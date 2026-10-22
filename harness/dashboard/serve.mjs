#!/usr/bin/env node
/**
 * Chomp board server — 127.0.0.1 only. Serves the board UI (web/, React), a small JSON API
 * over board/store.mjs, and live updates over Server-Sent Events. Starts the runner with
 * it, so the board being open is what keeps work moving.
 *
 * Writes (every POST) need all three of:
 *   - the per-process token the served page carries (x-agentos-token),
 *   - Sec-Fetch-Site: same-origin (real browsers send it; curl and scripts don't),
 *   - a Host header naming this server (blocks DNS rebinding).
 * Agents never reach these endpoints: the runner's guard denies Bash/Write access to the
 * board, and a plain curl fails the Sec-Fetch-Site check.
 *
 * The one exception is /api/companion/<id>/…: a task's phone companion (harness/companion),
 * or its Slack assistant and buttons (harness/slack), can chat, pause, start and retry its own
 * task with a per-task HMAC token. Never move.
 */

import http from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as store from "../../board/store.mjs";
import { createTaskApp } from "../qa/task-app.mjs";
import { Runner } from "../runner/index.mjs";
import { mcpStatus } from "../runner/connections.mjs";
import { renderMarkdown } from "./markdown.mjs";
import { buildRecap, markRecapSeen, recapSeen } from "./recap.mjs";
import { tokenOk as companionTokenOk, stopCompanion, stopCompanionOf, companionReadiness } from "../companion/index.mjs";
import { slack } from "../slack/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = store.AGENTOS_ROOT;
const TOKEN = randomBytes(24).toString("hex");
const PORT = Number(process.argv[process.argv.indexOf("--port") + 1]) || Number(process.env.PORT) || 4400;
// Where the companion MCP server (harness/companion/mcp.mjs) reaches this board, from Slack's
// assistant and its buttons too.
process.env.AGENTOS_PORT ??= String(PORT);
const STATIC = {
  "/logo.svg": [path.join(HERE, "assets", "logo.svg"), "image/svg+xml"],
};

// ── board UI ───────────────────────────────────────────────────────────────────────────
// The board is web/ (React + shadcn/ui), built to web/dist. With --dev it runs through Vite's
// middleware inside this server instead, so the page keeps this origin: the token,
// same-origin writes and HMR all work as in production.
const DEV = process.argv.includes("--dev");
const WEB = path.join(HERE, "web");
const DIST = path.join(WEB, "dist");
const WEB_SOURCES = ["src", "index.html", "vite.config.ts", "package.json"].map((p) => path.join(WEB, p))
  .concat(path.join(HERE, "..", "..", "agentos-design-system", "tokens.css"));
const ASSET_TYPES = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

function newestMtime(p) {
  if (!existsSync(p) || path.basename(p).startsWith("._")) return 0;
  const st = statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  return Math.max(0, ...readdirSync(p).map((name) => newestMtime(path.join(p, name))));
}

/** Install web/'s packages if they're missing and build it when dist is missing or older than
 * its sources, so a fresh clone or a pull never serves a stale UI. Runs `npm` from PATH, not this
 * process's Node: the desktop app runs us on Electron's Node, which is older than Vite supports. */
function ensureWebBuild() {
  if (!existsSync(path.join(WEB, "node_modules"))) {
    console.log("[serve] installing the board UI's packages (harness/dashboard/web)…");
    execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: WEB, stdio: "inherit" });
  }
  const built = path.join(DIST, "index.html");
  if (existsSync(built) && statSync(built).mtimeMs >= Math.max(...WEB_SOURCES.map(newestMtime))) return;
  console.log("[serve] building the board UI (harness/dashboard/web)…");
  try {
    execFileSync("npm", ["run", "bundle", "--silent"], { cwd: WEB, stdio: "inherit" });
  } catch (err) {
    if (!existsSync(built)) throw new Error(`couldn't build harness/dashboard/web: ${err.message}`);
    console.error(`[serve] UI build failed; serving the previous build: ${err.message}`);
  }
}

if (!DEV) ensureWebBuild();

/** The single page, with this process's write token in its meta tag. */
async function pageHtml(pathname) {
  if (DEV) return (await vite.transformIndexHtml(pathname, readFileSync(path.join(WEB, "index.html"), "utf8"))).replace("__TOKEN__", TOKEN);
  return readFileSync(path.join(DIST, "index.html"), "utf8").replace("__TOKEN__", TOKEN);
}

const runner = new Runner({ log: (line) => console.log(line) });

/** A card that reaches Done lets go of its local app, worktree and phone chat. */
function closeOut(id) {
  taskApp.stop(id);
  runner.cleanupWorkspace(id);
  stopCompanion(id).catch((err) => console.error(`[companion] ${id}: ${err.message}`));
}

// ── helpers ────────────────────────────────────────────────────────────────────────────

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("body is not JSON"));
      }
    });
  });
}

function hostOk(req) {
  return [`127.0.0.1:${PORT}`, `localhost:${PORT}`].includes(req.headers.host);
}

function writeAllowed(req) {
  return hostOk(req) && req.headers["x-agentos-token"] === TOKEN && req.headers["sec-fetch-site"] === "same-origin";
}

function accounts() {
  const dir = path.join(os.homedir(), ".local", "share", "claude-profiles");
  const named = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name) : [];
  return ["default", ...named];
}

function profiles() {
  return store.listProfiles();
}

/** What the new-task dialog needs per project: its name, the account it runs as, its task types. */
function profileOptions() {
  return profiles().map((name) => {
    const p = store.loadProfile(name);
    const libraries = store.librariesOf(p).map((l) => ({ id: l.id, label: l.label ?? l.id, has_work_file: store.hasWorkFile(p, l.id) }));
    return { name, label: p.label ?? name, account: p.account ?? null, task_kinds: store.kindsFor(p), libraries, has_work_file: store.hasWorkFile(p) };
  });
}

function boardState() {
  const flow = store.loadFlow();
  const tasks = store.listTasks().map((t) => ({
    ...t,
    unanswered: Boolean(store.openQuestions(t.id)) && t.status === "needs_input",
    unread: store.readChat(t.id).filter((m) => m.from !== "you").length,
    messages: store.readChat(t.id).filter((m) => m.kind !== "progress").length,
    docs: store.listDocs(t.id).length,
  }));
  return { columns: flow.columns, tasks, runner: runner.status(), settings: store.loadSettings(), app: taskApp.status() };
}

// The daily recap (recap.mjs). `today` is the page's local date, so the page decides when a day starts.
const RECAP_SEEN = path.join(ROOT, "board", "cache", "recap.json");
const isDay = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

function recap(today) {
  const entries = store.listTasks().map((task) => ({ task, chat: store.readChat(task.id) }));
  const projects = profiles().map((name) => ({ name, label: store.loadProfile(name).label ?? name }));
  return { ...buildRecap({ entries, columns: store.loadFlow().columns, profiles: projects, today }), seen: recapSeen(RECAP_SEEN) === today };
}

function taskDetail(id) {
  const task = store.getTask(id);
  if (!task) return null;
  // The agent's messages are Markdown, rendered here like the documents (escaped, http(s) links only).
  const chat = store.readChat(id).map((m) => (m.from === "agent" && m.kind === "message" && m.text ? { ...m, html: renderMarkdown(m.text) } : m));
  return { task, chat, docs: store.listDocs(id), openQuestions: store.openQuestions(id) };
}

// ── routes ─────────────────────────────────────────────────────────────────────────────

const sseClients = new Set();
// "Run locally": one task's build served from its worktree, for the owner to click through.
const taskApp = createTaskApp({ onChange: (id) => store.events.emit("change", id) });
store.events.on("change", (id) => {
  for (const res of sseClients) res.write(`data: ${JSON.stringify({ id })}\n\n`);
});

/**
 * What both the board page and a task's phone companion may do to a card. Messages from
 * the phone carry `via: "phone"`; everything else is the same path the board takes.
 */
function taskAction(res, task, action, body, flow, { via } = {}) {
  const id = task.id;
  if (action === "chat") {
    const open = store.openQuestions(id);
    const from = { from: "you", column: task.column, ...(via ? { via } : {}) };
    if (body.answers && open) {
      store.appendChat(id, { ...from, kind: "answers", questions: open.questions, answers: body.answers });
    } else if (typeof body.text === "string" && body.text.trim()) {
      store.appendChat(id, { ...from, text: body.text.trim() });
    } else {
      return send(res, 400, { error: body.answers ? "There are no open questions to answer." : "Write a message or answer the questions." });
    }
    runner.poke();
    return send(res, 200, taskDetail(id));
  }
  if (action === "retry") {
    store.updateTask(id, (t) => {
      const col = store.columnOf(flow, t.column);
      t.status = col.owner === "agent" ? "queued" : "idle";
      t.blocker = null;
    });
    runner.poke();
    return send(res, 200, store.getTask(id));
  }
  if (action === "figma-file") {
    store.setFigmaFile(id, body.url, { flow }); // throws (→ 400) on a link that isn't Figma's
    runner.poke();
    return send(res, 200, taskDetail(id));
  }
  if (action === "pause") {
    runner.cancel(id);
    return send(res, 200, store.pauseTask(id));
  }
  if (action === "start") {
    const started = store.startTask(id, { flow });
    runner.poke();
    return send(res, 200, started);
  }
  return send(res, 404, { error: "not found" });
}

async function handlePost(req, res, pathname) {
  let m;
  // A phone companion (harness/companion) acts on its own task only, with its HMAC token.
  if ((m = pathname.match(/^\/api\/companion\/([a-z0-9-]+)\/(chat|pause|start|retry)$/))) {
    if (!hostOk(req) || !companionTokenOk(m[1], req.headers.authorization)) return send(res, 403, { error: "bad companion token" });
    const task = store.getTask(m[1]);
    if (!task) return send(res, 404, { error: "This task isn't on the board anymore." });
    return taskAction(res, task, m[2], await readBody(req), store.loadFlow(), { via: "phone" });
  }
  if (!writeAllowed(req)) return send(res, 403, { error: "This endpoint only accepts requests from the board page itself." });
  const body = await readBody(req);
  const flow = store.loadFlow();

  if (pathname === "/api/tasks") {
    const task = store.createTask({ title: body.title, prompt: body.prompt, redesign: body.redesign, profile: body.profile, kind: body.kind, library: body.library, figma_file: body.figma_file });
    runner.poke();
    return send(res, 201, task);
  }
  if ((m = pathname.match(/^\/api\/tasks\/([a-z0-9-]+)\/(move|chat|retry|pr-ready|delete|pause|start|figma-file|app-start|app-stop)$/))) {
    const [, id, action] = m;
    const task = store.getTask(id);
    if (!task) return send(res, 404, { error: "no such task" });

    if (action === "move") {
      const target = store.columnOf(flow, body.column); // throws on an unknown column
      if (!store.columnServes(target, task)) return send(res, 400, { error: `${target.title} isn't part of a design-only task.` });
      runner.cancel(id);
      const moved = store.moveTask(id, body.column, { by: "you", flow });
      if (body.column === "done") closeOut(id);
      runner.poke();
      return send(res, 200, moved);
    }
    if (["chat", "retry"].includes(action)) return taskAction(res, task, action, body, flow);
    // Opening a PR for review is the owner's call, made here — never an agent's (the guard
    // denies `gh pr ready` to every agent). It finishes the task: the card goes to Done.
    if (action === "pr-ready") {
      const url = task.pr?.url;
      if (!url || !task.pr.draft) return send(res, 400, { error: "This task has no draft PR to open." });
      const repo = store.loadProfile(task.profile).repo;
      const result = await new Promise((resolve) => execFile("gh", ["pr", "ready", url], { cwd: repo }, (err, stdout, stderr) => resolve({ err, out: stderr || stdout })));
      if (result.err) return send(res, 502, { error: `gh pr ready failed: ${String(result.out).trim().slice(0, 300)}` });
      store.updateTask(id, (t) => { t.pr = { ...t.pr, draft: false, ready_at: new Date().toISOString() }; });
      store.appendChat(id, { from: "system", column: task.column, text: `You opened the PR for review: ${url}` });
      runner.cancel(id);
      const done = store.moveTask(id, "done", { by: "you", flow });
      closeOut(id);
      runner.poke();
      return send(res, 200, done);
    }
    if (["pause", "start", "figma-file"].includes(action)) return taskAction(res, task, action, body, flow);
    if (action === "app-start") {
      try {
        return send(res, 200, taskApp.start(id));
      } catch (err) {
        return send(res, 400, { error: String(err.message ?? err) });
      }
    }
    if (action === "app-stop") {
      taskApp.stop(id);
      return send(res, 200, { stopped: id });
    }
    if (action === "delete") {
      taskApp.stop(id);
      runner.cancel(id);
      await runner.cleanupWorkspace(id);
      await stopCompanionOf(task).catch(() => null);
      const dest = store.deleteTask(id);
      return send(res, 200, { deleted: id, trash: path.relative(ROOT, dest) });
    }
  }
  if (pathname === "/api/recap/seen") {
    if (!isDay(body.today)) return send(res, 400, { error: "today must be YYYY-MM-DD" });
    markRecapSeen(RECAP_SEEN, body.today);
    return send(res, 200, { seen: body.today });
  }
  if (pathname === "/api/settings") {
    const current = store.loadSettings();
    const next = { ...current };
    if (body.account !== undefined) {
      if (!accounts().includes(body.account)) return send(res, 400, { error: "unknown account" });
      next.account = body.account;
    }
    if (body.owner !== undefined) next.owner = String(body.owner).trim().slice(0, 60);
    if (body.profile !== undefined) {
      if (!profiles().includes(body.profile)) return send(res, 400, { error: "unknown profile" });
      next.profile = body.profile;
    }
    if (body.companions !== undefined) {
      next.companions = { ...current.companions };
      if (body.companions.enabled !== undefined) next.companions.enabled = Boolean(body.companions.enabled);
      if (["phone", "slack"].includes(body.companions.via)) next.companions.via = body.companions.via;
    }
    if (body.max_parallel !== undefined) next.max_parallel = Math.max(1, Math.min(4, Number(body.max_parallel) || 1));
    // { account, agents?: { planner: { model, effort } }, companion_model?, max_parallel? } → that account's
    // full set under per_account, so later changes to the fallback don't move it.
    if (body.per_account) {
      const { account } = body.per_account;
      if (!accounts().includes(account)) return send(res, 400, { error: "unknown account" });
      const known = (current.models ?? []).map((m) => m.id);
      const own = store.accountSettings(current, account);
      for (const [name, cfg] of Object.entries(body.per_account.agents ?? {})) {
        if (!own.agents[name]) continue;
        const model = known.includes(cfg.model) ? cfg.model : own.agents[name].model;
        const effort = ["default", "low", "medium", "high", "xhigh", "max"].includes(cfg.effort) ? cfg.effort : own.agents[name].effort;
        own.agents[name] = { model, effort };
      }
      if (known.includes(body.per_account.companion_model)) own.companion_model = body.per_account.companion_model;
      if (body.per_account.max_parallel !== undefined) own.max_parallel = Math.max(1, Math.min(4, Number(body.per_account.max_parallel) || 1));
      next.per_account = { ...current.per_account, [account]: own };
    }
    if (body.reset_account !== undefined) {
      next.per_account = { ...(next.per_account ?? current.per_account) };
      delete next.per_account[body.reset_account];
      if (!Object.keys(next.per_account).length) delete next.per_account;
    }
    store.saveSettings(next);
    return send(res, 200, next);
  }
  // Slack (harness/slack): { bot_token, app_token, user_id } saves and connects; /test DMs you.
  if (pathname === "/api/slack") return send(res, 200, await slack.configure(body));
  if (pathname === "/api/slack/test") {
    await slack.test();
    return send(res, 200, slack.status());
  }
  if (pathname === "/runner/start") { runner.start(); return send(res, 200, runner.status()); }
  if (pathname === "/runner/stop") { runner.stop(); return send(res, 200, runner.status()); }
  return send(res, 404, { error: "not found" });
}

async function handleGet(req, res, url) {
  const { pathname } = url;
  if (STATIC[pathname]) {
    const [file, type] = STATIC[pathname];
    return send(res, 200, readFileSync(file, "utf8"), type);
  }
  if (pathname === "/api/state") return send(res, 200, boardState());
  if (pathname === "/api/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(": connected\n\n");
    sseClients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(ping);
      sseClients.delete(res);
    });
    return;
  }
  let m;
  if ((m = pathname.match(/^\/api\/tasks\/([a-z0-9-]+)$/))) {
    const detail = taskDetail(m[1]);
    return detail ? send(res, 200, detail) : send(res, 404, { error: "no such task" });
  }
  if ((m = pathname.match(/^\/api\/tasks\/([a-z0-9-]+)\/docs\/([\w.-]+\.md)$/))) {
    const text = store.readDoc(m[1], m[2]);
    return text === null ? send(res, 404, { error: "no such document" }) : send(res, 200, { name: m[2], html: renderMarkdown(text, { assetBase: `/api/tasks/${m[1]}/files/` }) });
  }
  if ((m = pathname.match(/^\/api\/tasks\/([a-z0-9-]+)\/files\/qa\/([\w.-]+\.png)$/))) {
    const file = path.join(store.taskDir(m[1]), "qa", m[2]);
    if (!existsSync(file)) return send(res, 404, { error: "no such file" });
    res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    return res.end(readFileSync(file));
  }
  if (pathname === "/api/connections") {
    const settings = store.loadSettings();
    const account = url.searchParams.get("account") || settings.account;
    if (!accounts().includes(account)) return send(res, 400, { error: "unknown account" });
    // Check from the repo of a project that runs as this account, so project-scoped servers show.
    const project = profiles().find((n) => store.loadProfile(n).account === account) ?? (profiles().includes(settings.profile) ? settings.profile : null);
    const repo = project ? store.loadProfile(project).repo : null;
    try {
      const [servers, phone] = await Promise.all([
        mcpStatus(account, repo && existsSync(repo) ? repo : ROOT, { fresh: url.searchParams.has("fresh") }),
        companionReadiness(account).catch((err) => ({ title: "Couldn't check phone chats", fix: String(err.message ?? err) })),
      ]);
      const notSlack = slack.readiness();
      return send(res, 200, { account, login: servers.login ?? null, servers, phone: { ready: !phone, ...(phone ?? {}) }, slack: { ready: !notSlack, ...slack.status(), ...(notSlack ?? {}) } });
    } catch (err) {
      return send(res, 200, { account, servers: [], error: String(err.message ?? err) });
    }
  }
  if (pathname === "/api/recap") {
    const today = url.searchParams.get("today");
    return isDay(today) ? send(res, 200, recap(today)) : send(res, 400, { error: "today must be YYYY-MM-DD" });
  }
  if (pathname === "/api/options") return send(res, 200, { accounts: accounts(), profiles: profileOptions() });
  if (pathname === "/api/slack") return send(res, 200, slack.status());
  // Kept for the desktop app: it asks this before quitting so it can warn about agents mid-turn.
  if (pathname === "/runner/status") {
    const s = runner.status();
    return send(res, 200, { running: s.active.length > 0, loop: s.running, active: s.active });
  }
  // Everything else is the single-page board.
  if (pathname === "/" || /^\/(task\/[a-z0-9-]+(\/doc\/[\w.-]+\.md)?|settings|connections)$/.test(pathname)) {
    return send(res, 200, await pageHtml(pathname), "text/html");
  }
  // The built UI's hashed bundles: one flat folder, so a name with no slash is the whole check.
  if (!DEV && (m = pathname.match(/^\/assets\/(\w[\w.-]*)$/))) {
    const file = path.join(DIST, "assets", m[1]);
    if (!existsSync(file)) return send(res, 404, { error: "not found" });
    res.writeHead(200, { "content-type": ASSET_TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" });
    return res.end(readFileSync(file));
  }
  if (vite) return vite.middlewares(req, res, () => send(res, 404, { error: "not found" }));
  return send(res, 404, { error: "not found" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (!hostOk(req)) return send(res, 421, { error: "wrong host" });
    if (req.method === "POST") return await handlePost(req, res, url.pathname);
    if (req.method === "GET") return await handleGet(req, res, url);
    return send(res, 405, { error: "method not allowed" });
  } catch (err) {
    console.error(`[serve] ${req.method} ${url.pathname}: ${err.stack ?? err}`);
    return send(res, 400, { error: String(err.message ?? err) });
  }
});

// Vite is a devDependency of web/, loaded from there and only with --dev.
const vite = DEV
  ? await (await import(pathToFileURL(createRequire(path.join(WEB, "package.json")).resolve("vite")).href)).createServer({
    root: WEB,
    appType: "custom",
    server: { middlewareMode: true, hmr: { server } },
  })
  : null;

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Chomp board → http://127.0.0.1:${PORT}${DEV ? " (dev)" : ""}`);
  if (!process.argv.includes("--no-runner")) runner.start();
  slack.start({ port: PORT, log: (line) => console.log(line) });
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    runner.stop();
    slack.stop();
    process.exit(0);
  });
}

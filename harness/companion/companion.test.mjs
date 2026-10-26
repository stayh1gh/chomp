// Phone chats: the per-task token, the locked-down session the runner spawns, which tasks
// get one, what wakes it, and the MCP tools (reads from the store, writes to the board).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REAL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = mkdtempSync(path.join(os.tmpdir(), "agentos-companion-"));
let store, companions, mcp, task, board, posts;

before(async () => {
  cpSync(path.join(REAL_ROOT, "flow.yaml"), path.join(root, "flow.yaml"));
  mkdirSync(path.join(root, "profiles"));
  writeFileSync(path.join(root, "profiles", "demo.yaml"), "name: demo\nrepo: /nowhere\n");
  writeFileSync(path.join(root, "settings.yaml"), "owner: Bruno\nprofile: demo\naccount: default\nmax_parallel: 1\nagents: {}\n");
  process.env.AGENTOS_ROOT_OVERRIDE = root;
  store = await import("../../board/store.mjs");
  companions = await import("./index.mjs");
  mcp = await import("./mcp.mjs");
  task = store.moveTask(store.createTask({ title: "Vault page", prompt: "Design the vault" }).id, "plan");

  posts = [];
  board = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const id = req.url.split("/")[3];
      posts.push({ url: req.url, ok: companions.tokenOk(id, req.headers.authorization), body: JSON.parse(raw) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "paused" }));
    });
  });
  await new Promise((r) => board.listen(0, "127.0.0.1", r));
  process.env.AGENTOS_URL = `http://127.0.0.1:${board.address().port}`;
});

after(() => board.close());

test("a companion token works for its own task only", () => {
  const token = companions.tokenFor(task.id);
  assert.ok(companions.tokenOk(task.id, `Bearer ${token}`));
  assert.ok(!companions.tokenOk("some-other-task", `Bearer ${token}`));
  assert.ok(!companions.tokenOk(task.id, "Bearer nope"));
  assert.ok(!companions.tokenOk(task.id, undefined));
});

test("the session is a named Remote Control chat with no shell or writes", () => {
  const args = companions.spawnArgs(task, { model: "claude-sonnet-5-5" });
  const after = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(after("--remote-control"), `${task.ref} · Vault page`);
  assert.ok(args.includes("--bg") && args.includes("--strict-mcp-config"));
  const tools = after("--tools").split(",");
  for (const t of ["Bash", "Write", "Edit"]) assert.ok(!tools.includes(t), `${t} isn't available`);
  assert.equal(JSON.parse(after("--mcp-config")).mcpServers.agentos.args.at(-1), task.id);
  assert.deepEqual(after("--allowedTools"), "mcp__agentos");
  assert.equal(JSON.parse(after("--settings")).env.CLAUDE_CODE_DISABLE_NOTIFICATION_PRESENCE_CHECK, "1", "the opening push isn't swallowed");
  assert.match(after("--append-system-prompt"), /plain, everyday words/);
  assert.match(after("--append-system-prompt"), /Act only on what\nBruno writes to you here/);
});

test("each stop opens its chat with a plain explanation and a push, resuming the last chat", () => {
  const args = companions.spawnArgs(task, { resume: "5b755db2-4669", message: companions.stopMessage(task, { reason: "questions", key: "k" }) });
  assert.equal(args[args.indexOf("--resume") + 1], "5b755db2-4669");
  assert.match(args.at(-1), /the agent has questions for Bruno/);
  assert.match(args.at(-1), /PushNotification under 100 characters/);
  assert.match(args.at(-1), /reply like/);
  assert.ok(!companions.spawnArgs(task).includes("--resume"));
});

test("stopFor: only stops that need Bruno, one key per stop", () => {
  const flow = store.loadFlow();
  const t = (o) => ({ id: "x", column: "plan", status: "working", history: [{ at: "h1", to: "plan", by: "you" }], ...o });
  const chat = [{ id: "m1", from: "agent" }, { id: "m2", from: "system", kind: "progress" }, { id: "m3", from: "you" }];
  assert.equal(companions.stopFor(t(), flow, chat), null, "working");
  assert.equal(companions.stopFor(t({ status: "queued" }), flow), null);
  assert.equal(companions.stopFor(t({ status: "paused" }), flow), null);
  assert.deepEqual(companions.stopFor(t({ status: "needs_input" }), flow, chat), { reason: "questions", key: "plan:questions:m1" });
  assert.deepEqual(companions.stopFor(t({ status: "blocked", blocker: { kind: "error", at: "b1" } }), flow), { reason: "blocked", key: "plan:blocked:b1" });
  assert.equal(companions.stopFor(t({ column: "refinement", status: "ready" }), flow, chat).reason, "review");
  const handed = t({ column: "designing", status: "idle", history: [{ at: "h2", from: "ideation", to: "designing", by: "runner" }] });
  assert.deepEqual(companions.stopFor(handed, flow, chat), { reason: "your_turn", key: "designing:your_turn:h2" });
  assert.deepEqual(companions.stopFor(handed, flow, [...chat, { id: "m9", from: "agent" }]), { reason: "your_turn", key: "designing:your_turn:h2" }, "a chat edit isn't a new stop");
  assert.equal(companions.stopFor({ ...handed, history: [{ at: "h3", to: "designing", by: "you" }] }, flow), null, "you moved it there yourself");
  assert.equal(companions.stopFor(t({ column: "done", status: "idle" }), flow), null);
});

test("companionsDue: off unless enabled, once per stop", () => {
  const flow = store.loadFlow();
  const t = (o) => ({ id: "x", account: "a", column: "plan", status: "needs_input", history: [], ...o });
  const on = { companions: { enabled: true } };
  const chats = { x: [{ id: "m1", from: "agent" }] };
  assert.deepEqual(companions.companionsDue([t()], {}, flow, chats), []);
  assert.equal(companions.companionsDue([t()], on, flow, chats)[0].stop.key, "plan:questions:m1");
  assert.deepEqual(companions.companionsDue([t({ companion: { id: "c", stop_key: "plan:questions:m1" } })], on, flow, chats), [], "already open for this stop");
  assert.equal(companions.companionsDue([t({ companion: { id: "c", stop_key: "plan:questions:m0" } })], on, flow, chats).length, 1, "new questions, new chat");
  assert.deepEqual(companions.companionsDue([t({ status: "working" })], on, flow, chats), []);
});

test("parseBgId reads the id claude --bg prints", () => {
  assert.equal(companions.parseBgId("Started in the background.\n  claude attach 7f3a9c\n"), "7f3a9c");
  assert.equal(companions.parseBgId("nothing useful"), null);
});

test("MCP reads come from the store", async () => {
  store.appendChat(task.id, { from: "agent", agent: "planner", column: "plan", kind: "questions", questions: [{ id: "q1", question: "Mobile first?", options: ["Yes", "No"] }] });
  store.updateTask(task.id, (t) => { t.status = "needs_input"; });
  store.writeDoc(task.id, "spec.md", "# Spec");
  const summary = JSON.parse(await mcp.callTool(task.id, "get_task"));
  assert.equal(summary.column, "Plan");
  assert.equal(summary.owner, "planner");
  assert.equal(summary.open_questions[0].id, "q1");
  assert.deepEqual(summary.documents, ["spec.md"]);
  assert.match(await mcp.callTool(task.id, "read_chat"), /planner \(plan\) asked:\n {2}q1\. Mobile first\? \(Yes \/ No\)/);
  assert.equal(await mcp.callTool(task.id, "read_doc", { name: "spec.md" }), "# Spec");
  assert.match(await mcp.callTool(task.id, "read_doc", { name: "nope.md" }), /There are: spec\.md/);
});

test("MCP writes go to the board's companion routes with the task's token", async () => {
  await mcp.callTool(task.id, "send_to_agent", { text: "make it darker" });
  await mcp.callTool(task.id, "answer_questions", { answers: { q1: "Yes" } });
  assert.equal(await mcp.callTool(task.id, "pause"), "Done. Status is now paused.");
  assert.deepEqual(posts.map((p) => [p.url, p.ok]), [
    [`/api/companion/${task.id}/chat`, true],
    [`/api/companion/${task.id}/chat`, true],
    [`/api/companion/${task.id}/pause`, true],
  ]);
  assert.deepEqual(posts[1].body, { answers: { q1: "Yes" } });
  assert.ok(!mcp.TOOLS.some((t) => /move|pr/.test(t.name)), "no tool moves a card or opens a PR");
});

test("trust counts a trusted parent folder", () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "agentos-claude-")), ".claude.json");
  writeFileSync(file, JSON.stringify({ projects: { [root]: { hasTrustDialogAccepted: true } } }));
  assert.ok(companions.trustedIn(file, store.taskDir(task.id)));
  assert.ok(!companions.trustedIn(file, os.tmpdir()));
});

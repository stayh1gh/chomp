/**
 * The board's only writer. A task is one folder, board/tasks/<id>/:
 *   task.yaml   — where the card is and what it's doing (schemas/task.schema.json)
 *   chat.jsonl  — the task's chat thread, one message per line
 *   *.md        — documents the agents write (spec.md, plan.md, research.md, …)
 *
 * Agents never write task.yaml or chat.jsonl: the runner's guard only lets an agent write
 * the task folder's documents (harness/runner/guard.mjs). Everything that changes a card
 * goes through this module, which emits `change` so the board can push updates live.
 */

import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const AGENTOS_ROOT = process.env.AGENTOS_ROOT_OVERRIDE ?? path.resolve(HERE, "..");
const tasksDir = () => path.join(AGENTOS_ROOT, "board", "tasks");

export const STATUSES = ["queued", "working", "needs_input", "ready", "blocked", "idle", "paused"];
export const events = new EventEmitter();
events.setMaxListeners(50);

function writeAtomic(file, text) {
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

// ── flow + settings ────────────────────────────────────────────────────────────────────

export function loadFlow() {
  return loadYaml(readFileSync(path.join(AGENTOS_ROOT, "flow.yaml"), "utf8"));
}

export function columnOf(flow, id) {
  const col = flow.columns.find((c) => c.id === id);
  if (!col) throw new Error(`unknown column "${id}"`);
  return col;
}

/** Your settings.yaml (gitignored, written by the Settings page), or the tracked defaults until you save one. */
export function loadSettings() {
  const own = path.join(AGENTOS_ROOT, "settings.yaml");
  const file = existsSync(own) ? own : path.join(AGENTOS_ROOT, "settings.example.yaml");
  return loadYaml(readFileSync(file, "utf8"));
}

/** The person running this board, by name in agent prompts and chats; "the owner" until Settings has a name. */
export function ownerName(settings = loadSettings()) {
  return settings.owner?.trim() || "the owner";
}

export const FIGMA_DEFAULTS = { page_bg: "#1e1e1e", section_fill: "#404040" };
export const isHexColor = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** The task page's background and its sections' fill in Figma: the project's own, else settings.figma, else the defaults. */
export function figmaColors(settings = loadSettings(), project = null) {
  const own = { ...settings.figma, ...settings.per_project?.[project]?.figma };
  return {
    page_bg: isHexColor(own.page_bg) ? own.page_bg.toLowerCase() : FIGMA_DEFAULTS.page_bg,
    section_fill: isHexColor(own.section_fill) ? own.section_fill.toLowerCase() : FIGMA_DEFAULTS.section_fill,
  };
}

/**
 * Prompts and agent definitions say {{owner}} where they mean the person running the board,
 * and {{figma_page_bg}} / {{figma_section_fill}} for the project's Figma colors in Settings.
 */
export function personalize(text, settings = loadSettings(), project = null) {
  const figma = figmaColors(settings, project);
  return text
    .replaceAll("{{owner}}", ownerName(settings))
    .replaceAll("{{figma_page_bg}}", figma.page_bg)
    .replaceAll("{{figma_section_fill}}", figma.section_fill);
}

/**
 * How a project runs: its own `per_project` entry, falling back to the top-level `agents`,
 * `companions.model` and `max_parallel` for anything that project hasn't set.
 */
export function projectSettings(settings, project) {
  const own = settings.per_project?.[project] ?? {};
  const agents = {};
  for (const [name, cfg] of Object.entries(settings.agents ?? {})) agents[name] = { ...cfg, ...own.agents?.[name] };
  return {
    agents,
    companion_model: own.companion_model ?? settings.companions?.model ?? "claude-sonnet-5-5",
    max_parallel: own.max_parallel ?? settings.max_parallel ?? 2,
  };
}

export function saveSettings(settings) {
  const header = "# Edited from the board's Settings page.\n";
  writeAtomic(path.join(AGENTOS_ROOT, "settings.yaml"), header + dumpYaml(settings, { flowLevel: 2, lineWidth: 100 }));
  events.emit("change", null);
}

export function loadProfile(name) {
  return loadYaml(readFileSync(path.join(AGENTOS_ROOT, "profiles", `${name}.yaml`), "utf8"));
}

export function listProfiles() {
  const dir = path.join(AGENTOS_ROOT, "profiles");
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, "")).sort() : [];
}

// ── task types ─────────────────────────────────────────────────────────────────────────
// `full` goes all the way through Development; `design` ends after Refinement. A profile
// can narrow what it allows (`task_kinds: [design]` for a project with no code).

export const KINDS = ["full", "design"];

export function kindsFor(profile) {
  if (profile && !profile.repo) return ["design"]; // nothing to build in without a code repo
  const kinds = (profile?.task_kinds ?? KINDS).filter((k) => KINDS.includes(k));
  return kinds.length ? kinds : KINDS;
}

/** Where a project with no code repo works: board/projects/<name> (gitignored), which holds its docs such as DESIGN.md. */
export function projectFolder(name) {
  const dir = path.join(AGENTOS_ROOT, "board", "projects", name || "project");
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── design-system libraries ───────────────────────────────────────────────────────────
// A profile with several products lists them under figma.libraries, each with its own
// Figma library and work file (and optionally its own docs and viewports); every task
// picks one. resolveProfile folds the task's pick into figma.library_file / work_file, so
// everything downstream reads one profile shape.

export function librariesOf(profile) {
  return Array.isArray(profile?.figma?.libraries) ? profile.figma.libraries : [];
}

export function resolveProfile(profile, task) {
  // Design-only projects may have no repo: agents work in the project's own folder instead.
  if (profile && !profile.repo) profile = { ...profile, repo: projectFolder(profile.name), project_folder: true };
  const libs = librariesOf(profile);
  const lib = libs.find((l) => l.id === task?.library) ?? libs[0];
  const resolved = !lib ? profile : {
    ...profile,
    figma: { ...profile.figma, library_file: lib.library_file, work_file: lib.work_file ?? profile.figma.work_file, library: { id: lib.id, label: lib.label ?? lib.id } },
    viewports: lib.viewports ?? profile.viewports,
    design_system: { ...profile.design_system, context: lib.context ?? profile.design_system?.context },
  };
  // A Figma file given with the task is its work file, whatever the profile says.
  if (!task?.figma_file?.key) return resolved;
  return { ...resolved, figma: { ...resolved.figma, work_file: task.figma_file.key } };
}

/** Whether a profile (or one of its libraries) has a real work file, not missing or TODO. */
export function hasWorkFile(profile, libraryId) {
  const lib = librariesOf(profile).find((l) => l.id === libraryId);
  const v = lib?.work_file ?? profile?.figma?.work_file;
  return Boolean(v) && !/^todo$/i.test(String(v).trim());
}

/** { key, url } from a figma.com/design (or /file) link; throws on anything else. */
export function parseFigmaFile(url) {
  const m = String(url ?? "").trim().match(/^https:\/\/(?:www\.)?figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/);
  if (!m) throw new Error("That isn't a Figma file link — copy it from the file's address bar (figma.com/design/…).");
  return { key: m[1], url: String(url).trim() };
}

/** Gives a task its Figma file; a card blocked waiting for one goes back in the queue. */
export function setFigmaFile(id, url, { flow = loadFlow() } = {}) {
  const figmaFile = parseFigmaFile(url);
  return updateTask(id, (t) => {
    t.figma_file = figmaFile;
    if (t.status === "blocked" && t.blocker?.needs === "figma_file") {
      t.status = columnOf(flow, t.column).owner === "agent" ? "queued" : "idle";
      t.blocker = null;
    }
  });
}

/** Whether a column is part of this task's type. Tasks from before types existed are full. */
export function columnServes(col, task) {
  return !col.kinds || col.kinds.includes(task.kind ?? "full");
}

// ── tasks ──────────────────────────────────────────────────────────────────────────────

export function taskDir(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`bad task id "${id}"`);
  return path.join(tasksDir(), id);
}

function slugify(text) {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "task";
}

function freshSteps(column) {
  return (column.steps ?? []).map((s) => ({ name: s.name, done: false }));
}

export function listTasks() {
  if (!existsSync(tasksDir())) return [];
  const tasks = readdirSync(tasksDir(), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(tasksDir(), d.name, "task.yaml")))
    .map((d) => getTask(d.name))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  // Tasks from before card IDs existed get one, in creation order, once.
  for (const t of tasks.filter((x) => !x.number)) Object.assign(t, saveTask({ ...t, ...nextRef() }));
  return tasks;
}

// ── card IDs ───────────────────────────────────────────────────────────────────────────
// A monotonically increasing number per board (board/tasks/.counter), never reused — not
// even after a task is deleted — shown as <prefix>-<n> (settings.id_prefix, default AOS).

function nextRef() {
  mkdirSync(tasksDir(), { recursive: true });
  const file = path.join(tasksDir(), ".counter");
  const used = existsSync(file) ? Number(readFileSync(file, "utf8")) || 0 : 0;
  const number = used + 1;
  writeAtomic(file, String(number));
  const prefix = (() => {
    try { return loadSettings().id_prefix ?? "AOS"; } catch { return "AOS"; }
  })();
  return { number, ref: `${prefix}-${number}` };
}

export function getTask(id) {
  const file = path.join(taskDir(id), "task.yaml");
  if (!existsSync(file)) return null;
  return loadYaml(readFileSync(file, "utf8"));
}

function saveTask(task) {
  task.updated_at = new Date().toISOString();
  writeAtomic(path.join(taskDir(task.id), "task.yaml"), dumpYaml(task, { lineWidth: 100 }));
  events.emit("change", task.id);
  return task;
}

export function createTask({ title, prompt, redesign = false, profile: profileName, kind, library, figma_file }, { flow = loadFlow(), settings = loadSettings() } = {}) {
  if (!title?.trim()) throw new Error("title is required");
  if (!prompt?.trim()) throw new Error("prompt is required");
  const profileId = profileName || settings.profile;
  if (!profileId) throw new Error("pick a project first: add one to profiles/ (see GETTING-STARTED.md), then choose it in Settings");
  if (!listProfiles().includes(profileId)) throw new Error(`unknown project "${profileId}"`);
  const profile = loadProfile(profileId);
  const allowed = kindsFor(profile);
  const taskKind = kind || allowed[0];
  if (!allowed.includes(taskKind)) throw new Error(`${profile.label ?? profileId} doesn't take ${taskKind === "full" ? "full" : "design-only"} tasks`);
  const libs = librariesOf(profile);
  const libraryId = libs.length ? library || libs[0].id : null;
  if (libraryId && !libs.some((l) => l.id === libraryId)) throw new Error(`${profile.label ?? profileId} has no design system "${libraryId}"`);
  const figmaFile = figma_file?.trim() ? parseFigmaFile(figma_file) : null;
  const date = new Date().toISOString().slice(0, 10);
  let id = `${date}-${slugify(title)}`;
  while (existsSync(taskDir(id))) id = `${date}-${slugify(title)}-${randomBytes(2).toString("hex")}`;
  mkdirSync(taskDir(id), { recursive: true });
  const first = flow.columns[0];
  const now = new Date().toISOString();
  return saveTask({
    id,
    ...nextRef(),
    title: title.trim(),
    prompt: prompt.trim(),
    redesign: Boolean(redesign),
    kind: taskKind,
    profile: profileId,
    ...(libraryId ? { library: libraryId } : {}),
    ...(figmaFile ? { figma_file: figmaFile } : {}),
    account: profile.account ?? settings.account,
    column: first.id,
    status: first.owner === "agent" ? "queued" : "idle",
    activity: null,
    steps: freshSteps(first),
    blocker: null,
    sessions: {},
    links: {},
    created_at: now,
    updated_at: now,
    history: [{ at: now, to: first.id, by: "you" }],
  });
}

/**
 * Takes a task off the board by moving its folder to board/trash/<id>-<timestamp>, so a
 * mis-click is recoverable by moving the folder back. Never touches Figma or git.
 */
export function deleteTask(id) {
  const dir = taskDir(id);
  if (!existsSync(dir)) throw new Error(`no task "${id}"`);
  const trash = path.join(AGENTOS_ROOT, "board", "trash");
  mkdirSync(trash, { recursive: true });
  const dest = path.join(trash, `${id}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  renameSync(dir, dest);
  events.emit("change", id);
  return dest;
}

/** Read-modify-write. `fn` mutates the task in place (or returns a replacement). */
export function updateTask(id, fn) {
  const task = getTask(id);
  if (!task) throw new Error(`no task "${id}"`);
  const next = fn(task) ?? task;
  return saveTask(next);
}

/**
 * Pause parks a card: the runner skips it (chat replies included) until Start. Start puts
 * it back where it was — an interrupted run is queued to resume its session, a card that
 * was waiting (needs_input, ready, blocked) simply goes back to waiting.
 */
export function pauseTask(id) {
  return updateTask(id, (t) => {
    if (t.status === "paused") return;
    t.paused_from = t.status;
    t.status = "paused";
    t.activity = null;
  });
}

export function startTask(id, { flow = loadFlow() } = {}) {
  return updateTask(id, (t) => {
    if (t.status !== "paused") return;
    const col = columnOf(flow, t.column);
    const was = t.paused_from ?? "queued";
    delete t.paused_from;
    if (["needs_input", "ready", "blocked"].includes(was)) {
      t.status = was;
    } else if (col.owner === "agent") {
      t.status = "queued";
      if (t.sessions?.[col.id]) t.resume_pending = true; // pick the interrupted session back up
    } else {
      t.status = "idle";
    }
  });
}

/** Moving a card is how work starts: entering an agent column queues that agent. */
export function moveTask(id, toColumn, { by = "you", flow = loadFlow() } = {}) {
  const target = columnOf(flow, toColumn);
  return updateTask(id, (t) => {
    if (t.column === toColumn) return;
    if (!columnServes(target, t)) throw new Error(`${target.title} isn't part of a ${t.kind === "design" ? "design-only" : "full"} task`);
    t.history.push({ at: new Date().toISOString(), from: t.column, to: toColumn, by });
    t.column = toColumn;
    t.status = target.owner === "agent" ? "queued" : "idle";
    // Re-entering a column starts that agent fresh; it re-reads the documents and chat.
    t.sessions = Object.fromEntries(Object.entries(t.sessions ?? {}).filter(([k]) => k.split(":")[0] !== toColumn));
    t.steps = freshSteps(target);
    t.activity = null;
    t.blocker = null;
    delete t.paused_from;
    delete t.resume_pending;
  });
}

/** Ticks the step named `name` (and every step before it) on the card's current column.
 *  Returns the names it newly ticked. */
export function tickStep(task, name) {
  const idx = task.steps.findIndex((s) => s.name === name);
  if (idx === -1) return [];
  const ticked = [];
  for (let i = 0; i <= idx; i += 1) {
    if (!task.steps[i].done) {
      task.steps[i].done = true;
      ticked.push(task.steps[i].name);
    }
  }
  return ticked;
}

/** The step a written file completes, for the card's current column, or null. */
export function stepForFile(flow, columnId, filename) {
  const col = columnOf(flow, columnId);
  return (col.steps ?? []).find((s) => s.file && s.file === filename)?.name ?? null;
}

/** The step a tool call completes (steps declare `tool: use_figma`), or null. */
export function stepForTool(flow, columnId, toolName) {
  const col = columnOf(flow, columnId);
  return (col.steps ?? []).find((s) => s.tool && (toolName === s.tool || toolName.endsWith(`__${s.tool}`)))?.name ?? null;
}

// ── chat ───────────────────────────────────────────────────────────────────────────────

const chatFile = (id) => path.join(taskDir(id), "chat.jsonl");

export function readChat(id) {
  const file = chatFile(id);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/**
 * from: "you" | "agent" | "system". kind: "message" | "questions" | "answers".
 * A message from you starts undelivered; the runner delivers it to the column's agent.
 */
export function appendChat(id, msg) {
  const entry = {
    id: randomBytes(6).toString("hex"),
    at: new Date().toISOString(),
    kind: "message",
    ...msg,
  };
  if (entry.from === "you") entry.delivered = entry.delivered ?? false;
  appendFileSync(chatFile(id), JSON.stringify(entry) + "\n");
  events.emit("change", id);
  return entry;
}

export function undelivered(id) {
  return readChat(id).filter((m) => m.from === "you" && m.delivered === false);
}

export function markDelivered(id, ids) {
  patchChat(id, ids, { delivered: true });
}

/** Sets `patch`'s fields on the messages with these ids. */
export function patchChat(id, ids, patch) {
  const set = new Set(ids);
  const lines = readChat(id).map((m) => (set.has(m.id) ? { ...m, ...patch } : m));
  writeAtomic(chatFile(id), lines.map((m) => JSON.stringify(m)).join("\n") + (lines.length ? "\n" : ""));
  events.emit("change", id);
}

/** The most recent agent question set still waiting on answers, or null. */
export function openQuestions(id) {
  const chat = readChat(id);
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    if (chat[i].kind === "answers") return null;
    if (chat[i].kind === "questions") return chat[i];
  }
  return null;
}

// ── documents ──────────────────────────────────────────────────────────────────────────

export function listDocs(id) {
  return readdirSync(taskDir(id)).filter((f) => f.endsWith(".md")).sort();
}

/** Runner-written documents (ds-lint.md). Agents write theirs through the guarded Write tool. */
export function writeDoc(id, name, text) {
  if (!/^[\w.-]+\.md$/.test(name)) throw new Error("bad document name");
  writeAtomic(path.join(taskDir(id), name), text);
  events.emit("change", id);
}

export function readDoc(id, name) {
  if (!/^[\w.-]+\.md$/.test(name)) throw new Error("bad document name");
  const file = path.join(taskDir(id), name);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

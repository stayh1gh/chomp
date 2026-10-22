// End to end against a fake SDK: a card enters Plan, the planner asks, Bruno answers in
// the chat, the planner resumes the same session, writes its three documents (ticking the
// checklist), and the card auto-advances to Ideation — where it blocks, because the
// designer isn't built yet. Also covers store moves and the MCP pre-flight.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REAL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = mkdtempSync(path.join(os.tmpdir(), "agentos-test-"));
const repo = path.join(root, "repo");
let store, runnerMod;

before(async () => {
  for (const p of ["flow.yaml", "agents", "skills"]) cpSync(path.join(REAL_ROOT, p), path.join(root, p), { recursive: true });
  mkdirSync(path.join(root, "profiles"));
  mkdirSync(repo);
  writeFileSync(path.join(root, "profiles", "demo.yaml"), `name: demo\nrepo: ${repo}\nbase_branch: main\nfigma:\n  work_file: WORK\n  library_file: LIB\n`);
  writeFileSync(path.join(root, "settings.yaml"), "owner: Bruno\nprofile: demo\naccount: default\nmax_parallel: 2\nagents:\n  planner: { model: opus, effort: high }\n  designer: { model: opus, effort: high }\n  builder: { model: opus, effort: high }\n");
  process.env.AGENTOS_ROOT_OVERRIDE = root;
  store = await import("../../board/store.mjs");
  runnerMod = await import("./index.mjs");
});

/**
 * A fake query(): runs `script(options)` to get tool calls + final text for this turn.
 * Chat replies (side sessions, no `agent`) answer from `chats` and are logged in `chatCalls`;
 * by default they pass the message on to the agent.
 */
function fakeQuery(turns, chats = []) {
  const calls = [];
  const chatCalls = [];
  const impl = ({ prompt, options }) => {
    if (!options.agent) {
      chatCalls.push({ prompt, options });
      const out = chats[chatCalls.length - 1] ?? { reply: "", handled: false };
      return (async function* () {
        yield { type: "result", subtype: "success", result: "```json\n" + JSON.stringify(out) + "\n```" };
      })();
    }
    const turn = turns[calls.length];
    calls.push({ prompt, options });
    return (async function* () {
      yield { type: "system", subtype: "init", session_id: options.resume ?? `s${calls.length}` };
      for (const [tool, input] of turn.tools ?? []) {
        const out = await options.hooks.PreToolUse[0].hooks[0]({ tool_name: tool, tool_input: input });
        const allowed = out.hookSpecificOutput.permissionDecision === "allow";
        if (allowed && tool === "Write") writeFileSync(path.resolve(options.cwd, input.file_path), input.content);
        turn.denied = (turn.denied ?? 0) + (allowed ? 0 : 1);
      }
      yield { type: "result", subtype: "success", result: "done\n```json\n" + JSON.stringify(turn.result) + "\n```" };
    })();
  };
  return { impl, calls, chatCalls };
}

const NO_SHEET = async () => null; // no Figma library to read in tests

const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out");
};

test("pickWork: queued starts, chat on a waiting card resumes, human column edits", () => {
  const flow = store.loadFlow();
  const t = (o) => ({ id: "x", sessions: {}, ...o });
  assert.equal(runnerMod.pickWork([t({ column: "plan", status: "queued" })], flow)[0].kind, "start");
  assert.equal(runnerMod.pickWork([t({ column: "plan", status: "needs_input" })], flow).length, 0);
  assert.equal(runnerMod.pickWork([t({ column: "plan", status: "needs_input" })], flow, { undeliveredById: { x: [{}] } })[0].kind, "resume");
  assert.equal(runnerMod.pickWork([t({ column: "designing", status: "idle" })], flow, { undeliveredById: { x: [{}] } })[0].kind, "edit");
  assert.equal(runnerMod.pickWork([t({ column: "done", status: "idle" })], flow, { undeliveredById: { x: [{}] } })[0].kind, "no_agent");
  assert.equal(runnerMod.pickWork([t({ column: "plan", status: "queued" })], flow, { inflight: new Set(["x"]) }).length, 0);
  const blocked = t({ column: "plan", status: "blocked", blocker: { kind: "connection", at: new Date(0).toISOString() } });
  assert.equal(runnerMod.pickWork([blocked], flow)[0].recheck, true);
  const fresh = { kind: "missing_agent", at: new Date().toISOString() };
  assert.equal(runnerMod.pickWork([t({ column: "designing", status: "blocked", blocker: fresh })], flow, { undeliveredById: { x: [{}] } }).length, 0, "no 3-second retry loop");
  const stale = { kind: "missing_agent", at: new Date(0).toISOString() };
  assert.equal(runnerMod.pickWork([t({ column: "designing", status: "blocked", blocker: stale })], flow, { undeliveredById: { x: [{}] } })[0].kind, "edit");
  assert.equal(runnerMod.pickWork([t({ column: "plan", status: "blocked", blocker: { kind: "error", at: new Date(0).toISOString() } })], flow, { undeliveredById: { x: [{}] } }).length, 0);
});

test("accountSettings: an account's own models and limit win, per agent, over the top-level ones", () => {
  const settings = {
    agents: { planner: { model: "opus", effort: "high" }, builder: { model: "opus", effort: "high" } },
    companions: { model: "sonnet" },
    max_parallel: 2,
    per_account: { work: { agents: { planner: { model: "haiku", effort: "low" } }, companion_model: "haiku", max_parallel: 4 } },
  };
  assert.deepEqual(store.accountSettings(settings, "work"), {
    agents: { planner: { model: "haiku", effort: "low" }, builder: { model: "opus", effort: "high" } },
    companion_model: "haiku",
    max_parallel: 4,
  });
  assert.deepEqual(store.accountSettings(settings, "home"), { agents: settings.agents, companion_model: "sonnet", max_parallel: 2 });
});

test("store: create, move resets checklist and clears that column's session", () => {
  const task = store.createTask({ title: "Move me", prompt: "p" });
  assert.equal(task.column, "plan");
  assert.equal(task.status, "queued");
  store.updateTask(task.id, (x) => { x.sessions = { plan: "a", designing: "b", "designing:edit": "c" }; });
  const moved = store.moveTask(task.id, "designing");
  assert.equal(moved.status, "idle");
  assert.deepEqual(moved.sessions, { plan: "a" });
  assert.equal(moved.history.at(-1).from, "plan");
  assert.throws(() => store.moveTask(task.id, "nope"));
  store.deleteTask(task.id);
});

test("planner flow: questions → answers → resume → documents → auto-advance", async () => {
  const task = store.createTask({ title: "Onboarding", prompt: "Design the first upload screen" });
  const dir = store.taskDir(task.id);
  const { impl, calls } = fakeQuery([
    { result: { status: "needs_input", summary: "Two things first.", questions: [{ question: "Mobile only?", options: ["Yes", "No"], recommended: "Yes" }] } },
    {
      tools: [
        ["Write", { file_path: path.join(dir, "spec.md"), content: "# Spec" }],
        ["Write", { file_path: path.join(dir, "task.yaml"), content: "status: done" }], // must be denied
        ["Write", { file_path: path.join(dir, "plan.md"), content: "# Plan" }],
        ["Write", { file_path: path.join(dir, "research.md"), content: "# Research" }],
      ],
      result: { status: "done", summary: "Spec, plan and research are in." },
    },
    { result: { status: "needs_input", summary: "parked", questions: [{ question: "stop here?" }] } },
  ]);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: async () => [{ name: "mobbin", status: "connected" }, { name: "figma", status: "connected" }] });
  runner.running = true;

  await runner.tick();
  await until(() => store.getTask(task.id).status === "needs_input");
  assert.match(calls[0].prompt, /Design the first upload screen/);
  assert.equal(calls[0].options.agent, "planner");
  assert.ok(calls[0].options.agents.planner.tools.includes("mcp__mobbin__*"));
  assert.equal(calls[0].options.agents.planner.model, "opus");
  assert.deepEqual(calls[0].options.settingSources, ["user", "project", "local"]);
  const open = store.openQuestions(task.id);
  assert.equal(open.questions[0].question, "Mobile only?");

  store.appendChat(task.id, { from: "you", column: "plan", kind: "answers", questions: open.questions, answers: { q1: "Yes" } });
  await runner.tick();
  await until(() => store.getTask(task.id).column === "ideation");
  assert.equal(calls[1].options.resume, "s1");
  assert.match(calls[1].prompt, /Mobile only\?\n  → Yes/);
  assert.equal(store.undelivered(task.id).length, 0);
  assert.ok(existsSync(path.join(dir, "research.md")));
  assert.doesNotMatch(readFileSync(path.join(dir, "task.yaml"), "utf8"), /^status: done$/m);

  const after = store.getTask(task.id);
  assert.equal(after.history.at(-1).by, "runner");
  assert.ok(after.steps.every((s) => !s.done), "Ideation's checklist starts fresh");
  const plannerSummary = store.readChat(task.id).filter((m) => m.agent === "planner" && m.kind === "message").at(-1);
  assert.equal(plannerSummary.text, "Spec, plan and research are in.");

  // …and Ideation's designer picks it up straight away.
  await until(() => calls.length === 3);
  assert.equal(calls[2].options.agent, "designer");
  await until(() => store.getTask(task.id).status === "needs_input");
  store.deleteTask(task.id);
});

test("steps tick as each document is written", async () => {
  const task = store.createTask({ title: "Ticks", prompt: "p" });
  const dir = store.taskDir(task.id);
  let seen;
  const { impl } = fakeQuery([{ tools: [["Write", { file_path: path.join(dir, "plan.md"), content: "x" }]], result: { status: "blocked", summary: "s", blocker: "need access" } }]);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: async () => [{ name: "mobbin", status: "connected" }] });
  runner.running = true;
  await runner.tick();
  await until(() => (seen = store.getTask(task.id)).status === "blocked");
  assert.deepEqual(seen.steps.map((s) => s.done), [true, true, true, false]); // Questions, Spec, Plan ticked; Research not
  assert.deepEqual(store.readChat(task.id).filter((m) => m.kind === "progress").map((m) => m.text), ["✓ Questions", "✓ Spec", "✓ Plan"]);
  assert.equal(seen.blocker.kind, "agent");
  assert.equal(store.readChat(task.id).find((m) => m.from === "agent").text, "s\n\nneed access", "the ask is in the chat, not only on the card");
  store.deleteTask(task.id);
});

test("pre-flight blocks on a missing MCP server with the fix command", async () => {
  const task = store.createTask({ title: "No mobbin", prompt: "p" });
  const { impl, calls } = fakeQuery([]);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: async () => [{ name: "plugin:figma:figma", status: "needs-auth" }] });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).status === "blocked");
  const b = store.getTask(task.id).blocker;
  assert.equal(b.kind, "connection");
  assert.match(b.detail, /claude mcp add --scope user --transport http mobbin https:\/\/api\.mobbin\.com\/mcp/);
  assert.equal(calls.length, 0);
});

test("a message sent mid-turn reaches the agent before the card moves on", async () => {
  const task = store.createTask({ title: "Late note", prompt: "p" });
  let release;
  const gate = new Promise((r) => (release = r));
  const calls = [];
  const impl = ({ prompt, options }) => {
    calls.push({ prompt, options });
    const n = calls.length;
    return (async function* () {
      yield { type: "system", session_id: options.resume ?? "late" };
      if (n === 1) await gate;
      yield { type: "result", subtype: "success", result: '```json\n{"status":"done","summary":"turn ' + n + '"}\n```' };
    })();
  };
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: async () => [{ name: "mobbin", status: "connected" }] });
  runner.running = true;
  await runner.tick();
  await until(() => calls.length === 1);
  store.appendChat(task.id, { from: "you", column: "plan", text: "Also cover tablets" });
  release();
  await until(() => store.getTask(task.id).column === "ideation");
  assert.equal(calls.length, 2);
  assert.match(calls[1].prompt, /Also cover tablets/);
  assert.equal(calls[1].options.resume, "late");
});

test("an expired Claude login blocks as a connection problem with the login command", async () => {
  const task = store.createTask({ title: "Expired", prompt: "p" });
  const impl = () => (async function* () {
    throw new Error("Claude Code returned an error result: Failed to authenticate: OAuth session expired and could not be refreshed");
  })();
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: async () => [{ name: "mobbin", status: "connected" }] });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).status === "blocked");
  const b = store.getTask(task.id).blocker;
  assert.equal(b.kind, "connection");
  assert.match(b.title, /login has expired/);
  assert.match(b.detail, /\/login/);
  store.deleteTask(task.id);
});

const MCP_OK = async () => [{ name: "mobbin", status: "connected" }, { name: "figma", status: "connected" }];
const LINK = "https://www.figma.com/design/WORK/?node-id=5-1";
const lintResult = (n) => ({ ok: true, page: "Chomp · t", errorCount: n, warningCount: 1, byRule: n ? { "raw-fill": n } : {},
  counts: { nodes: 10, instances: 4, libraryInstances: 4, localInstances: 0, texts: 3 },
  errors: Array.from({ length: n }, (_, i) => ({ rule: "raw-fill", id: `5:${i + 9}`, name: "Header", detail: "fills uses a raw color" })),
  warnings: [{ rule: "contrast", id: "5:3", name: "Caption", detail: "contrast 3.9:1, needs 4.5:1" }], placeholders: ["DatePicker"] });

test("designer: lint errors go back to the designer, a clean page moves the card on", async () => {
  const task = store.createTask({ title: "Lint loop", prompt: "p" });
  store.moveTask(task.id, "ideation");
  const dir = store.taskDir(task.id);
  const { impl, calls } = fakeQuery([
    { tools: [["mcp__figma__use_figma", { fileKey: "WORK", code: "x" }], ["mcp__figma__use_figma", { fileKey: "LIB", code: "x" }], ["Write", { file_path: path.join(dir, "design.md"), content: "# Design" }]],
      result: { status: "done", summary: "Two directions.", links: { figma: LINK }, figma_nodes: ["5:2"] } },
    { result: { status: "done", summary: "Fixed.", links: { figma: LINK }, figma_nodes: ["5-7"] } },
  ]);
  const lints = [];
  const lintImpl = async (args) => { lints.push(args); return lintResult(lints.length === 1 ? 2 : 0); };
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK, lintImpl });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).column === "designing");

  assert.equal(calls[0].options.agent, "designer");
  assert.equal(calls.length, 2);
  assert.match(calls[1].prompt, /DS lint on your page found 2 errors \(raw-fill: 2\)/);
  assert.match(calls[1].prompt, /\[raw-fill\] "Header" \(5:9\)/);
  assert.equal(calls[1].options.resume, "s1");
  assert.deepEqual({ fileKey: lints[0].fileKey, pageId: lints[0].pageId, nodeIds: lints[0].nodeIds }, { fileKey: "WORK", pageId: "5:1", nodeIds: ["5:2"] });
  assert.deepEqual(lints[1].nodeIds, ["5:2", "5:7"], "a fix round adds to the scope, never drops from it");
  const t = store.getTask(task.id);
  assert.deepEqual(t.figma, { file_key: "WORK", page_id: "5:1", url: LINK, nodes: ["5:2", "5:7"] });
  assert.equal(t.links.figma, LINK);
  assert.deepEqual(t.lint.placeholders, ["DatePicker"]);
  assert.equal(t.lint.errors, 0);
  assert.match(store.readDoc(task.id, "ds-lint.md"), /✅ No errors\./);
  assert.equal(t.status, "idle");
  store.deleteTask(task.id);
});

test("designer: the library file is off limits to use_figma", async () => {
  const task = store.createTask({ title: "Library guard", prompt: "p" });
  store.moveTask(task.id, "ideation");
  const turns = [{ tools: [["mcp__figma__use_figma", { fileKey: "LIB", code: "x" }]], result: { status: "needs_input", summary: "s", questions: [{ question: "q" }] } }];
  const { impl } = fakeQuery(turns);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK, lintImpl: async () => lintResult(0) });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).status === "needs_input");
  assert.equal(turns[0].denied, 1);
  store.deleteTask(task.id);
});

test("designer: errors left after two fix rounds block the card with the report", async () => {
  const task = store.createTask({ title: "Stubborn", prompt: "p" });
  store.moveTask(task.id, "ideation");
  const done = { result: { status: "done", summary: "s", links: { figma: LINK }, figma_nodes: ["5:2"] } };
  const { impl, calls } = fakeQuery([done, done, done, done]);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK, lintImpl: async () => lintResult(1) });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).status === "blocked");
  assert.equal(calls.length, 3);
  const t = store.getTask(task.id);
  assert.equal(t.column, "ideation");
  assert.deepEqual([t.blocker.kind, t.blocker.title], ["agent", "DS lint: 1 error left"]);
  assert.match(store.readChat(task.id).at(-1).text, /still finds 1 error after 2 fix rounds/);
  store.deleteTask(task.id);
});

test("designer: no page link → asked for it, not linted blind", async () => {
  const task = store.createTask({ title: "No link", prompt: "p" });
  store.moveTask(task.id, "ideation");
  const { impl, calls } = fakeQuery([
    { result: { status: "done", summary: "s" } },
    { result: { status: "done", summary: "s", links: { figma: "https://www.figma.com/design/OTHER/?node-id=1-1" } } },
    { result: { status: "done", summary: "s", links: { figma: LINK }, figma_nodes: ["5:2"] } },
  ]);
  const lints = [];
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK, lintImpl: async (a) => { lints.push(a); return lintResult(0); } });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).column === "designing");
  assert.match(calls[1].prompt, /links\.figma/);
  assert.match(calls[2].prompt, /points at file OTHER/);
  assert.equal(lints.length, 1);
  store.deleteTask(task.id);
});

test("designer: no figma_nodes, or ones off the page → asked for them; only those are linted", async () => {
  const task = store.createTask({ title: "Scope", prompt: "p" });
  store.moveTask(task.id, "ideation");
  const { impl, calls } = fakeQuery([
    { result: { status: "done", summary: "s", links: { figma: LINK } } },
    { result: { status: "done", summary: "s", links: { figma: LINK }, figma_nodes: ["9:9"] } },
    { result: { status: "done", summary: "s", links: { figma: LINK }, figma_nodes: ["5:2"] } },
  ]);
  const lints = [];
  const lintImpl = async (a) => { lints.push(a.nodeIds); return { ...lintResult(0), notFound: a.nodeIds.filter((id) => id === "9:9") }; };
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK, lintImpl });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).column === "designing");
  assert.match(calls[1].prompt, /List in figma_nodes/);
  assert.match(calls[2].prompt, /figma_nodes 9:9 isn't on page 5:1/);
  assert.deepEqual(lints, [["9:9"], ["5:2"]], "the dropped id leaves the scope; nothing is linted without one");
  assert.deepEqual(store.getTask(task.id).figma.nodes, ["5:2"]);
  store.deleteTask(task.id);
});

test("builder: Development ends at visual QA for Bruno's review, with no PR to verify", async () => {
  const task = store.createTask({ title: "Build only", prompt: "p" });
  store.moveTask(task.id, "development");
  const wt = path.join(repo, ".claude", "worktrees", `agentos-${task.id}`);
  const execCalls = [];
  const execImpl = async (cmd, args) => {
    execCalls.push(cmd);
    if (args.includes("add")) mkdirSync(wt, { recursive: true });
    return "";
  };
  const { impl } = fakeQuery([{ tools: [["Edit", { file_path: path.join(wt, "src", "a.tsx") }], ["Write", { file_path: path.join(store.taskDir(task.id), "qa.md"), content: "# QA" }]],
    result: { status: "done", summary: "s" } }]);
  const runner = new runnerMod.Runner({ log: () => {}, queryImpl: impl, mcpStatusImpl: MCP_OK, execImpl, cheatsheetImpl: NO_SHEET });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).status === "ready");
  const t = store.getTask(task.id);
  assert.equal(t.column, "development", "waits for Bruno to move it to Draft PR");
  assert.equal(t.pr, undefined);
  assert.ok(!execCalls.includes("gh"), "no PR check in Development");
  assert.ok(t.steps.every((s) => s.done));
  store.deleteTask(task.id);
});

test("designer: Ideation draws and lints the primary viewport only, Refinement every one in split sections; both get the DS cheat sheet", async () => {
  writeFileSync(path.join(root, "profiles", "vp.yaml"), `name: vp\nrepo: ${repo}\nbase_branch: main\nfigma:\n  work_file: WORK\n  library_file: LIB\n` +
    "viewports:\n  - { w: 1280, h: 900, primary: true }\n  - { w: 390, h: 844 }\n");
  const task = store.createTask({ title: "Viewports", prompt: "p", profile: "vp" });
  store.moveTask(task.id, "ideation");
  const done = { result: { status: "done", summary: "s", links: { figma: LINK }, figma_nodes: ["5:2"] } };
  const { impl, calls } = fakeQuery([done, done]);
  const lints = [];
  const sheets = [];
  const cheatsheetImpl = async ({ root: r, profile }) => {
    sheets.push(profile.figma.library_file);
    const file = path.join(r, "board", "cache", "ds", `${profile.figma.library_file}.md`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "# DS cheat sheet");
    return file;
  };
  const runner = new runnerMod.Runner({ log: () => {}, queryImpl: impl, mcpStatusImpl: MCP_OK, cheatsheetImpl, lintImpl: async (a) => { lints.push(a); return lintResult(0); } });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).column === "designing");
  assert.deepEqual(sheets, ["LIB"]);
  assert.match(calls[0].prompt, /DS cheat sheet for this task's library: .*board\/cache\/ds\/LIB\.md/);
  assert.match(calls[0].prompt, /Viewports: 1280×900 \(primary\), 390×844\. This column draws the primary viewport only \(1280×900\)/);
  assert.deepEqual(lints[0].viewports, [{ w: 1280, h: 900, primary: true, required: true }, { w: 390, h: 844, primary: false, required: false }]);
  assert.deepEqual(lints[0].fullPageGroups, []);

  store.moveTask(task.id, "refinement");
  await runner.tick();
  await until(() => calls.length === 2 && store.getTask(task.id).status === "ready");
  assert.match(calls[1].prompt, /This column draws every viewport: .*"Final — 390"/);
  assert.deepEqual(lints[1].viewports.map((v) => v.required), [true, true]);
  assert.deepEqual(lints[1].fullPageGroups, ["Final", "Flows & states"]);
  store.deleteTask(task.id);
});

test("builder: Draft PR reuses the worktree and verifies the draft PR", async () => {
  const task = store.createTask({ title: "Build it", prompt: "p" });
  store.moveTask(task.id, "development");
  store.moveTask(task.id, "review");
  const wt = path.join(repo, ".claude", "worktrees", `agentos-${task.id}`);
  const execCalls = [];
  const execImpl = async (cmd, args) => {
    execCalls.push([cmd, ...args].join(" "));
    if (args.includes("worktree") && args.includes("add")) mkdirSync(wt, { recursive: true });
    if (cmd === "gh") return JSON.stringify({ isDraft: true, headRefName: `agentos/${task.id}`, baseRefName: "main", state: "OPEN", url: "u" });
    return "";
  };
  const PR = "https://github.com/acme/app/pull/7";
  const turns = [
    { tools: [["Edit", { file_path: path.join(wt, "src", "a.tsx") }], ["Write", { file_path: path.join(repo, "src", "main-checkout.tsx"), content: "x" }],
      ["Bash", { command: "gh pr create --title t --body b" }], ["Bash", { command: "git push origin main" }]],
      result: { status: "done", summary: "s", links: { pr: PR } } },
  ];
  const { impl, calls } = fakeQuery(turns);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK, execImpl });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).status === "ready");

  assert.equal(calls[0].options.agent, "builder");
  assert.equal(calls[0].options.cwd, wt);
  assert.equal(calls[0].options.env.AGENTOS_TASK, task.id);
  assert.match(calls[0].prompt, new RegExp(`git worktree ${wt.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")} on branch agentos/${task.id}`));
  assert.ok(execCalls.some((c) => c.includes(`worktree add -b agentos/${task.id} ${wt} origin/main`)));
  assert.equal(turns[0].denied, 3, "main-checkout write, non-draft PR and push to main are all denied");
  const t = store.getTask(task.id);
  assert.deepEqual(t.pr, { url: PR, draft: true });
  assert.ok(t.steps.every((s) => s.done));
  assert.equal(t.column, "review");

  await runner.cleanupWorkspace(task.id);
  assert.ok(execCalls.some((c) => c.includes(`worktree remove ${wt}`)));
  store.deleteTask(task.id);
});

test("builder: the finished Development message carries qa.md", async () => {
  const task = store.createTask({ title: "QA doc", prompt: "p" });
  store.moveTask(task.id, "development");
  const wt = path.join(repo, ".claude", "worktrees", `agentos-${task.id}`);
  const execImpl = async (cmd, args) => {
    if (args.includes("add")) mkdirSync(wt, { recursive: true });
    return "";
  };
  const { impl } = fakeQuery([{ tools: [["Write", { file_path: path.join(store.taskDir(task.id), "qa.md"), content: "# QA" }]], result: { status: "done", summary: "Built it." } }]);
  const runner = new runnerMod.Runner({ log: () => {}, queryImpl: impl, mcpStatusImpl: MCP_OK, execImpl });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).status === "ready");
  const last = store.readChat(task.id).filter((m) => m.from === "agent").at(-1);
  assert.equal(last.text, "Built it.");
  assert.deepEqual(last.docs, ["qa.md"]);
  await runner.cleanupWorkspace(task.id);
  store.deleteTask(task.id);
});

test("builder: a PR that isn't a draft blocks the card", async () => {
  const task = store.createTask({ title: "Not draft", prompt: "p" });
  store.moveTask(task.id, "development");
  store.moveTask(task.id, "review");
  const wt = path.join(repo, ".claude", "worktrees", `agentos-${task.id}`);
  const execImpl = async (cmd, args) => {
    if (args.includes("add")) mkdirSync(wt, { recursive: true });
    return cmd === "gh" ? JSON.stringify({ isDraft: false, headRefName: `agentos/${task.id}`, baseRefName: "main" }) : "";
  };
  const { impl } = fakeQuery([{ result: { status: "done", summary: "s", links: { pr: "https://github.com/acme/app/pull/8" } } }]);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK, execImpl });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).status === "blocked");
  assert.equal(store.getTask(task.id).blocker.title, "The PR isn't a draft");
  store.deleteTask(task.id);
});

test("store: delete moves the task folder to board/trash", () => {
  const task = store.createTask({ title: "Delete me", prompt: "p" });
  const dest = store.deleteTask(task.id);
  assert.equal(store.getTask(task.id), null);
  assert.ok(existsSync(path.join(dest, "task.yaml")));
  assert.match(dest, /board\/trash\/.*delete-me/);
  assert.throws(() => store.deleteTask(task.id));
});

test("card IDs: sequential, never reused after a delete", () => {
  const a = store.createTask({ title: "Id A", prompt: "p" });
  const b = store.createTask({ title: "Id B", prompt: "p" });
  assert.equal(b.number, a.number + 1);
  assert.equal(b.ref, `AOS-${b.number}`);
  store.deleteTask(b.id);
  const c = store.createTask({ title: "Id C", prompt: "p" });
  assert.equal(c.number, b.number + 1);
  store.deleteTask(a.id);
  store.deleteTask(c.id);
});

test("pause parks a card; start puts it back or resumes its session", () => {
  const flow = store.loadFlow();
  const t = store.createTask({ title: "Pausable", prompt: "p" });
  store.updateTask(t.id, (x) => { x.status = "working"; x.sessions = { plan: "s9" }; });
  let x = store.pauseTask(t.id);
  assert.equal(x.status, "paused");
  assert.equal(runnerMod.pickWork([x], flow, { undeliveredById: { [t.id]: [{}] } }).length, 0, "paused ignores chat too");
  x = store.startTask(t.id);
  assert.deepEqual([x.status, x.resume_pending], ["queued", true]);
  assert.equal(runnerMod.pickWork([x], flow)[0].kind, "resume");

  store.updateTask(t.id, (y) => { y.status = "needs_input"; delete y.resume_pending; });
  store.pauseTask(t.id);
  assert.equal(store.startTask(t.id).status, "needs_input");
  store.deleteTask(t.id);
});

test("a chat edit resumes its session only while the agent's definition is unchanged", async () => {
  const task = store.createTask({ title: "Stale session", prompt: "p" });
  store.moveTask(task.id, "designing");
  const version = runnerMod.loadAgent("designer").version;
  store.updateTask(task.id, (t) => { t.sessions = { "designing:edit": "old" }; t.session_versions = { "designing:edit": "outdated" }; });
  const { impl, calls } = fakeQuery([
    { result: { status: "done", summary: "Added.", links: { figma: LINK }, figma_nodes: ["5:2"] } },
    { result: { status: "done", summary: "Added again.", links: { figma: LINK }, figma_nodes: ["5:2"] } },
  ]);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK, lintImpl: async () => lintResult(0) });
  runner.running = true;

  store.appendChat(task.id, { from: "you", column: "designing", text: "add the reference screenshots" });
  await runner.tick();
  await until(() => calls.length === 1 && store.getTask(task.id).status !== "working");
  assert.equal(calls[0].options.resume, undefined, "a session from an older designer.md isn't resumed");
  assert.match(calls[0].prompt, /Chat so far/, "the fresh session gets the full context");
  assert.equal(store.getTask(task.id).session_versions["designing:edit"], version);

  store.appendChat(task.id, { from: "you", column: "designing", text: "try again" });
  await runner.tick();
  await until(() => calls.length === 2 && store.getTask(task.id).status !== "working");
  assert.equal(calls[1].options.resume, "s1");
  store.deleteTask(task.id);
});

test("task types: the profile and type are picked per task, and Development is full-only", () => {
  writeFileSync(path.join(root, "profiles", "design-co.yaml"), `name: design-co\nlabel: Design Co\naccount: designacct\ntask_kinds: [design]\nrepo: ${repo}\nfigma:\n  work_file: WORK\n  library_file: LIB\n`);
  const full = store.createTask({ title: "Default type", prompt: "p" });
  assert.equal(full.kind, "full");
  assert.equal(full.profile, "demo");
  assert.equal(full.account, "default");

  const design = store.createTask({ title: "Design only", prompt: "p", profile: "design-co" });
  assert.equal(design.kind, "design", "defaults to the profile's first task kind");
  assert.equal(design.account, "designacct", "the profile's account wins over settings");
  assert.throws(() => store.createTask({ title: "Code it", prompt: "p", profile: "design-co", kind: "full" }), /doesn't take full tasks/);
  assert.throws(() => store.createTask({ title: "Nope", prompt: "p", profile: "missing" }), /unknown project/);

  assert.throws(() => store.moveTask(design.id, "development"), /isn't part of a design-only task/);
  assert.equal(store.moveTask(design.id, "refinement").column, "refinement");
  assert.equal(store.moveTask(design.id, "done").column, "done");
  assert.equal(store.moveTask(full.id, "development").column, "development");
  assert.throws(() => store.moveTask(design.id, "review"), /isn't part of a design-only task/);
  assert.equal(store.columnServes(store.columnOf(store.loadFlow(), "development"), { id: "old" }), true, "tasks without a kind are full");
  for (const t of [full, design]) store.deleteTask(t.id);
});

test("every dispatch carries the flow's standing rules and the task type", () => {
  const flow = store.loadFlow();
  assert.ok(flow.standing_rules?.length, "flow.yaml has standing rules");
  const task = store.createTask({ title: "Rules", prompt: "p", profile: "design-co" });
  const prompt = runnerMod.buildPrompt({ task, col: store.columnOf(flow, "plan"), kind: "start" }, store.loadProfile("design-co"), []);
  assert.match(prompt, /Standing rules \(every project/);
  assert.match(prompt, /figma\.library_file/);
  assert.match(prompt, /Task type: design only/);
  assert.ok(prompt.indexOf("Standing rules") < prompt.indexOf("Profile (profiles/"), "rules come before the profile");
  store.deleteTask(task.id);
});

test("pre-flight asks for the task's Figma file first, then the profile's library", async () => {
  writeFileSync(path.join(root, "profiles", "no-figma.yaml"), `name: no-figma\nlabel: No Figma\nrepo: ${repo}\nfigma:\n  library_file: TODO\n  work_file: TODO\n`);
  assert.deepEqual(runnerMod.missingFigmaFiles(store.loadProfile("no-figma")), ["library_file", "work_file"]);
  assert.deepEqual(runnerMod.missingFigmaFiles(store.loadProfile("demo")), []);
  const task = store.createTask({ title: "No figma", prompt: "p", profile: "no-figma" });
  const { impl, calls } = fakeQuery([]);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK });
  await runner.dispatch({ task, col: store.columnOf(store.loadFlow(), "plan"), kind: "start", agent: "planner" }, store.loadSettings(), new AbortController());
  const b = store.getTask(task.id).blocker;
  assert.equal(b.kind, "connection", "rechecks every minute, so filling in the keys unblocks it");
  assert.equal(b.needs, "figma_file", "the board asks for the file on the card");
  assert.match(b.title, /This task has no Figma file yet/);
  assert.doesNotMatch(b.detail, /^Fix: /, "not a terminal command");

  assert.throws(() => store.setFigmaFile(task.id, "https://example.com/x"), /isn't a Figma file link/);
  const url = "https://www.figma.com/design/nXFTmnQoMPn/Member-Center?node-id=1-52";
  assert.equal(store.setFigmaFile(task.id, url).status, "queued", "giving the file unblocks the card");
  const withFile = store.getTask(task.id);
  assert.deepEqual(withFile.figma_file, { key: "nXFTmnQoMPn", url });
  assert.equal(store.resolveProfile(store.loadProfile("no-figma"), withFile).figma.work_file, "nXFTmnQoMPn");

  await runner.dispatch({ task: withFile, col: store.columnOf(store.loadFlow(), "plan"), kind: "start", agent: "planner" }, store.loadSettings(), new AbortController());
  const lib = store.getTask(task.id).blocker;
  assert.match(lib.title, /No Figma has no Figma library yet/);
  assert.match(lib.detail, /figma\.library_file in profiles\/no-figma\.yaml/);
  assert.equal(lib.needs, undefined);
  assert.equal(calls.length, 0);
  store.deleteTask(task.id);
});

test("a Figma file given at creation is the task's work file", () => {
  assert.throws(() => store.createTask({ title: "Bad link", prompt: "p", profile: "demo", figma_file: "figma.com/nope" }), /isn't a Figma file link/);
  const task = store.createTask({ title: "With file", prompt: "p", profile: "demo", figma_file: " https://figma.com/design/ABC123/Thing " });
  assert.deepEqual(task.figma_file, { key: "ABC123", url: "https://figma.com/design/ABC123/Thing" });
  const profile = store.resolveProfile(store.loadProfile("demo"), task);
  assert.equal(profile.figma.work_file, "ABC123", "overrides the profile's WORK");
  assert.equal(profile.figma.library_file, "LIB");
  const prompt = runnerMod.buildPrompt({ task, col: store.columnOf(store.loadFlow(), "plan"), kind: "start" }, profile, []);
  assert.match(prompt, /Figma file for this task \(Bruno's link, it is your work file\): https:\/\/figma\.com\/design\/ABC123\/Thing/);
  assert.equal(store.createTask({ title: "No file", prompt: "p", figma_file: "" }).figma_file, undefined);
  assert.equal(store.hasWorkFile(store.loadProfile("demo")), true);
  assert.equal(store.hasWorkFile(store.loadProfile("no-figma")), false);
  store.deleteTask(task.id);
});

test("every real profile parses and names valid task kinds", async () => {
  const { load } = await import("js-yaml");
  const { readdirSync } = await import("node:fs");
  for (const f of readdirSync(path.join(REAL_ROOT, "profiles")).filter((x) => x.endsWith(".yaml"))) {
    const p = load(readFileSync(path.join(REAL_ROOT, "profiles", f), "utf8"));
    assert.equal(p.name, f.replace(/\.yaml$/, ""), `${f}: name matches the file`);
    for (const k of p.task_kinds ?? []) assert.ok(store.KINDS.includes(k), `${f}: unknown task kind ${k}`);
    for (const r of p.design_requirements ?? []) assert.equal(typeof r, "string", `${f}: every design requirement is one string`);
  }
});

test("design-system libraries: the task picks one and the agents only see that one", () => {
  writeFileSync(path.join(root, "profiles", "multi.yaml"), [
    "name: multi", "label: Multi", "task_kinds: [design]", `repo: ${repo}`,
    "figma:", "  libraries:",
    "    - { id: news, label: News, library_file: NEWSLIB, work_file: NEWSWORK }",
    "    - { id: tools, label: Tools, library_file: TOOLLIB, work_file: TODO, viewports: [{ w: 1440, h: 900 }] }",
    "viewports: []", "",
  ].join("\n"));
  const first = store.createTask({ title: "Lib default", prompt: "p", profile: "multi" });
  assert.equal(first.library, "news", "defaults to the first library");
  assert.throws(() => store.createTask({ title: "Bad lib", prompt: "p", profile: "multi", library: "nope" }), /no design system "nope"/);
  const tools = store.createTask({ title: "Lib tools", prompt: "p", profile: "multi", library: "tools" });

  const resolved = store.resolveProfile(store.loadProfile("multi"), tools);
  assert.equal(resolved.figma.library_file, "TOOLLIB");
  assert.deepEqual(resolved.viewports, [{ w: 1440, h: 900 }]);
  assert.deepEqual(runnerMod.missingFigmaFiles(resolved), ["work_file"]);
  const prompt = runnerMod.buildPrompt({ task: first, col: store.columnOf(store.loadFlow(), "plan"), kind: "start" }, store.resolveProfile(store.loadProfile("multi"), first), []);
  assert.match(prompt, /Design system for this task: News — Figma library NEWSLIB, work file NEWSWORK/);
  const plain = store.createTask({ title: "No libs", prompt: "p" });
  assert.equal(plain.library, undefined, "single-library profiles don't get one");
  for (const t of [first, tools, plain]) store.deleteTask(t.id);
});

test("pre-flight names the task's library when its Figma keys are missing", async () => {
  const task = store.createTask({ title: "Tools todo", prompt: "p", profile: "multi", library: "tools" });
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: fakeQuery([]).impl, mcpStatusImpl: MCP_OK });
  await runner.dispatch({ task, col: store.columnOf(store.loadFlow(), "plan"), kind: "start", agent: "planner" }, store.loadSettings(), new AbortController());
  const b = store.getTask(task.id).blocker;
  assert.match(b.title, /This task has no Figma file yet/);
  assert.match(b.detail, /figma\.libraries → tools: work_file in profiles\/multi\.yaml for every Multi \(Tools\) task/);
  store.deleteTask(task.id);
});

test("connections: only the exactly-named server counts, and fixes switch with claude-profile", async () => {
  const { missingMcp, claudeAs } = await import("./connections.mjs");
  const servers = [{ name: "plugin:figma:figma", status: "connected" }, { name: "figma", status: "failed" }];
  const miss = missingMcp(["figma"], servers, "client");
  assert.match(miss.title, /Figma is failed for the client account/);
  assert.equal(miss.fix, "claude-profile use client && claude, then /mcp → figma → Authenticate");
  assert.equal(missingMcp(["figma"], [{ name: "figma", status: "connected" }], "client"), null);
  assert.equal(claudeAs("default"), "command claude");
});

test("connections: Google Drive's add command brings its own OAuth client", async () => {
  const { mcpAddCommand } = await import("./connections.mjs");
  assert.equal(mcpAddCommand("gdrive", "client"),
    "claude-profile use client && claude mcp add --scope user --transport http --client-id <google-oauth-client-id> --client-secret gdrive https://drivemcp.googleapis.com/mcp/v1");
  assert.equal(mcpAddCommand("figma", "default"), "command claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp");
});

/** Pauses the cards earlier tests left behind, so a tick only works on this test's card. */
const pauseOthers = () => { for (const t of store.listTasks()) store.updateTask(t.id, (x) => { x.status = "paused"; }); };

test("chat: a question on a waiting card gets a quick reply, and the card doesn't move or work", async () => {
  pauseOthers();
  const task = store.createTask({ title: "Question edit", prompt: "p" });
  store.moveTask(task.id, "designing");
  store.appendChat(task.id, { from: "you", column: "designing", text: "What's that held state?" });
  const { impl, calls, chatCalls } = fakeQuery([], [{ reply: "It's the brand's unspent clearance.\n\nIt goes away once the retry is used.", handled: true }]);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK, lintImpl: async () => { throw new Error("must not lint"); } });
  runner.running = true;
  await runner.tick();
  assert.deepEqual(runner.status().replying, [task.id], "the chat shows the agent replying");
  assert.equal(store.getTask(task.id).status, "idle", "a chat reply never marks the card working");
  await until(() => runner.replying.size === 0);
  await runner.tick();
  assert.equal(calls.length, 0, "no full agent turn for a question");
  assert.equal(chatCalls[0].options.model, "claude-sonnet-5-5");
  assert.match(chatCalls[0].prompt, /isn't working on this card right now/);
  assert.equal(store.readChat(task.id).at(-1).text, "It's the brand's unspent clearance.\n\nIt goes away once the retry is used.");
  assert.equal(store.undelivered(task.id).length, 0);
  assert.deepEqual(runner.status().replying, []);
  store.deleteTask(task.id);
});

test("answered: a question the quick chat passes on gets the agent's reply, no lint, the card rests", async () => {
  pauseOthers();
  const task = store.createTask({ title: "Deep question", prompt: "p" });
  store.moveTask(task.id, "designing");
  store.appendChat(task.id, { from: "you", column: "designing", text: "Why that layout?" });
  const { impl, calls } = fakeQuery([{ result: { status: "answered", summary: "Because the plan puts setup first." } }]);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK, lintImpl: async () => { throw new Error("must not lint"); } });
  runner.running = true;
  await runner.tick();
  await until(() => calls.length === 1 && store.getTask(task.id).status === "idle");
  assert.match(calls[0].prompt, /only asks a question, answer it and change nothing \(status answered\)/);
  assert.match(calls[0].options.agents.designer.prompt, /Never talk about them in the third person \("Bruno asked…"/);
  assert.equal(store.readChat(task.id).filter((m) => m.from === "agent").length, 1, "an empty quick reply posts nothing");
  assert.equal(store.readChat(task.id).at(-1).text, "Because the plan puts setup first.");
  store.deleteTask(task.id);
});

test("answered: a question on a card waiting for answers keeps it waiting", async () => {
  pauseOthers();
  const task = store.createTask({ title: "Still waiting", prompt: "p" });
  store.moveTask(task.id, "plan");
  const asked = { status: "needs_input", summary: "One thing first.", questions: [{ question: "Mobile only?" }] };
  const { impl } = fakeQuery([{ result: asked }, { result: { status: "answered", summary: "Mobile means the 390 phone layout." } }]);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK });
  runner.running = true;
  await runner.tick();
  await until(() => store.getTask(task.id).status === "needs_input");
  store.appendChat(task.id, { from: "you", column: "plan", text: "What do you mean by mobile?" });
  await runner.tick();
  await until(() => runner.replying.size === 0);
  await runner.tick();
  await until(() => store.readChat(task.id).at(-1).text === "Mobile means the 390 phone layout.");
  await until(() => store.getTask(task.id).status === "needs_input");
  assert.equal(store.openQuestions(task.id).questions[0].question, "Mobile only?");
  store.deleteTask(task.id);
});

test("busy agent: a question gets a reply now, a request waits for the step to end", async () => {
  pauseOthers();
  const task = store.createTask({ title: "Busy", prompt: "p" });
  store.moveTask(task.id, "designing");
  store.updateTask(task.id, (t) => { t.status = "working"; t.activity = "Working in Figma"; });
  const { impl, chatCalls } = fakeQuery([], [
    { reply: "It's the held request row.", handled: true },
    { reply: "I'll make it red as soon as this step ends.", handled: false },
  ]);
  const runner = new runnerMod.Runner({ log: () => {}, cheatsheetImpl: NO_SHEET, queryImpl: impl, mcpStatusImpl: MCP_OK });
  runner.running = true;
  runner.inflight.set(task.id, new AbortController()); // the designer is mid-step

  const q = store.appendChat(task.id, { from: "you", column: "designing", text: "What's that held state?" });
  await runner.tick();
  await until(() => store.readChat(task.id).at(-1).text === "It's the held request row.");
  assert.deepEqual(chatCalls[0].options.tools, ["Read", "Glob", "Grep"]);
  assert.equal(chatCalls[0].options.resume, undefined, "a side session, never the busy one");
  assert.match(chatCalls[0].prompt, /right now: Working in Figma/);
  assert.equal(store.undelivered(task.id).length, 0, "a fully answered question counts as read");

  store.appendChat(task.id, { from: "you", column: "designing", text: "Make the button red" });
  await runner.tick();
  await until(() => store.readChat(task.id).at(-1).text === "I'll make it red as soon as this step ends.");
  await until(() => runner.replying.size === 0);
  assert.deepEqual(store.undelivered(task.id).map((m) => m.text), ["Make the button red"], "the request waits for the agent");
  await runner.tick();
  assert.equal(chatCalls.length, 2, "never replied to twice");
  assert.equal(store.readChat(task.id).find((m) => m.id === q.id).replied, true);
  store.deleteTask(task.id);
});

test("agents address the owner by the name in settings, never a hardcoded one", () => {
  for (const name of ["planner", "designer", "builder"]) {
    const def = runnerMod.loadAgent(name);
    assert.doesNotMatch(def.prompt + def.description, /\{\{owner\}\}/, `${name} has an unfilled {{owner}}`);
    assert.match(def.prompt, /Bruno/, `${name} names the owner from settings.yaml`);
  }
  assert.equal(store.personalize("{{owner}} wrote", { owner: "Ana" }), "Ana wrote");
  assert.equal(store.personalize("{{owner}} wrote", { owner: "" }), "the owner wrote");
});

test("with no settings.yaml the board reads settings.example.yaml; saving writes settings.yaml", () => {
  const own = path.join(root, "settings.yaml");
  const example = path.join(root, "settings.example.yaml");
  const saved = readFileSync(own, "utf8");
  writeFileSync(example, "owner: \"\"\nprofile: \"\"\naccount: default\nagents: {}\n");
  rmSync(own);
  try {
    const s = store.loadSettings();
    assert.equal(s.profile, "");
    assert.equal(store.ownerName(s), "the owner");
    assert.throws(() => store.createTask({ title: "x", prompt: "y" }), /pick a project first/);
    store.saveSettings({ ...s, owner: "Ana" });
    assert.ok(existsSync(own));
    assert.match(readFileSync(example, "utf8"), /owner: ""/, "the example is never written");
  } finally {
    writeFileSync(own, saved);
    rmSync(example);
  }
});

test("a project with no code repo is design only and works in its own folder", () => {
  const profile = { name: "sketches", figma: { library_file: "LIB", work_file: "WORK" } };
  assert.deepEqual(store.kindsFor(profile), ["design"]);
  const resolved = store.resolveProfile(profile, {});
  assert.equal(resolved.repo, path.join(root, "board", "projects", "sketches"));
  assert.ok(existsSync(resolved.repo));
  assert.equal(resolved.project_folder, true);
  assert.deepEqual(store.kindsFor({ ...profile, repo: "/somewhere" }), ["full", "design"]);
});

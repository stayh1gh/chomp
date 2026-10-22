// Slack notifications: pasted credentials, the DM per stop and its thread, replies to the
// card's assistant, the buttons, and the Socket Mode frames (acked, deduped, only Bruno's).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REAL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = mkdtempSync(path.join(os.tmpdir(), "agentos-slack-"));
const ME = "U0BRUNO123";
let store, slackMod, companions, flow;

before(async () => {
  cpSync(path.join(REAL_ROOT, "flow.yaml"), path.join(root, "flow.yaml"));
  mkdirSync(path.join(root, "profiles"));
  writeFileSync(path.join(root, "profiles", "demo.yaml"), "name: demo\nrepo: /nowhere\n");
  writeFileSync(path.join(root, "settings.yaml"), "profile: demo\naccount: default\nmax_parallel: 1\nagents: {}\n");
  process.env.AGENTOS_ROOT_OVERRIDE = root;
  store = await import("../../board/store.mjs");
  slackMod = await import("./index.mjs");
  companions = await import("../companion/index.mjs");
  flow = store.loadFlow();
});

/** A Slack with fake Web API, socket, assistant and board actions; records what it sent. */
function fake({ answer = "The planner needs 2 answers.", fail = false } = {}) {
  const calls = [];
  const asked = [];
  const acted = [];
  let ts = 100;
  const fetchImpl = async (url, init) => {
    const method = url.split("/").pop();
    const body = JSON.parse(init.body);
    calls.push({ method, body, auth: init.headers.authorization });
    const out = method === "chat.postMessage" ? { ok: true, channel: "D0DM", ts: String(ts++) }
      : method === "auth.test" ? { ok: true, team: "Bruno's" }
      : method === "apps.connections.open" ? { ok: true, url: "wss://example" }
      : { ok: true };
    return { status: 200, json: async () => out };
  };
  const queryImpl = ({ prompt, options }) => {
    asked.push({ prompt, options });
    return (async function* () {
      if (fail) throw new Error("no auth");
      yield { type: "system", session_id: options.resume ?? "s-1" };
      yield { type: "result", subtype: "success", result: answer, session_id: options.resume ?? "s-1" };
    })();
  };
  const s = new slackMod.Slack({ log: () => {}, fetchImpl, queryImpl, act: async (id, action) => acted.push([id, action]), WebSocketImpl: class {} });
  return { s, calls, asked, acted, posts: () => calls.filter((c) => c.method === "chat.postMessage") };
}

function configure() {
  writeFileSync(path.join(root, "board", ".slack.json"), JSON.stringify({ bot_token: "xoxb-1", app_token: "xapp-1", user_id: ME }));
}

test("credentials: token shapes and member id are checked, trimmed", () => {
  const ok = slackMod.checkCredentials({ bot_token: " xoxb-1-2 ", app_token: "xapp-1-A", user_id: "U0BRUNO123\n" });
  assert.deepEqual(ok, { bot_token: "xoxb-1-2", app_token: "xapp-1-A", user_id: "U0BRUNO123" });
  assert.throws(() => slackMod.checkCredentials({ ...ok, bot_token: "xoxp-1" }), /starts with xoxb-/);
  assert.throws(() => slackMod.checkCredentials({ ...ok, app_token: "xoxb-1" }), /starts with xapp-/);
  assert.throws(() => slackMod.checkCredentials({ ...ok, user_id: "bruno" }), /member ID/);
});

test("configure saves only after Slack accepts the bot token, readable by you alone", async () => {
  const { s, calls } = fake();
  s.start = async () => {};
  s.error = "pretend"; // skip the wait for hello
  await s.configure({ bot_token: "xoxb-9", app_token: "xapp-9", user_id: ME });
  assert.equal(calls[0].method, "auth.test");
  assert.equal(calls[0].auth, "Bearer xoxb-9");
  assert.equal(s.config().team, "Bruno's");
  assert.equal(statSync(path.join(root, "board", ".slack.json")).mode & 0o777, 0o600);
});

test("readiness says what's missing", () => {
  const { s } = fake();
  configure();
  assert.match(s.readiness().title, /isn't connected/);
  s.connected = true;
  assert.equal(s.readiness(), null);
});

test("buttons: Retry when blocked, Start when paused, else Pause", () => {
  const ids = (t) => slackMod.buttonsFor({ id: "x", column: "plan", ...t }).map((b) => b.action_id);
  assert.deepEqual(ids({ status: "blocked" }), ["agentos_retry", "agentos_pause"]);
  assert.deepEqual(ids({ status: "paused" }), ["agentos_start"]);
  assert.deepEqual(ids({ status: "needs_input" }), ["agentos_pause"]);
  assert.deepEqual(ids({ status: "idle", column: "done" }), []);
});

test("a stop opens the card's thread; the next one posts in it, sent to the DM too", async () => {
  configure();
  const { s, posts, asked } = fake();
  const task = store.createTask({ title: "Vault page", prompt: "Design the vault" });
  store.updateTask(task.id, (t) => { t.status = "needs_input"; });

  await s.notify(store.getTask(task.id), { reason: "questions", key: "plan:questions:m1" });
  const first = posts()[0].body;
  assert.equal(first.channel, ME);
  assert.equal(first.thread_ts, undefined);
  assert.match(first.blocks[0].text.text, /Vault page\*\nThe planner needs 2 answers\./);
  assert.match(asked[0].options.systemPrompt.append, /assistant in Slack/);
  assert.ok(!asked[0].options.tools.some((t) => /Bash|Write|Edit/.test(t)), "no shell, no writes");
  assert.deepEqual(asked[0].options.allowedTools.filter((t) => t.startsWith("mcp__")), ["mcp__agentos"]);
  assert.deepEqual(store.getTask(task.id).slack, { stop_key: "plan:questions:m1", channel: "D0DM", thread_ts: "100", session_id: "s-1", notified_at: store.getTask(task.id).slack.notified_at });

  await s.notify(store.getTask(task.id), { reason: "blocked", key: "plan:blocked:b1" });
  const second = posts()[1].body;
  assert.equal(second.channel, "D0DM");
  assert.equal(second.thread_ts, "100");
  assert.equal(second.reply_broadcast, true);
  assert.equal(asked[1].options.resume, "s-1", "the conversation carries over");
});

test("when the assistant fails, a plain notice still goes out", async () => {
  configure();
  const { s, posts } = fake({ fail: true });
  const task = store.createTask({ title: "Settings", prompt: "x" });
  await s.notify(store.getTask(task.id), { reason: "blocked", key: "k" });
  assert.match(posts()[0].body.text, /stopped: the agent is stuck and needs you/);
});

test("companionsDue with Slack: once per stop, keyed on the Slack message", () => {
  const on = { companions: { enabled: true, via: "slack" } };
  const t = { id: "a", column: "plan", status: "needs_input", history: [] };
  const chats = { a: [{ id: "m1", from: "agent" }] };
  assert.equal(companions.companionsDue([t], on, flow, chats).length, 1);
  assert.equal(companions.companionsDue([{ ...t, slack: { stop_key: "plan:questions:m1" } }], on, flow, chats).length, 0);
  assert.equal(companions.companionsDue([{ ...t, companion: { stop_key: "plan:questions:m1" } }], on, flow, chats).length, 1, "a phone chat doesn't count");
});

test("Bruno's reply in a card's thread goes to that card's assistant", async () => {
  configure();
  const { s, posts, asked, calls } = fake({ answer: "Got it, the planner is moving again." });
  const task = store.createTask({ title: "Inbox", prompt: "x" });
  store.updateTask(task.id, (t) => { t.slack = { channel: "D0DM", thread_ts: "555.1", session_id: "s-9" }; });

  await s.onMessage({ type: "message", channel_type: "im", channel: "D0DM", user: ME, text: "1 yes &amp; 2 the &lt;second&gt;", ts: "556.0", thread_ts: "555.1" }, "Ev1");
  assert.equal(asked[0].options.resume, "s-9");
  assert.match(asked[0].prompt, /1 yes & 2 the <second>/);
  assert.deepEqual(posts().at(-1).body, { channel: "D0DM", thread_ts: "555.1", text: "Got it, the planner is moving again.", unfurl_links: false });
  assert.ok(calls.some((c) => c.method === "reactions.add"));

  await s.onMessage({ type: "message", channel_type: "im", channel: "D0DM", user: ME, text: "again", ts: "556.0", thread_ts: "555.1" }, "Ev1");
  assert.equal(asked.length, 1, "a redelivered event runs once");
});

test("messages that aren't Bruno's, or the bot's own, are ignored; top-level ones get a pointer", async () => {
  configure();
  const { s, posts, asked } = fake();
  const base = { type: "message", channel_type: "im", channel: "D0DM", text: "hi", ts: "1.0", thread_ts: "555.1" };
  await s.onMessage({ ...base, user: "U0SOMEONE" });
  await s.onMessage({ ...base, user: ME, bot_id: "B1" });
  await s.onMessage({ ...base, user: ME, subtype: "message_changed" });
  assert.equal(posts().length + asked.length, 0);
  await s.onMessage({ ...base, user: ME, thread_ts: undefined });
  assert.match(posts()[0].body.text, /Reply in a card's thread/);
});

test("buttons act on the card through the board, and only for Bruno", async () => {
  configure();
  const { s, acted, posts } = fake();
  const task = store.createTask({ title: "Profile", prompt: "x" });
  store.updateTask(task.id, (t) => { t.slack = { channel: "D0DM", thread_ts: "700.1" }; });
  const click = (user, action) => s.onAction({ type: "block_actions", user: { id: user }, channel: { id: "D0DM" }, message: { ts: "700.1" }, actions: [{ action_id: `agentos_${action}`, value: task.id }] });

  await click("U0SOMEONE", "retry");
  assert.deepEqual(acted, []);
  await click(ME, "retry");
  await click(ME, "move"); // not a button Chomp has
  assert.deepEqual(acted, [[task.id, "retry"]]);
  assert.deepEqual(posts().map((p) => [p.body.thread_ts, p.body.text]), [["700.1", "Trying again."]]);
});

test("Socket Mode frames: hello connects, envelopes are acked, disconnect reconnects", async () => {
  configure();
  const { s } = fake();
  const sent = [];
  const ws = { send: (m) => sent.push(JSON.parse(m)), close: () => {} };
  let handled = 0;
  s.onAction = async () => { handled++; };
  s.onFrame(ws, JSON.stringify({ type: "hello" }));
  assert.equal(s.connected, true);
  s.onFrame(ws, JSON.stringify({ type: "interactive", envelope_id: "e1", payload: { type: "block_actions" } }));
  assert.deepEqual(sent, [{ envelope_id: "e1" }]);
  assert.equal(handled, 1);
  s.stopped = true; // don't actually reconnect
  s.onFrame(ws, JSON.stringify({ type: "disconnect", reason: "refresh_requested" }));
  assert.equal(s.connected, false);
});

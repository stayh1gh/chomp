/**
 * Slack notifications: the "Slack" choice under Notify me via. When a card stops because it
 * needs the owner, the Chomp bot DMs them, one thread per card ("AOS-12 · Vault page"), saying in
 * plain words what's needed. Their replies in that thread go to a headless assistant with the
 * phone chat's prompt, tools and limits (harness/companion): it can answer questions, pass on
 * instructions, retry, pause or start the card, but never move it or open a PR. Retry, Pause
 * and Start are also buttons on each message.
 *
 * Socket Mode: the board opens an outgoing WebSocket to Slack, so nothing needs a public URL
 * and it only runs while the board does. Tokens and the owner's member ID live in
 * board/.slack.json (gitignored, 0600); messages and clicks from anyone else are ignored.
 *
 * One stop, one message; the next stop posts in the same thread (also sent to the DM) and the
 * assistant resumes the same conversation (task.slack.session_id).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import * as store from "../../board/store.mjs";
import { envFor } from "../runner/connections.mjs";
import { companionPrompt, stopMessage, DEFAULT_MODEL } from "../companion/index.mjs";
import { callTool } from "../companion/mcp.mjs";

const MCP = path.join(store.AGENTOS_ROOT, "harness", "companion", "mcp.mjs");
export const MANIFEST = path.join(store.AGENTOS_ROOT, "harness", "slack", "manifest.yaml");
const configFile = () => path.join(store.AGENTOS_ROOT, "board", ".slack.json");

const FALLBACK = {
  questions: "the agent has questions for you",
  blocked: "the agent is stuck and needs you",
  review: "a step finished and is waiting for you to look",
  your_turn: "it reached a step that's yours",
};
const DONE = { retry: "Trying again.", pause: "Paused.", start: "Started again." };

/** Pure: checks pasted credentials, trimmed. Throws a plain message on a bad one. */
export function checkCredentials({ bot_token, app_token, user_id } = {}) {
  const c = { bot_token: String(bot_token ?? "").trim(), app_token: String(app_token ?? "").trim(), user_id: String(user_id ?? "").trim() };
  if (!/^xoxb-[\w-]+$/.test(c.bot_token)) throw new Error("The bot token starts with xoxb- (OAuth & Permissions → Bot User OAuth Token).");
  if (!/^xapp-[\w-]+$/.test(c.app_token)) throw new Error("The app token starts with xapp- (Basic Information → App-Level Tokens, scope connections:write).");
  if (!/^[UW][A-Z0-9]{6,}$/.test(c.user_id)) throw new Error("Your member ID looks like U0123ABCD (your Slack profile → ⋯ → Copy member ID).");
  return c;
}

/** Pure: Slack's &amp; &lt; &gt; back to text. */
export function unescape(text) {
  return String(text ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** Pure: the buttons that make sense for the card right now. */
export function buttonsFor(task) {
  const actions = [];
  if (task.status === "blocked") actions.push(["retry", "Retry", "primary"]);
  if (task.status === "paused") actions.push(["start", "Start", "primary"]);
  else if (task.column !== "done") actions.push(["pause", "Pause"]);
  return actions.map(([action, label, style]) => ({ type: "button", action_id: `agentos_${action}`, text: { type: "plain_text", text: label }, value: task.id, ...(style ? { style } : {}) }));
}

/** Pure: a stop's message as Block Kit. */
export function stopBlocks(task, text, boardUrl) {
  const buttons = buttonsFor(task);
  return [
    { type: "section", text: { type: "mrkdwn", text: `*${task.ref} · ${task.title}*\n${text}`.slice(0, 3000) } },
    ...(buttons.length ? [{ type: "actions", elements: buttons }] : []),
    { type: "context", elements: [{ type: "mrkdwn", text: `Reply in this thread · <${boardUrl}/task/${task.id}|Open on the board> (on the Mac)` }] },
  ];
}

export class Slack {
  constructor({ log = console.log, fetchImpl = (...a) => fetch(...a), WebSocketImpl = globalThis.WebSocket, queryImpl = query, act = callTool } = {}) {
    this.log = log;
    this.fetch = fetchImpl;
    this.WebSocket = WebSocketImpl;
    this.query = queryImpl;
    this.act = act;
    this.port = Number(process.env.AGENTOS_PORT) || 4400;
    this.ws = null;
    this.connected = false;
    this.error = null;
    this.team = null;
    this.stopped = true;
    this.backoff = 1000;
    this.seen = new Set(); // event ids already handled; Slack redelivers on a slow ack
    this.queues = new Map(); // task id → the last queued job, so one task's turns don't overlap
  }

  config() {
    try {
      return existsSync(configFile()) ? JSON.parse(readFileSync(configFile(), "utf8")) : null;
    } catch {
      return null;
    }
  }

  status() {
    const c = this.config();
    return { configured: Boolean(c), user_id: c?.user_id ?? null, team: this.team ?? c?.team ?? null, connected: this.connected, error: this.error };
  }

  /** What stops Slack notifications, as { title, fix }, or null when they can go out. */
  readiness() {
    if (!this.config()) return { title: "Slack isn't set up yet", fix: "Settings → Notifications → Slack: paste the two tokens and your member ID" };
    if (!this.connected) return { title: `Slack isn't connected${this.error ? `: ${this.error}` : ""}`, fix: "Check the tokens in Settings → Notifications, then save them again" };
    return null;
  }

  async api(method, body = {}, token = this.config()?.bot_token) {
    const res = await this.fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    if (!json.ok) throw new Error(`Slack ${method}: ${json.error ?? "failed"}`);
    return json;
  }

  /** Saves pasted credentials once Slack accepts the bot token, then (re)connects. */
  async configure(input) {
    const c = checkCredentials(input);
    const auth = await this.api("auth.test", {}, c.bot_token);
    mkdirSync(path.dirname(configFile()), { recursive: true });
    writeFileSync(configFile(), JSON.stringify({ ...c, team: auth.team ?? null }, null, 1), { mode: 0o600 });
    this.team = auth.team ?? null;
    this.stop();
    await this.start({ port: this.port, log: this.log });
    // Settings shows the outcome, so give Slack's hello a moment to arrive.
    for (let i = 0; i < 25 && !this.connected && !this.error; i++) await new Promise((r) => setTimeout(r, 200));
    return this.status();
  }

  async start({ port, log } = {}) {
    if (port) this.port = port;
    if (log) this.log = log;
    this.stopped = false;
    if (!this.config()) return;
    await this.connect().catch((err) => this.fail(err));
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    try {
      ws?.close();
    } catch {}
  }

  fail(err) {
    this.connected = false;
    this.error = String(err.message ?? err);
    this.log(`[slack] ${this.error}`);
    this.reconnect();
  }

  reconnect() {
    if (this.stopped || !this.config()) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect().catch((err) => this.fail(err)), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 60_000);
  }

  async connect() {
    const c = this.config();
    if (!c || this.stopped) return;
    const { url } = await this.api("apps.connections.open", {}, c.app_token);
    if (this.stopped) return;
    const ws = new this.WebSocket(url);
    this.ws = ws;
    ws.addEventListener("message", (e) => this.onFrame(ws, e.data));
    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      this.connected = false;
      this.reconnect();
    });
    ws.addEventListener("error", () => {}); // close follows
  }

  /** One Socket Mode frame: ack first (Slack redelivers after 3 s), then handle. */
  onFrame(ws, data) {
    let frame;
    try {
      frame = JSON.parse(String(data));
    } catch {
      return;
    }
    if (frame.type === "hello") {
      this.connected = true;
      this.error = null;
      this.backoff = 1000;
      this.log("[slack] connected");
      return;
    }
    if (frame.type === "disconnect") {
      // Slack rotates connections; open the next one now.
      if (this.ws === ws) this.ws = null;
      this.connected = false;
      try {
        ws.close();
      } catch {}
      this.backoff = 1000;
      this.reconnect();
      return;
    }
    if (frame.envelope_id) ws.send(JSON.stringify({ envelope_id: frame.envelope_id }));
    const p = frame.payload ?? {};
    const handle = frame.type === "events_api" && p.event?.type === "message" ? this.onMessage(p.event, p.event_id)
      : frame.type === "interactive" && p.type === "block_actions" ? this.onAction(p)
      : null;
    handle?.catch((err) => this.log(`[slack] ${err.message ?? err}`));
  }

  /** Runs `job` after the task's previous one, so replies land in order. */
  enqueue(taskId, job) {
    const next = (this.queues.get(taskId) ?? Promise.resolve()).then(job, job);
    this.queues.set(taskId, next.catch(() => {}));
    return next;
  }

  /** A turn of the task's assistant: `prompt` in, its last words out. */
  async ask(task, prompt, { settings = store.loadSettings(), resume = null } = {}) {
    const q = this.query({
      prompt,
      options: {
        cwd: store.taskDir(task.id),
        env: envFor(task.account, { AGENTOS_PORT: String(this.port) }),
        model: store.accountSettings(settings, task.account).companion_model ?? DEFAULT_MODEL,
        systemPrompt: { type: "preset", preset: "claude_code", append: companionPrompt(task, { where: "slack" }) },
        // Reading the task folder and the Chomp tools; no shell, no writes.
        tools: ["Read", "Glob", "Grep"],
        mcpServers: { agentos: { type: "stdio", command: process.execPath, args: [MCP, task.id], env: { ...process.env, AGENTOS_PORT: String(this.port) } } },
        strictMcpConfig: true,
        settingSources: [],
        allowedTools: ["mcp__agentos", "Read", "Glob", "Grep"],
        permissionMode: "dontAsk",
        maxTurns: 12,
        ...(resume ? { resume } : {}),
      },
    });
    let text = "";
    let sessionId = null;
    for await (const msg of q) {
      if (msg.session_id) sessionId ??= msg.session_id;
      if (msg.type === "assistant") for (const b of msg.message?.content ?? []) if (b.type === "text" && b.text.trim()) text = b.text;
      if (msg.type === "result" && msg.subtype === "success" && msg.result?.trim()) text = msg.result;
    }
    if (!text.trim()) throw new Error("the assistant didn't write anything");
    return { text: text.trim(), sessionId };
  }

  boardUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  /** The DM for one stop: the first opens the card's thread, later ones post in it. */
  notify(task, stop, settings = store.loadSettings()) {
    // Claimed up front, so the runner's next tick doesn't send this stop twice.
    store.updateTask(task.id, (t) => { t.slack = { ...t.slack, stop_key: stop.key }; });
    return this.enqueue(task.id, async () => {
      const c = this.config();
      if (!c) throw new Error("Slack isn't set up");
      const current = store.getTask(task.id) ?? task;
      let text = `${current.ref} stopped: ${FALLBACK[stop.reason] ?? "it needs you"}. Open the board to see what's needed.`;
      let sessionId = current.slack?.session_id ?? null;
      try {
        ({ text, sessionId } = await this.ask(current, stopMessage(current, stop, { where: "slack" }), { settings, resume: sessionId }));
      } catch (err) {
        this.log(`[slack] ${current.ref}: the assistant failed (${err.message ?? err}); sent a plain notice`);
      }
      const thread = current.slack?.thread_ts ?? null;
      const posted = await this.api("chat.postMessage", {
        channel: current.slack?.channel ?? c.user_id,
        text: `${current.ref}: ${text}`,
        blocks: stopBlocks(current, text, this.boardUrl()),
        unfurl_links: false,
        ...(thread ? { thread_ts: thread, reply_broadcast: true } : {}),
      });
      store.updateTask(task.id, (t) => {
        t.slack = { ...t.slack, channel: posted.channel, thread_ts: thread ?? posted.ts, ...(sessionId ? { session_id: sessionId } : {}), notified_at: new Date().toISOString() };
      });
      return { channel: posted.channel, ts: posted.ts };
    });
  }

  reply(channel, thread_ts, text) {
    return this.api("chat.postMessage", { channel, thread_ts, text, unfurl_links: false });
  }

  /** The owner wrote in the DM. In a card's thread it goes to that card's assistant. */
  async onMessage(event, eventId) {
    const c = this.config();
    if (!c || event.channel_type !== "im" || event.bot_id || event.subtype || event.user !== c.user_id) return;
    if (eventId) {
      if (this.seen.has(eventId)) return;
      this.seen.add(eventId);
      if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value);
    }
    if (!event.thread_ts) {
      await this.reply(event.channel, event.ts, "Reply in a card's thread so I know which task you mean.");
      return;
    }
    const task = store.listTasks().find((t) => t.slack?.thread_ts === event.thread_ts);
    if (!task) {
      await this.reply(event.channel, event.thread_ts, "That card isn't on the board anymore.");
      return;
    }
    await this.api("reactions.add", { channel: event.channel, timestamp: event.ts, name: "eyes" }).catch(() => null);
    return this.enqueue(task.id, async () => {
      const current = store.getTask(task.id) ?? task;
      let text;
      try {
        const out = await this.ask(current, `${store.ownerName()} replied in Slack:\n\n${unescape(event.text)}`, { resume: current.slack?.session_id ?? null });
        text = out.text;
        if (out.sessionId) store.updateTask(task.id, (t) => { t.slack = { ...t.slack, session_id: out.sessionId }; });
      } catch (err) {
        this.log(`[slack] ${task.ref}: ${err.message ?? err}`);
        text = "Something went wrong on my side, so nothing was passed on. Try again, or answer on the board.";
      }
      await this.reply(event.channel, event.thread_ts, text);
    });
  }

  /** A Retry, Pause or Start button. */
  async onAction(payload) {
    const c = this.config();
    if (!c || payload.user?.id !== c.user_id) return;
    for (const a of payload.actions ?? []) {
      const action = a.action_id?.replace(/^agentos_/, "");
      if (!DONE[action]) continue;
      const task = store.getTask(a.value);
      const channel = payload.channel?.id ?? payload.container?.channel_id;
      const thread = payload.message?.thread_ts ?? payload.message?.ts ?? payload.container?.message_ts;
      if (!task) {
        await this.reply(channel, thread, "That card isn't on the board anymore.");
        continue;
      }
      let text = DONE[action];
      try {
        await this.act(task.id, action);
      } catch (err) {
        text = `Couldn't do that: ${err.message ?? err}`;
      }
      await this.reply(channel, task.slack?.thread_ts ?? thread, text);
    }
  }

  /** A test DM from Settings. */
  async test() {
    const c = this.config();
    if (!c) throw new Error("Slack isn't set up");
    await this.api("chat.postMessage", { channel: c.user_id, text: "Chomp is connected. When a card needs you, it'll message you here." });
  }
}

/** The board's one connection: serve.mjs starts it, the runner sends through it. */
export const slack = new Slack();

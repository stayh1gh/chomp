/**
 * The runner: watches the board and runs whichever agent owns each card's column.
 *
 * Lives inside the board server (harness/dashboard/serve.mjs) and starts with it. One
 * loop, three kinds of work (pickWork):
 *   start   — a card sitting `queued` in an agent column
 *   resume  — a card whose agent is waiting (needs_input / ready / blocked by itself) and
 *             you've written in its chat; your messages are delivered by resuming the
 *             column's session, so the agent keeps its context
 *   edit    — you wrote in the chat of a card in a human column that has a `chat_agent`
 *             (Designing → designer): a small, scoped change, the card stays put
 *
 * Every dispatch: pre-flight (agent exists, required MCP servers connected) → query() with
 * the agent's definition, the account's login and the guard as a PreToolUse hook → the
 * turn-result block at the end decides what happens to the card. Agents never write the
 * board; this file does, through board/store.mjs.
 */

import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { load as loadYaml } from "js-yaml";
import * as store from "../../board/store.mjs";
import { checkTool } from "./guard.mjs";
import { extractTurnJson, validateTurn, normalizeQuestions, answersToProse } from "./turn-result.mjs";
import { mcpStatus, missingMcp, envFor, claudeAs } from "./connections.mjs";
import { runLint, dsNamesFor, parseFigmaUrl, figmaPageUrl, lintMarkdown, lintViewports } from "../figma/lint.mjs";
import { ensureCheatsheet, cheatsheetPath } from "../figma/cheatsheet.mjs";
import * as companions from "../companion/index.mjs";
import { slack } from "../slack/index.mjs";

const ROOT = store.AGENTOS_ROOT;
const RECHECK_MS = 60_000;
const MAX_LINT_FIXES = 2;
// Chat replies (Runner.chatReply) favour speed over depth: settings.chat.model overrides.
const CHAT_MODEL = "claude-sonnet-5-5";
const execFileP = promisify(execFile);
const run = async (cmd, args, opts) => (await execFileP(cmd, args, { maxBuffer: 10 * 1024 * 1024, ...opts })).stdout.trim();
const AUTH_ERROR = /failed to authenticate|oauth session expired|not logged in|please run \/login|invalid api key/i;

// ── agent definitions ──────────────────────────────────────────────────────────────────

const TURN_CONTRACT = `
## Ending every turn

Nobody watches this session live. Finish every turn with exactly one fenced \`\`\`json block,
and nothing after it:

\`\`\`json
{
  "status": "done | answered | needs_input | blocked",
  "summary": "your message to {{owner}} in the task's chat (see below)",
  "questions": [{ "id": "q1", "question": "…", "options": ["…", "…"], "recommended": "…" }],
  "blocker": "what you need from {{owner}}, when status is blocked",
  "links": { "figma": "https://…", "pr": "https://…" },
  "figma_nodes": ["12:34", "designer only: ids of the sections/frames you made or changed"]
}
\`\`\`

- \`done\`: this column's work (or the change {{owner}} asked for) is finished.
- \`answered\`: {{owner}} only asked a question or chatted, and you replied without changing
  anything. The card stays exactly as it was; nothing is linted or moved.
- \`needs_input\`: you need answers before you can continue well — 1 to 5 questions, each with
  options when there are natural choices and your recommended answer. The answers come back
  as the next message in this same session.
- \`blocked\`: you can't continue at all (missing access, missing source). Say exactly what
  would unblock you in \`blocker\`.
- \`questions\`, \`blocker\` and \`links\` are only included when they apply.

### The summary is a chat message to {{owner}}

Write it the way Claude replies in a chat: to {{owner}}, as "you", about your own work as "I".
Never talk about them in the third person ("{{owner}} asked…", "Answered {{owner}}'s question") and
never narrate yourself ("The designer fixed…").

- When their newest message asks something, answer it in your first sentence, plainly.
- Markdown: short paragraphs separated by a blank line (\`\\n\\n\` inside the JSON string),
  a \`-\` list when you name three or more things, **bold** sparingly, \`code\` for names.
- Keep it short: a few sentences for a small turn, a short paragraph plus a list for a big
  one. Lead with what matters to them; skip preamble and sign-offs.
`;

/** An agent's definition, personalized for the project it's working on (its Figma colors). */
export function loadAgent(name, project = null) {
  const file = path.join(ROOT, "agents", `${name}.md`);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`agents/${name}.md has no frontmatter`);
  const fm = loadYaml(m[1]) ?? {};
  const skills = (fm.skills ?? []).map((s) => {
    const skillFile = path.join(ROOT, "skills", name, s, "SKILL.md");
    if (!existsSync(skillFile)) throw new Error(`agents/${name}.md names skill "${s}" but ${path.relative(ROOT, skillFile)} doesn't exist`);
    return `\n\n---\n\n${readFileSync(skillFile, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "")}`;
  });
  const def = {
    name,
    description: store.personalize(fm.description ?? name, undefined, project),
    tools: String(fm.tools ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    writes: fm.writes ?? [],
    bash: fm.bash ?? [],
    prompt: store.personalize(m[2].trim() + skills.join("") + "\n" + TURN_CONTRACT, undefined, project),
  };
  // A session keeps the instructions it started with, so the runner only resumes one
  // whose agent definition (prompt, skills, tools, allowlists) hasn't changed since.
  def.version = createHash("sha1").update(JSON.stringify([def.prompt, def.tools, def.writes, def.bash])).digest("hex").slice(0, 12);
  return def;
}

// ── what to work on ────────────────────────────────────────────────────────────────────

/** Pure: the work this tick should start, in board order. */
export function pickWork(tasks, flow, { inflight = new Set(), undeliveredById = {}, now = Date.now() } = {}) {
  const work = [];
  for (const t of tasks) {
    if (inflight.has(t.id) || t.status === "paused") continue;
    const col = flow.columns.find((c) => c.id === t.column);
    if (!col) continue;
    const pending = (undeliveredById[t.id] ?? []).length > 0;
    const kind = col.owner === "agent" ? "resume" : col.chat_agent ? "edit" : "no_agent";
    const agent = col.owner === "agent" ? col.agent : col.chat_agent ?? null;

    if (t.status === "blocked") {
      // Same rule in every column: missing connections/agents recheck once a minute, an
      // agent that blocked itself waits for a reply, a failed run waits for Retry.
      const b = t.blocker ?? {};
      const sessionKey = col.owner === "agent" ? col.id : `${col.id}:edit`;
      if (b.kind === "agent" && pending) work.push({ task: t, col, kind, agent });
      else if (["connection", "missing_agent"].includes(b.kind) && now - Date.parse(b.checked_at ?? b.at) > RECHECK_MS) {
        const retryKind = col.owner === "agent" && !t.sessions?.[sessionKey] ? "start" : kind;
        if (col.owner === "agent" || pending) work.push({ task: t, col, kind: retryKind, agent, recheck: true });
      }
    } else if (col.owner === "agent") {
      if (t.status === "queued") work.push({ task: t, col, kind: t.resume_pending ? "resume" : "start", agent });
      else if (pending && ["needs_input", "ready"].includes(t.status)) work.push({ task: t, col, kind: "resume", agent });
    } else if (pending) {
      work.push({ task: t, col, kind, agent });
    }
  }
  return work;
}

/** A card resting on the owner: its agent finished, asked, or blocked itself, or it sits in their column. */
export function waitsOnYou(t) {
  return ["needs_input", "ready", "idle"].includes(t.status) || (t.status === "blocked" && t.blocker?.kind === "agent");
}

// ── prompts ────────────────────────────────────────────────────────────────────────────

function chatTranscript(id, limit = 30) {
  const lines = store.readChat(id).slice(-limit).map((m) => {
    const who = m.from === "you" ? "{{owner}}" : m.from === "agent" ? `agent (${m.column})` : "board";
    if (m.kind === "questions") return `${who}: asked — ${m.questions.map((q) => q.question).join(" / ")}`;
    if (m.kind === "answers") return `${who}: answered — ${Object.values(m.answers ?? {}).join(" / ")}`;
    return `${who}: ${m.text}`;
  });
  return lines.length ? lines.join("\n") : "(empty)";
}

/** flow.yaml's standing_rules: the owner's rules for every project, whatever the profile. */
function standingRules() {
  const rules = store.loadFlow().standing_rules ?? [];
  return rules.length ? `Standing rules (every project, mandatory — they come before the profile's own):\n${rules.map((r) => `- ${r}`).join("\n")}` : null;
}

/** Profile keys a design can't start without: still missing or a TODO placeholder. */
export function missingFigmaFiles(profile) {
  return ["library_file", "work_file"].filter((k) => {
    const v = profile.figma?.[k];
    return !v || /^todo$/i.test(String(v).trim());
  });
}

function contextBlock(staleTask, col, profile) {
  const task = store.getTask(staleTask.id) ?? staleTask; // pick up workspace/figma set this dispatch
  const dir = store.taskDir(task.id);
  const docs = store.listDocs(task.id);
  return [
    `Task: ${task.title} (id ${task.id})`,
    `Column: ${col.title}${col.steps ? ` — checklist: ${col.steps.map((s) => s.name + (s.file ? ` (${s.file})` : "")).join(", ")}` : ""}`,
    `Task folder (write your documents here, top-level .md files only): ${dir}`,
    `Documents so far: ${docs.length ? docs.join(", ") : "none"}`,
    task.workspace && !task.workspace.removed
      ? `Your workspace (cwd): git worktree ${task.workspace.path} on branch ${task.workspace.branch}, cut from origin/${profile.base_branch ?? "main"}. The bound repo's main checkout (${profile.repo}) is off limits.`
      : profile.project_folder
        ? `Project folder (your cwd): ${profile.repo} — this project has no code repo, so it's design only; its docs (e.g. DESIGN.md) live here.`
        : `Bound repo (your cwd): ${profile.repo}`,
    `Chomp root: ${ROOT}`,
    task.figma_file ? `Figma file for this task ({{owner}}'s link, it is your work file): ${task.figma_file.url}` : null,
    task.figma ? `Figma task page: ${task.figma.url} (page id ${task.figma.page_id} in file ${task.figma.file_key})` : null,
    `Task type: ${task.kind === "design" ? "design only — the Figma design is the deliverable; nothing gets built in code, and the card ends after Refinement" : "full — designed in Figma, then built in code in Development"}`,
    standingRules(),
    profile.figma?.library
      ? `Design system for this task: ${profile.figma.library.label} — Figma library ${profile.figma.library_file}, work file ${profile.figma.work_file}` +
        `${profile.design_system?.context?.length ? `, docs ${profile.design_system.context.join(", ")}` : ""}` +
        `${profile.viewports?.length ? `, viewports ${profile.viewports.map((v) => `${v.w}×${v.h}`).join(", ")}` : ""}. ` +
        `Wherever the profile below says figma.library_file / figma.work_file, it means these. Never use another library listed in the profile.`
      : null,
    viewportLine(col, profile),
    col.agent === "designer" || col.chat_agent === "designer" ? cheatsheetLine(profile, ROOT) : null,
    `Profile (profiles/${task.profile}.yaml):\n${readFileSync(path.join(ROOT, "profiles", `${task.profile}.yaml`), "utf8").trim()}`,
    `Redesigning an existing screen: ${task.redesign ? "yes — read the current screen in the repo first" : "no"}`,
    `Request from {{owner}}:\n${task.prompt}`,
    `Chat so far (oldest first):\n${chatTranscript(task.id)}`,
  ].filter(Boolean).join("\n\n");
}

/** The designer's map of the task's library, when the runner has built one. */
function cheatsheetLine(profile, root) {
  const key = profile.figma?.library_file;
  const file = key && cheatsheetPath(root, key);
  if (!file || !existsSync(file)) return null;
  return `DS cheat sheet for this task's library: ${file} — component set keys with their variant and property names, ` +
    `variable and style keys by name. Read it before drawing and import from it; use search_design_system only for what it doesn't list or a key that fails.`;
}

/** For the designer's columns: which viewports this column draws, and where they go. */
export function viewportLine(col, profile) {
  if (col.verify !== "figma-ds-lint" || !profile.viewports?.length) return null;
  const marked = lintViewports(profile.viewports, col.viewports);
  const size = (v) => `${v.w}×${v.h}`;
  const primary = marked.find((v) => v.primary);
  const others = marked.filter((v) => !v.primary);
  const list = marked.map((v) => `${size(v)}${v.primary ? " (primary)" : ""}`).join(", ");
  if (col.viewports === "primary") {
    return `Viewports: ${list}. This column draws the primary viewport only (${size(primary)}); ` +
      `${others.length ? `${others.map(size).join(", ")} ${others.length > 1 ? "are" : "is"} Refinement's, for the picked direction.` : ""}`.trim();
  }
  return `Viewports: ${list}. This column draws every viewport: the primary one in each section, ` +
    `${others.length ? `and each other one in its own sections named "<section> — <width>" (${others.map((v) => `"Final — ${v.w}"`).join(", ")}), never mixed into the primary's.` : ""}`.trim();
}

function messagesProse(msgs) {
  return msgs
    .map((m) => (m.kind === "answers" ? answersToProse(m.questions ?? [], m.answers) : `{{owner}} wrote: ${m.text}`))
    .join("\n\n");
}

export function buildPrompt(work, profile, msgs) {
  return store.personalize(promptFor(work, profile, msgs), undefined, work.task.profile);
}

function promptFor(work, profile, msgs) {
  const { task, col, kind } = work;
  if (kind === "start") {
    return `${contextBlock(task, col, profile)}\n\nRun your process for the ${col.title} column, then end with the turn-result block.`;
  }
  if (kind === "edit") {
    return `${contextBlock(task, col, profile)}\n\nThe card is in ${col.title}, which is {{owner}}'s column — they're working on it themselves. ` +
      `Do exactly what their newest message asks and nothing more; don't run a full column process. ` +
      `If it only asks a question, answer it and change nothing (status answered).\n\n${messagesProse(msgs)}\n\nEnd with the turn-result block.`;
  }
  // resume
  const body = msgs.length ? messagesProse(msgs) : "The board restarted or rechecked while you were working. Continue where you left off.";
  const ask = msgs.some((m) => m.kind !== "answers") ? " If they only asked a question, answer it and stop there (status answered)." : "";
  return `${body}\n\nContinue the ${col.title} column's work, then end with the turn-result block.${ask}`;
}

// ── activity labels ────────────────────────────────────────────────────────────────────

export function activityFor(toolName, input) {
  if (toolName.startsWith("mcp__mobbin")) return "Searching Mobbin";
  if (toolName.includes("figma")) return "Working in Figma";
  if (toolName === "Write" || toolName === "Edit") return `Writing ${path.basename(String(input?.file_path ?? ""))}`;
  if (toolName === "WebFetch") {
    try { return `Reading ${new URL(input.url).host}`; } catch { return "Reading a link"; }
  }
  if (["Read", "Grep", "Glob"].includes(toolName)) return "Reading the codebase";
  if (toolName === "Bash") return "Running commands";
  return null;
}

// ── the runner ─────────────────────────────────────────────────────────────────────────

export class Runner {
  constructor({ log = console.log, queryImpl = query, mcpStatusImpl = mcpStatus, lintImpl = runLint, cheatsheetImpl = ensureCheatsheet, execImpl = run, companionsImpl = companions, slackImpl = slack } = {}) {
    this.exec = execImpl;
    this.companions = companionsImpl;
    this.slack = slackImpl;
    this.log = log;
    this.query = queryImpl;
    this.mcpStatus = mcpStatusImpl;
    this.lint = lintImpl;
    this.cheatsheet = cheatsheetImpl;
    this.running = false;
    this.inflight = new Map(); // task id → AbortController
    this.replying = new Map(); // message id → AbortController of its quick reply (chatReply)
    this.replyingTasks = new Map(); // task id → quick replies in flight, for the chat's "replying…"
    this.timer = null;
    this.ticking = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    // A board restart mid-turn leaves cards `working` with nobody on them.
    for (const t of store.listTasks()) {
      if (t.status === "working" && !this.inflight.has(t.id)) {
        store.updateTask(t.id, (x) => {
          const col = store.columnOf(store.loadFlow(), x.column);
          x.status = col.owner === "agent" ? "queued" : "idle";
          x.activity = null;
        });
      }
    }
    this.timer = setInterval(() => this.tick(), 3000);
    this.tick();
    this.log("[runner] started");
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    for (const [id, ctrl] of this.inflight) {
      ctrl.abort();
      this.log(`[runner] stopped ${id} mid-turn`);
    }
    for (const ctrl of this.replying.values()) ctrl.abort();
    this.replying.clear();
    this.log("[runner] stopped");
  }

  poke() {
    if (this.running) setImmediate(() => this.tick());
  }

  /**
   * Notify me via (settings.companions.via): when a card stops because it needs the owner, open
   * a phone chat for that stop in the Claude app (harness/companion), or DM them on Slack
   * (harness/slack). An account that can't run phone chats (no claude.ai login, folder not
   * trusted), or Slack not set up or connected, is skipped and logged once a minute at most;
   * Connections shows the fix.
   */
  async syncCompanions(tasks, settings, flow) {
    if (!settings.companions?.enabled || this.companionsBusy) return;
    const chats = Object.fromEntries(tasks.map((t) => [t.id, store.readChat(t.id)]));
    const due = this.companions.companionsDue(tasks, settings, flow, chats);
    if (!due.length) return;
    const viaSlack = settings.companions.via === "slack";
    this.companionsBusy = true;
    this.companionReady ??= new Map(); // account (or "slack") → { at, notReady }
    try {
      for (const { task, stop } of due) {
        const key = viaSlack ? "slack" : task.account;
        let ready = this.companionReady.get(key);
        if (!ready || Date.now() - ready.at > RECHECK_MS) {
          ready = { at: Date.now(), notReady: viaSlack ? this.slack.readiness() : await this.companions.companionReadiness(task.account) };
          this.companionReady.set(key, ready);
          if (ready.notReady) this.log(`[${viaSlack ? "slack" : "companion"}] ${ready.notReady.title} — ${ready.notReady.fix}`);
        }
        if (ready.notReady) continue;
        try {
          if (viaSlack) {
            await this.slack.notify(task, stop, settings);
            this.log(`[slack] ${task.ref}: sent a Slack message (${stop.reason})`);
            continue;
          }
          const c = await this.companions.startCompanion(task.id, { stop, settings });
          this.log(`[companion] ${task.ref}: opened a phone chat (${stop.reason}) ${c.id}`);
        } catch (err) {
          this.log(`[companion] ${task.ref}: ${err.message ?? err}`);
        }
      }
    } finally {
      this.companionsBusy = false;
    }
  }

  /** Stops a card's in-flight agent (used before you move it). */
  cancel(id) {
    const ctrl = this.inflight.get(id);
    if (ctrl) ctrl.abort();
    this.inflight.delete(id);
  }

  status() {
    return { running: this.running, active: [...this.inflight.keys()], replying: [...this.replyingTasks.keys()] };
  }

  /** Your messages the agent hasn't read yet, minus those a quick reply is answering right now. */
  pending(id) {
    return store.undelivered(id).filter((m) => !this.replying.has(m.id));
  }

  /**
   * A normal chat: your new messages get a reply in seconds from a fast, read-only side
   * session that knows the task (its documents, the repo, the chat) but can't change
   * anything — while the agent is mid-step (`busy`), or while the card waits for you. The
   * card's status doesn't change. A question it fully answers counts as read; a request
   * for work stays unread, for the agent's next turn (after its current step, when busy).
   */
  chatReply(task, flow, settings, { busy }) {
    const msgs = this.pending(task.id).filter((m) => m.kind !== "answers" && !m.replied);
    if (!msgs.length) return;
    const col = flow.columns.find((c) => c.id === task.column);
    const agent = col?.owner === "agent" ? col.agent : col?.chat_agent;
    if (!agent) return;
    const ctrl = new AbortController();
    const ids = msgs.map((m) => m.id);
    for (const id of ids) this.replying.set(id, ctrl);
    this.replyingTasks.set(task.id, (this.replyingTasks.get(task.id) ?? 0) + 1);
    store.events.emit("change", task.id);
    this.quickReply({ task, col, agent, msgs, settings, ctrl, busy })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        this.log(`[runner] ${task.id}: chat reply failed: ${err.message ?? err}`);
        store.patchChat(task.id, ids, { replied: true }); // the agent's own turn takes it from here
      })
      .finally(() => {
        for (const id of ids) if (this.replying.get(id) === ctrl) this.replying.delete(id);
        const n = (this.replyingTasks.get(task.id) ?? 1) - 1;
        if (n > 0) this.replyingTasks.set(task.id, n);
        else this.replyingTasks.delete(task.id);
        store.events.emit("change", task.id);
        this.poke();
      });
  }

  async quickReply({ task, col, agent, msgs, settings, ctrl, busy }) {
    const profile = store.resolveProfile(store.loadProfile(task.profile), task);
    const tools = ["Read", "Glob", "Grep"];
    const guardCtx = { tools, cwd: profile.repo, agentosRoot: ROOT, taskDir: store.taskDir(task.id), writeRoots: [], figmaFile: null, bashAllow: [] };
    const guard = async (input) => {
      const verdict = checkTool(input.tool_name, input.tool_input, guardCtx);
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: verdict.allow ? "allow" : "deny", ...(verdict.allow ? {} : { permissionDecisionReason: verdict.reason }) } };
    };
    const doing = store.getTask(task.id)?.activity;
    const situation = busy
      ? `You are the ${agent}'s chat while the ${agent} itself is mid-step on this card${doing ? ` (right now: ${doing})` : ""}.`
      : `You are the ${agent}'s chat. The ${agent} isn't working on this card right now; the card is waiting for {{owner}}.`;
    const work = busy
      ? `If it asks for a change or new work, don't do it: say you'll get to it as soon as your current step ends, and set handled to false.`
      : `If it asks for a change or new work, or answers something the ${agent} was waiting on, don't reply: set reply to "" and handled to false, and the ${agent} itself takes it from here.`;
    const prompt = `${contextBlock(task, col, profile)}\n\n${situation} ` +
      `You can read the task folder's documents and the repo, but you can't change anything. Be quick: read only what the answer needs.\n\n${messagesProse(msgs)}\n\n` +
      `Reply to this now, as the ${agent}. ${work} ` +
      `Write the reply the way Claude replies in a chat: to {{owner}} as "you", about the work as "I", never about them in the third person. ` +
      `Answer a question in your first sentence; Markdown with short paragraphs (blank lines between them), a \`-\` list for three or more things. ` +
      `End with exactly one fenced json block and nothing after it:\n\n` +
      `\`\`\`json\n{ "reply": "your chat message", "handled": true }\n\`\`\`\n\n` +
      `handled is true when your reply fully covers the message (a question, a remark), false when the ${agent} still has work to do for it.`;
    const q = this.query({
      prompt: store.personalize(prompt, settings, task.profile),
      options: {
        cwd: profile.repo,
        env: envFor(task.account, { AGENTOS_ROOT: ROOT, AGENTOS_TASK: task.id }),
        allowedTools: tools,
        tools,
        model: settings.chat?.model ?? CHAT_MODEL,
        effort: "low",
        settingSources: [],
        persistSession: false,
        maxTurns: 8,
        hooks: { PreToolUse: [{ hooks: [guard] }] },
        canUseTool: async (_name, input) => ({ behavior: "allow", updatedInput: input }),
        abortController: ctrl,
      },
    });
    let text = "";
    for await (const msg of q) {
      if (msg.type === "result") {
        if (msg.subtype === "success") text = msg.result;
        else throw new Error(`stopped: ${msg.subtype}`);
      }
    }
    if (ctrl.signal.aborted) return;
    const out = extractTurnJson(text);
    const reply = typeof out?.reply === "string" ? out.reply.trim() : "";
    const handled = out?.handled === true;
    if (!out || (handled && !reply)) throw new Error("no reply in its json block");
    if (reply) store.appendChat(task.id, { from: "agent", column: col.id, agent, text: reply });
    store.patchChat(task.id, msgs.map((m) => m.id), handled ? { replied: true, delivered: true } : { replied: true });
  }

  async tick() {
    if (!this.running || this.ticking) return;
    this.ticking = true;
    try {
      const flow = store.loadFlow();
      const settings = store.loadSettings();
      const tasks = store.listTasks();
      // Chat first: messages on a busy card, or on one waiting for you, get a quick reply
      // before (or instead of) a full agent turn. Those messages stay out of pickWork meanwhile.
      for (const t of tasks) {
        if (this.inflight.has(t.id)) this.chatReply(t, flow, settings, { busy: true });
        else if (waitsOnYou(t)) this.chatReply(t, flow, settings, { busy: false });
      }
      const undeliveredById = Object.fromEntries(tasks.map((t) => [t.id, this.pending(t.id)]));
      this.syncCompanions(tasks, settings, flow).catch((err) => this.log(`[companion] ${err.message ?? err}`));
      const work = pickWork(tasks, flow, { inflight: new Set(this.inflight.keys()), undeliveredById });
      for (const w of work) {
        if (w.kind === "no_agent") {
          const msgs = undeliveredById[w.task.id];
          store.markDelivered(w.task.id, msgs.map((m) => m.id));
          store.appendChat(w.task.id, { from: "system", column: w.col.id, text: `No agent works the ${w.col.title} column. Move the card to send it back to an agent.` });
          continue;
        }
        // Each project has its own limit, so a busy project doesn't hold up another's cards.
        const project = w.task.profile;
        const busy = tasks.filter((t) => t.profile === project && this.inflight.has(t.id)).length;
        if (busy >= store.projectSettings(settings, project).max_parallel) continue;
        const ctrl = new AbortController();
        this.inflight.set(w.task.id, ctrl);
        this.dispatch(w, settings, ctrl)
          .catch((err) => this.fail(w, err, ctrl))
          .finally(() => {
            if (this.inflight.get(w.task.id) === ctrl) this.inflight.delete(w.task.id);
            this.poke();
          });
      }
    } catch (err) {
      this.log(`[runner] tick failed: ${err.stack ?? err}`);
    } finally {
      this.ticking = false;
    }
  }

  block(id, blocker) {
    store.updateTask(id, (t) => {
      const now = new Date().toISOString();
      t.status = "blocked";
      t.activity = null;
      t.blocker = { ...blocker, at: t.blocker?.title === blocker.title ? t.blocker.at : now, checked_at: now };
    });
  }

  fail(w, err, ctrl) {
    if (ctrl.signal.aborted) return;
    this.log(`[runner] ${w.task.id} failed: ${err.stack ?? err}`);
    const message = String(err.message ?? err);
    if (AUTH_ERROR.test(message)) {
      // Rechecked every minute like a missing MCP server, so logging in is all it takes.
      const account = w.task.account;
      this.block(w.task.id, { kind: "connection", title: `The ${account} Claude login has expired`, detail: `Fix: ${claudeAs(account)}, then type /login` });
      return;
    }
    this.block(w.task.id, { kind: "error", title: "The agent run failed", detail: message });
    store.appendChat(w.task.id, { from: "system", column: w.col.id, text: `The ${w.agent} run failed: ${err.message ?? err}. Press Retry on the card when it's fixed.` });
  }

  /** Pre-flight. Returns false (and blocks the card) when something is missing. */
  async preflight(w, agentDef, profile) {
    const { task, col } = w;
    if (!agentDef) {
      this.block(task.id, { kind: "missing_agent", title: `The ${w.agent} agent isn't built yet`, detail: `agents/${w.agent}.md doesn't exist.` });
      return false;
    }
    // A connection-kind blocker rechecks every minute, so filling in the keys is all it takes.
    // The work file comes with the task (the board asks for it); the library is per profile.
    const missingFiles = missingFigmaFiles(profile);
    const lib = profile.figma?.library;
    const name = `${profile.label ?? task.profile}${lib ? ` (${lib.label})` : ""}`;
    if (missingFiles.includes("work_file")) {
      this.block(task.id, { kind: "connection", needs: "figma_file", title: "This task has no Figma file yet", detail: `Paste the link to the Figma file this task is designed in, or set ${lib ? `figma.libraries → ${lib.id}: ` : "figma."}work_file in profiles/${task.profile}.yaml for every ${name} task.` });
      return false;
    }
    if (missingFiles.includes("library_file")) {
      this.block(task.id, { kind: "connection", title: `${name} has no Figma library yet`, detail: `Set ${lib ? `figma.libraries → ${lib.id}: ` : "figma."}library_file in profiles/${task.profile}.yaml to the key in the Design System library's link (figma.com/design/<key>/…). The card retries on its own within a minute.` });
      return false;
    }
    const required = col.requires_mcp ?? [];
    if (required?.length) {
      const servers = await this.mcpStatus(task.account, profile.repo, { fresh: Boolean(w.recheck) });
      const missing = missingMcp(required, servers, task.account);
      if (missing) {
        this.block(task.id, { kind: "connection", title: missing.title, detail: `Fix: ${missing.fix}` });
        return false;
      }
    }
    return true;
  }

  async dispatch(w, settings, ctrl) {
    const { task, col } = w;
    const profile = store.resolveProfile(store.loadProfile(task.profile), task);
    const agentDef = loadAgent(w.agent, task.profile);
    if (!(await this.preflight(w, agentDef, profile))) return;
    if (!existsSync(profile.repo)) {
      this.block(task.id, { kind: "error", title: "The bound repo is missing", detail: `${profile.repo} doesn't exist — fix profiles/${task.profile}.yaml.` });
      return;
    }

    let workspace = null;
    if (col.worktree) {
      try {
        workspace = await this.prepareWorkspace(task, profile);
      } catch (err) {
        this.block(task.id, { kind: "error", title: "Couldn't set up the git worktree", detail: String(err.message ?? err).slice(0, 500) });
        return;
      }
    }
    const cwd = workspace?.path ?? profile.repo;
    if (agentDef.name === "designer") await this.prepareCheatsheet(task, profile);

    const msgs = this.pending(task.id);
    const sessionKey = w.kind === "edit" ? `${col.id}:edit` : col.id;
    let resume = w.kind === "start" ? null : task.sessions?.[sessionKey] ?? null;
    if (resume && task.session_versions?.[sessionKey] !== agentDef.version) {
      this.log(`[runner] ${task.id}: agents/${agentDef.name}.md changed since session ${resume} started — starting a fresh one`);
      resume = null;
    }
    // No session to resume (e.g. blocked before it ever ran): start fresh — the full
    // context block already carries the whole chat, these messages included.
    let prompt;
    if (w.kind === "edit" && !resume) prompt = buildPrompt(w, profile, msgs);
    else if (w.kind === "edit") prompt = `${messagesProse(msgs)}\n\nDo exactly what this asks and nothing more, then end with the turn-result block. If it only asks a question, answer it and change nothing (status answered).`;
    else if (!resume) prompt = buildPrompt({ ...w, kind: "start" }, profile, msgs);
    else prompt = buildPrompt(w, profile, msgs);

    const before = { status: task.status, blocker: task.blocker ?? null };
    store.updateTask(task.id, (t) => {
      t.status = "working";
      t.activity = "Starting";
      t.blocker = null;
      delete t.resume_pending;
    });
    if (msgs.length) store.markDelivered(task.id, msgs.map((m) => m.id));

    const agentCfg = store.projectSettings(settings, task.profile).agents[w.agent] ?? {};
    const taskDir = store.taskDir(task.id);
    const guardCtx = {
      tools: agentDef.tools,
      cwd,
      agentosRoot: ROOT,
      taskDir,
      writeRoots: [...agentDef.writes.map((p) => path.resolve(profile.repo, p)), ...(workspace ? [workspace.path] : [])],
      figmaFile: profile.figma?.work_file ?? null,
      bashAllow: agentDef.bash,
    };

    let fixRounds = 0;
    const linted = new Set(); // figma_nodes named this dispatch: a fix round can add, never drop
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { text, sessionId } = await this.runQuery({ w, prompt, resume, agentDef, agentCfg, profile, guardCtx, ctrl, sessionKey, cwd });
      if (ctrl.signal.aborted) return;
      resume = sessionId ?? resume;
      const result = extractTurnJson(text);
      const errs = validateTurn(result);
      if (errs.length) {
        this.log(`[runner] ${task.id}: invalid turn result (${errs.join("; ")}) — asking again`);
        prompt = `Your turn ended without a valid turn-result block: ${errs.join("; ")}. Reply with only the corrected \`\`\`json block.`;
        continue;
      }
      // Messages that arrived mid-turn go to the agent before the card moves on.
      const late = this.pending(task.id);
      if (late.length && ["done", "answered"].includes(result.status)) {
        store.markDelivered(task.id, late.map((m) => m.id));
        prompt = `${messagesProse(late)}\n\n{{owner}} wrote this while you were working. Take it into account, then end with the turn-result block.`;
        attempt = -1; // fresh budget for the follow-up
        continue;
      }
      // A design is only done when the runner's own DS lint says so.
      if (result.status === "done" && col.verify) {
        const v = col.verify === "figma-ds-lint" ? await this.verifyDesign(w, result, profile, ctrl, linted)
          : col.verify === "draft-pr" ? await this.verifyDraftPr(w, result, profile)
          : (() => { throw new Error(`unknown verify "${col.verify}" in flow.yaml`); })();
        if (ctrl.signal.aborted || v.stop) return;
        if (v.prompt) {
          if (v.fix && fixRounds >= MAX_LINT_FIXES) {
            this.lintFailed(w, v.lint);
            return;
          }
          prompt = v.prompt;
          if (v.fix) {
            fixRounds += 1;
            attempt = -1; // a fix round gets a fresh budget; a bad link uses up an attempt
          }
          continue;
        }
      }
      this.apply(w, result, before);
      return;
    }
    this.block(task.id, { kind: "error", title: "The agent never returned a valid result", detail: "Three turns ended without a valid turn-result block." });
  }

  async runQuery({ w, prompt, resume, agentDef, agentCfg, profile, guardCtx, ctrl, sessionKey, cwd }) {
    const { task } = w;
    const flow = store.loadFlow();
    const guardHook = async (input) => {
      const verdict = checkTool(input.tool_name, input.tool_input, guardCtx);
      if (!verdict.allow) {
        this.log(`[guard] ${task.id} ${input.tool_name} denied: ${verdict.reason}`);
        return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: verdict.reason } };
      }
      const label = activityFor(input.tool_name, input.tool_input);
      const file = input.tool_input?.file_path;
      let ticked = [];
      store.updateTask(task.id, (t) => {
        if (label) t.activity = label;
        if (typeof file === "string" && path.dirname(path.resolve(guardCtx.cwd, file)) === guardCtx.taskDir) {
          const step = store.stepForFile(flow, t.column, path.basename(file));
          if (step) ticked.push(...store.tickStep(t, step));
        }
        const toolStep = store.stepForTool(flow, t.column, input.tool_name);
        if (toolStep) ticked.push(...store.tickStep(t, toolStep));
      });
      this.progress(task.id, w.col.id, ticked);
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } };
    };

    const q = this.query({
      prompt: store.personalize(prompt, undefined, task.profile),
      options: {
        cwd,
        env: envFor(task.account, { AGENTOS_ROOT: ROOT, AGENTOS_TASK: task.id }),
        agent: agentDef.name,
        agents: {
          [agentDef.name]: {
            description: agentDef.description,
            prompt: agentDef.prompt,
            tools: [...agentDef.tools, "ToolSearch"], // mcp__x__* wildcards expand here (verified)
            ...(agentCfg.model ? { model: agentCfg.model } : {}),
            ...(agentCfg.effort && agentCfg.effort !== "default" ? { effort: agentCfg.effort } : {}),
          },
        },
        settingSources: ["user", "project", "local"],
        hooks: { PreToolUse: [{ hooks: [guardHook] }] },
        canUseTool: async (_name, input) => ({ behavior: "allow", updatedInput: input }),
        abortController: ctrl,
        ...(resume ? { resume } : {}),
      },
    });

    let text = "";
    let assistantText = "";
    let sessionId = null;
    for await (const msg of q) {
      if (msg.session_id && !sessionId) {
        sessionId = msg.session_id;
        store.updateTask(task.id, (t) => {
          t.sessions = { ...(t.sessions ?? {}), [sessionKey]: sessionId };
          t.session_versions = { ...(t.session_versions ?? {}), [sessionKey]: agentDef.version };
        });
      }
      if (msg.type === "assistant") {
        for (const block of msg.message?.content ?? []) if (block.type === "text") assistantText = block.text;
      }
      if (msg.type === "result") {
        if (msg.subtype === "success") text = msg.result;
        else throw new Error(`the agent stopped: ${msg.subtype}${msg.errors?.length ? ` — ${msg.errors.join("; ")}` : ""}`);
      }
    }
    return { text: text || assistantText, sessionId };
  }

  /**
   * Runs the DS lint on what the designer made on the task's Figma page: the nodes in
   * `figma_nodes`, merged into `linted` across the dispatch's fix rounds. The rest of the
   * page (the owner's own frames, other tasks' sections) is never judged. Returns { prompt }
   * to send the designer back (a bad link or scope, or lint errors with `fix: true`),
   * { stop: true } when the card was blocked, or {} when its work is clean.
   */
  async verifyDesign(w, result, profile, ctrl, linted = new Set()) {
    const { task } = w;
    const fileKey = profile.figma?.work_file;
    const link = parseFigmaUrl(result.links?.figma);
    const linkProblem = `Put the link to your task's Figma PAGE in links.figma: ${figmaPageUrl(fileKey ?? "<work_file>", "<page-id>")} (node-id is the page's id, not a frame's).`;
    if (link && link.fileKey !== fileKey) return { prompt: `links.figma points at file ${link.fileKey}, but task pages live in the work file ${fileKey}. ${linkProblem} End with the turn-result block.` };
    const pageId = link?.nodeId ?? store.getTask(task.id).figma?.page_id;
    if (!pageId) return { prompt: `${linkProblem} End with the turn-result block.` };
    for (const id of result.figma_nodes ?? []) linted.add(id.replace("-", ":"));
    const scopeProblem = "List in figma_nodes the ids of the sections (or loose frames) you created or changed on the page this turn, e.g. \"figma_nodes\": [\"12:34\", \"12:35\"] — the runner lints only those, never {{owner}}'s own frames.";
    if (!linted.size) return { prompt: `${scopeProblem} End with the turn-result block.` };

    store.updateTask(task.id, (t) => {
      t.activity = "Running the DS lint";
      t.figma = { file_key: fileKey, page_id: pageId, url: figmaPageUrl(fileKey, pageId), nodes: [...linted] };
      t.links = { ...t.links, figma: t.figma.url };
    });

    let lint;
    try {
      lint = await this.lint({
        account: task.account, cwd: profile.repo, fileKey, pageId, nodeIds: [...linted], dsNames: dsNamesFor(profile),
        viewports: lintViewports(profile.viewports ?? [], w.col.viewports), fullPageGroups: w.col.full_pages ?? [],
      });
    } catch (err) {
      if (ctrl.signal.aborted) return { stop: true };
      if (/no page with id/i.test(err.message)) return { prompt: `The DS lint couldn't find a page with id ${pageId}. ${linkProblem} End with the turn-result block.` };
      this.block(task.id, { kind: "error", title: "Couldn't run the DS lint", detail: err.message });
      store.appendChat(task.id, { from: "system", column: w.col.id, text: `The DS lint couldn't run: ${err.message}. Press Retry on the card.` });
      return { stop: true };
    }
    if (ctrl.signal.aborted) return { stop: true };
    if (lint.notFound?.length) {
      for (const id of lint.notFound) linted.delete(id);
      return { prompt: `figma_nodes ${lint.notFound.join(", ")} ${lint.notFound.length > 1 ? "aren't" : "isn't"} on page ${pageId}. ${scopeProblem} End with the turn-result block.` };
    }

    const url = figmaPageUrl(fileKey, pageId);
    store.writeDoc(task.id, "ds-lint.md", lintMarkdown(lint, url));
    let lintTicked = false;
    store.updateTask(task.id, (t) => {
      t.lint = { errors: lint.errorCount, warnings: lint.warningCount, placeholders: lint.placeholders, at: new Date().toISOString() };
      if (lint.errorCount === 0) {
        const step = (store.columnOf(store.loadFlow(), t.column).steps ?? []).find((s) => s.verify);
        if (step) store.tickStep(t, step.name);
        lintTicked = Boolean(step);
      } else t.activity = `Fixing ${lint.errorCount} DS lint error${lint.errorCount > 1 ? "s" : ""}`;
    });
    if (lintTicked) this.progress(task.id, w.col.id, [`DS lint — 0 errors, ${lint.warningCount} warning${lint.warningCount === 1 ? "" : "s"}`]);
    if (lint.errorCount === 0) return {};

    const list = lint.errors.map((e) => `- [${e.rule}] "${e.name}" (${e.id}): ${e.detail}`).join("\n");
    return {
      fix: true,
      lint,
      prompt: `The runner's DS lint on your page found ${lint.errorCount} error${lint.errorCount > 1 ? "s" : ""} (${Object.entries(lint.byRule ?? {}).map(([r, n]) => `${r}: ${n}`).join(", ")}). ` +
        `Fix every one with library pieces — bind fills/strokes to Color variables, gap/padding to Spacing variables, radius to Radius variables, apply text and effect styles, ` +
        `replace local or detached components with Design System instances (or a "⚠ Missing: <Name>" placeholder if the library has none).` +
        `${lint.errorCount > lint.errors.length ? ` Showing the first ${lint.errors.length}; fix the same kinds everywhere in your figma_nodes.` : ""}\n\n${list}\n\n` +
        `Then end with the turn-result block again, same links.figma and figma_nodes.`,
    };
  }

  /**
   * The library's DS cheat sheet (harness/figma/cheatsheet.mjs), built the first time a
   * designer works with that library and weekly after; contextBlock points the dispatch at
   * it. A failed build never blocks the card: the designer falls back to
   * search_design_system.
   */
  async prepareCheatsheet(task, profile) {
    try {
      store.updateTask(task.id, (t) => { t.activity = "Reading the Design System library"; });
      await this.cheatsheet({ root: ROOT, profile, account: task.account, cwd: profile.repo, log: this.log });
    } catch (err) {
      this.log(`[runner] ${task.id}: no DS cheat sheet for ${profile.figma?.library_file}: ${err.message}`);
    }
  }

  /**
   * The task's own git worktree on branch agentos/<task id>, cut from the profile's base
   * branch on origin — never the bound repo's main checkout, which may hold someone's
   * uncommitted work. Reused when the card comes back to the column.
   */
  async prepareWorkspace(task, profile) {
    const branch = `agentos/${task.id}`;
    const wtPath = path.join(profile.repo, ".claude", "worktrees", `agentos-${task.id}`);
    if (!existsSync(wtPath)) {
      store.updateTask(task.id, (t) => { t.activity = "Setting up a git worktree"; });
      const base = profile.base_branch ?? "main";
      await this.exec("git", ["-C", profile.repo, "fetch", "origin", base], {});
      const hasBranch = await this.exec("git", ["-C", profile.repo, "branch", "--list", branch], {});
      await this.exec("git", ["-C", profile.repo, "worktree", "add", ...(hasBranch ? [wtPath, branch] : ["-b", branch, wtPath, `origin/${base}`])], {});
    }
    store.updateTask(task.id, (t) => { t.workspace = { path: wtPath, branch }; });
    return { path: wtPath, branch };
  }

  /** The PR in links.pr must exist, be a draft, and go from this task's branch to base. */
  async verifyDraftPr(w, result, profile) {
    const { task } = w;
    const url = result.links?.pr;
    if (!url || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(url)) {
      return { prompt: "Put the draft PR's URL (https://github.com/<owner>/<repo>/pull/<n>) in links.pr. End with the turn-result block." };
    }
    let pr;
    try {
      pr = JSON.parse(await this.exec("gh", ["pr", "view", url, "--json", "isDraft,headRefName,baseRefName,state,url"], { cwd: profile.repo }));
    } catch (err) {
      return { prompt: `\`gh pr view ${url}\` failed (${String(err.message ?? err).slice(0, 200)}). Check the URL and put the right one in links.pr. End with the turn-result block.` };
    }
    const branch = store.getTask(task.id).workspace?.branch;
    const base = profile.base_branch ?? "main";
    if (pr.headRefName !== branch || pr.baseRefName !== base) {
      return { prompt: `That PR goes ${pr.headRefName} → ${pr.baseRefName}; this task's must go ${branch} → ${base}. Fix it or link the right PR in links.pr. End with the turn-result block.` };
    }
    if (!pr.isDraft) {
      this.block(task.id, { kind: "error", title: "The PR isn't a draft", detail: `${url} is open for review. Only ${store.ownerName()} opens PRs for review — convert it back to a draft on GitHub, then Retry.` });
      return { stop: true };
    }
    store.updateTask(task.id, (t) => {
      t.links = { ...t.links, pr: url };
      t.pr = { url, draft: true };
      const step = (store.columnOf(store.loadFlow(), t.column).steps ?? []).find((s) => s.verify);
      if (step) store.tickStep(t, step.name);
    });
    return {};
  }

  /** One short chat line per checklist step the moment it completes. */
  progress(id, column, names) {
    for (const name of names) store.appendChat(id, { from: "system", kind: "progress", column, text: `✓ ${name}` });
  }

  /** Called when a card reaches Done: drop its worktree if it's clean. The branch stays. */
  async cleanupWorkspace(id) {
    const task = store.getTask(id);
    const ws = task?.workspace;
    if (!ws || !existsSync(ws.path)) return;
    try {
      const dirty = await this.exec("git", ["-C", ws.path, "status", "--porcelain"], {});
      if (dirty) {
        store.appendChat(id, { from: "system", column: task.column, text: `Kept the worktree at ${ws.path}: it has uncommitted changes.` });
        return;
      }
      const repo = store.loadProfile(task.profile).repo;
      await this.exec("git", ["-C", repo, "worktree", "remove", ws.path], {});
      store.updateTask(id, (t) => { t.workspace = { ...ws, removed: true }; });
    } catch (err) {
      this.log(`[runner] ${id}: worktree cleanup failed: ${err.message ?? err}`);
    }
  }

  lintFailed(w, lint) {
    const text = `The DS lint still finds ${lint.errorCount} error${lint.errorCount > 1 ? "s" : ""} after ${MAX_LINT_FIXES} fix rounds — see ds-lint.md. Reply in the chat to send the designer back, or move the card on if you accept them.`;
    store.appendChat(w.task.id, { from: "system", column: w.col.id, text });
    if (w.kind === "edit") {
      store.updateTask(w.task.id, (t) => { t.status = "idle"; t.activity = null; });
      return;
    }
    this.block(w.task.id, { kind: "agent", title: `DS lint: ${lint.errorCount} error${lint.errorCount > 1 ? "s" : ""} left`, detail: "Reply in the chat and the designer picks it back up." });
  }

  apply(w, result, before = {}) {
    const { task, col } = w;
    const flow = store.loadFlow();
    // A blocked turn's ask goes in the chat with its summary: the board shows no alert for it.
    const text = result.status === "blocked" ? `${result.summary}\n\n${result.blocker}` : result.summary;
    // A finished step's documents (flow.yaml `file:`, e.g. qa.md) ride along, so the message opens them.
    const written = new Set(store.listDocs(task.id));
    const docs = result.status === "done" ? (col.steps ?? []).map((s) => s.file).filter((f) => f && written.has(f)) : [];
    store.appendChat(task.id, { from: "agent", column: col.id, agent: w.agent, text, links: result.links ?? null, ...(docs.length ? { docs } : {}) });

    if (result.status === "needs_input") {
      store.appendChat(task.id, { from: "agent", column: col.id, agent: w.agent, kind: "questions", questions: normalizeQuestions(result.questions) });
      store.updateTask(task.id, (t) => {
        t.status = "needs_input";
        t.activity = null;
        if (result.links) t.links = { ...t.links, ...result.links };
      });
      return;
    }
    if (result.status === "blocked") {
      this.block(task.id, { kind: "agent", title: result.blocker, detail: "Reply in the chat and the agent picks it back up." });
      return;
    }
    if (result.status === "answered") {
      // Only a reply: the card goes back to how it was. A card that was waiting on the owner (open
      // questions, its own blocker, finished work) still is; anything else rests.
      store.updateTask(task.id, (t) => {
        t.activity = null;
        if (result.links) t.links = { ...t.links, ...result.links };
        const waited = ["needs_input", "ready"].includes(before.status) || (before.status === "blocked" && before.blocker?.kind === "agent");
        t.status = waited ? before.status : w.kind === "edit" ? "idle" : "ready";
        if (t.status === "blocked") t.blocker = before.blocker;
      });
      return;
    }
    // done
    store.updateTask(task.id, (t) => {
      t.activity = null;
      if (result.links) t.links = { ...t.links, ...result.links };
      if (w.kind === "edit") {
        t.status = "idle";
        return;
      }
      for (const s of t.steps) s.done = true;
      t.status = "ready";
    });
    if (w.kind !== "edit" && col.on_done && col.on_done !== "stay") {
      store.moveTask(task.id, col.on_done, { by: "runner", flow });
    }
  }
}

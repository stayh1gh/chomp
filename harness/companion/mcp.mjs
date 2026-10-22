#!/usr/bin/env node
/**
 * The Chomp MCP server a phone companion talks to (stdio, one task per process):
 *   node harness/companion/mcp.mjs <task-id>
 *
 * Reads come straight from the store. Writes go through the board server's companion
 * routes, so the board updates live and the runner reacts at once. No tool moves a card.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { pathToFileURL } from "node:url";
import * as store from "../../board/store.mjs";
import { tokenFor } from "./index.mjs";

const MAX_DOC = 40_000;

export const TOOLS = [
  { name: "get_task", description: "The card now: column, status, what the agent is doing, checklist, blocker, links, open questions, documents.", inputSchema: { type: "object", properties: {} } },
  {
    name: "read_chat",
    description: "The task chat, newest last: the board's owner, the agents and the board.",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "How many recent messages (default 20, max 100)." } } },
  },
  {
    name: "read_doc",
    description: "One of the task's documents (spec.md, plan.md, research.md, …). get_task lists them.",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "send_to_agent",
    description: "Write in the task chat as the board's owner. It reaches the agent working the card's column (or the column's chat agent).",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "answer_questions",
    description: "Answer the agent's open questions. Keys are question ids from get_task; a missing answer means 'use your judgment'.",
    inputSchema: { type: "object", properties: { answers: { type: "object", additionalProperties: { type: "string" } } }, required: ["answers"] },
  },
  { name: "pause", description: "Pause the card: stops the agent mid-turn and holds it until start.", inputSchema: { type: "object", properties: {} } },
  { name: "start", description: "Start a paused card again.", inputSchema: { type: "object", properties: {} } },
  { name: "retry", description: "Retry a card that's blocked on an error.", inputSchema: { type: "object", properties: {} } },
];

function who(m) {
  if (m.from === "you") return m.via === "phone" ? `${store.ownerName()} (phone)` : store.ownerName();
  if (m.from === "agent") return `${m.agent ?? "agent"} (${m.column})`;
  return "board";
}

export function formatMessage(m) {
  const when = m.at?.slice(0, 16).replace("T", " ");
  if (m.kind === "questions") return `[${when}] ${who(m)} asked:\n${m.questions.map((q) => `  ${q.id}. ${q.question}${q.options?.length ? ` (${q.options.join(" / ")})` : ""}`).join("\n")}`;
  if (m.kind === "answers") return `[${when}] ${who(m)} answered: ${(m.questions ?? []).map((q) => `${q.id}: ${m.answers?.[q.id] || "your judgment"}`).join("; ")}`;
  const links = m.links ? ` ${Object.values(m.links).filter(Boolean).join(" ")}` : "";
  return `[${when}] ${who(m)}: ${m.text ?? ""}${links}`;
}

export function taskSummary(id, flow = store.loadFlow()) {
  const t = store.getTask(id);
  if (!t) throw new Error(`no task "${id}" — it may have been deleted`);
  const col = flow.columns.find((c) => c.id === t.column);
  const open = store.openQuestions(id);
  return {
    ref: t.ref,
    title: t.title,
    request: t.prompt,
    column: col?.title ?? t.column,
    owner: col?.owner === "agent" ? col.agent : store.ownerName(),
    status: t.status,
    activity: t.activity ?? null,
    checklist: (t.steps ?? []).map((s) => `${s.done ? "✓" : "·"} ${s.name}`),
    blocker: t.blocker ?? null,
    links: { ...(t.links ?? {}), ...(t.pr?.url ? { pr: `${t.pr.url}${t.pr.draft ? " (draft)" : ""}` } : {}) },
    open_questions: open && t.status === "needs_input" ? open.questions : null,
    documents: store.listDocs(id),
    columns: flow.columns.filter((c) => store.columnServes(c, t)).map((c) => c.title).join(" → "),
  };
}

async function post(taskId, action, body = {}) {
  const base = process.env.AGENTOS_URL ?? `http://127.0.0.1:${process.env.AGENTOS_PORT ?? 4400}`;
  let res;
  try {
    res = await fetch(`${base}/api/companion/${taskId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tokenFor(taskId)}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("The Chomp board isn't running on this Mac, so nothing can reach the task. Open the Chomp app.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `the board answered ${res.status}`);
  return json;
}

export async function callTool(taskId, name, args = {}) {
  switch (name) {
    case "get_task":
      return JSON.stringify(taskSummary(taskId), null, 1);
    case "read_chat": {
      const limit = Math.max(1, Math.min(100, Number(args.limit) || 20));
      const msgs = store.readChat(taskId).filter((m) => m.kind !== "progress").slice(-limit);
      return msgs.length ? msgs.map(formatMessage).join("\n\n") : "The chat is empty.";
    }
    case "read_doc": {
      const text = store.readDoc(taskId, String(args.name ?? ""));
      if (text === null) return `No document "${args.name}". There are: ${store.listDocs(taskId).join(", ") || "none yet"}.`;
      return text.length > MAX_DOC ? `${text.slice(0, MAX_DOC)}\n\n… (cut at ${MAX_DOC} characters)` : text;
    }
    case "send_to_agent": {
      if (!String(args.text ?? "").trim()) throw new Error("text is empty");
      await post(taskId, "chat", { text: args.text });
      const t = taskSummary(taskId);
      return `Sent. ${t.owner === store.ownerName() ? `The card is in ${t.column}, which is yours; its chat agent (if any) picks it up.` : `The ${t.owner} picks it up on its next turn.`}`;
    }
    case "answer_questions":
      await post(taskId, "chat", { answers: args.answers ?? {} });
      return "Answers sent; the agent continues with them.";
    case "pause":
    case "start":
    case "retry": {
      const t = await post(taskId, name);
      return `Done. Status is now ${t.status}.`;
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const taskId = process.argv[2];
  store.taskDir(taskId); // throws on a bad id
  const server = new Server({ name: "agentos", version: "0.1.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      return { content: [{ type: "text", text: await callTool(taskId, req.params.name, req.params.arguments) }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: String(err.message ?? err) }] };
    }
  });
  await server.connect(new StdioServerTransport());
}

/**
 * The daily recap: what happened on the board on the last day with any activity before
 * today, grouped by project, in plain words. Built from each task's history and chat; no
 * model involved, so it's instant and only says what the files say.
 *
 * Days are local calendar days (the board and the page run on the same machine).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** "2026-10-16" for an ISO timestamp, in local time. */
export function dayOf(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Every timestamp a task carries: created, moved, chatted. */
function stamps(task, chat) {
  return [task.created_at, ...(task.history ?? []).map((h) => h.at), ...chat.map((m) => m.at)].filter(Boolean);
}

/** The last day before `today` that anything happened on, or null. */
export function lastWorkday(entries, today) {
  let last = null;
  for (const { task, chat } of entries) {
    for (const at of stamps(task, chat)) {
      const day = dayOf(at);
      if (day && day < today && (!last || day > last)) last = day;
    }
  }
  return last;
}

/** An agent's message cut to its first sentence or clause, at most ~120 characters. */
export function gist(text) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  let first = flat.split(/(?<=[.!?])\s|:\s|;\s/)[0].replace(/[.:;,]$/, "");
  // A clause cut inside parentheses loses the open part.
  if ((first.match(/\(/g) ?? []).length > (first.match(/\)/g) ?? []).length) first = first.slice(0, first.lastIndexOf("(")).trim();
  // Still long: stop at the first comma, dash or aside after the main clause.
  if (first.length > 90) {
    const cut = first.slice(40).search(/,\s| — | \(/);
    if (cut >= 0) first = first.slice(0, 40 + cut);
  }
  if (first.length <= 120) return first;
  return `${first.slice(0, 120).replace(/[\s,;:]+\S*$/, "")}…`;
}

const PAST = new Set(["wrote", "built", "made", "drew", "ran", "set", "put", "kept", "took", "split", "found", "gave"]);

/** "I built 3 directions" / "Built 3 directions" → "The designer built 3 directions." */
export function said(agent, text) {
  const who = `The ${agent ?? "agent"}`;
  let line = gist(text);
  if (line.startsWith("I ")) line = `${who} ${line.slice(2)}`;
  else {
    const word = line.split(" ")[0].toLowerCase();
    if (word.endsWith("ed") || PAST.has(word)) line = `${who} ${word}${line.slice(word.length)}`;
  }
  return /[.!?…]$/.test(line) ? line : `${line}.`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// "try again", "keep going": a nudge to redo the last request, not a new one.
const RETRY = /^(?:(?:please |pls )?(?:try|do it|run it|go)(?: it)? again|retry|again|one more time|keep going)\b/i;
// Verbs a request to the agent usually starts with, once "can you" / "please" are gone.
const ASKS = new Set(("add make change remove delete move use try update fix show create build put swap replace redo do give keep drop rename " +
  "align increase decrease reduce center bring explore base follow match copy apply set turn merge split check look test push open " +
  "write draft design draw include mirror combine simplify clean tighten shrink darken lighten start finish redesign rework revert " +
  "undo review compare pick choose find get send attach upload export import generate resize space crop flip hide insert lower raise " +
  "expand collapse sort group label link connect wire capture screenshot mock prototype polish refine iterate stack enlarge").split(" "));

/** Your words, read back to you: "my" → "your", "me" → "you". */
const yours = (text) =>
  text.replace(/\b(I'm|I am|I|me|my|mine|myself)\b/g, (w) => ({ "I'm": "you're", "I am": "you are", I: "you", me: "you", my: "your", mine: "yours", myself: "yourself" })[w]);

/**
 * One of your messages as the work you asked for: "can you add the screenshots?" → "asked to
 * add the screenshots". Null when it asks for no work (a question, a comment, a "try again").
 */
export function asked(text) {
  if (RETRY.test(String(text ?? "").trim())) return null;
  let line = gist(text).replace(/[?!.\s]+$/, "");
  const lead = /^(?:(?:hey|hi|ok(?:ay)?|so|now|also|and|then|please|pls|plz|great|nice|cool|thanks)[,!]?\s+|(?:can|could|would|will) you(?: please)?\s+|(?:i want|i'd like|i would like|i need)(?: you)? to\s+|let'?s\s+|let us\s+)/i;
  while (lead.test(line)) line = line.replace(lead, "");
  line = line.replace(/,?\s+(?:please|pls)$/i, "");
  const forThing = /^(?:i want|i'd like|i would like|i need)\s+(.+)/i.exec(line);
  if (forThing) return `asked for ${yours(forThing[1])}`;
  const word = line.split(/\s/)[0].toLowerCase();
  return ASKS.has(word) ? `asked to ${word}${yours(line.slice(word.length))}` : null;
}

/** The last work you asked for on a day, as a sentence, or null. */
export function youAsked(mine) {
  const line = mine.filter((m) => m.kind !== "answers" && m.text).map((m) => asked(m.text)).filter(Boolean).at(-1);
  return line ? `You ${line}.` : null;
}

/** The column a task goes to after its current one, for its kind. */
function nextColumn(task, columns) {
  const kind = task.kind ?? "full";
  const at = columns.findIndex((c) => c.id === task.column);
  return columns.slice(at + 1).find((c) => !c.kinds || c.kinds.includes(kind)) ?? null;
}

/** What you (or the board) do next with a task, in one sentence. */
export function nextStep(task, columns) {
  const col = columns.find((c) => c.id === task.column);
  const where = col?.title ?? task.column;
  const then = nextColumn(task, columns);
  const moveOn = then ? `, then move it to ${then.title}` : "";
  if (task.column === "done") return "Nothing, it's finished.";
  switch (task.status) {
    case "working":
    case "queued": return `Wait for the ${col?.agent ?? "agent"} to finish ${where}.`;
    case "needs_input": return `Answer the ${col?.agent ?? "agent"}'s questions in the chat.`;
    case "blocked": return task.blocker?.title ? `Clear the blocker: ${task.blocker.title.replace(/\.$/, "")}.` : "Clear the blocker, then retry it.";
    case "paused": return `Press Start to pick ${where} back up.`;
    case "ready": return task.column === "review" ? "Check the draft PR, then open it for review." : `Check the ${where} work${moveOn}.`;
    default:
      if (task.column === "designing") return `Pick a direction in Figma${moveOn}.`;
      return col?.owner === "human" ? `Review it${moveOn}.` : `It's in ${where}.`;
  }
}

/** What happened to one task on `day` and what's next, in plain sentences; null when nothing did. */
export function taskRecap(task, chat, day, columns) {
  const on = (at) => dayOf(at) === day;
  const title = (id) => columns.find((c) => c.id === id)?.title ?? id;
  const done = [];

  const created = on(task.created_at);
  const moves = (task.history ?? []).filter((h) => on(h.at) && h.from);
  const moved = moves.length ? `moved from ${title(moves[0].from)} to ${title(moves.at(-1).to)}` : "";
  if (created) done.push(moved ? `Added and ${moved}.` : "Added to the board.");
  else if (moved) done.push(`M${moved.slice(1)}.`);

  // The last thing an agent said that day carries the substance; the checklist only without it.
  // What you asked for reads before the agent's reply to it; after, when it's still unanswered.
  const today = chat.filter((m) => on(m.at));
  const last = today.filter((m) => m.from === "agent" && m.kind !== "progress" && m.text).at(-1);
  const steps = [...new Set(today.filter((m) => m.kind === "progress" && m.text?.startsWith("✓ ")).map((m) => m.text.slice(2).split(" — ")[0].trim()))];
  const mine = today.filter((m) => m.from === "you");
  const you = youAsked(mine);
  const answered = you && last && mine.at(-1).at <= last.at;
  if (answered) done.push(you);
  if (last) done.push(said(last.agent, last.text));
  else if (steps.length) done.push(`Finished ${plural(steps.length, "step")}, ending with ${steps.at(-1)}.`);

  const reachedReview = moves.some((h) => h.to === "review") || today.some((m) => m.column === "review" && m.from === "agent");
  if (task.pr?.url && reachedReview) done.push(task.pr.draft === false ? "Pull request opened." : "Draft PR opened.");

  if (you && !answered) done.push(you);

  if (!done.length) return null;
  return {
    id: task.id,
    ref: task.ref ?? null,
    title: task.title,
    done: done.join(" "),
    next: nextStep(task, columns),
    links: linksOf(task),
  };
}

/** The most recent day up to `today` with something to say about a task: { day, done }, or null. */
export function lastRecap(task, chat, columns, today) {
  const days = [...new Set(stamps(task, chat).map(dayOf).filter((d) => d && d <= today))].sort().reverse();
  for (const day of days) {
    const recap = taskRecap(task, chat, day, columns);
    if (recap) return { day, done: recap.done };
  }
  return null;
}

/** Whether a task sits on you: questions, a blocker, finished work to move, a human column, a pause. */
export function waitingOnYou(task, columns) {
  if (task.column === "done") return false;
  if (["needs_input", "blocked", "ready", "paused"].includes(task.status)) return true;
  return task.status === "idle" && columns.find((c) => c.id === task.column)?.owner === "human";
}

// Questions and blockers first: they stop an agent; the rest wait on a review.
const URGENCY = { needs_input: 0, blocked: 1, ready: 2, paused: 3, idle: 4 };

const linksOf = (task) => (task.pr?.url ? { pr: task.pr.url } : task.links?.figma ? { figma: task.links.figma } : {});

/**
 * The recap for the last workday before `today`:
 * { day, projects: [{ name, label, tasks, waiting }] }, projects in profile order. `tasks` is
 * what got done that day, last touched first; `waiting` is every other task that sits on you,
 * however long ago it was touched, with what was done the last day it was worked on.
 */
export function buildRecap({ entries, columns, profiles, today }) {
  const day = lastWorkday(entries, today);
  const byProject = new Map();
  const project = (name) => {
    if (!byProject.has(name)) byProject.set(name, { tasks: [], waiting: [] });
    return byProject.get(name);
  };
  for (const { task, chat } of entries) {
    const name = task.profile ?? "other";
    const recap = day && taskRecap(task, chat, day, columns);
    if (recap) {
      const last = stamps(task, chat).filter((at) => dayOf(at) === day).sort().at(-1);
      project(name).tasks.push({ ...recap, last });
    } else if (waitingOnYou(task, columns)) {
      const last = stamps(task, chat).sort().at(-1) ?? "";
      const before = lastRecap(task, chat, columns, today);
      project(name).waiting.push({
        id: task.id, ref: task.ref ?? null, title: task.title,
        day: before?.day ?? null, done: before?.done ?? null,
        next: nextStep(task, columns), links: linksOf(task), status: task.status, last,
      });
    }
  }
  const order = profiles.map((p) => p.name);
  const projects = [...byProject.entries()]
    .sort(([a], [b]) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9))
    .map(([name, { tasks, waiting }]) => ({
      name,
      label: profiles.find((p) => p.name === name)?.label ?? name,
      tasks: tasks.sort((a, b) => b.last.localeCompare(a.last)).map(({ last, ...t }) => t),
      waiting: waiting
        .sort((a, b) => URGENCY[a.status] - URGENCY[b.status] || b.last.localeCompare(a.last))
        .map(({ last, status, ...t }) => t),
    }));
  return { day, projects };
}

/** The day the recap was last dismissed, kept beside the board's other caches. */
export function recapSeen(file) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).seen ?? null : null;
  } catch {
    return null;
  }
}

export function markRecapSeen(file, day) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ seen: day }) + "\n");
}

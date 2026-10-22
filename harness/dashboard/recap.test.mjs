import { test } from "node:test";
import assert from "node:assert/strict";
import { asked, buildRecap, gist, lastRecap, lastWorkday, nextStep, said, taskRecap, waitingOnYou } from "./recap.mjs";

const columns = [
  { id: "plan", title: "Plan", owner: "agent", agent: "planner" },
  { id: "ideation", title: "Ideation", owner: "agent", agent: "designer" },
  { id: "designing", title: "Designing", owner: "human" },
  { id: "refinement", title: "Refinement", owner: "agent", agent: "designer" },
  { id: "review", title: "Draft PR", owner: "agent" },
  { id: "done", title: "Done", owner: "human" },
];

// Noon local time, so the day never shifts with the machine's timezone.
const at = (day, h = 12) => new Date(`${day}T${String(h).padStart(2, "0")}:00:00`).toISOString();

const login = {
  id: "login", ref: "AOS-7", title: "Login screen", profile: "client", column: "designing", status: "idle",
  created_at: at("2026-10-16", 10),
  history: [
    { at: at("2026-10-16", 10), to: "plan", by: "you" },
    { at: at("2026-10-16", 11), from: "plan", to: "ideation", by: "runner" },
    { at: at("2026-10-16", 13), from: "ideation", to: "designing", by: "runner" },
  ],
};
const loginChat = [
  { at: at("2026-10-16", 10), from: "you", kind: "answers", answers: { q1: "a", q2: "b" } },
  { at: at("2026-10-16", 11), from: "system", kind: "progress", text: "✓ Spec" },
  { at: at("2026-10-16", 11), from: "agent", agent: "planner", text: "Wrote the spec. Then more." },
  { at: at("2026-10-16", 13), from: "system", kind: "progress", text: "✓ DS lint — 0 errors, 54 warnings" },
  { at: at("2026-10-16", 13), from: "agent", agent: "designer", text: "I built 3 directions: A, B and C." },
];

test("lastWorkday skips today and finds the latest earlier day", () => {
  const old = { task: { created_at: at("2026-10-14"), history: [] }, chat: [{ at: at("2026-10-19") }] };
  assert.equal(lastWorkday([{ task: login, chat: loginChat }, old], "2026-10-19"), "2026-10-16");
  assert.equal(lastWorkday([old], "2026-10-14"), null);
});

test("taskRecap says what was done and what's next", () => {
  const r = taskRecap(login, loginChat, "2026-10-16", columns);
  assert.equal(r.done, "Added and moved from Plan to Designing. The designer built 3 directions.");
  assert.equal(r.next, "Pick a direction in Figma, then move it to Refinement.");
});

test("taskRecap falls back to the checklist when no agent spoke", () => {
  const chat = ["A", "B"].map((x) => ({ at: at("2026-10-16"), from: "system", kind: "progress", text: `✓ ${x}` }));
  assert.equal(taskRecap({ ...login, created_at: at("2026-10-10"), history: [] }, chat, "2026-10-16", columns).done, "Finished 2 steps, ending with B.");
});

test("taskRecap is null for a quiet day", () => {
  assert.equal(taskRecap(login, loginChat, "2026-10-15", columns), null);
});

test("gist keeps the first clause and caps long ones", () => {
  assert.equal(gist("Done; next up"), "Done");
  assert.equal(gist("Specs for the Home (Figma 2073:6408; more) here"), "Specs for the Home");
  assert.equal(gist("Made the Empty states page in Figma with two directions, each with Brand Home and Licenses at 1280 and 390"), "Made the Empty states page in Figma with two directions");
  const long = gist("word ".repeat(60));
  assert.ok(long.length <= 121 && long.endsWith("…"));
});

test("said puts the agent in front of a past-tense line", () => {
  assert.equal(said("builder", "Removed the strip; more"), "The builder removed the strip.");
  assert.equal(said("planner", "Spec, plan and research are written."), "Spec, plan and research are written.");
});

test("nextStep names your move or the agent's", () => {
  assert.equal(nextStep({ column: "plan", status: "blocked", blocker: { title: "Figma not connected" } }, columns), "Clear the blocker: Figma not connected.");
  assert.equal(nextStep({ column: "ideation", status: "working" }, columns), "Wait for the designer to finish Ideation.");
  assert.equal(nextStep({ column: "plan", status: "needs_input" }, columns), "Answer the planner's questions in the chat.");
  assert.equal(nextStep({ column: "done", status: "idle" }, columns), "Nothing, it's finished.");
});

test("buildRecap groups by project in profile order", () => {
  const other = { ...login, id: "nav", title: "Nav", profile: "acme", history: [], created_at: at("2026-10-16", 9) };
  const r = buildRecap({
    entries: [{ task: login, chat: loginChat }, { task: other, chat: [] }],
    columns,
    profiles: [{ name: "acme", label: "Acme" }, { name: "client", label: "Client" }],
    today: "2026-10-19",
  });
  assert.equal(r.day, "2026-10-16");
  assert.deepEqual(r.projects.map((p) => [p.label, p.tasks.map((t) => t.id)]), [["Acme", ["nav"]], ["Client", ["login"]]]);
});

test("waitingOnYou is your move, not an agent's", () => {
  assert.equal(waitingOnYou({ column: "designing", status: "idle" }, columns), true);
  assert.equal(waitingOnYou({ column: "plan", status: "needs_input" }, columns), true);
  assert.equal(waitingOnYou({ column: "plan", status: "working" }, columns), false);
  assert.equal(waitingOnYou({ column: "done", status: "idle" }, columns), false);
});

test("buildRecap lists untouched tasks that wait on you, questions first", () => {
  const old = (id, column, status) => ({ task: { id, title: id, profile: "client", column, status, created_at: at("2026-10-10"), history: [] }, chat: [] });
  const r = buildRecap({
    entries: [{ task: login, chat: loginChat }, old("review-me", "designing", "idle"), old("asks", "plan", "needs_input"), old("busy", "plan", "working")],
    columns,
    profiles: [{ name: "client", label: "Client" }],
    today: "2026-10-19",
  });
  assert.deepEqual(r.projects[0].tasks.map((t) => t.id), ["login"]);
  assert.deepEqual(r.projects[0].waiting.map((t) => t.id), ["asks", "review-me"]);
  assert.equal(r.projects[0].waiting[0].next, "Answer the planner's questions in the chat.");
  assert.equal(r.projects[0].waiting[0].day, "2026-10-10");
  assert.equal(r.projects[0].waiting[0].done, "Added to the board.");
});

test("lastRecap skips days with nothing to say", () => {
  const chat = [{ at: at("2026-10-17"), from: "system", kind: "message", text: "Phone chat test" }];
  assert.deepEqual(lastRecap(login, [...loginChat, ...chat], columns, "2026-10-19"), {
    day: "2026-10-16",
    done: "Added and moved from Plan to Designing. The designer built 3 directions.",
  });
});

test("asked reads your message back as a request", () => {
  assert.equal(asked("can you add the references screenshots?"), "asked to add the references screenshots");
  assert.equal(asked("add a new version based on Grok's reference"), "asked to add a new version based on Grok's reference");
  assert.equal(asked("Could you please make my header smaller, pls"), "asked to make your header smaller");
  assert.equal(asked("I want a darker version"), "asked for a darker version");
  assert.equal(asked("why is the nav so tall?"), null);
  assert.equal(asked("the header looks off to me."), null);
  assert.equal(asked("try again"), null);
});

test("taskRecap tells the work you asked for before the agent's reply", () => {
  const chat = [
    { at: at("2026-10-16", 9), from: "you", text: "can you add the references screenshots?" },
    { at: at("2026-10-16", 10), from: "agent", agent: "designer", text: "I couldn't add them." },
    { at: at("2026-10-16", 11), from: "you", text: "try again" },
    { at: at("2026-10-16", 12), from: "you", text: "Try again" },
    { at: at("2026-10-16", 13), from: "agent", agent: "designer", text: "Added 8 screenshots to References. All uploads worked." },
  ];
  const task = { ...login, created_at: at("2026-10-10"), history: [] };
  assert.equal(taskRecap(task, chat, "2026-10-16", columns).done,
    "You asked to add the references screenshots. The designer added 8 screenshots to References.");
  const unanswered = [...chat, { at: at("2026-10-16", 14), from: "you", text: "make it darker" }, { at: at("2026-10-16", 14), from: "you", text: "why so dark?" }];
  assert.equal(taskRecap(task, unanswered, "2026-10-16", columns).done, "The designer added 8 screenshots to References. You asked to make it darker.");
});

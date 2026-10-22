import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REAL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let store, createTaskApp, root;

before(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), "agentos-task-app-"));
  cpSync(path.join(REAL_ROOT, "flow.yaml"), path.join(root, "flow.yaml"));
  mkdirSync(path.join(root, "profiles"));
  writeFileSync(path.join(root, "profiles", "demo.yaml"), "name: demo\nrepo: /tmp\ncommands:\n  dev: pnpm dev\napp_preview:\n  port: 3999\n  path: /dev/states\n");
  writeFileSync(path.join(root, "settings.yaml"), "profile: demo\naccount: default\nagents: {}\n");
  process.env.AGENTOS_ROOT_OVERRIDE = root;
  store = await import("../../board/store.mjs");
  ({ createTaskApp } = await import("./task-app.mjs"));
});

function taskWithWorktree() {
  const task = store.createTask({ title: "Run me", prompt: "p" });
  const wt = mkdtempSync(path.join(root, "wt-"));
  execFileSync("git", ["init", "-q", wt]);
  execFileSync("git", ["-C", wt, "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-q", "--allow-empty", "-m", "x"]);
  store.updateTask(task.id, (t) => { t.workspace = { path: wt, branch: `agentos/${task.id}` }; });
  return { task, wt };
}

test("run locally: serves the task's worktree, reports starting → running", async () => {
  const { task, wt } = taskWithWorktree();
  const calls = [];
  const changes = [];
  let finish;
  const serve = (o) => { calls.push(o); return new Promise((r) => (finish = r)); };
  const app = createTaskApp({ serve, onChange: (id) => changes.push(id), stateFile: path.join(root, "state.json") });

  assert.equal(app.start(task.id).state, "starting");
  assert.equal(calls[0].cwd, wt);
  assert.equal(calls[0].port, 3999);
  assert.equal(calls[0].command, "pnpm dev");
  assert.match(calls[0].commit, /^[0-9a-f]{40}$/);
  finish("http://localhost:3999");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(app.status(), { task: task.id, state: "running", url: "http://localhost:3999/dev/states" });

  app.stop("someone-else");
  assert.equal(app.status().state, "running", "stop for another task leaves it");
  app.stop(task.id);
  assert.equal(app.status(), null);
  assert.deepEqual(changes, [task.id, task.id, task.id]);
});

test("run locally: a failed start reports why; a stopped start never flips back", async () => {
  const { task } = taskWithWorktree();
  const fail = createTaskApp({ serve: async () => { throw new Error("the app exited while starting"); }, stateFile: path.join(root, "s2.json") });
  fail.start(task.id);
  await new Promise((r) => setImmediate(r));
  assert.equal(fail.status().state, "failed");
  assert.match(fail.status().error, /exited/);

  let finish;
  const slow = createTaskApp({ serve: () => new Promise((r) => (finish = r)), stateFile: path.join(root, "s3.json") });
  slow.start(task.id);
  slow.stop();
  finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(slow.status(), null);
});

test("run locally: needs the task's worktree", () => {
  const task = store.createTask({ title: "No branch", prompt: "p" });
  const app = createTaskApp({ serve: async () => {}, stateFile: path.join(root, "s4.json") });
  assert.throws(() => app.start(task.id), /no build branch/);
});

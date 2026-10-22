/**
 * "Run locally": the board starts a task's own build — the profile's dev server in the
 * task's worktree (agentos/<task id>) — so the owner can click through the outcome before the
 * draft PR. One task's app at a time, on the profile's `app_preview.port` (default 3418, beside
 * the designer's reference app on 3417), opened at `app_preview.path`.
 *
 * Starting takes minutes the first time (dependencies, first compile), so `start()` returns at
 * once and `status()` reports { task, state: starting | running | failed, url, error }; `onChange`
 * fires on every transition.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as store from "../../board/store.mjs";
import { alive, readState, serveApp, stopApp } from "./dev-server.mjs";

const STATE_FILE = path.join(os.tmpdir(), "agentos-task-app.json");
const LOG_FILE = path.join(os.homedir(), "Library", "Logs", "Chomp", "task-app.log");

export function previewOf(profile) {
  const port = profile.app_preview?.port ?? 3418;
  return { port, path: profile.app_preview?.path ?? "/" };
}

/** Why this task can't run locally, or null. */
export function cantRun(task, profile) {
  const ws = task?.workspace;
  if (!ws?.path || ws.removed || !existsSync(ws.path)) return "This task has no build branch on this computer.";
  if (!profile.commands?.dev) return `profiles/${task.profile}.yaml has no commands.dev.`;
  return null;
}

export function createTaskApp({ onChange = () => {}, serve = serveApp, stateFile = STATE_FILE } = {}) {
  // What the board shows. A dev server left running by an earlier board process is picked
  // back up as running (its state file says which task it serves).
  let current = null;
  const saved = readState(stateFile);
  if (saved?.task && alive(saved.pid)) current = { task: saved.task, state: "running", url: saved.url };
  let run = 0;

  const set = (next) => {
    const id = next?.task ?? current?.task ?? null;
    current = next;
    onChange(id);
  };

  return {
    status: () => current,

    start(taskId) {
      const task = store.getTask(taskId);
      if (!task) throw new Error("no such task");
      const profile = store.resolveProfile(store.loadProfile(task.profile), task);
      const why = cantRun(task, profile);
      if (why) throw new Error(why);
      const { port, path: entry } = previewOf(profile);
      const url = `http://localhost:${port}${entry}`;
      const commit = execFileSync("git", ["-C", task.workspace.path, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      const mine = (run += 1);
      set({ task: taskId, state: "starting", url });
      serve({ cwd: task.workspace.path, command: profile.commands.dev, port, commit, stateFile, logFile: LOG_FILE, extra: { task: taskId, url }, log: (m) => console.log(`[task-app] ${taskId}: ${m}`) })
        .then(() => { if (mine === run) set({ task: taskId, state: "running", url }); })
        .catch((err) => { if (mine === run) set({ task: taskId, state: "failed", url, error: String(err.message ?? err).slice(0, 300) }); });
      return current;
    },

    /** Stops the app (only if it's `taskId`'s, when given). */
    stop(taskId = null) {
      if (taskId && current?.task !== taskId) return;
      run += 1;
      stopApp(stateFile);
      if (current) set(null);
    },
  };
}

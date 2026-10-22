#!/usr/bin/env node
/**
 * agentos — start the board (which starts the runner with it), or manage a task's phone chat.
 *
 *   agentos serve [--port <n>] [--no-runner]
 *   agentos companion start|stop|status <AOS-n | task id>
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...args] = process.argv.slice(2);
const USAGE = "Usage: agentos serve [--port <n>] [--no-runner]\n       agentos companion start|stop|status <AOS-n | task id>";

if (cmd === "serve") {
  spawn(process.execPath, [path.join(ROOT, "harness", "dashboard", "serve.mjs"), ...args], { stdio: "inherit" }).on("exit", (code) => process.exit(code ?? 0));
} else if (cmd === "companion") {
  const store = await import("../board/store.mjs");
  const companions = await import("../harness/companion/index.mjs");
  const [action, ref] = args;
  const task = store.listTasks().find((t) => t.ref?.toLowerCase() === String(ref).toLowerCase() || t.id === ref);
  if (!task || !["start", "stop", "status"].includes(action)) {
    console.log(task ? USAGE : `No task "${ref}".\n${USAGE}`);
    process.exit(1);
  }
  if (action === "start") {
    const notReady = await companions.companionReadiness(task.account);
    if (notReady) {
      console.log(`${notReady.title}.\nFix: ${notReady.fix}`);
      process.exit(1);
    }
    const chat = store.readChat(task.id);
    const stop = companions.stopFor(task, store.loadFlow(), chat);
    const c = await companions.startCompanion(task.id, { stop });
    console.log(`Started "${c.name}" (${c.id}). It shows up in the Claude app under Code.`);
  } else if (action === "stop") {
    console.log((await companions.stopCompanion(task.id)) ? "Stopped." : "This task has no phone chat.");
  } else {
    const live = await companions.liveSessions(task.account);
    console.log(JSON.stringify({ companion: task.companion ?? null, live: companions.isLive(live, task.companion) }, null, 1));
  }
} else {
  console.log(USAGE);
  process.exit(cmd ? 1 : 0);
}

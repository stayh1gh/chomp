#!/usr/bin/env node
/**
 * Screenshots of the ACTUAL app, for the designer to ground a design in what ships.
 *
 * Runs the profile's app from a reference worktree pinned to origin/<base branch>
 * (`<repo>/.claude/worktrees/agentos-reference`) — never the human's main checkout — on a
 * fixed local port, starting it on first use and leaving it running for the next capture.
 * Paths come from the profile's `app_reference` (e.g. a dev gallery that renders real
 * screens inside the real app shell without a login).
 *
 *   app-reference.mjs --task <id> --name <slug> --path </route?query> [--viewport WxH]… [--full-page]
 *   app-reference.mjs --stop
 *
 * The designer may run this command and nothing else through Bash (agents/designer.md
 * `bash:`), so it validates everything itself.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "../../board/store.mjs";
import { captureUrl } from "./capture.mjs";
import { serveApp, stopApp } from "./dev-server.mjs";

const PID_FILE = path.join(os.tmpdir(), "agentos-reference-app.json");
const LOG_FILE = path.join(os.homedir(), "Library", "Logs", "Chomp", "reference-app.log");

function parse(argv) {
  const a = { viewports: [], fullPage: false, wait: 1500 };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--task") (a.task = v), (i += 1);
    else if (k === "--name") (a.name = v), (i += 1);
    else if (k === "--path") (a.path = v), (i += 1);
    else if (k === "--viewport") (a.viewports.push(v), (i += 1));
    else if (k === "--full-page") a.fullPage = true;
    else if (k === "--stop") a.stop = true;
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

/** Reference worktree at origin/<base>, deps installed, dev server up. Returns its base URL. */
export async function ensureReferenceApp(profile, log = (m) => console.error(m)) {
  const port = profile.app_reference?.port ?? 3417;
  const branch = profile.base_branch ?? "main";
  const wt = path.join(profile.repo, ".claude", "worktrees", "agentos-reference");
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

  git("-C", profile.repo, "fetch", "origin", branch);
  const target = git("-C", profile.repo, "rev-parse", `origin/${branch}`);
  if (!existsSync(wt)) {
    log(`creating reference worktree at origin/${branch}`);
    git("-C", profile.repo, "worktree", "add", "--detach", wt, `origin/${branch}`);
  } else if (git("-C", wt, "rev-parse", "HEAD") !== target) {
    git("-C", wt, "checkout", "--detach", target);
  }
  return serveApp({ cwd: wt, command: profile.commands.dev, port, commit: target, stateFile: PID_FILE, logFile: LOG_FILE, log });
}

export function validate(a, profile) {
  let task = null;
  try { task = a.task && store.getTask(a.task); } catch { /* bad id */ }
  if (!task) throw new Error("--task must name an existing task");
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(a.name ?? "")) throw new Error("--name must be a short lowercase slug");
  if (!/^\/[\w\-./?=&%[\]]*$/.test(a.path ?? "") || a.path.includes("..")) throw new Error("--path must be an app path like /dev/talent-states/z/<id>?w=1280");
  if (!profile.app_reference) throw new Error(`profiles/${task.profile}.yaml has no app_reference`);
  for (const v of a.viewports) if (!/^\d{3,4}x\d{3,4}$/.test(v)) throw new Error(`bad viewport ${v}`);
}

async function main() {
  const a = parse(process.argv.slice(2));
  if (a.stop) {
    stopApp(PID_FILE);
    console.log("stopped");
    return;
  }
  let task = null;
  try { task = store.getTask(a.task ?? ""); } catch { /* validate() reports it */ }
  const profile = task ? store.resolveProfile(store.loadProfile(task.profile), task) : {};
  validate(a, profile);
  const base = await ensureReferenceApp(profile);
  await captureUrl({ ...a, url: `${base}${a.path}` });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  });
}

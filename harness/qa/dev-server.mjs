/**
 * Runs a profile's dev server (`commands.dev`) from a checkout on a fixed local port, as a
 * detached process group that outlives the caller. A small JSON state file remembers which
 * checkout and commit it serves, so the next call reuses it or restarts it. Used by the
 * designer's reference app (app-reference.mjs) and the board's "Run locally" (task-app.mjs).
 */

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

export const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export async function answers(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export function readState(stateFile) {
  try {
    return JSON.parse(readFileSync(stateFile, "utf8"));
  } catch {
    return null;
  }
}

export function stopApp(stateFile) {
  const state = readState(stateFile);
  if (state && alive(state.pid)) process.kill(-state.pid, "SIGTERM");
  rmSync(stateFile, { force: true });
}

/**
 * The dev server for `cwd` at `commit`, up on `port`: reused when it already is, otherwise
 * (re)started, installing dependencies first when node_modules is missing or the lockfile
 * changed. Resolves to its base URL once it answers.
 */
export async function serveApp({ cwd, command, port, commit, stateFile, logFile, extra = {}, log = (m) => console.error(m) }) {
  const base = `http://localhost:${port}`;
  const state = readState(stateFile);
  if (state && alive(state.pid) && state.cwd === cwd && state.commit === commit && (await answers(base))) return base;
  if (state && alive(state.pid)) process.kill(-state.pid, "SIGTERM");

  const lock = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"].find((f) => existsSync(path.join(cwd, f)));
  const lockHash = lock ? createHash("sha1").update(readFileSync(path.join(cwd, lock))).digest("hex") : "none";
  if (!existsSync(path.join(cwd, "node_modules")) || (state?.cwd === cwd && state.lockHash !== lockHash)) {
    log("installing dependencies (first run takes a few minutes)");
    const pm = lock === "pnpm-lock.yaml" ? ["pnpm", ["install", "--frozen-lockfile"]] : lock === "yarn.lock" ? ["yarn", ["install", "--frozen-lockfile"]] : ["npm", ["ci"]];
    // Async, so the board server keeps answering while it runs.
    await new Promise((resolve, reject) => {
      const p = spawn(pm[0], pm[1], { cwd, stdio: ["ignore", "ignore", "inherit"] });
      p.on("error", reject);
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${pm[0]} ${pm[1].join(" ")} failed (exit ${code})`))));
    });
  }

  log(`starting the app on ${base}`);
  mkdirSync(path.dirname(logFile), { recursive: true });
  const out = openSync(logFile, "a");
  const child = spawn("sh", ["-c", command], { cwd, env: { ...process.env, PORT: String(port) }, detached: true, stdio: ["ignore", out, out] });
  child.unref();
  writeFileSync(stateFile, JSON.stringify({ pid: child.pid, cwd, commit, lockHash, port, ...extra }));

  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (await answers(base)) return base;
    if (!alive(child.pid)) throw new Error(`the app exited while starting — see ${logFile}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`the app didn't answer on ${base} within 4 minutes — see ${logFile}`);
}

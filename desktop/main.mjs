// Chomp desktop wrapper — Electron main process.
//
// This is deliberately a thin shell: it does not reimplement anything the board
// already does. It finds the Chomp repo on disk, spawns the existing
// harness/dashboard/serve.mjs as a child process (or reuses one that's already
// running), and opens a window on it. See desktop/README.md (none — see the repo
// root README's "Desktop app" section) for the constraints this respects:
//
//   - serve.mjs's write endpoints require Sec-Fetch-Site: same-origin, so the
//     window MUST load the real http://127.0.0.1:<port> origin — never file://.
//   - GET /artifact resolves paths relative to process.cwd(), so the child must be
//     spawned with cwd set to the Chomp repo root.
//   - the unattended runner's dispatch locks are in-memory / per-process, so only
//     one serve.mjs should run at a time — this wrapper reuses an already-running
//     server instead of racing it, and never kills a server it didn't start.

import { app, BrowserWindow, dialog, shell } from "electron";
import { spawn, execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";

const DEFAULT_PORT = 4400;
const CONFIG_DIR = path.join(os.homedir(), ".agentos");
const CONFIG_PATH = path.join(CONFIG_DIR, "desktop.json");
const LOG_DIR = path.join(os.homedir(), "Library", "Logs", "Chomp");
const LOG_PATH = path.join(LOG_DIR, "server.log");

let mainWindow = null;
let serverChild = null; // only set if THIS process spawned the server
let serverPort = DEFAULT_PORT;

// ---------------------------------------------------------------------------
// Single instance — a second launch just focuses the existing window instead
// of racing the first over the runner's in-memory locks.
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(main);

  app.on("window-all-closed", () => {
    // macOS convention: stay running (and keep the server alive) until Cmd+Q.
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) main();
  });

  let quitConfirmed = false;
  app.on("before-quit", async (event) => {
    if (!serverChild || quitConfirmed) return; // never touch a server we didn't spawn
    event.preventDefault();
    const proceed = await confirmQuitIfRunnerActive();
    if (!proceed) return;
    quitConfirmed = true;
    try {
      serverChild.kill();
    } catch {
      // already dead
    }
    serverChild = null;
    app.quit();
  });
}

async function main() {
  if (mainWindow) return; // already running (e.g. re-triggered via activate)

  const root = await resolveAgentosRoot();
  if (!root) {
    app.quit();
    return;
  }

  const preflightError = preflightCheck(root);
  if (preflightError) {
    await dialog.showMessageBox({
      type: "error",
      title: "Chomp",
      message: "Dependencies not installed",
      detail: preflightError,
    });
    app.quit();
    return;
  }

  const childEnv = await buildChildEnv();
  const running = await findRunningServer(DEFAULT_PORT);

  // The app runs main. Pull it before starting our own server; a server someone else
  // started keeps whatever it loaded, so leave its checkout alone.
  const branch = await currentBranch(root, childEnv);
  if (branch !== "main") {
    const result = await dialog.showMessageBox({
      type: "warning",
      title: "Chomp",
      message: `The Chomp checkout is on “${branch || "a detached HEAD"}”, not main.`,
      detail: `The board will run that branch's code and won't pull main. To go back:\n\n  cd "${root}" && git switch main`,
      buttons: ["Open Anyway", "Quit"],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 1) {
      app.quit();
      return;
    }
  } else if (!running) {
    const pullError = await pullMain(root, childEnv);
    if (pullError) {
      await dialog.showMessageBox({
        type: "warning",
        title: "Chomp",
        message: "Couldn't update main, so the board runs the code already there.",
        detail: pullError,
      });
    }
  }

  if (running) {
    serverPort = DEFAULT_PORT;
    openWindow(serverPort);
    return;
  }

  serverPort = await findFreePort(DEFAULT_PORT);

  mkdirSync(LOG_DIR, { recursive: true });
  const logStream = createWriteStream(LOG_PATH, { flags: "a" });
  logStream.write(`\n--- launch ${new Date().toISOString()} (port ${serverPort}) ---\n`);

  const child = spawn(
    process.execPath,
    [path.join(root, "harness", "dashboard", "serve.mjs"), "--port", String(serverPort)],
    {
      cwd: root,
      env: { ...childEnv, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  serverChild = child;
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  child.on("exit", (code) => {
    if (serverChild === child) {
      serverChild = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog
          .showMessageBox({
            type: "error",
            title: "Chomp",
            message: `The board server exited unexpectedly (code ${code}).`,
            detail: `See log for details:\n${LOG_PATH}`,
            buttons: ["Open Log", "Quit"],
          })
          .then((result) => {
            if (result.response === 0) shell.showItemInFolder(LOG_PATH);
            app.quit();
          });
      }
    }
  });

  // The first launch installs and builds the board UI before it answers.
  const healthy = await waitForHealthy(serverPort, 180_000);
  if (!healthy) {
    const tail = readLogTail();
    await dialog.showMessageBox({
      type: "error",
      title: "Chomp",
      message: "The board server didn't start in time.",
      detail: tail || `Check the log at ${LOG_PATH}`,
    });
    if (serverChild) serverChild.kill();
    app.quit();
    return;
  }

  openWindow(serverPort);
}

function openWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Chomp",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  // Links off the board (Figma, GitHub PRs, Mobbin) go to the default browser — which
  // hands figma.com to the Figma app when it's set to — never to a bare Electron window
  // with no Figma or GitHub session.
  const boardOrigin = `http://127.0.0.1:${port}`;
  const external = (url) => /^https?:\/\//.test(url) && !url.startsWith(boardOrigin);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (external(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (external(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  // Must be the real http origin (not file://) — serve.mjs's write endpoints
  // check Sec-Fetch-Site: same-origin, which only a real http navigation sets.
  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

// ---------------------------------------------------------------------------
// Repo root resolution
// ---------------------------------------------------------------------------
async function resolveAgentosRoot() {
  let root = null;
  if (existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
      if (cfg.root && isValidRoot(cfg.root)) root = cfg.root;
    } catch {
      // fall through to defaults / prompt
    }
  }

  // `npm start` in desktop/: the checkout it sits in. A built app only knows the saved root.
  const parent = path.resolve(app.getAppPath(), "..");
  if (!root && !app.isPackaged && isValidRoot(parent)) {
    root = parent;
  }

  if (!root) {
    const result = await dialog.showOpenDialog({
      title: "Locate the Chomp repo",
      message: "Select the folder containing harness/dashboard/serve.mjs",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const picked = result.filePaths[0];
    if (!isValidRoot(picked)) {
      await dialog.showMessageBox({
        type: "error",
        title: "Chomp",
        message: "That folder doesn't look like the Chomp repo (no harness/dashboard/serve.mjs).",
      });
      return null;
    }
    root = picked;
  }

  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ root }, null, 2));
  return root;
}

function isValidRoot(root) {
  return existsSync(path.join(root, "harness", "dashboard", "serve.mjs"));
}

function preflightCheck(root) {
  if (!existsSync(path.join(root, "node_modules", "js-yaml"))) {
    return `Dependencies aren't installed in:\n${root}\n\nRun this once in a terminal, then relaunch:\n\n  cd "${root}" && npm ci`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main branch — the root checkout lives on main; branch work goes in worktrees.
// ---------------------------------------------------------------------------
function git(root, args, env) {
  return new Promise((resolve) => {
    execFile("git", ["-C", root, ...args], { env, timeout: 20_000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout).trim(), err: String(stderr).trim() || err?.message || "" });
    });
  });
}

async function currentBranch(root, env) {
  const head = await git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], env);
  return head.ok ? head.out : null;
}

/** Fast-forwards main to origin/main. Returns why it couldn't, or null. Offline isn't an error. */
async function pullMain(root, env) {
  const fetched = await git(root, ["fetch", "--quiet", "origin", "main"], env);
  if (!fetched.ok) {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_PATH, `\n--- ${new Date().toISOString()} couldn't fetch main: ${fetched.err}\n`);
    return null;
  }
  const merged = await git(root, ["merge", "--ff-only", "--quiet", "origin/main"], env);
  return merged.ok ? null : merged.err.split("\n").filter((line) => !line.startsWith("hint:")).join("\n");
}

// ---------------------------------------------------------------------------
// Env — GUI-launched apps get a bare PATH; the runner needs the real one
// (git, gh, pnpm, etc.) plus HOME for ~/.local/share/claude-profiles/.
// ---------------------------------------------------------------------------
function buildChildEnv() {
  return new Promise((resolve) => {
    const shellBin = process.env.SHELL || "/bin/zsh";
    execFile(shellBin, ["-ilc", "echo -n $PATH"], { timeout: 5000 }, (err, stdout) => {
      const env = { ...process.env };
      if (!err && stdout && stdout.trim()) {
        env.PATH = stdout.trim();
      }
      if (!env.HOME) env.HOME = os.homedir();
      resolve(env);
    });
  });
}

// ---------------------------------------------------------------------------
// Port discovery / reuse
// ---------------------------------------------------------------------------
function findRunningServer(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/runner/status", timeout: 1500 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 1000 }, (res) => {
      res.resume();
      resolve(false); // something answered — not free
    });
    req.on("error", () => resolve(true));
    req.on("timeout", () => {
      req.destroy();
      resolve(true);
    });
  });
}

async function findFreePort(startPort) {
  let port = startPort;
  for (let i = 0; i < 20; i++) {
    if (await isPortFree(port)) return port;
    port += 1;
  }
  return startPort; // give up gracefully; serve.mjs will fail loudly if truly taken
}

function waitForHealthy(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 1500 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => {
        if (Date.now() >= deadline) resolve(false);
        else setTimeout(attempt, 300);
      });
      req.on("timeout", () => {
        req.destroy();
        if (Date.now() >= deadline) resolve(false);
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

function readLogTail() {
  try {
    const text = readFileSync(LOG_PATH, "utf8");
    return text.split("\n").slice(-30).join("\n");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Quit confirmation — don't silently kill a mid-flight unattended run.
// ---------------------------------------------------------------------------
function checkRunnerActive(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/runner/status", timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const status = JSON.parse(body);
          resolve(Boolean(status.running));
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function confirmQuitIfRunnerActive() {
  const active = await checkRunnerActive(serverPort);
  if (!active) return true;
  const result = await dialog.showMessageBox({
    type: "warning",
    title: "Chomp",
    message: "The unattended runner is active.",
    detail: "Quitting will stop it mid-run.",
    buttons: ["Cancel", "Quit Anyway"],
    defaultId: 0,
    cancelId: 0,
  });
  return result.response === 1;
}

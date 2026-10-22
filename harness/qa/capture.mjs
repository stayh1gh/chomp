#!/usr/bin/env node
/**
 * Visual QA captures for the builder, saved into the task's qa/ folder so qa.md can show
 * them side by side. The builder runs this through Bash; it names the task, never the
 * board path, so the guard's "agents never touch the board" rule still holds — this
 * script is the one place that writes there, and only PNGs under qa/.
 *
 *   capture.mjs --task <id> --name <slug> --url <http://localhost:…/route>
 *               [--viewport 390x844]… [--full-page] [--wait <ms>] [--storage <state.json>]
 *   capture.mjs --task <id> --name <slug> --fetch <https://www.figma.com/api/mcp/asset/….png>
 *
 * Viewports default to the task profile's. Prints one saved path per line.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import * as store from "../../board/store.mjs";

function parse(argv) {
  const a = { viewports: [], fullPage: false, wait: 800 };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--task") (a.task = v), (i += 1);
    else if (k === "--name") (a.name = v), (i += 1);
    else if (k === "--url") (a.url = v), (i += 1);
    else if (k === "--fetch") (a.fetch = v), (i += 1);
    else if (k === "--viewport") (a.viewports.push(v), (i += 1));
    else if (k === "--wait") (a.wait = Number(v)), (i += 1);
    else if (k === "--storage") (a.storage = v), (i += 1);
    else if (k === "--full-page") a.fullPage = true;
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

export function validate(a) {
  let task = null;
  try { task = a.task && store.getTask(a.task); } catch { /* bad id */ }
  if (!task) throw new Error("--task must name an existing task");
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(a.name ?? "")) throw new Error("--name must be a short lowercase slug");
  if (Boolean(a.url) === Boolean(a.fetch)) throw new Error("give exactly one of --url or --fetch");
  if (a.url && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(a.url)) throw new Error("--url must be a local dev server URL");
  if (a.fetch && !/^https:\/\/www\.figma\.com\/api\/mcp\/asset\/[\w-]+\.png$/.test(a.fetch)) throw new Error("--fetch only takes Figma MCP screenshot URLs");
  for (const v of a.viewports) if (!/^\d{3,4}x\d{3,4}$/.test(v)) throw new Error(`bad viewport ${v}`);
}

async function main() {
  const a = parse(process.argv.slice(2));
  validate(a);
  const dir = path.join(store.taskDir(a.task), "qa");
  mkdirSync(dir, { recursive: true });

  if (a.fetch) {
    const res = await fetch(a.fetch);
    if (!res.ok) throw new Error(`Figma asset fetch failed: HTTP ${res.status}`);
    const file = path.join(dir, `${a.name}.png`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`qa/${path.basename(file)}`);
    return;
  }

  await captureUrl(a, dir);
}

/** Screenshots `a.url` at each viewport into `dir`; prints and returns the qa/ paths. */
export async function captureUrl(a, dir = path.join(store.taskDir(a.task), "qa")) {
  mkdirSync(dir, { recursive: true });
  const saved = [];
  const task = store.getTask(a.task);
  const viewports = a.viewports.length
    ? a.viewports.map((v) => v.split("x").map(Number))
    : (store.resolveProfile(store.loadProfile(task.profile), task).viewports ?? [{ w: 1440, h: 900 }]).map((v) => [v.w, v.h]);
  const browser = await chromium.launch();
  try {
    for (const [width, height] of viewports) {
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, ...(a.storage ? { storageState: a.storage } : {}) });
      const page = await ctx.newPage();
      const res = await page.goto(a.url, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(a.wait);
      const file = path.join(dir, `${a.name}-${width}x${height}.png`);
      await page.screenshot({ path: file, fullPage: a.fullPage });
      const line = `qa/${path.basename(file)}${res && !res.ok() ? `  (HTTP ${res.status()})` : ""}`;
      console.log(line);
      saved.push(line);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return saved;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  });
}

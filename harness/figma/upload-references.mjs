#!/usr/bin/env node
/**
 * Puts reference screenshots into the task's Figma page. The designer can't move bytes
 * itself (its Bash runs only allowlisted scripts), so it:
 *   1. lays out one frame per reference in the page's References section,
 *   2. calls the Figma MCP `upload_assets` with those frames' ids (`nodeIds`), getting one
 *      single-use upload URL per frame,
 *   3. writes `references.json` into the task folder:
 *        [{ "source": "<Mobbin image_url | qa/<capture>.png>", "upload_url": "<submitUrl>", "name": "<layer name>" }]
 *   4. runs this script, which downloads each source and POSTs it to its upload URL —
 *      Figma then sets it as that frame's image fill. Upload URLs are single-use and expire
 *      after 10 minutes, so run this right after `upload_assets`.
 *
 *   upload-references.mjs --task <id>
 *
 * Sources are limited to Mobbin's image URLs and the task's own qa/ captures (the real
 * app, from app-reference.mjs); destinations to Figma upload URLs. Prints one line per
 * reference and exits non-zero if any failed.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "../../board/store.mjs";

const TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

/** Throws on anything that isn't a Mobbin image or this task's own capture → a Figma upload URL. */
export function validateEntry(entry, taskDir) {
  const { source, upload_url: upload } = entry ?? {};
  if (typeof source !== "string" || typeof upload !== "string") throw new Error("each entry needs `source` and `upload_url` strings");
  let up;
  try { up = new URL(upload); } catch { throw new Error(`upload_url isn't a URL: ${upload.slice(0, 80)}`); }
  if (up.protocol !== "https:" || !/(^|\.)figma\.com$/.test(up.hostname)) throw new Error(`upload_url must be a Figma https URL (got ${up.hostname})`);
  if (/^qa\/[\w.-]+\.(png|jpe?g|webp)$/.test(source)) {
    const file = path.join(taskDir, source);
    if (!existsSync(file)) throw new Error(`${source} doesn't exist in the task folder — capture it with app-reference.mjs first`);
    return { kind: "file", file, upload };
  }
  let src;
  try { src = new URL(source); } catch { throw new Error(`source must be a Mobbin image URL or qa/<file>.png (got ${source.slice(0, 80)})`); }
  if (src.protocol !== "https:" || !/(^|\.)mobbin\.com$/.test(src.hostname)) throw new Error(`source must be a Mobbin image URL (got ${src.hostname})`);
  return { kind: "url", url: source, upload };
}

async function bytesFor(item) {
  if (item.kind === "file") {
    const ext = path.extname(item.file).slice(1).toLowerCase();
    return { body: readFileSync(item.file), type: TYPES[ext] ?? "image/png" };
  }
  const res = await fetch(item.url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!Object.values(TYPES).includes(type)) throw new Error(`not an image (${type || "no content-type"})`);
  return { body: Buffer.from(await res.arrayBuffer()), type };
}

export async function uploadReferences(taskId, { fetchImpl } = {}) {
  if (fetchImpl) globalThis.fetch = fetchImpl;
  const dir = store.taskDir(taskId);
  const listFile = path.join(dir, "references.json");
  if (!existsSync(listFile)) throw new Error("no references.json in the task folder");
  const entries = JSON.parse(readFileSync(listFile, "utf8"));
  if (!Array.isArray(entries) || !entries.length) throw new Error("references.json must be a non-empty array");
  if (entries.length > 60) throw new Error("at most 60 references per run (upload_assets' own limit)");

  const results = await Promise.all(entries.map(async (entry, i) => {
    try {
      const item = validateEntry(entry, dir);
      const { body, type } = await bytesFor(item);
      if (body.length > 10 * 1024 * 1024) throw new Error("over Figma's 10 MB limit");
      // Multipart, so Figma names the layer after the file.
      const ext = Object.keys(TYPES).find((k) => TYPES[k] === type) ?? "png";
      const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim().slice(0, 80) : `Reference ${i + 1}`;
      const form = new FormData();
      form.append("file", new Blob([body], { type }), `${name.replace(/[\/:*?"<>|]/g, "-")}.${ext}`);
      const res = await fetch(item.upload, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`upload failed: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
      return `✓ ${i + 1}. ${entry.source.slice(0, 80)}`;
    } catch (err) {
      return `✗ ${i + 1}. ${String(entry?.source ?? "").slice(0, 80)} — ${err.message}`;
    }
  }));
  return results;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const at = process.argv.indexOf("--task");
  const taskId = at > -1 ? process.argv[at + 1] : null;
  (async () => {
    let task = null;
    try { task = taskId && store.getTask(taskId); } catch { /* bad id */ }
    if (!task) throw new Error("--task must name an existing task");
    const lines = await uploadReferences(taskId);
    for (const line of lines) console.log(line);
    if (lines.some((l) => l.startsWith("✗"))) process.exitCode = 1;
  })().catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  });
}

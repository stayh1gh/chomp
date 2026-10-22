import { test, before } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REAL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let mod, store, id, dir;

before(async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agentos-refs-"));
  cpSync(path.join(REAL_ROOT, "flow.yaml"), path.join(root, "flow.yaml"));
  mkdirSync(path.join(root, "profiles"));
  writeFileSync(path.join(root, "profiles", "demo.yaml"), "name: demo\nrepo: /tmp\n");
  writeFileSync(path.join(root, "settings.yaml"), "profile: demo\naccount: default\nagents: {}\n");
  process.env.AGENTOS_ROOT_OVERRIDE = root;
  store = await import("../../board/store.mjs");
  id = store.createTask({ title: "Refs", prompt: "p" }).id;
  dir = store.taskDir(id);
  mkdirSync(path.join(dir, "qa"));
  writeFileSync(path.join(dir, "qa", "vault-1280x900.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  mod = await import("./upload-references.mjs");
});

const UP = "https://mcp.figma.com/mcp/upload/2bdfd326/submit?scaleMode=FIT";

test("only Mobbin images or the task's own captures, only to Figma upload URLs", () => {
  assert.equal(mod.validateEntry({ source: "https://mobbin.com/api/mcp/short/yaT3jyzt", upload_url: UP }, dir).kind, "url");
  assert.equal(mod.validateEntry({ source: "qa/vault-1280x900.png", upload_url: UP }, dir).kind, "file");
  assert.throws(() => mod.validateEntry({ source: "https://evil.com/x.png", upload_url: UP }, dir), /Mobbin/);
  assert.throws(() => mod.validateEntry({ source: "qa/../task.yaml", upload_url: UP }, dir));
  assert.throws(() => mod.validateEntry({ source: "/etc/passwd", upload_url: UP }, dir));
  assert.throws(() => mod.validateEntry({ source: "qa/missing.png", upload_url: UP }, dir), /doesn't exist/);
  assert.throws(() => mod.validateEntry({ source: "qa/vault-1280x900.png", upload_url: "https://evil.com/up" }, dir), /Figma/);
  assert.throws(() => mod.validateEntry({ source: "qa/vault-1280x900.png", upload_url: "http://mcp.figma.com/up" }, dir), /Figma/);
});

test("downloads each source and POSTs it as a named file; reports per image", async () => {
  writeFileSync(path.join(dir, "references.json"), JSON.stringify([
    { source: "https://mobbin.com/api/mcp/short/abc", upload_url: UP, name: "Mobbin · Dropbox — Upload" },
    { source: "qa/vault-1280x900.png", upload_url: UP, name: "Current app — /vault" },
    { source: "https://evil.com/x.png", upload_url: UP },
  ]));
  const posts = [];
  const fakeFetch = async (url, opts = {}) => {
    if (opts.method === "POST") {
      const file = opts.body.get("file");
      posts.push({ url, name: file.name, type: file.type });
      return new Response('{"imageHash":"h"}', { status: 200 });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/webp" } });
  };
  const lines = await mod.uploadReferences(id, { fetchImpl: fakeFetch });
  assert.deepEqual(lines.map((l) => l[0]), ["✓", "✓", "✗"]);
  // Uploads run in parallel, so compare without order.
  assert.deepEqual(posts.map((p) => `${p.name} ${p.type}`).sort(), ["Current app — -vault.png image/png", "Mobbin · Dropbox — Upload.webp image/webp"]);
});

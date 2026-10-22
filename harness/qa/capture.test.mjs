import { test, before } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REAL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let validate, id;

before(async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agentos-qa-"));
  cpSync(path.join(REAL_ROOT, "flow.yaml"), path.join(root, "flow.yaml"));
  mkdirSync(path.join(root, "profiles"));
  writeFileSync(path.join(root, "profiles", "demo.yaml"), "name: demo\nrepo: /tmp\n");
  writeFileSync(path.join(root, "settings.yaml"), "profile: demo\naccount: default\nagents: {}\n");
  process.env.AGENTOS_ROOT_OVERRIDE = root;
  const store = await import("../../board/store.mjs");
  id = store.createTask({ title: "QA", prompt: "p" }).id;
  ({ validate } = await import("./capture.mjs"));
});

test("capture only takes local app URLs and Figma MCP screenshots", () => {
  const ok = (a) => validate({ task: id, name: "default", viewports: [], ...a });
  assert.doesNotThrow(() => ok({ url: "http://localhost:3000/vault" }));
  assert.doesNotThrow(() => ok({ fetch: "https://www.figma.com/api/mcp/asset/c44d2a0a-fca7.png" }));
  assert.throws(() => ok({ url: "https://evil.com/" }), /local dev server/);
  assert.throws(() => ok({ fetch: "https://evil.com/a.png" }), /Figma MCP/);
  assert.throws(() => ok({ url: "http://localhost:3000/", fetch: "https://www.figma.com/api/mcp/asset/a.png" }), /exactly one/);
  assert.throws(() => ok({ url: "http://localhost:3000/", name: "../../etc" }), /slug/);
  assert.throws(() => ok({ url: "http://localhost:3000/", viewports: ["big"] }), /bad viewport/);
  assert.throws(() => validate({ task: "../x", name: "a", viewports: [], url: "http://localhost/" }), /existing task/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, utimesSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCheatsheetScript, isCheatsheetCall, fetchRows, cheatsheetMarkdown, ensureCheatsheet, cheatsheetPath } from "./cheatsheet.mjs";

// A tiny stand-in for the library file's Plugin API: enough to run ds-cheatsheet.js for real.
function fakeLibrary({ vars = 3 } = {}) {
  const node = (type, name, key, extra = {}) => ({ type, name, key, ...extra });
  const button = node("COMPONENT_SET", "Button", "set-button", {
    componentPropertyDefinitions: {
      Size: { type: "VARIANT", variantOptions: ["sm", "md"] },
      "Label#1:0": { type: "TEXT" },
      "Icon#2:0": { type: "BOOLEAN" },
    },
  });
  const variant = node("COMPONENT", "Size=sm", "c-variant", { parent: button });
  const avatar = node("COMPONENT", "Avatar", "c-avatar", { parent: { type: "FRAME" }, componentPropertyDefinitions: { "Glyph#3:0": { type: "INSTANCE_SWAP" } } });
  const hidden = node("COMPONENT", ".Base", "c-hidden", { parent: { type: "FRAME" }, componentPropertyDefinitions: {} });
  const all = [button, variant, avatar, hidden];
  return {
    root: { name: "Design System", children: [
      { findAllWithCriteria: ({ types }) => all.slice(0, 2).filter((n) => types.includes(n.type)) },
      { findAllWithCriteria: ({ types }) => all.slice(2).filter((n) => types.includes(n.type)) },
    ] },
    currentPage: null,
    setCurrentPageAsync: async () => {},
    variables: {
      getLocalVariableCollectionsAsync: async () => [
        { id: "C1", name: "Color", modes: [{ name: "Light" }, { name: "Dark" }] },
        { id: "C2", name: "Private", hiddenFromPublishing: true, modes: [] },
      ],
      getLocalVariablesAsync: async () => [
        ...Array.from({ length: vars }, (_, i) => ({ name: `bg/${String(i).padStart(4, "0")}`, key: `v${i}`.padEnd(40, "0"), variableCollectionId: "C1", resolvedType: "COLOR" })),
        { name: "secret", key: "vx", variableCollectionId: "C2", resolvedType: "FLOAT" },
      ],
    },
    getLocalTextStylesAsync: async () => [{ name: "Heading/H1", key: "s-h1" }],
    getLocalEffectStylesAsync: async () => [{ name: "Shadow/sm", key: "s-sh" }],
    getLocalPaintStylesAsync: async () => [],
  };
}
const runScript = (figma, code) => new (Object.getPrototypeOf(async function () {}).constructor)("figma", code)(figma);

/** A fake query() that behaves like the model: one mis-copied attempt, then the exact calls. */
function fakeModel(figma, { calls = { n: 0 } } = {}) {
  return ({ prompt, options }) => {
    calls.n += 1;
    const hook = options.hooks.PreToolUse[0].hooks[0];
    let code = prompt.split("<<<SCRIPT\n")[1].split("\nSCRIPT>>>")[0];
    return (async function* () {
      const bad = await hook({ tool_name: "mcp__figma__use_figma", tool_input: { fileKey: "LIB", code: code.replace("hidden", "hiddn") } });
      yield { type: "user", message: { content: [{ type: "tool_result", is_error: bad.hookSpecificOutput.permissionDecision !== "allow", content: "denied" }] } };
      for (;;) {
        const out = await hook({ tool_name: "mcp__figma__use_figma", tool_input: { fileKey: "LIB", code } });
        assert.equal(out.hookSpecificOutput.permissionDecision, "allow");
        const r = await runScript(figma, code);
        yield { type: "user", message: { content: [{ type: "tool_result", content: [{ type: "text", text: JSON.stringify(r) }] }] } };
        if (r.next === null) return;
        code = code.replace(/const OFFSET = \d+;/, `const OFFSET = ${r.next};`);
      }
    })();
  };
}

test("script: comments stripped, OFFSET is the only part a call may change", () => {
  const s = buildCheatsheetScript(0);
  assert.doesNotMatch(s, /^\s*\/\//m);
  assert.equal(isCheatsheetCall(buildCheatsheetScript(42).replace(/\n/g, "\n  "), 42), true);
  assert.equal(isCheatsheetCall(buildCheatsheetScript(42), 0), false, "the wrong page");
  assert.equal(isCheatsheetCall(s.replace("setCurrentPageAsync(p)", "closePlugin()"), 0), false);
});

test("fetchRows: pages through the library under use_figma's 20 KB limit, only with the exact script", async () => {
  const { rows, file } = await fetchRows({ account: "default", cwd: "/", fileKey: "LIB", queryImpl: fakeModel(fakeLibrary({ vars: 400 })) });
  assert.equal(file, "Design System");
  assert.equal(rows.filter((r) => r[0] === "var").length, 400, "every variable, across pages; hidden collections left out");
  assert.deepEqual(rows.filter((r) => r[0] === "set" || r[0] === "comp"), [
    ["set", "Button", "set-button", "Size=sm|md, text:Label#1:0, bool:Icon#2:0"],
    ["comp", "Avatar", "c-avatar", "swap:Glyph#3:0"],
  ]);
});

test("markdown: component keys with property names, variables by collection, styles", async () => {
  const r = await runScript(fakeLibrary(), buildCheatsheetScript(0));
  const md = cheatsheetMarkdown({ label: "Acme", fileKey: "LIB", file: r.file, rows: r.rows, builtAt: new Date("2026-10-17") });
  assert.match(md, /^# DS cheat sheet — Acme/);
  assert.match(md, /1 component sets, 1 components, 3 variables, 2 styles/);
  assert.match(md, /- \*\*Button\*\* `set-button` — Size=sm\|md · text:Label#1:0 · bool:Icon#2:0/);
  assert.match(md, /### Color — modes Light, Dark\n- `bg\/0000` `v0+` color/);
  assert.match(md, /## Text styles \(1\)\n- `Heading\/H1` `s-h1`/);
  assert.doesNotMatch(md, /Color styles/);
});

test("ensureCheatsheet: built once per library, reused while fresh, rebuilt weekly or on --refresh", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agentos-ds-"));
  const profile = { figma: { library_file: "LIB", library: { label: "Lib" } } };
  const calls = { n: 0 };
  const queryImpl = fakeModel(fakeLibrary(), { calls });
  const args = { root, profile, account: "default", cwd: "/", queryImpl };

  const [a, b] = await Promise.all([ensureCheatsheet(args), ensureCheatsheet(args)]);
  assert.equal(a, cheatsheetPath(root, "LIB"));
  assert.equal(b, a);
  assert.equal(calls.n, 1, "two dispatches at once share one build");
  assert.match(readFileSync(a, "utf8"), /`set-button`/);

  await ensureCheatsheet(args);
  assert.equal(calls.n, 1, "fresh: no Figma call");
  await ensureCheatsheet({ ...args, refresh: true });
  assert.equal(calls.n, 2);
  const old = (Date.now() - 8 * 24 * 3600 * 1000) / 1000;
  utimesSync(a, old, old);
  await ensureCheatsheet(args);
  assert.equal(calls.n, 3, "a week old: rebuilt");

  const failing = () => { throw new Error("no access to the library file"); };
  utimesSync(a, old, old);
  assert.equal(await ensureCheatsheet({ ...args, queryImpl: failing }), a, "a failed rebuild keeps the older copy");
  await assert.rejects(ensureCheatsheet({ ...args, root: mkdtempSync(path.join(os.tmpdir(), "agentos-ds-")), queryImpl: failing }), /no access/);
  assert.equal(await ensureCheatsheet({ ...args, profile: { figma: { library_file: "TODO" } } }), null);
  assert.equal(existsSync(`${a}.tmp`), false);
});

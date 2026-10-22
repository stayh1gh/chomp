import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLintScript, parseFigmaUrl, figmaPageUrl, sameScript, lintMarkdown, runLint, primaryViewport, lintViewports } from "./lint.mjs";

test("script: comments stripped, page id and names injected, bad ids refused", () => {
  const s = buildLintScript("12:34", ["Button", "Card"], [{ w: 390, h: 844 }], [], ["Final"]);
  assert.match(s, /const VIEWPORTS = \[\{"w":390,"h":844,"primary":false,"required":true\}\]/);
  assert.match(s, /const FULL_PAGE_GROUPS = \["Final"\]/);
  assert.match(s, /const PAGE_ID = "12:34"/);
  assert.match(s, /\["Button","Card"\]/);
  assert.doesNotMatch(s, /^\s*\/\//m);
  assert.throws(() => buildLintScript('1:2"; figma.root.remove(); "', []));
  assert.equal(sameScript(s.replace(/\n/g, "\n  "), s), true);
  assert.equal(sameScript(s.replace("12:34", "12:35"), s), false);
});

test("figma urls", () => {
  assert.deepEqual(parseFigmaUrl("https://www.figma.com/design/ABC123/Name?node-id=1637-12465&t=x"), { fileKey: "ABC123", nodeId: "1637:12465" });
  assert.deepEqual(parseFigmaUrl("https://www.figma.com/design/ABC123/?node-id=4-2"), { fileKey: "ABC123", nodeId: "4:2" });
  assert.deepEqual(parseFigmaUrl("https://www.figma.com/design/ABC123/Name"), { fileKey: "ABC123", nodeId: null });
  assert.equal(parseFigmaUrl("https://example.com"), null);
  assert.equal(figmaPageUrl("ABC", "4:2"), "https://www.figma.com/design/ABC/?node-id=4-2");
});

test("report markdown", () => {
  const md = lintMarkdown({ page: "P", errorCount: 1, warningCount: 0, counts: { libraryInstances: 3, localInstances: 0, texts: 2 }, placeholders: ["DatePicker"],
    errors: [{ rule: "raw-fill", name: "Card | x", detail: "raw", id: "1:2" }], warnings: [] }, "https://f");
  assert.match(md, /❌ 1 error\./);
  assert.match(md, /Missing from the Design System:\*\* DatePicker/);
  assert.match(md, /\| raw-fill \| Card \/ x \| raw \| `1:2` \|/);
});

test("runLint: a mis-copied script is denied, the exact one runs, its JSON comes back", async () => {
  const fake = ({ prompt, options }) => {
    const code = prompt.split("<<<SCRIPT\n")[1].split("\nSCRIPT>>>")[0];
    const hook = options.hooks.PreToolUse[0].hooks[0];
    return (async function* () {
      for (const attempt of [code.replace("errors", "errs"), code]) {
        const out = await hook({ tool_name: "mcp__figma__use_figma", tool_input: { fileKey: "WORK", code: attempt } });
        const allowed = out.hookSpecificOutput.permissionDecision === "allow";
        yield { type: "user", message: { content: [{ type: "tool_result", is_error: !allowed, content: [{ type: "text", text: allowed ? '{"ok":true,"errorCount":0}' : "denied" }] }] } };
      }
    })();
  };
  const r = await runLint({ account: "default", cwd: "/", fileKey: "WORK", pageId: "1:2", dsNames: [], queryImpl: fake });
  assert.deepEqual(r, { ok: true, errorCount: 0 });

  const neverExact = ({ options }) => (async function* () {
    await options.hooks.PreToolUse[0].hooks[0]({ tool_name: "mcp__figma__use_figma", tool_input: { fileKey: "WORK", code: "return 1" } });
  })();
  await assert.rejects(runLint({ account: "default", cwd: "/", fileKey: "WORK", pageId: "1:2", dsNames: [], queryImpl: neverExact }), /copied with changes/);
});

// A tiny stand-in for the Figma Plugin API: enough of it to run ds-lint.js for real.
function fakePage(build) {
  const byId = new Map();
  const mk = (type, props, children = []) => {
    const n = { type, visible: true, x: 0, y: 0, width: 100, height: 100, fills: [], strokes: [], effects: [], ...props, children };
    if (type === "FRAME" && !("layoutMode" in n)) n.layoutMode = "NONE";
    for (const c of children) c.parent = n;
    n.findAll = (f) => { const out = []; const walk = (x) => { for (const c of x.children ?? []) { if (f(c)) out.push(c); walk(c); } }; walk(n); return out; };
    byId.set(n.id, n);
    return n;
  };
  const page = mk("PAGE", { id: "1:1", name: "Chomp · Homepage and Onboarding" }, build(mk));
  page.findAllWithCriteria = ({ types }) => page.findAll((n) => types.includes(n.type));
  return { mixed: Symbol("mixed"), getNodeByIdAsync: async (id) => byId.get(id) ?? null, setCurrentPageAsync: async () => {} };
}
const runScript = (figma, code) => new (Object.getPrototypeOf(async function () {}).constructor)("figma", code)(figma);
const bound = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, boundVariables: { color: { id: "V:1" } } }];
const raw = [{ type: "SOLID", color: { r: 0.9, g: 0.2, b: 0.2 } }];

// Side navigation's page: its clean Direction section next to Bruno's own loose Homepage
// frame (raw colors, unstyled text) and an older task's section with errors of its own.
const sideNavPage = () => fakePage((mk) => [
  mk("SECTION", { id: "2:1", name: "Direction A — For you today", width: 1920, height: 1200 }, [
    mk("FRAME", { id: "2:2", name: "Homepage (1280)", width: 1280, height: 900, fills: raw }),
  ]),
  mk("FRAME", { id: "3:1", name: "A1 · Talent Home — new account (1280)", width: 1280, height: 900, fills: raw }, [
    mk("TEXT", { id: "3:2", name: "Welcome", characters: "Welcome back, Adam", textStyleId: "", fills: raw }),
  ]),
  mk("SECTION", { id: "4:1", name: "Direction · Side nav A — Toggle on the edge", y: 2000, width: 1600, height: 1200 }, [
    mk("FRAME", { id: "4:2", name: "Side nav (1280)", x: 40, y: 80, width: 1280, height: 900, fills: bound }, [
      mk("TEXT", { id: "4:3", name: "Label", characters: "Home", textStyleId: "S:1", fills: bound }),
    ]),
  ]),
]);

test("ds-lint: only the designer's figma_nodes are judged — Bruno's loose frames and older sections aren't", async () => {
  const viewports = [{ w: 1280, h: 800 }];
  const scoped = await runScript(sideNavPage(), buildLintScript("1:1", [], viewports, ["4:1"]));
  assert.equal(scoped.errorCount, 0, JSON.stringify(scoped.errors));
  assert.deepEqual(scoped.scope, ["Direction · Side nav A — Toggle on the edge"]);
  assert.deepEqual(scoped.notFound, []);

  const whole = await runScript(sideNavPage(), buildLintScript("1:1", [], viewports));
  assert.deepEqual(whole.errors.map((e) => e.id).sort(), ["2:2", "3:1", "3:2", "3:2"]);
  assert.equal(whole.scope, null);

  const missing = await runScript(sideNavPage(), buildLintScript("1:1", [], viewports, ["4:1", "9:9", "4:2"]));
  assert.deepEqual(missing.notFound, ["9:9"]);
  assert.deepEqual(missing.scope, ["Direction · Side nav A — Toggle on the edge"]); // 4:2 sits inside 4:1: linted once
  assert.throws(() => buildLintScript("1:1", [], [], ["4:1); figma.root.remove(); ("]), /bad Figma node id/);
});

test("viewports: the flagged one is primary (else the only, else the widest); Ideation requires only it", () => {
  const vps = [{ w: 390, h: 844 }, { w: 1280, h: 900, primary: true }];
  assert.equal(primaryViewport(vps).w, 1280);
  assert.equal(primaryViewport([{ w: 390, h: 844 }, { w: 1440, h: 900 }]).w, 1440);
  assert.equal(primaryViewport([]), null);
  assert.deepEqual(lintViewports(vps, "primary"), [{ w: 390, h: 844, primary: false, required: false }, { w: 1280, h: 900, primary: true, required: true }]);
  assert.deepEqual(lintViewports(vps, "all").map((v) => v.required), [true, true]);
  assert.deepEqual(lintViewports(vps).map((v) => v.required), [true, true], "a column that doesn't say gets every viewport");
});

// A desk-first profile: 1280 is primary, 390 lives in its own "— 390" sections.
const VPS = [{ w: 390, h: 844 }, { w: 1280, h: 900, primary: true }];
const screen = (mk, id, w, h, props = {}) => mk("FRAME", { id, name: `Screen (${w})`, x: 40, y: 80, width: w, height: h, fills: bound, ...props });
const splitPage = ({ phoneFlows = true, finalPhone = true, mixed = false } = {}) => fakePage((mk) => [
  mk("SECTION", { id: "10:1", name: "References", width: 3000, height: 1200 }, [screen(mk, "10:2", 390, 844)]),
  mk("SECTION", { id: "11:1", name: "Direction A — Calm", width: 1400, height: 1100 }, [screen(mk, "11:2", 1280, 900)]),
  mk("SECTION", { id: "12:1", name: "Final", width: 1400, height: 1100 }, [screen(mk, "12:2", 1280, 900)]),
  ...(finalPhone ? [mk("SECTION", { id: "13:1", name: "Final — 390", width: 600, height: 1100 }, [screen(mk, "13:2", 390, 844)])] : []),
  mk("SECTION", { id: "14:1", name: "Flows & states", width: 3000, height: 1100 }, [
    mk("FRAME", { id: "14:2", name: "Upload flow", x: 40, y: 80, width: 2700, height: 900, layoutMode: "HORIZONTAL" }, [
      screen(mk, "14:3", 1280, 900),
      ...(mixed ? [screen(mk, "14:4", 390, 844)] : []),
    ]),
  ]),
  mk("SECTION", { id: "15:1", name: "Flows & states — 390", width: 1000, height: 1100 }, phoneFlows ? [screen(mk, "15:2", 390, 844)] : []),
]);
const missingPages = (r) => r.errors.filter((e) => e.rule === "missing-full-page").map((e) => `${e.id} ${e.detail.split(" — design")[0].split(" — add")[0]}`);

test("ds-lint: Ideation needs a Direction's full page at the primary viewport only", async () => {
  const ideation = await runScript(splitPage(), buildLintScript("1:1", [], lintViewports(VPS, "primary"), ["10:1", "11:1"]));
  assert.equal(ideation.errorCount, 0, JSON.stringify(ideation.errors));
  assert.deepEqual(ideation.warnings, [], "phone-sized reference images aren't screens in the wrong section");

  const every = await runScript(splitPage(), buildLintScript("1:1", [], lintViewports(VPS, "all"), ["11:1"]));
  assert.deepEqual(missingPages(every), ['11:1 no full-page 390×844 screen in "Direction A — Calm — 390"']);
});

test("ds-lint: Refinement reads each viewport group across its split sections, and requires Final and Flows & states", async () => {
  const nodes = ["13:1", "14:1", "15:1"];
  const ok = await runScript(splitPage(), buildLintScript("1:1", [], lintViewports(VPS, "all"), nodes, ["Final", "Flows & states"]));
  assert.equal(ok.errorCount, 0, JSON.stringify(ok.errors));

  const noPhoneFlows = await runScript(splitPage({ phoneFlows: false }), buildLintScript("1:1", [], lintViewports(VPS, "all"), nodes, ["Final", "Flows & states"]));
  assert.deepEqual(missingPages(noPhoneFlows), ['15:1 no full-page 390×844 screen in "Flows & states — 390"']);

  const noFinalPhone = await runScript(splitPage({ finalPhone: false }), buildLintScript("1:1", [], lintViewports(VPS, "all"), ["14:1", "15:1"], ["Final", "Flows & states"]));
  assert.deepEqual(missingPages(noFinalPhone), ['12:1 no full-page 390×844 screen in "Final — 390"'], "required even when the designer didn't list it");

  const notRequired = await runScript(splitPage({ finalPhone: false }), buildLintScript("1:1", [], lintViewports(VPS, "all"), ["14:1", "15:1"]));
  assert.equal(notRequired.errorCount, 0, "without full_pages, only the groups listed are checked");

  const noFlows = await runScript(fakePage((mk) => [mk("SECTION", { id: "12:1", name: "Final", width: 1400, height: 1100 }, [screen(mk, "12:2", 1280, 900)])]),
    buildLintScript("1:1", [], lintViewports(VPS, "primary"), ["12:1"], ["Flows & states"]));
  assert.deepEqual(missingPages(noFlows), ['1:1 no "Flows & states" section']);
});

test("ds-lint: a phone screen in the desktop section is flagged", async () => {
  const r = await runScript(splitPage({ mixed: true }), buildLintScript("1:1", [], lintViewports(VPS, "all"), ["13:1", "14:1", "15:1"], ["Final", "Flows & states"]));
  assert.equal(r.errorCount, 0);
  assert.deepEqual(r.warnings.map((w) => [w.rule, w.id, w.detail]), [["mixed-viewports", "14:4", '390-wide screen in "Flows & states" — move it to "Flows & states — 390"']]);
});

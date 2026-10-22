// Chomp DS cheat sheet — read-only. Runs inside Figma via use_figma on the Design System
// LIBRARY file (harness/figma/cheatsheet.mjs; the runner checks the call is this exact
// script, the OFFSET number aside). Lists what a designer imports by key: component sets
// and components with their property names, variables by collection, and text, effect and
// color styles. Never mutates anything.
//
// Returns { ok, file, total, next, rows } where rows are compact arrays:
//   ["set" | "comp", name, key, props]  props: "Size=sm|md|lg" for variants, "text:Label#1:0",
//                                       "bool:Icon#2:0", "swap:Glyph#3:0" for the rest
//   ["coll", name, modes]               a variable collection ("Light|Dark")
//   ["var", collection, name, key, type]
//   ["text" | "effect" | "paint", name, key]
// use_figma rejects return values over 20 KB, so one call returns the rows from OFFSET up to
// about BUDGET characters; `next` is where the following call starts (null when done).

const OFFSET = 0;
const BUDGET = 15000;

// use_figma has no loadAllPagesAsync: visit each page to load it, then come back.
const startPage = figma.currentPage;
const found = { COMPONENT_SET: [], COMPONENT: [] };
for (const p of figma.root.children) {
  await figma.setCurrentPageAsync(p);
  for (const n of p.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] })) found[n.type].push(n);
}
await figma.setCurrentPageAsync(startPage);
const hidden = (name) => /^[._]/.test(name.trim());
const byName = (a, b) => a[1].localeCompare(b[1]);

function props(node) {
  let defs = {};
  try { defs = node.componentPropertyDefinitions ?? {}; } catch (e) { return ""; }
  const short = { TEXT: "text", BOOLEAN: "bool", INSTANCE_SWAP: "swap" };
  return Object.entries(defs)
    .map(([k, d]) => (d.type === "VARIANT" ? `${k}=${(d.variantOptions ?? []).join("|")}` : `${short[d.type] ?? d.type.toLowerCase()}:${k}`))
    .join(", ");
}

const sets = found.COMPONENT_SET
  .filter((s) => !hidden(s.name))
  .map((s) => ["set", s.name, s.key, props(s)])
  .sort(byName);
const comps = found.COMPONENT
  .filter((c) => c.parent?.type !== "COMPONENT_SET" && !hidden(c.name))
  .map((c) => ["comp", c.name, c.key, props(c)])
  .sort(byName);

const collections = (await figma.variables.getLocalVariableCollectionsAsync()).filter((c) => !c.hiddenFromPublishing);
const collName = new Map(collections.map((c) => [c.id, c.name]));
const vars = (await figma.variables.getLocalVariablesAsync())
  .filter((v) => !v.hiddenFromPublishing && collName.has(v.variableCollectionId))
  .map((v) => ["var", collName.get(v.variableCollectionId), v.name, v.key, v.resolvedType.toLowerCase()])
  .sort((a, b) => a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
const colls = collections.map((c) => ["coll", c.name, c.modes.map((m) => m.name).join("|")]).sort(byName);

const styles = async (kind, get) => (await get()).filter((s) => !hidden(s.name)).map((s) => [kind, s.name, s.key]).sort(byName);
const rows = [
  ...sets,
  ...comps,
  ...colls,
  ...vars,
  ...(await styles("text", () => figma.getLocalTextStylesAsync())),
  ...(await styles("effect", () => figma.getLocalEffectStylesAsync())),
  ...(await styles("paint", () => figma.getLocalPaintStylesAsync())),
];

const out = [];
let size = 0;
let i = OFFSET;
for (; i < rows.length; i++) {
  const n = JSON.stringify(rows[i]).length + 1;
  if (out.length && size + n > BUDGET) break;
  out.push(rows[i]);
  size += n;
}

return { ok: true, file: figma.root.name, total: rows.length, next: i < rows.length ? i : null, rows: out };

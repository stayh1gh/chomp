// Chomp DS lint — read-only. Runs inside Figma via use_figma (Plugin API, top-level
// await/return). harness/figma/lint.mjs fills in __PAGE_ID__, __NODE_IDS__, __DS_NAMES__,
// __VIEWPORTS__ and __FULL_PAGE_GROUPS__, and the runner checks the call is this exact
// script. Never mutates anything.
//
// Scope: only the subtrees of NODE_IDS — the sections/frames the designer says it made
// (turn result figma_nodes). Everything else on the page (the owner's own loose frames,
// another task's sections) is never judged. Empty NODE_IDS lints the whole page.
//
// Errors (must be zero before a design leaves its column):
//   non-library-instance  instance of a component that isn't from a library and isn't a
//                         local composite defined on this page
//   detached-lookalike    a frame/group named like a Design System component
//   raw-fill / raw-stroke solid or gradient paint not bound to a variable or style
//   text-no-style         text without a text style
//   raw-spacing           auto-layout gap/padding not bound to a variable
//   raw-radius            corner radius not bound to a variable
//   raw-effect            shadow/blur not from an effect style
//   outside-section       a section's child extends past the section (section children
//                         use section-relative coordinates)
//   missing-full-page     a section group ("Direction …", "Final", "Flows & states") has no
//                         full-page frame at one of the viewports this column requires
//                         (full page = that width, at least that height)
// Warnings: no-auto-layout, contrast (WCAG AA), touch-target (< 44px on mobile frames),
// mixed-viewports (a screen sits in another viewport's section).
//
// Viewport groups: each non-primary viewport has its own sections next to the primary
// one's, named "<section> — <width>" ("Final", "Final — 390"). A group's frames count
// together, read across the whole page, so the phone screens in "Flows & states — 390"
// cover 390 for "Flows & states". Checked: every group the designer's sections belong to,
// plus FULL_PAGE_GROUPS (the column's required ones, e.g. Refinement's Final and Flows &
// states), at each VIEWPORTS entry with `required` (Ideation: the primary only).
// Subtrees named "⚠ Missing: …" are placeholders for components the DS lacks: skipped,
// and listed so the gap is visible.

const PAGE_ID = "__PAGE_ID__";
const NODE_IDS = __NODE_IDS__;
const DS_NAMES = new Set(__DS_NAMES__.map((n) => n.toLowerCase()));
const VIEWPORTS = __VIEWPORTS__; // [{ w, h, primary, required }]
const FULL_PAGE_GROUPS = __FULL_PAGE_GROUPS__;
const MAX_ITEMS = 40; // use_figma rejects return values over 20 KB
const MAX_NODES = 20000;

const page = await figma.getNodeByIdAsync(PAGE_ID);
if (!page || page.type !== "PAGE") return { ok: false, error: `No page with id ${PAGE_ID}` };
await figma.setCurrentPageAsync(page);

const onPage = (n) => { for (let p = n?.parent; p; p = p.parent) if (p.id === page.id) return true; return false; };
const notFound = [];
let roots = page.children;
if (NODE_IDS.length) {
  roots = [];
  for (const id of NODE_IDS) {
    const n = await figma.getNodeByIdAsync(id);
    if (n && onPage(n)) roots.push(n);
    else notFound.push(id);
  }
  const ids = new Set(roots.map((n) => n.id));
  const nested = (n) => { for (let p = n.parent; p && p.type !== "PAGE"; p = p.parent) if (ids.has(p.id)) return true; return false; };
  roots = roots.filter((n, i) => !nested(n) && roots.findIndex((m) => m.id === n.id) === i);
}

const errors = [];
const warnings = [];
const placeholders = [];
const counts = { nodes: 0, instances: 0, libraryInstances: 0, localInstances: 0, texts: 0 };
const localComponentIds = new Set(page.findAllWithCriteria({ types: ["COMPONENT"] }).map((c) => c.id));
const add = (list, rule, node, detail) => list.push({ rule, id: node.id, name: node.name.slice(0, 60), detail: detail.slice(0, 120) });

const visiblePaints = (paints) => (Array.isArray(paints) ? paints.filter((p) => p.visible !== false && (p.opacity ?? 1) > 0) : []);
const styleId = (node, prop) => (prop in node && typeof node[prop] === "string" ? node[prop] : "");

function checkPaints(node, prop, styleProp, rule) {
  if (!(prop in node) || node[prop] === figma.mixed) return;
  if (styleId(node, styleProp)) return;
  for (const p of visiblePaints(node[prop])) {
    if (p.type === "SOLID" && !p.boundVariables?.color) return add(errors, rule, node, `${prop} uses a raw color — bind it to a Design System color variable or style`);
    if (p.type.startsWith("GRADIENT")) return add(errors, rule, node, `${prop} uses a raw gradient — use a Design System style`);
  }
}

function luminance({ r, g, b }) {
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function solidColor(node) {
  if (!("fills" in node) || node.fills === figma.mixed) return null;
  const p = visiblePaints(node.fills).find((x) => x.type === "SOLID" && (x.opacity ?? 1) > 0.95);
  return p ? p.color : null;
}
function backgroundOf(node) {
  for (let n = node.parent; n && n.type !== "PAGE"; n = n.parent) {
    const c = solidColor(n);
    if (c) return c;
  }
  return null;
}
function mobileFrame(node) {
  let top = node;
  while (top.parent && top.parent.type !== "PAGE" && top.parent.type !== "SECTION") top = top.parent;
  return "width" in top && top.width <= 500;
}

async function visit(node) {
  if (counts.nodes++ > MAX_NODES) return;
  if (node.visible === false) return;
  if (node.parent?.type === "SECTION" && "width" in node) {
    const s = node.parent;
    if (node.x < 0 || node.y < 0 || node.x + node.width > s.width + 1 || node.y + node.height > s.height + 1) {
      add(errors, "outside-section", node, `sits outside "${s.name}" (at ${Math.round(node.x)},${Math.round(node.y)} in a ${Math.round(s.width)}×${Math.round(s.height)} section) — coordinates are relative to the section; move it in or grow the section`);
    }
  } else if (node.parent?.type === "PAGE" && node.type !== "SECTION") {
    add(warnings, "not-in-section", node, "top-level layer outside the page's sections");
  }
  if (/^⚠|^missing:/i.test(node.name)) {
    placeholders.push(node.name.replace(/^⚠\s*(missing:\s*)?/i, ""));
    return;
  }

  if (node.type === "INSTANCE") {
    counts.instances++;
    const main = await node.getMainComponentAsync();
    if (!main) add(errors, "non-library-instance", node, "instance has no main component (deleted or unavailable)");
    else if (main.remote) counts.libraryInstances++;
    else if (localComponentIds.has(main.id)) counts.localInstances++;
    else add(errors, "non-library-instance", node, `instance of local component "${main.name}" — use the Design System library's component`);
    const label = `${node.name} ${main?.parent?.type === "COMPONENT_SET" ? main.parent.name : main?.name ?? ""}`;
    if (/button|checkbox|radio|switch|toggle|tab|chip|link/i.test(label) && (node.width < 44 || node.height < 44) && mobileFrame(node)) {
      add(warnings, "touch-target", node, `${Math.round(node.width)}×${Math.round(node.height)} — under 44×44 on a mobile frame`);
    }
    return; // an instance's insides belong to the library
  }

  if ((node.type === "FRAME" || node.type === "GROUP") && DS_NAMES.has(node.name.toLowerCase())) {
    add(errors, "detached-lookalike", node, `"${node.name}" is a Design System component name but this is a ${node.type.toLowerCase()} — place the library instance instead`);
  }

  if (node.type !== "SECTION") {
    checkPaints(node, "fills", "fillStyleId", "raw-fill");
    checkPaints(node, "strokes", "strokeStyleId", "raw-stroke");
    if ("effects" in node && Array.isArray(node.effects) && node.effects.some((e) => e.visible !== false) && !styleId(node, "effectStyleId")) {
      add(errors, "raw-effect", node, "effect not from a Design System effect style");
    }
    if ("cornerRadius" in node) {
      const corners = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"];
      const unbound = corners.filter((c) => (node[c] ?? 0) > 0 && !node.boundVariables?.[c]);
      if (unbound.length) add(errors, "raw-radius", node, `corner radius ${node.cornerRadius === figma.mixed ? "(mixed)" : node.cornerRadius} not bound to a Radius variable`);
    }
  }

  if (node.type === "TEXT") {
    counts.texts++;
    const ids = node.textStyleId === figma.mixed ? node.getStyledTextSegments(["textStyleId"]).map((s) => s.textStyleId) : [node.textStyleId];
    if (ids.some((id) => !id)) add(errors, "text-no-style", node, `"${node.characters.slice(0, 40)}" has no Design System text style`);
    const fg = solidColor(node);
    const bg = backgroundOf(node);
    if (fg && bg) {
      const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      const ratio = (l1 + 0.05) / (l2 + 0.05);
      const size = typeof node.fontSize === "number" ? node.fontSize : 14;
      const weight = typeof node.fontWeight === "number" ? node.fontWeight : 400;
      const min = size >= 18 || (size >= 14 && weight >= 700) ? 3 : 4.5;
      if (ratio < min) add(warnings, "contrast", node, `contrast ${ratio.toFixed(2)}:1, needs ${min}:1`);
    }
  }

  if ((node.type === "FRAME" || node.type === "COMPONENT") && "layoutMode" in node) {
    if (node.layoutMode !== "NONE") {
      const props = ["itemSpacing", "counterAxisSpacing", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom"];
      const unbound = props.filter((p) => typeof node[p] === "number" && node[p] > 0 && !node.boundVariables?.[p]);
      if (unbound.length) add(errors, "raw-spacing", node, `${unbound.join(", ")} not bound to Spacing variables`);
    } else if (node.children.length > 1 && node.parent.type !== "PAGE" && node.parent.type !== "SECTION") {
      add(warnings, "no-auto-layout", node, "children positioned by hand — use auto-layout");
    }
  }

  if ("children" in node) for (const child of node.children) await visit(child);
}

for (const root of roots) await visit(root);

const groupOf = (name) => {
  const m = name.trim().match(/^(.*?)\s+[—–-]\s+(\d{3,4})$/);
  return m ? { base: m[1].trim(), w: Number(m[2]) } : { base: name.trim(), w: null };
};
const FULL_PAGE = /^(direction\b|final$|flows & states$)/i;
const sections = page.children.filter((n) => n.type === "SECTION");
const groups = new Map(); // lower-cased base name → its sections
for (const s of sections) {
  const key = groupOf(s.name).base.toLowerCase();
  groups.set(key, [...(groups.get(key) ?? []), s]);
}
const screensIn = (s) => s.findAll((n) => n.type === "FRAME" && n.visible !== false && !(n.parent && n.parent.type === "INSTANCE"));
const checked = new Map(); // key → display name
for (const r of roots) if (r.type === "SECTION" && FULL_PAGE.test(groupOf(r.name).base)) checked.set(groupOf(r.name).base.toLowerCase(), groupOf(r.name).base);
for (const g of FULL_PAGE_GROUPS) checked.set(g.toLowerCase(), g);
for (const [key, base] of checked) {
  const members = groups.get(key) ?? [];
  if (!members.length) {
    add(errors, "missing-full-page", page, `no "${base}" section — add it with a full page at ${VIEWPORTS.filter((v) => v.required).map((v) => v.w).join(" and ")}`);
    continue;
  }
  const frames = members.flatMap(screensIn);
  for (const v of VIEWPORTS.filter((x) => x.required)) {
    if (frames.some((f) => Math.abs(f.width - v.w) <= 1 && f.height >= v.h - 1)) continue;
    const where = v.primary ? `"${base}"` : `"${base} — ${v.w}"`;
    const home = members.find((s) => groupOf(s.name).w === (v.primary ? null : v.w)) ?? members[0];
    add(errors, "missing-full-page", home, `no full-page ${v.w}×${v.h} screen in ${where} — design the whole page (app chrome included) at that viewport, in that section`);
  }
}

// Tidiness: a screen belongs in its own viewport's section, never mixed into another's.
if (VIEWPORTS.length > 1) {
  const rootIds = new Set(roots.map((n) => n.id));
  for (const s of sections.filter((x) => rootIds.has(x.id) && FULL_PAGE.test(groupOf(x.name).base))) {
    const own = groupOf(s.name).w;
    // Nested sections (one per flow or state row) count as part of their parent.
    const kids = (n) => n.children.flatMap((c) => (c.type === "SECTION" ? kids(c) : [c]));
    const tops = kids(s).flatMap((c) => (c.type === "FRAME" && c.layoutMode && c.layoutMode !== "NONE" && !VIEWPORTS.some((v) => Math.abs(c.width - v.w) <= 1) ? c.children : [c]));
    for (const f of tops) {
      if (f.type !== "FRAME") continue;
      const v = VIEWPORTS.find((x) => Math.abs(f.width - x.w) <= 1 && f.height >= x.h - 1);
      if (!v) continue;
      const fits = v.primary ? own === null : own === v.w;
      if (!fits) add(warnings, "mixed-viewports", f, `${v.w}-wide screen in "${s.name}" — move it to "${groupOf(s.name).base}${v.primary ? "" : ` — ${v.w}`}"`);
    }
  }
}

const byRule = {};
for (const e of [...errors, ...warnings]) byRule[e.rule] = (byRule[e.rule] ?? 0) + 1;

return {
  ok: true,
  byRule,
  page: page.name,
  scope: NODE_IDS.length ? roots.map((n) => n.name.slice(0, 60)) : null,
  notFound,
  counts,
  errorCount: errors.length,
  warningCount: warnings.length,
  errors: errors.slice(0, MAX_ITEMS),
  warnings: warnings.slice(0, MAX_ITEMS),
  placeholders: [...new Set(placeholders)],
  truncated: counts.nodes > MAX_NODES,
};

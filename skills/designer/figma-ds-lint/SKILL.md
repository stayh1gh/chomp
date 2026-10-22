---
name: figma-ds-lint
description: The Design System contract for every Figma layer Chomp creates, and how to fix what the runner's DS lint (harness/figma/ds-lint.js) sends back.
---

# figma-ds-lint

Created for Chomp (crivo: Create, 2026-10-13). {{owner}}'s rule: always our components and
styles. This makes that mechanical.

## The contract

Everything you put on the task page is one of the items below. "You" is the scope: the
runner lints only the nodes listed in your turn result's `figma_nodes` (the sections or
frames you created or changed). {{owner}}'s own frames and other tasks' sections on the same
page are never linted, and you leave them alone.

1. **An instance of a Design System library component.** Set its variant and component
   properties (`setProperties`) to get what you need. Never detach it.
2. **A local composite**, i.e. a local component defined on this page and built from
   library instances. It's for repeated pieces the library doesn't have as one component.
   Its own frames follow rule 3.
3. **A layout frame** (auto-layout) whose fills, strokes, gap, padding and radius are all
   bound to library variables (Color, Spacing, Radius) and whose effects use library
   effect styles.
4. **Text** with a library text style and a fill bound to a Color variable.
5. **A placeholder** for a component the library doesn't have: a frame named
   `⚠ Missing: <Component name>`, sized to the slot, plus a line in your notes document.
   The lint skips it and lists it.

Never draw a lookalike of a library component (a frame named "Button" is an error). Never
use hex colors, raw numbers for spacing/radius, or raw fonts.

## How it's checked

You don't run the lint. When you end a turn with `figma_nodes`, the runner runs
`harness/figma/ds-lint.js` on those nodes itself and sends back every error with its rule,
layer and node id; you fix them and end the turn again (two rounds, then the card blocks
for {{owner}}). Build to the contract as you go so that round trip comes back clean.

Full pages are checked per **viewport group**: a section plus its `<section> — <w>`
siblings ("Final", "Final — 390"), read together across the page. Ideation and Designing
need a full page at the primary viewport in each `Direction …` you list; Refinement needs
one at every viewport in the `Final` and `Flows & states` groups.

## Fixing each rule

| Rule | Fix |
|---|---|
| `non-library-instance` | Swap for the library component (`importComponentSetByKeyAsync(key)` → variant → `createInstance()`), or make it a local composite on this page. |
| `detached-lookalike` | Delete it and place the library instance. |
| `raw-fill` / `raw-stroke` | `figma.variables.setBoundVariableForPaint(paint, "color", colorVar)` and reassign the array; or apply a library color style. |
| `text-no-style` | `await figma.importStyleByKeyAsync(key)` then `text.textStyleId = style.id` (load the style's font first). |
| `raw-spacing` | `frame.setBoundVariable("itemSpacing" \| "paddingLeft" \| …, spacingVar)` for every nonzero value. |
| `raw-radius` | `setBoundVariable` on `topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius`. |
| `raw-effect` | Apply a library effect style: `node.effectStyleId = style.id`. |
| `missing-full-page` | The group needs a full-page screen at that viewport: that exact width, at least that height, with the app's chrome, in that viewport's section (the primary one in `<section>`, any other in `<section> — <w>`). "no … section" means the section itself is missing: add it. |
| `outside-section` | A section's children use coordinates **relative to the section**: set `x`/`y` from the section's top-left (e.g. 40, 80), never the page's. Then `section.resizeWithoutConstraints(w, h)` so everything fits with margin. |

Import variables with `figma.variables.importVariableByKeyAsync(key)` and styles with
`figma.importStyleByKeyAsync(key)`, using keys from the DS cheat sheet in your dispatch (or
`search_design_system`, entity `variable` / `style`, for anything it doesn't list). Warnings
(`contrast`, `touch-target`, `no-auto-layout`, `mixed-viewports`) don't block, but fix
them when the fix is a library choice (a different color variable, a bigger button size
variant) or a move (`mixed-viewports`: put the screen in its own viewport's section).

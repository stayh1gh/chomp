---
name: figma-states
description: Refinement — clean up the task page (drop unpicked directions, gather and prune local components), then take what {{owner}} put in Final to every viewport and surface, and design every flow and state it needs, cloned from their frames and changed only through library components and variables, plus a clickable prototype.
---

# figma-states

Adapted from Chomp's `flow-and-states` and `generate-prototype` (crivo: Adapt,
2026-10-13).

## 0. Start from Final

Read the task page's `Final` section (`get_metadata`, then one `get_screenshot`). {{owner}}'s
refined design lives there. It's the source of truth even where it differs from
`design.md`. Read the DS cheat sheet your dispatch names for every library key you need
(*figma-design-ui* step 1).

If `Final` is empty: one `Direction …` section clearly changed since Ideation? Ask anyway,
because guessing wrong wastes the whole column. End with `needs_input` and one question,
"Which direction should I take into flows and states?", with the direction names as
options. That's the only question this column may ask.

**Never change anything inside `Final` or the chosen direction.** That's {{owner}}'s work.
Clone frames from `Final` into `Final — <w>` and `Flows & states` and change the clones. The
only edits outside your sections are the cleanup below: moving local components out and
deleting the directions {{owner}} didn't pick.

**Page layout.** The page background is `{{figma_page_bg}}`, every section's fill `{{figma_section_fill}}` (a section
nested in another: white at 6% opacity). One row, left to right, tops aligned at `y = 0`,
200 apart:

`Notes` card · `References` · the directions · `Final` · `Flows & states` · `Final — <w>` ·
`Flows & states — <w>` · `Components`

with a `Final — <w>` and a `Flows & states — <w>` per viewport other than the primary one
(your dispatch's Viewports line). Add any section that's missing and fix an older page's
order and colors, moving whole sections only, never what's inside them. After deleting
directions or growing a section, move the ones to its right so the 200 gaps stay.

## 1. Clean up the page

Before building anything, in this order (move components before deleting sections, so
nothing in `Final` loses its main component):

1. **Gather the components.** Add a `Components` section at the right end of the row
   (reuse it if it exists). Move every local component
   and component set on the task page into it, wherever it sits now (Direction sections,
   `Final`, loose on the page): `appendChild` into the section, laid out in a row with a
   library-styled label above each. Moving a main component keeps its instances linked;
   never re-create, duplicate or detach one to move it.
2. **Delete the directions {{owner}} didn't pick.** The chosen direction is the one `Final`
   was built from: compare `Final`'s frames with each Direction's (names, structure, one
   screenshot each if that's not enough). Delete every other `Direction …` section
   whole. If `Final` mixes several directions, keep each one it took from. If you can't
   tell which one it came from, ask the question above instead of deleting.

Unused components are removed at the end (step 6), once the states are built.

## 2. Every viewport, every surface

Ideation drew only the plan's **(ideation)** surfaces (one screen, or a flow's main path) at
the primary viewport. Now take the picked direction
everywhere:

- **`Final — <w>`, per other viewport:** each screen in `Final` as a full page at that
  viewport, in the same order: the same content and direction, laid out the way the app
  does at that width (its chrome there, e.g. a phone top bar instead of a side rail),
  rebuilt from the same library components and variables rather than scaled down.
- **The plan's other surfaces** (its Surfaces that `Final` doesn't have): design each in
  the picked direction's language, as a full page at the primary viewport in
  `Flows & states` and at every other viewport in `Flows & states — <w>`. They're the
  first rows there, labelled `<Surface> — Default`.

When the profile has `app_reference`, capture the shipped screens at the other viewports
first (`--viewport <W>x<H>`), so their chrome matches the app.

## 3. Work out the states

From `spec.md` (Must-have states), `plan.md` (Flow) and the screens in `Final`, list:

- **Flows**: the main path, plus any alternative or recovery paths, each as ordered steps.
- **States per screen**: only what applies, but think through all of these: default,
  empty, loading, error (inline and full), validation, disabled, permission or locked,
  partial data, long content and overflow, success and confirmation, destructive confirm.

## 4. Build them in Flows & states

Every state is a full page, chrome included (the profile's `design_requirements` apply
here too), cloned from `Final` (or `Final — <w>`), at **every viewport**: the primary one
in `Flows & states`, each other one in its own `Flows & states — <w>`, with the same nested
sections in the same order so they line up. Never put a screen in another viewport's
section; the lint warns on it and requires a full page at each viewport in both groups.

Break each `Flows & states` section into nested SECTION nodes, stacked top to bottom, 80
from the parent's edges and 80 apart, with the parent resized to fit:

- One section per flow, named `Flow · <name>` (e.g. "Flow · Get started (main path)"):
  its steps left to right in one horizontal auto-layout row, one frame per step, in order.
- One section per screen for its states, named after what it shows (e.g. "Images fail to
  load", "Hero motion — start, middle, end, reduced motion"): one horizontal auto-layout
  row of frames.
- The section's name is its title: no separate title text inside it. Its content sits 80
  from its edges, and the section is resized to fit.
- Above every frame, a label using library text styles:
  `<Screen> — <State>` and on a second line `Trigger: <what causes it>`.
- Compose each state per *figma-taste* §5 (empty, loading, error, zero) and each other
  viewport per §6.
- Express each state by changing **library** pieces: instance variants and properties
  (`state=error`, `disabled`), swapping one library component for another, binding
  different Color variables. Never detach an instance to fake a state.
- A state that needs a component the library doesn't have gets a
  `⚠ Missing: <Name>` placeholder (see *figma-ds-lint*).

## 5. Prototype

Wire the main flow at each viewport so {{owner}} can click through it in presentation mode: on
each step, the triggering instance gets an `ON_CLICK` → `NAVIGATE` reaction to the next
step's frame (`setReactionsAsync`). Set each flow's first step as a flow starting point
named after the flow and viewport ("Upload — 390").

## 6. Check your work

- Remove unused components from `Components`: delete every local component, and every
  component set, with no instances left in the file (`getInstancesAsync()` returns none;
  for a set, none across all its variants). An instance inside another component that
  you're deleting doesn't count, so repeat until a pass deletes nothing. Keep the unused
  variants of a set that's still in use: they're its states.
- Take one `get_screenshot` per row and run *figma-taste* §8 on it. Fix clipping, overlap,
  leftover placeholder copy and wrong variants too.
- Don't run the DS lint yourself: the runner lints your `figma_nodes` when you end the turn,
  checks `Final` and `Flows & states` for a full page at every viewport, and sends back
  every error to fix (*figma-ds-lint*).

## 7. states.md

Write it to the task folder:

```markdown
# Flows and states — <task title>
Figma: <page URL>

Viewports: <primary> (primary), <w>…

## Flows
1. <Flow name>: step → step → step (prototype starts at <frame>, per viewport)

## States
| Screen | State | Trigger | What differs from default |
|---|---|---|---|

## Cleanup
Directions deleted, directions kept (and why), components removed as unused.

## Viewport differences
What changes at each other viewport beyond the width (chrome, stacking, hidden parts).

## Missing from the Design System
## Assumptions
```

End with `done`. In the summary, give the counts (flows, states, viewports), the
directions you deleted, and anything {{owner}} should check first. Set `links.figma` to the page
URL and `figma_nodes` to the ids of what you created or changed (every `Final — <w>`,
`Flows & states`, every `Flows & states — <w>`, any kit section) — never `Final` or the
Directions, which are {{owner}}'s.

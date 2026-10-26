---
name: figma-design-ui
description: Ideation — create the task's Figma page, put 10–14 references on it, and design 2–3 genuinely different directions, each as what the task asked for (one screen, or every step of a flow's main path) at the primary viewport, using only the Design System library.
---

# figma-design-ui

Adapted from Chomp's `generate-ideas`, `information-architecture`, `draft-surface`,
`figma-page-scaffold` and `constrain-to-library`, on top of Figma's own
`figma-generate-design` workflow (crivo: Adapt, 2026-10-13).

## 1. Read before drawing

- **The profile's `design_requirements`.** Mandatory; they override anything below.
- **The actual app.** When the profile has `app_reference`, capture the shipped screens
  closest to this task at the primary viewport (your dispatch's Viewports line) and look at
  them (Read the PNGs) before drawing anything:
  `node "$AGENTOS_ROOT/harness/qa/app-reference.mjs" --task "$AGENTOS_TASK" --name <slug> --path "<gallery path>" --viewport <W>x<H>`
  (It's the only command you can run; the first call may take a minute to start the app.)
  Also read the shell code it lists, so the chrome you draw matches how the app draws it at
  that width.
- **The latest layouts.** Open the profile's `figma.reference_pages` (`get_metadata`, then a
  `get_screenshot` of the newest full-page screens) and match their layout type: frame size,
  navigation, content column, spacing rhythm. Newest beats older or archived pages.

- `spec.md`, `plan.md` and `research.md` in the task folder. The plan's Surfaces, Flow and
  Design-system pieces are your brief. The research's "Start here" references are your
  starting points.
- The repo's `DESIGN.md` (design authority order and rules) and the screens closest to
  this task in code, so the directions extend the product instead of ignoring it.
- The Design System kit: **the DS cheat sheet** your dispatch names (one Read). It lists
  the library's component sets and components with their import keys and variant and
  property names, and its variables and text, effect and color styles by name with their
  keys. Import straight from it; don't rediscover the library. Only for a piece it doesn't
  list, or a key that fails to import, use `search_design_system` against
  `figma.library_file` (short queries, one intent each). With no cheat sheet in the
  dispatch, do that for every piece, and read each component's properties once (temporary
  instance → `componentProperties` → remove it) so text goes in through `setProperties`.

- **Decide each screen** per *figma-taste* §1 before drawing: its kind, data and jobs,
  one question, one finding and blocks (or, for a page, the argument and the idea).

## 2. The task page

If the dispatch names an existing Figma task page, reuse it. Otherwise create a page in
the work file named `Chomp · <task title>`, after the last page, with its background set
to `{{figma_page_bg}}` (`page.backgrounds`). Lay it out in one row, left to right, tops aligned at
`y = 0`, 200 apart, as top-level SECTION nodes (each screen goes *inside* its section: child
coordinates are section-relative, and the section grows to fit):

`Notes` card · `References` · `Direction A — <name>` · `Direction B — <name>` ·
(`Direction C — <name>`) · `Final` · `Flows & states` · `Final — <w>` ·
`Flows & states — <w>` · `Components`

Each viewport other than the primary one adds a `Final — <w>` and a `Flows & states — <w>`
section (`<w>` is its width), after the primary `Flows & states`. With 1280 primary and 390
phone viewports, that's `Final` · `Flows & states` · `Final — 390` · `Flows & states — 390`.
A profile with one viewport has no `— <w>` sections. `Components` is added in Refinement.
When a section grows, move the ones to its right so the 200 gaps stay.

Every top-level section's fill is `{{figma_section_fill}}`. A section nested inside another gets a white
fill at 6% opacity instead, so it reads against its parent. Never mix viewports in one
section: the lint reads each group together and warns on a screen in the wrong one.

- `Notes` card: not a section. A white card left of `References`, titled "Notes", in
  library text styles: a short description of the task, then numbered groups of checkbox
  lines: the missing components, the open decisions, and the readiness checks (states
  covered, DS colors/type/spacing/components only, copy final, AA contrast, color isn't
  the only signal, nothing hover-only). Name its top layer `Notes`.
- `References`: the screenshots themselves, not just links. See step 2b.
- `Final`: leave it empty except for one library-styled line, "Move or copy the
  direction you want here — Refinement starts from this section."
- `Flows & states`, `Final — <w>`, `Flows & states — <w>`: empty, for Refinement.

## 2b. References: put the screenshots in

{{owner}} reviews the directions next to what they were drawn from, so the References section
carries real images:

1. **Choose the set.** Aim for **10–14 Mobbin references**: the research's "Start here"
   ones, then the strongest per research target until every target is covered. The
   real-app captures you took with `app-reference.mjs` (current screens, in `qa/` in the
   task folder) come on top and don't count. Fewer than 10 only when research.md doesn't
   have that many relevant ones; never pad with weak matches, and say so in design.md.
2. **Lay them out as a grid of rows** inside `References`: a vertical auto-layout of
   horizontal auto-layout rows, 4–5 images per row, one row per platform so sizes line up:
   phone rows of 5 frames at 390×844, web and desk rows of 4 at 1280×800. The real-app
   captures get the first row, captioned "Current app — <route>". Bind the gaps and padding
   to Spacing variables. Put a caption above each frame in library text styles:
   "<App> — <screen>", what to take from it on a second line, and the Mobbin link. Collect
   the frame ids in order.
3. **Request upload URLs:** call `upload_assets` with the work file's `fileKey`,
   `currentPageId` = the task page, `count` = number of frames, `nodeIds` = those frame
   ids in order, and `scaleMode: "FIT"`.
4. **Write `references.json`** to the task folder, one entry per frame in the same order:
   `{ "source": "<image_url from research.md, or qa/<capture>.png>", "upload_url": "<submitUrl>", "name": "Mobbin · <App> — <screen>" }`.
   If a research entry has no `image_url` (or it expired), search Mobbin for that screen
   again (`search_screens`, naming the app, `image_format: "jpg"`) and use the fresh `image_url`.
5. **Upload them right away** (the URLs expire after 10 minutes):
   `node "$AGENTOS_ROOT/harness/figma/upload-references.mjs" --task "$AGENTOS_TASK"`.
   It prints ✓ or ✗ per image. Retry any ✗ with fresh URLs. If an image still won't come
   in, delete its frame and keep the caption with the link.
6. **Check** with one `get_screenshot` of `References`.

## 3. Directions

Make 2–3 directions that differ in **structure or flow**: what's primary, how the user
moves, what's grouped with what (*figma-taste* §1: a different answer to what's biggest,
a different block order or grouping). Different colors on one skeleton don't count. Give each
direction a short name and one signature idea.

Ideation is for {{owner}} to pick a direction fast, so each direction draws **what the task
asked for, and no more**:
- **A screen** (the task asks for one screen, page, sheet or panel): one screen, the
  surface the plan marks **(ideation)**.
- **A flow** (the task asks for a sequence: onboarding, sign-up, checkout, a wizard):
  every step of the main path, the surfaces the plan marks **(ideation)**, in Flow order,
  left to right in one row inside the Direction section, so {{owner}} can read the direction
  as the flow. One screen of a flow is never enough to pick a direction from.
- Older plans mark one **(hero)** instead: if the spec or the plan's Flow still describes
  a flow, draw the main path's steps from Flow; else draw the hero (or the first surface).
- The same set of screens in every direction, so {{owner}} compares like with like.
- Each screen a **full page at the primary viewport only** (your dispatch's Viewports
  line): the exact width, at least its height, with the app's navigation and chrome as the
  real app shows it there and realistic content around the part that changes. A floating
  component on its own is never a screen. The runner's lint rejects a Direction without
  that full page.
- Nothing else: no alternative or recovery paths, no surfaces off the main path, no other
  viewports, no variants or states. Refinement draws those for the direction {{owner}} picks.
- Navigation or chrome the library has no component for: build it once on this page as a
  local composite from library instances and variables, matching the app's code and the
  reference pages, then place instances of it in every screen.
- Build each screen per `figma-generate-design` steps 3–5: create the wrapper first, then
  sections inside it, then library instances with real copy through `setProperties`.
  Bind every fill, gap, padding and radius to a variable, and give every text layer a
  text style.
- Turn repeated pieces into a local composite on this page, built from library
  instances.
- Where the library lacks a component, use a `⚠ Missing: <Name>` placeholder (see
  *figma-ds-lint*).

## 4. Check your work

- Compare each screen with your app captures: chrome, page width, type scale and
  spacing rhythm should read as the same product.
- Take one `get_screenshot` per direction and run *figma-taste* §8 on it (at most three
  rounds). Fix clipped text, overlaps, leftover placeholder copy and wrong variants too.
- Don't run the DS lint yourself: the runner lints your `figma_nodes` when you end the turn
  and sends back every error to fix (*figma-ds-lint*).

## 5. design.md

Write it to the task folder:

```markdown
# Design — <task title>
Figma: <page URL>

## Direction A — <name>
Idea: one line. Question: … Finding: … Optimizes for: … Trade-off: … Informed by: <reference>.
Critique: <overall score> (design _ · usability _ · creativity _ · content _); left: …
(same for B, C)

## Recommendation
Which direction and why, in two or three sentences. {{owner}} decides.

## References
<n> Mobbin + <m> current-app captures. Under 10 Mobbin: why (research had only <n> relevant).

## Left for Refinement
The plan's other surfaces, alternative and recovery paths, the other viewports (<w>…) and states.

## Sample data
What's invented (names, figures) and must be confirmed.

## Kit
Library components used (name → where), plus any local composites and why they exist.

## Missing from the Design System
Each placeholder: what it needs to be, and the closest library component.
```

End with `done`. In the summary, give the directions in one line each and your
recommendation. Set `links.figma` to the page URL
(`https://www.figma.com/design/<work_file>/?node-id=<page id with ->`) and `figma_nodes` to
the ids of the sections you created or changed (the Directions, `References`, any kit
section): the runner lints only those.

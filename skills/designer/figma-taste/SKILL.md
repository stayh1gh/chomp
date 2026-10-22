---
name: figma-taste
description: Composition and critique for every screen the designer draws — what a screen answers, what's biggest, how blocks share edges, honest data and states, the tells of generated UI — then a look-and-fix loop on Figma screenshots. Decides layout only; the Design System decides every value.
---

# figma-taste

Adapted from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) v2 (MIT, commit
`6010f91`), composition and critique only (crivo: Adapt, 2026-10-22). Its scripts, its
dealt palettes, type and photographs, its motion and its image sourcing are left out: in
Chomp the Design System library fixes those.

A screen built by a model looks like the average of every screen it has seen: a greeting,
four KPI tiles with icons in tinted circles, a gradient chart, a zebra table. Nothing in
it is wrong and nothing in it was decided. This skill replaces those defaults with
decisions, then makes you look at what you drew.

## 0. What wins

1. The flow's standing rules and the profile's `design_requirements`.
2. The Design System library and the product's own chrome, as the real app draws it.
   This skill never adds a colour, size, radius, shadow or font the library doesn't have:
   where a rule below gives a number, pick the nearest library variable or style. If a
   library component itself carries something this skill bans (a shadow on its card, an
   uppercase label), keep the component as it is and note it in your notes document.
3. This skill: what goes on the screen, what's biggest, in what order, grouped how, at
   what density, with what words and data.

## 1. Before drawing: decide the screen

Decide first which kind of screen it is. **An app screen** is worked in (a dashboard,
list, inbox, detail, settings, editor). **A page** is read and scrolled (a landing,
marketing or product page). A product page that shows its app is a page; the app
fragments on it follow the app-screen rules.

**For an app screen**, write in your notes, before any use_figma call:

- **The data and the jobs** (8–12 lines): the objects the screen shows and their fields
  with units; realistic magnitudes, including how small they are for a new account; who
  opens it, how often, on what device; what they do next from here, and which job comes
  up most.
- **The one question** the screen answers first ("Who is waiting for a reply?"). It
  decides what's biggest, what's read first, and what's left out.
- **The one finding**: the fact in this data that most needs attention. It goes where
  it's read first (under the title, or as the headline figure's subline), next to the
  action it drives.
- **The blocks**, one line each, as answers to the next questions. A block with no
  question is deleted. This is how you avoid the stock order of KPI row, big chart, two
  small charts, table.

**For a page**, write the argument: one line per section, a claim and its proof; the
claims decide which sections exist and in what order. Then the idea, in one sentence:
"On this page, **[something only this subject has]** becomes **[the composition]**."
Competitor test: put the nearest competitor in the sentence. If it still works, the idea
belongs to the category; find another.

**Across directions**, these notes are where the directions differ: a different answer
to what's biggest, a different shell, a different block order or grouping. Never the same
skeleton restyled.

## 2. Composition — app screens

**Shell.** The product's chrome stays as the real app draws it. Where the task designs
chrome: the product's mark and name at the top, the scope (workspace, team, account) as a
switcher or breadcrumb; navigation recedes (active item a neutral fill or brighter label,
not an accent bar); a top bar only when it holds something real (search, the switcher,
the object's name); a count on a nav item only on a queue that needs action.

**Canvas.**
- One left edge from the title to the last row, one right edge; the grid's arithmetic
  closes (columns × width + gaps = the content width). One gap value both ways.
- Choose the column count from the item count: four KPIs get four columns, a lone card
  spans. No orphan cells.
- Cards that share a row share a bottom edge. Balance by content (same row counts, paired
  blocks of similar height); only then stretch, and a stretched card pins only an action
  or a total to its foot, never a legend over a blank band.
- Narrow blocks (≤5 columns, ≤6 rows) don't span the canvas; pair them with the next block.
- Everything the plan names for this screen shows its header and first rows on the first
  screen of the primary viewport. Cap lists at 4–6 rows with "View all" and the total.
  Time-sensitive blocks come before long tables.
- The most frequent job is one click away: its control in the title row or on the row
  that needs it. A screen with no control for its main job reads as a report.

**Title.** One per screen, a noun ("Members", the object's name), not a greeting; the
library's page-title style, never a display size. An optional second line about the data
(the finding, the period), never about the interface. Actions to its right only when real.
One filled primary per screen.

**Figures.** No tile per KPI: one container split by dividers, label over value, sentence
case. No icon in a tinted circle, no sparkline. The figure that answers the screen's
question is the largest figure on the screen; nothing else matches it. A delta names its
window ("vs last 30 days"); its colour says good or bad, not up or down (rising error
rate is negative); zero or no prior period is grey ("+4 (new)", or a dash).

**Charts.** One question, one series; switch metrics with a control instead of overlaying.
One hue per chart, on the main data element; neutrals for the rest. No legend for a single
series. 3–5 faint horizontal gridlines, no y-axis line, round ticks above the maximum,
flat x labels. Straight segments, no markers, no gradient fill. Annotate the event that
explains a spike. A mostly flat series gets two-thirds of the width, not all of it. A few
numbers need no chart.

**Tables and lists.** Numbers right-aligned in tabular figures with fixed decimals; the
identity column gets the most width. Headers small, grey, sentence case: no uppercase, no
fill band, no zebra rows. A missing value is a grey dash; a real zero is printed. One
status mark per row, a pale tint with dark text of the same hue. Row actions: none, one
trailing kebab, or one visible action where the row needs doing. No pagination on an
overview.

**Forms and settings.** Label above the field, never a placeholder as label. One control
height per row. One save model per view (autosave with a "Saved" stamp, or one Save per
panel). One view per settings area. Destructive actions last, in their own section, with
the consequence in words. Beside a control, a small preview of what it produces is the
substance a settings screen otherwise lacks. Disabled controls stay legible and say why.

**Density** is row pitch, padding and type size moved together. Placed space reads calm;
leftover space (a grid that doesn't fit the data, an empty column, a stretched card) reads
unfinished.

## 3. Composition — pages

- Headlines two lines or fewer at every viewport (about 32 characters is safe); a clear
  title on the first screen saying what this is; a heading on every section.
- Equal outer margins; no section huddled on one side with the other half empty; no blank
  stretch taller than half a screen.
- Two or three type sizes do the visible work: one very large, one small. Left-aligned by
  default, one centred moment at most. Two or three left edges on the whole page.
- The gap between sections is clearly larger than any gap inside one. Each section has a
  different composition from its neighbours; none is a card grid.
- One accent, on the action and perhaps one other thing. Running text in full ink.
- One dominant image beats six small ones. No image beats a placeholder, an icon or an
  abstract shape.
- Removing ornament leaves space: fill it with scale, full content or a real picture,
  never another ornament. Thin sections are the commonest reason a clean page loses.

## 4. Words and data

- Real copy from the spec and the product's voice; words of the trade ("Waiting on the
  customer"), never the template's noun ("Items", "Records").
- Sample data that's believable and adds up: totals from the rows as shown, a fact shown
  twice says the same thing twice, every relative figure names its baseline ("+5 on the
  usual Monday"). Small accounts at their real, small size.
- Never: lorem ipsum, Acme, John Doe, "User 1", vanity figures ("10,000+ teams"), invented
  quotes or logos. No copy that describes the interface ("This page shows…").
- List the sample data in your notes document so {{owner}} can see what's invented.

## 5. States

- **Empty** keeps its frame and header and adds one sentence (and the add action); an
  empty side block shows the reference data instead of a lonely box. First run keeps the
  title and puts the first action where the data will appear.
- **Loading** is the final layout with each value replaced by a flat bar at its real
  size, labels shown, nothing shifting when data lands.
- **Error** sits inside the block that failed: what failed, when data was last good, and
  Retry. Never a full-screen banner for one block.
- **Zero** is printed as a zero; red is a signal on the failing fact, one per object.

## 6. Other viewports

Each one is a composition of its own, not the primary squeezed. On a phone: navigation
folds into the app's phone chrome; tables become two-line rows (identity and key number
on line 1, the other fields grey on line 2: moved, never dropped); KPIs become a 2-column
grid or a label/value list; at most one row of controls above a chart; filters collapse
into chips; a block with an action moves up as a one-line summary.

## 7. Tells — never draw these

Greeting with an emoji, or an illustrated welcome banner · KPI tiles with icons in tinted
circles · sparklines on KPIs · a green "+12.5%" pill everywhere · gradient area charts,
smoothed lines, a dot on every point · rainbow charts, a hue per bar · fat donuts with
labelled slices · zebra tables under uppercase tracked headers · saturated status chips
with white text · the accent on every button, tab and link · a dark or saturated sidebar
on a light screen · glass, glow, gradients on surfaces or text · eyebrow labels and pill
badges above headings · 01/02/03 numbering · rows of identical icon-topped cards · emoji
as icons · an equal four-up grid whatever the data · pagination under a five-row list ·
an empty chart with an illustration and "No data yet" · a screen that names no product
and offers no action.

A screen with every tell removed and nothing put in their place is a tidy template. What
fills the space is the product: its own data at its real size, the one question answered
by the biggest block, and a grid whose sums close.

## 8. Look, then fix

After building a screen or row, `get_screenshot` it and critique the picture, never the
script: you'll read your intentions into the code. Make each pass on its own:

1. **One second, then five.** One thing seen first? Can a stranger say what this is and
   what to do next?
2. **The question.** Is it answered by the biggest thing, read first? Is the largest
   figure the answer?
3. **Squint.** Two or three masses with clear size differences, or many medium ones?
4. **Cover the name.** Could this belong to a competitor or another product? (pages: the
   idea; app screens: its data, objects and words)
5. **Edges and space.** Count left edges. Any dead strip, orphan cell, ragged row,
   stretched card with a blank band, unequal margins?
6. **Colour.** Only on data, status and the one primary action?
7. **Numbers.** Do totals add up, do copies of a fact agree, do figures line up digit for
   digit, does every relative figure name its baseline?
8. **Sameness.** One word per block or section; the same word three times is the template.
9. **Substance.** Is everything the plan asked for there, complete and readable?
10. **Tells.** Anything from §7?

Score each screen as a juror who didn't build it, 1–10: design 40%, usability 30%,
creativity 20%, content 10%. A clean, professional kit is a 6–7. Caps: any tell from §7 →
overall ≤ 6.5; could belong to anyone (pass 4) → creativity ≤ 6; plan content missing →
content ≤ 6; no control for the main job → usability ≤ 7.

Fix the top three problems, most visible first, in this order: hierarchy, composition,
words and data, states, detail. Name problems the way a designer would ("the KPI strip
ends 120px short of the table's right edge"), never "could be more polished". At most
three rounds; stop early when a round finds nothing a stranger would notice. If the last
round is still under 7.5, say so in your notes document with what's left; don't round up.

For each direction or screen, record in your notes document: the question (or the idea),
the finding, the score, and anything left.

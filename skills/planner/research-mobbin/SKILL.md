---
name: research-mobbin
description: Answer plan.md's research targets — what the product already has first, then Mobbin for the gaps — and write a curated research.md for the designer.
---

# research-mobbin

Adapted from Chomp's `internal-pattern-search` and `reference-research`, merged: internal
first, external only for what internal search left open.

## 1. Internal, briefly

For each research target in `plan.md`, check whether the product already does this job
somewhere (a screen, a component in the DS index). An existing pattern wins over any
external reference — the designer should reuse it. Note where, with file paths.

## 2. Mobbin for the gaps

For each target internal search didn't settle:

- `search_flows` for multi-screen journeys, `search_screens` for one surface's layout,
  `search_sections` for a specific component pattern.
- Query with the target's own words, not generic categories. Try 2–3 phrasings before
  calling a target empty.
- Keep 3–6 references per target that are actually relevant. Curate, don't dump.
- The designer puts 10–14 of them on the Figma page, so research.md needs **at least ~14
  usable references with an `image_url`** across all targets. Short of that, search the
  thinner targets with more phrasings (and `search_flows` for their screens) before
  settling; if there still aren't enough relevant ones, say so under Gaps rather than
  adding weak matches.
- Search with `output_destination: "design_tool"`, `output_tool: "Figma"` and
  `image_format: "jpg"`: the designer puts these screenshots into the Figma page, and JPG
  is the safe format for Figma image fills.

## 3. Write research.md

```markdown
# Research — <task title>

## Start here
The 2–3 references most worth the designer's time, one line each on why.

<n> references with images in total.

## <research target>
**In the product:** what exists (path) or "nothing comparable".
**References:**
- **<App> — <screen/flow>** — <mobbin_url>
  Image: <image_url> · Platform: <ios|web>
  What to take: the specific decision (layout, interaction, empty state, copy pattern).
  Watch out: what doesn't transfer to this product.

## Gaps
Targets where neither the product nor Mobbin had anything good. Say so plainly.
```

Include every reference's `mobbin_url` and its high-resolution `image_url` (the designer
downloads it into Figma; Mobbin's image URLs last 30 days). A
target with no good reference gets "nothing relevant found", not a weak match.

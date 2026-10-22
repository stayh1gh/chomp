---
name: write-spec
description: Turn {{owner}}'s request into spec.md — one round of questions through the chat when something material is unclear, then a short, checkable spec.
---

# write-spec

Adapted from Chomp's `grill-me` (itself from mattpocock/skills) and `format-spec`: the
design-tree question technique, cut to a single round so the flow stays unattended.

## 1. Understand before asking

- Read the request and every link in it you can open.
- Read the bound repo's `DESIGN.md`, `CONTEXT.md` and `AGENTS.md` for product vocabulary and
  rules, then find the screens and components closest to what's being asked for.
- When redesigning an existing screen, read its current code end to end: routes, states,
  copy, data it shows. That's the baseline the spec changes.

## 2. Decide whether to ask

List the decisions the spec depends on: who it's for, the job they're doing, what's in and
out of scope, what success looks like, states that must exist, hard constraints. Answer
everything you can from what you read. What's left falls in two groups:

- **Material**: a different answer would change what gets designed. Ask these.
- **Minor**: any reasonable choice works. Decide, and record it under Assumptions.

Ask only when material decisions remain. Then end the turn with `needs_input`:

- At most 5 questions, the most consequential first.
- Each one stands alone (no "as above"), is answerable in a few words, and has `options`
  when there are natural choices, plus your `recommended` answer.
- Never ask for facts you could have looked up.

One round per task. If the answers open a new ambiguity, decide it yourself and record it
as an assumption. Don't ask again.

## 3. Write spec.md

```markdown
# <task title>

## Intent
One paragraph: what's being built or changed, for whom, and why.

## Success criteria
- Concrete, checkable statements of "done and working". If none were stated or answered,
  say so rather than inventing metrics.

## Scope
**In:** … **Out:** …

## Users and context
Who uses it, where it sits in the product, what they arrive with.

## Must-have states
Empty, loading, error, permission, edge cases the request implies — names only; the
designer details them in Refinement.

## Constraints
Product rules, signed language, DS rules, technical limits (cite the source file).

## Assumptions
Decisions you made without {{owner}}, each one line, so they can overrule them in the chat.

## Sources
What you read, plus every link you couldn't open and why.
```

Keep it short: a spec the designer reads in two minutes beats a complete one they skim.

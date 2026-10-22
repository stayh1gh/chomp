---
name: plan
description: Turn spec.md into plan.md — the surfaces to design, the flow between them, the design-system pieces to reach for, and the questions research should answer.
---

# plan

Adapted from Chomp's `create-plan` (itself from mattpocock/skills `to-tickets`). The
vertical-slice rule survives; slices are now separate board tasks, not chain runs.

## Reads

`spec.md`, the bound repo's design system (`figma.components_index` and
`design_system.components` in the profile, or `design_system.context` when the profile
lists references outside the repo), and the routes and screens the spec touches.

## Write plan.md

```markdown
# Plan — <task title>

## Surfaces
Each screen, sheet, dialog or panel to design: name, route (existing or new), its job in
one line. Mark what Ideation draws with **(ideation)**, matching what {{owner}} asked for: a
screen → that one surface; a flow (onboarding, sign-up, checkout, a wizard) → every step of
the main path, in Flow order. Ideation draws only those, in every direction; Refinement
draws the rest (alternative paths, other surfaces, states, other viewports) for the
direction {{owner}} picks.

## Flow
How the user moves between the surfaces, as a short numbered path. Note entry points and
exits.

## Design-system pieces
Components from the DS index that obviously fit (exact names from the index), and anything
the DS doesn't cover yet — flagged as "missing", never invented.

## Research targets
3–6 specific questions for Mobbin, phrased as patterns to find
("bulk-select in a mobile list with a sticky action bar"), not categories ("lists").

## Build notes
Where this lands in code: routes, files likely touched, data it needs. Only what's
visible from the repo; no speculation about backends. For a design-only task (Task type
in your dispatch), leave this section out: the deliverable is the Figma flows and states.

## Slices
Usually: "One task." If the spec covers several independently shippable parts, list
them in order with what each delivers. This card continues with the first; {{owner}} creates
the others as new tasks.
```

Default to one slice. Don't manufacture structure the spec doesn't need.

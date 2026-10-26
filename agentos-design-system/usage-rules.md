# Usage rules

One rule per line, organized by pattern. Adapted to this project's actual surfaces — the board, the run detail page, the settings pane, and the small set of dialogs — rather than a generic app's forms/navigation set. Add more as patterns come up.

## Board & columns

- Columns MUST come from `flow.yaml`'s declared order — never hardcode a column list in a component.
- Lanes come from `flow.yaml` too: neighbouring columns with the same `group` are one lane (Plan + Ideation, Development + Draft PR). A lane's icon colour is its `tone`. Code never names a column to join it with another or to label a button (`enter_label`).
- A lane with no cards folds into a 56px dashed rail (icon + vertical title) that still takes drops; the lanes with cards share the width. With no tasks at all, the first lane stays open and says so.
- Lanes have no box: a header (icon, title, count, owner) over the card stack, straight on the panel.
- A card shows exactly one button, its status. Actions on a card's next step (Create draft PR, Open PR for review) live in the task panel.
- The board scrolls horizontally at the column level and vertically per-column card stack; the page itself never scrolls.

## Cards

- One `card-title` per card, in `title` style — never wrap a second title-weight line inside a card.
- The description well (`surface-inset`) is reserved for one thing: the run's clamped 4-line description. Do not reuse it as a generic "boxed content" pattern elsewhere in a card.
- A card's footer (Approve) only renders `data-has-footer="true"` and gets the `divider` rule — a footerless card MUST NOT show the divider.
- Badges in `card-tags` communicate state or metadata only; never use a badge as a clickable button (badges have no interactive states — see `states.md`).

## Dialogs

- The small dialog (`sm`, 440px) is for short, single-purpose forms (New Task) — always offer the `dialog-close` control, and confirm before dismissing if the form has unsaved input.
- The full-page dialog variant (run detail) sits beside the sidebar (`left: var(--sidebar-w)`), not over it, and drops the backdrop tint — it is a page, not a floating modal. Do not apply the standard `dialog-overlay` backdrop styling to it.
- Dialog titles use `heading-sm`; the full-page variant's own title uses `display` instead, since it is a page heading, not a dialog heading.

## Settings pane

- Each setting is one `setting-row` (`surface-card` background) with a label on the left and controls on the right — do not stack label above control.
- Status text (`settings-status`) defaults to `ink-muted`; only flips to `success`/`danger` after a save actually resolves, never as a permanent color.

## Destructive / gated actions

- Approve (`btn[data-variant="approve-ghost"]`) is the only destructive-adjacent, irreversible action in the system (an agent-set `review` status becomes human-approved `done`, which nothing in this UI can undo). It MUST remain full-width in the card footer, never a small inline icon button, so it cannot be triggered by an accidental click near other controls.
- Gate badges (`gate` variant) mark steps that block later steps until approved — always pair the badge with the gate number, never show it as a bare color chip.

## Loading & feedback

- Disable the triggering control during any async action (settings save, task creation) — the shipped `.btn:disabled` treatment (0.5 opacity, `pointer-events: none`) already covers this; do not invent a separate loading style.
- Confirm success or failure via the `toast` component, bottom-left, auto-dismissing — never a blocking dialog for a routine confirmation.
- The `sidebar-note` disclosure ("generated at / not live") is the one place the UI must always tell the user when the current render is a static snapshot rather than a live view — keep it visible in every export mode, not just the served/interactive one.

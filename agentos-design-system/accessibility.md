# Accessibility

Translates the baseline checklist into this system's own semantic tokens and components. Load alongside `DESIGN.md` for every component build and a11y review.

## Contrast

- Default body text (`ink-strong` `#e3e4e6` / `ink` `#ffffff`) on `canvas`, `surface`, or `surface-card` MUST meet 4.5:1. All three exceed it comfortably on `#09090a`–`#1a1a1b` backgrounds.
- `ink-muted`, `ink-subtle`, `ink-nav` (used for card meta, column counts, sidebar labels) MUST be checked against whichever surface they sit on before reuse in a new component — they were sampled for specific surface/text pairs (see `primitive-tokens.md`) and are not guaranteed 4.5:1 on every surface in the ladder.
- `ink-faint` and `ink-disabled` are exempt from the 4.5:1 requirement only when the content itself is genuinely non-interactive placeholder/disabled text (column-empty, unset subtask dot) — never use them for readable body copy to "tone it down."
- Status is never color-only: every status badge (`running`/`approval`/`user`/`done`) carries a text label inside the badge, not just a colored dot. The one color-only signal in the system is the `subtask-dot`, which is always adjacent to a text `subtask-name` — do not ship a bare status dot with no label anywhere else.

## Focus rings

- Every interactive element MUST show the 2px `focus-ring` (brand) outline on `:focus-visible`, offset 1px from the edge — the select is the current reference implementation (`outline: 2px solid var(--accent-indigo); outline-offset: 1px`).
- Buttons, dialog close, column actions, and file chips currently rely on hover only in the shipped CSS — this is a gap, not the intended contract. Any new interactive component MUST add an explicit `:focus-visible` ring; do not ship a component with hover-only affordance.
- Never remove `outline` (e.g. via a reset) without supplying this replacement in the same rule.

## Touch targets

- This is a desktop, pointer-driven surface with no dedicated mobile layout, so the 44×44pt/48×48dp touch minimum does not strictly gate it — but icon-only controls (`btn[data-size="icon"]`, 24×24px) are already below it. Expand the click/tap hit area via padding on any icon-only control reused in a future touch context, rather than shrinking the visual glyph further.

## Keyboard navigation

- Tab order MUST match visual order: sidebar → panel header → board columns left-to-right → cards top-to-bottom within a column.
- The full-page detail dialog (task detail) and the small New Task dialog MUST both be escapable via a keyboard route (Escape closes; the `dialog-close` button is also reachable by tab) — do not trap focus with no exit.
- Column hover-actions (`+`/`…`) already support `:focus-within` to stay visible under keyboard focus — preserve this when touching that CSS; do not gate visibility on `:hover` alone.

## `prefers-reduced-motion`

- The system's only animations are 0.1–0.2s opacity/background transitions (button hover, column actions reveal, toast show/hide) — none are essential to comprehension. Wrap them in `@media (prefers-reduced-motion: no-preference)` if the transition list grows beyond these short utility fades; the current ones are short enough to ship unconditionally but SHOULD NOT grow into anything longer without the guard.

## Screen reader

- Icon-only controls (`btn[data-size="icon"]`, `dialog-close`, column `+`/`…`) MUST carry `aria-label` — none currently do in the shipped markup; this is a required fix when a component is rebuilt from these specs, not an optional nicety.
- Form fields inside dialogs (New Task) MUST pair every `input`/`textarea`/`select` with a `label[for]`.
- Heading hierarchy MUST stay sequential: `panel-header h1` → `column-heading h2` (per column) → `settings-group h2` / `side-section h3` — do not skip from `h1` to `h3`.
- The `toast` component MUST be marked `aria-live="polite"` (`aria-live="assertive"` for `.error`) so async confirmations and errors are announced without requiring focus to move.

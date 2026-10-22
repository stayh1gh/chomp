# Semantic tokens

References primitive names only — no hex. This is the stable interface between `primitive-tokens.md` and every component recipe in `components/*.md`.

## Color aliases

```yaml
canvas: surface.surface-0        # Page-level background behind the panel. Never inside a card or panel.
surface: surface.surface-1       # The single app panel. Not for cards.
surface-card: surface.surface-2  # Cards, setting rows, outline badge fill, file chips.
surface-inset: surface.surface-3 # One nesting level inside a card. Today: the description well only.
accent-tile: surface.surface-accent-tile  # The brand-mark tile background. Not a control surface.

border: surface.surface-border               # Default hairline: panel edge, dialog edge, topbar/side-section rules.
border-strong: surface.surface-border-strong # Badge outline, select/input border, file-chip border.
border-hover: 'component-flat.border-hover'  # Hover state of border-strong on select/file-chip.
divider: surface.surface-divider             # Card footer rule above the Approve button. Never a general-purpose divider.

ink: text.text-0            # Highest-emphasis single line: card title, dialog title, primary button label.
ink-strong: text.text-1     # Panel/column headers; default body color.
ink-body: text.text-3       # Multi-line description and prompt text.
ink-muted: text.text-4      # Card meta, outline-badge text, settings hints.
ink-subtle: text.text-5     # Column count, header icon buttons, side-section labels.
ink-nav: text.text-6        # Sidebar nav label (inactive).
ink-faint: text.text-7-a11y  # Lowest-emphasis utility text (`.muted`). Contrast-corrected — the raw sampled
                              # text-7 fails 4.5:1 on canvas; see primitive-tokens.md "a11y-corrected variants".
ink-disabled: text.text-8   # Column-empty placeholder, unset subtask indicator. Exempt from 4.5:1 — genuinely
                             # disabled/placeholder content only (see accessibility.md).
ink-inverse: text.text-0    # Text on the brand fill only (primary button, FAB, Done badge). White clears 4.5:1
                             # on brand (indigo) but not on the success/warning/danger fills — see ink-on-status.
ink-on-status: text.ink-on-status-fill  # Text on success/warning/danger badge fills specifically. Near-black —
                                         # white fails contrast on these lighter, more saturated fills.

brand: indigo.500      # The one chromatic accent: primary CTA, FAB, Done badge/ring, avatar chip, focus ring. Never decorative.
success: green.500     # Running status only. Never a generic "good" indicator elsewhere.
warning: orange.500    # Waiting for User status only.
danger: red.500         # Waiting for Approval status, error toast/status text. Not for warnings.
approve: approve.approve-text-a11y # The Approve action affordance's text color. Distinct from `success` despite
                                    # both being green. Contrast-corrected — see primitive-tokens.md.
```

## Component & interaction tier

Stateful tokens for backgrounds, borders, and icons where a component needs a per-state fill. `interaction-*` tokens that are true overlays are documented as such; two components (`primary` button, FAB) use a brightness filter instead of a swapped fill because that is what the shipped CSS does — this is called out explicitly rather than forced into the overlay model.

```yaml
bg-brand-default: brand
bg-brand-default-hovered: 'filter: brightness(1.1) over bg-brand-default'  # Not a token swap — a CSS filter.

bg-secondary-default: component-flat.bg-secondary
bg-secondary-default-hovered: component-flat.bg-secondary-hover

bg-ghost-default: transparent
bg-ghost-default-hovered: component-flat.bg-ghost-hover

bg-approve-ghost-default: transparent
bg-approve-ghost-hovered: approve.approve-hover-tint   # rgba(51,130,37,0.10) — a true overlay tint.

bg-input: component-flat.bg-input   # select, dialog input/textarea/select fields.

border-default: border
border-strong: border-strong
border-strong-hovered: border-hover

icon-default: ink-subtle
icon-muted: ink-muted

focus-ring: brand   # 2px outline, 1px offset. See DESIGN.md "Interactive states".
```

## Status badge tier (flat, non-interactive — no hover/pressed states; badges are not clickable)

```yaml
bg-badge-running: success
ink-badge-running: ink-on-status    # Not ink-inverse — white fails 4.5:1 on the success fill (2.22:1).
bg-badge-approval: danger
ink-badge-approval: ink-on-status   # Not ink-inverse — white fails 4.5:1 on the danger fill (3.30:1).
bg-badge-user: warning
ink-badge-user: ink-on-status       # Not ink-inverse — white fails 4.5:1 on the warning fill (2.31:1).
bg-badge-done: brand
ink-badge-done: ink-inverse          # White passes on the brand (indigo) fill (4.70:1) — the one badge that keeps it.
bg-badge-outline: surface-card
border-badge-outline: border-strong
ink-badge-outline: ink-muted
bg-badge-gate: status-pair.gate.bg
ink-badge-gate: status-pair.gate.ink
bg-badge-warn: status-pair.warn.bg
ink-badge-warn: status-pair.warn.ink
bg-badge-model: status-pair.model.bg
ink-badge-model: status-pair.model.ink
```

## Typography

Named styles are defined with resolved values in `DESIGN.md`'s frontmatter (`typography:` block) — this file records only the raw scale they're built from, for reference:

```yaml
# font-size primitives (px): 10, 11, 12, 13, 14, 16, 20, 24
# line-height primitives (px, or %): 14, 16, 20, 25, 30, 160%
# font-weight primitives: 400 (regular), 500 (medium), 600 (semibold)
# font-family primitive: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
```

Reference-only — never bind a component directly to a font-size/weight primitive. Use the named styles (`display`, `heading`, `title`, `body`, `caption`, …) from `DESIGN.md`.

## Spacing & shape

Base grid: 4px, with one 2px exception (the sidebar-help affordance).

Token paths here are `spacing.*` and `radius.*`. Neither is emitted under those names as CSS
variables: `tokens.css` emits the spacing scale as `--space-*` (Tailwind's own `--spacing`
multiplier already produces this exact 4px grid via `p-2`/`h-6`/etc. — components use those
utilities directly rather than a token-named class) and radius as `--shape-radius-*` (Tailwind
reserves `--radius-*` for its own scale). See the note at the top of `tokens.css`.

```yaml
spacing: [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 48]  # px
radius:
  none: 0
  sm: 5px    # Board column top corners only.
  md: 6px    # Interactive controls: button, input, select, dialog-close, file-chip.
  lg: 8px    # Containers: panel, dialog, card, phase-group, sidebar logo tile.
  pill: 48px # Status badges (capped by max-width, not a true circle).
  full: 9999px # True circular/pill controls: FAB, icon button, avatar chip (50%).
border-width:
  width-default: 1px
  width-focus: 2px
focus-offset: 1px
```

## Icon size

Single theme-independent step scale.

```yaml
icon-size:
  xs: 13px   # column status icon, prop-row/phase-value icons
  sm: 14px   # sidebar icon inner glyph, file-chip icon, dialog-close icon
  md: 16px   # avatar-chip diameter context
  lg: 18px   # sidebar icon frame
  xl: 20px   # approve-ghost icon
```

## Dark aliases

Not applicable — this system has no light theme. `color-scheme: dark` is set at the document root and every alias above already targets the dark-native primitive; there is no `light:`/`dark:` remap to generate.

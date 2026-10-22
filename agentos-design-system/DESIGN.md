---
name: Chomp Dashboard
product: web app (desktop-first, single-column fallback ≤900px, no dedicated touch layer)
themes: [dark]
colors:
  dark:
    canvas: '#09090a'
    surface: '#121213'
    surface-card: '#1a1a1b'
    surface-inset: '#242424'
    border: '#1a1b1d'
    border-strong: '#2f3033'
    divider: '#27292b'
    accent-tile: '#212121'
    ink: '#ffffff'
    ink-strong: '#e3e4e6'
    ink-body: '#b8b8b8'
    ink-muted: '#98999c'
    ink-subtle: '#959597'
    ink-nav: '#929294'
    ink-faint: '#7c7c7e'
    ink-disabled: '#4a4a4d'
    ink-on-status: '#09090a'
    brand: '#5e6ad2'
    success: '#34c759'
    warning: '#ff8d28'
    danger: '#ee5d5d'
    approve: '#3e9f2d'
    bg-secondary-default: '#232326'
    bg-secondary-hovered: '#2c2c30'
    bg-ghost-hovered: '#1e1e21'
    bg-input: '#0d0d0e'
    border-hover: '#454649'
    badge-gate-bg: '#1b2a44'
    badge-gate-ink: '#93b4e8'
    badge-warn-bg: '#33240a'
    badge-warn-ink: '#d9a441'
    badge-model-bg: '#241a33'
    badge-model-ink: '#b79ce0'
    toast-danger-border: '#5c2626'
    toast-danger-ink: '#e79b9b'
typography:
  display:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 30px
  heading:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 25px
  heading-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 20px
  label-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 500
    lineHeight: 20px
  nav-item:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 20px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 500
    lineHeight: 160%
  title:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 16px
  caption-strong:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  overline:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
  micro:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 400
    lineHeight: 14px
  nano:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: 400
    lineHeight: 14px
  weight-regular: 400
  weight-medium: 500
  weight-semibold: 600
  family-default: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
spacing:
  space-2: 2px
  space-4: 4px
  space-6: 6px
  space-8: 8px
  space-10: 10px
  space-12: 12px
  space-14: 14px
  space-16: 16px
  space-20: 20px
  space-24: 24px
  space-28: 28px
  space-32: 32px
  space-48: 48px
radius:
  none: 0px
  sm: 5px
  md: 6px
  lg: 8px
  pill: 48px
  full: 9999px
icon-size:
  xs: 13px
  sm: 14px
  md: 16px
  lg: 18px
  xl: 20px
borders:
  width-default: 1px
  width-focus: 2px
  focus-offset: 1px
---

Rules in this document use RFC 2119 keywords: MUST, MUST NOT, SHOULD, MAY.

## About this file & what to load when

| Task | Load |
|---|---|
| Styling or layout decision | This file only |
| Building or modifying a component | This file + `components/<name>.md` |
| Wiring interactive states (hover/pressed/disabled) | + `states.md` |
| Placing a component inside a board, dialog, or settings pane | + `usage-rules.md` |
| Accessibility review | + `accessibility.md` |
| Writing CSS or JS | `tokens.css` / `tokens.json` once `generate-tokens` runs — never hardcode hex |
| Reading raw color scales | `primitive-tokens.md` — never during UI work |

## Product brief

Chomp's board is the internal Kanban where a request travels from spec to draft PR — one card per task (`board/tasks/<id>/task.yaml`), in the columns `flow.yaml` declares (Plan, Ideation, Designing, Refinement, Development, Done), with a short per-column checklist on each card and a chat docked bottom-right. The owner reads it to see where each task stands, answers agents' questions in the chat, and moves cards out of the columns that wait for him. It is a small vanilla-JS page served by `harness/dashboard/serve.mjs`, updated live over server-sent events. The visual language is a direct, deliberate application of Linear's product-issue-view idiom: an extremely dark, near-black canvas, a single lavender-indigo accent, hairline borders instead of shadows for structure, and a four-step type scale (12 · 14 · 16 · 18px, 14 the default) built for scanning many short rows at once — not a marketing surface.

## Design principles

**One accent, many statuses** — `brand` (`#5e6ad2`) is reserved for the one deliberate call to action per view (primary button, FAB, active/Done state, focus ring). Status color (`success`/`warning`/`danger`) communicates state, never emphasis, and MUST NOT be reused as a decorative brand substitute.

**Hairlines over shadows** — surfaces are separated by 1px `border` tokens and a four-step `canvas → surface → surface-card → surface-inset` ladder, not drop shadows. The one permitted shadow is the near-invisible `0 0.5px 1px rgba(0,0,0,0.3)` resting elevation on cards/rows, which MUST NOT be strengthened into a visible drop shadow.

**Density is the default, not an exception** — body type sits at 12–14px; components MUST default to their compact form (`sm`/`md` sizing, 8–12px internal padding) unless a specific view (the run detail page) calls for the larger 16–24px reading type explicitly documented in `typography`.

**Hover, not motion, is the primary affordance** — this is a pointer-driven desktop surface. Interactive elements MUST expose a `hover` state (background or brightness shift, ≤0.1s transition) and SHOULD NOT rely on animation, scale, or elevation changes to signal interactivity.

**Every color is a token, never a guess** — hex values MUST be resolved through `bg-*`, `border-*`, `ink-*` semantic tokens (see `semantic-tokens.md`), never written inline once `tokens.css` exists. The few status-pair colors that do not fit the `brand`/`success`/`warning`/`danger` scales (`badge-gate-*`, `badge-warn-*`, `badge-model-*`) are still named tokens, not one-off hex.

## Colors

The palette is dark-only by design — `color-scheme: dark` is set at the root and there is no light variant to fall back to. `canvas` (`#09090a`) is the outermost page background and MUST NOT appear inside a panel or card. `surface` (`#121213`) is the single app panel — the sidebar's sibling container — and is not a card background. `surface-card` (`#1a1a1b`) is the resting background for cards, setting rows, badges' outline variant, and file chips. `surface-inset` (`#242424`) is reserved for content nested one level inside a card — today, only the card description well.

`brand` is the one chromatic accent in the system: primary buttons, the FAB, the Done badge and status ring, avatar chips, and every focus ring. `success`, `warning`, and `danger` map to the three live run states — Running, Waiting for User, Waiting for Approval — and MUST NOT be applied to anything that is not communicating one of those states. `approve` is a distinct green from `success`; it marks the Approve action affordance specifically and MUST NOT be conflated with the Running status color even though both are green-family.

Text uses the `ink-*` ladder by emphasis, darkest reserved for disabled content: `ink` (pure white) for the highest-emphasis single line of a component (card title, dialog title), `ink-strong` for headers and default body color, `ink-body` for multi-line description/prompt text, `ink-muted` and `ink-subtle` for metadata and secondary labels, `ink-faint` for the lowest-emphasis utility text, `ink-disabled` for placeholders and empty-state copy. `ink-inverse` (white) MUST be used only on the `brand` fill (primary button, FAB, Done badge) — on the `success`/`warning`/`danger` badge fills, which are lighter and more saturated, white fails WCAG AA and `ink-on-status` (near-black) MUST be used instead. `ink-faint` and `approve` resolve to contrast-corrected values rather than their raw Figma-sampled hex — both failed 4.5:1 at their shipped text size; see `primitive-tokens.md` for the sampled-vs-corrected record.

## Typography

Inter is the only typeface, falling back through the system sans stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`) since a strict CSP blocks web fonts in the published Artifact export. Named styles below MUST be used as complete units (family + size + weight + line-height together) rather than composed ad hoc. `display` and `heading-sm` are reserved for page/dialog titles; `title` is the only style permitted on a card's primary label; `caption` and `micro` carry the majority of the UI's text volume by design — this is a dense surface and SHOULD stay that way rather than growing type sizes for emphasis. Reach for weight (`weight-medium`, `weight-semibold`) or `ink` tier before reaching for a larger size.

## Layout & spacing

Spacing MUST come from the 4px-based `spacing` scale (`space-4` through `space-48`); there is no fractional or 2px-off-grid value in the shipped UI apart from `space-2`, which is reserved for the sidebar-help affordance only. The sidebar is fixed at 220px, board columns at 348px, and the run-detail page caps its two-column body at 1120px total (a 720px content column plus a 320px properties rail) — these are structural constants, not part of the spacing scale, and MUST NOT be treated as tokens to reuse elsewhere.

## Shape & borders

Radius is tiered by structural role, not by component: `sm` (5px) is reserved for the board column's own rounded top; `md` (6px) is the default for interactive controls — buttons, inputs, selects, the dialog close button, file chips; `lg` (8px) is reserved for containers — panel, dialog, card, phase-group, the sidebar logo tile; `pill` (48px) is the status-badge radius (not a full circle — badges keep a `max-width`, so 48px reads as a pill without the CSS overhead of `9999px`); `full` (9999px) is reserved for true circular/pill controls — the FAB, icon-only buttons, the avatar chip. Border width is 1px everywhere except the 2px focus ring. Borders — never shadows — are the default way to separate a component from its surface; a shadow SHOULD only appear as the near-invisible resting elevation already defined in Design principles.

## Interactive states

Every interactive element MUST define at minimum a `hover` state and, where it can be disabled, a `disabled` state at 0.5 opacity with pointer-events removed. Hover feedback is expressed one of three ways depending on the element, and a component's recipe in `components/<name>.md` states which: a background-color swap to a dedicated `bg-*-hovered` token (secondary/ghost buttons, sidebar items), a `filter: brightness(1.1)` overlay (the primary button and FAB — these have no separate hovered hex), or a semi-transparent tint overlay (the Approve action, `rgba(51,130,37,0.10)` over `surface-card`). Focus is always the 2px `brand`-colored outline, offset 1px from the element edge, and MUST NOT be removed without an equivalent replacement. See `states.md` for the full state contract and `accessibility.md` for the focus-ring requirement.

## Components

- **Button** — `primary` / `secondary` / `ghost` / `approve-ghost` appearances at `default`/`sm`/`icon` sizes. See `components/button.md`.
- **Badge** — non-interactive status pill in 8 variants (`running`, `approval`, `user`, `done`, `outline`, `gate`, `warn`, `model`). See `components/badge.md`.
- **Card** — the board's primary content unit; a `data-slot` shadcn-anatomy card with an optional footer. See `components/card.md`.
- **Dialog** — modal (`sm`/default sizes) and a full-page variant used for the run detail view. See `components/dialog.md`.
- **Select** — native `<select>` restyled with a custom chevron; the only form control in the system today. See `components/select.md`.
- **Toast** — bottom-left transient confirmation/error message. See `components/toast.md`.
- **Sidebar nav** — the fixed 220px left rail; brand mark + 5-item nav, only one item live. See `components/sidebar-nav.md`.
- **Column** — one board lane: header, count, hover-revealed actions, scrollable card stack. See `components/column.md`.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Use `brand` only for the one primary action or the Done/active state in a given view | Apply `brand` to more than one control per view for emphasis |
| Separate surfaces with a 1px `border` token | Add a visible `box-shadow` to imply elevation |
| Keep card/list body text at `caption` (12px) or `body` (14px) | Bump type size on a card to create hierarchy — use weight/`ink` tier instead |
| Use `ink-disabled` and 0.5 opacity for disabled controls | Gray out disabled text using an arbitrary hex not in the `ink-*` ladder |
| Use `success`/`warning`/`danger` only for the Running / Waiting-for-User / Waiting-for-Approval states | Reuse a status color as a generic accent or brand substitute |
| Give every interactive element a visible focus ring | Remove `outline` without providing a replacement focus style |
| Reach for `radius.md` on controls and `radius.lg` on containers | Mix radius values within one component's own parts |

## Accessibility

Body text on `canvas`/`surface`/`surface-card` MUST meet 4.5:1 contrast; `ink-faint` and `ink-disabled` are exempt only when the content itself is genuinely disabled or placeholder text. Every interactive element MUST be reachable and operable by keyboard, with the 2px `brand` focus ring visible on `:focus-visible`. Icon-only controls (button `icon` size, dialog close, column `+`/`…`) MUST carry an `aria-label`. See `accessibility.md` for the full checklist.

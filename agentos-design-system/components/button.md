# Button

## Purpose

The system's clickable-action primitive (shadcn Button anatomy, restyled). Covers every button-shaped control in the dashboard: form actions, card-footer approval, the floating new-task action, and icon-only utility controls.

## When to use

- Any single discrete action a user triggers directly (submit a dialog, open New Task, approve a step).
- Icon-only utility actions in tight chrome (dialog close, column header actions) via the `icon` size.

## When not to use

- Navigation between pages — use the sidebar nav item instead (`components/sidebar-nav.md`); a button MUST NOT navigate via `href`.
- Communicating a state with no action attached — use `components/badge.md`.

## Properties

```
appearance:
  primary — the one main call-to-action per view (New Task dialog submit, FAB). Never more than one visually "loud" primary per screen.
  secondary — supporting actions alongside a primary (dialog cancel). Default choice when an action needs a fill but isn't the main one.
  ghost — low-emphasis actions in dense chrome (dialog close, column header icon buttons). No fill at rest.
  approve-ghost — the single Approve action in a card footer only. Full-width, never used for any other action.
size:
  default — standard dialog/form buttons (40px implicit height via padding).
  sm — dense contexts: settings actions, inline row actions. 32px height.
  icon — icon-only controls, 24×24px, fully round.
```

### Token bindings

```yaml
button-primary:
  backgroundColor: '{bg-brand-default}'
  textColor: '{ink-inverse}'
  radius: '{radius.md}'
  typography: '{body}'
  fontWeight: 500
  paddingInline: '{spacing.space-16}'
button-primary-hovered:
  filter: 'brightness(1.1) over bg-brand-default'   # not a token swap — see states.md
button-secondary:
  backgroundColor: '{bg-secondary-default}'
  textColor: '{ink-strong}'
  radius: '{radius.md}'
button-secondary-hovered:
  backgroundColor: '{bg-secondary-default-hovered}'
button-ghost:
  backgroundColor: transparent
  textColor: '{ink-subtle}'
  radius: '{radius.md}'
button-ghost-hovered:
  backgroundColor: '{bg-ghost-default-hovered}'
  textColor: '{ink-strong}'
button-approve-ghost:
  backgroundColor: transparent
  textColor: '{approve}'
  radius: '0 0 {radius.lg} {radius.lg}'   # bottom corners only — matches the card it sits in
  width: 100%
button-approve-ghost-hovered:
  backgroundColor: '{bg-approve-ghost-hovered}'   # true overlay tint, rgba(51,130,37,0.10)
button-disabled:
  opacity: 0.5
  pointerEvents: none
focus-ring: '{focus-ring}'
```

## States

`default`, `hover` (mechanism varies by appearance — see Token bindings), `disabled` (0.5 opacity, no pointer events). No distinct `pressed`/`active` state is defined — see `states.md`. `focus-visible` MUST show the 2px `focus-ring` outline; this is not yet implemented in the shipped CSS and MUST be added when this component is rebuilt.

## Accessibility guidelines

- `icon` size buttons MUST carry `aria-label` describing the action (e.g. "Close dialog", "Add task").
- `approve-ghost` MUST be reachable and operable by keyboard as a full-width target, not shrunk to an icon.
- Disabled buttons MUST use the native `disabled` attribute, not a visual-only style, so assistive tech announces the unavailable state.

## Notes

- `primary` and the FAB share the same fill (`bg-brand-default`) and hover mechanism (brightness filter) — treat the FAB as a `primary` button variant with `full` radius and fixed positioning, not a separate component.
- Never combine `approve-ghost` with any size other than its default full-width footer placement.
- `{approve}`'s resolved value is contrast-corrected (`#3e9f2d`, 5.14:1 on `surface-card`) — the raw Figma-sampled `#338225` measured 3.61:1 at this text size/weight and fails WCAG AA. See `primitive-tokens.md`.

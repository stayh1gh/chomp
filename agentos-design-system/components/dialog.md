# Dialog

## Purpose

Modal overlay (shadcn Dialog anatomy) in two forms: a standard centered modal for short forms, and a full-page variant (no Figma frame — built from a Linear issue-page reference) for the run detail view.

## When to use

- `sm`/default sizes: a short, focused form or confirmation (New Task).
- `full` size: a page-level detail view that still behaves like a dismissible overlay over the board (run detail).

## When not to use

- For content that belongs inline in the page — a dialog interrupts; don't use it for supplementary, non-blocking information (use a `side-section` in an existing page instead).

## Properties

```
size:
  sm — 440px max-width. Short forms and confirmations.
  default — 560px max-width. The general case.
  full — full viewport, offset by the sidebar width, no backdrop tint. Page-level content only (currently: run detail).
```

### Token bindings

```yaml
dialog-overlay:
  backgroundColor: 'rgba(0,0,0,0.5)'
  padding: '{spacing.space-24}'
dialog-overlay-full:
  backgroundColor: transparent
  left: 'var(--sidebar-w)'
  padding: 0
dialog-content:
  backgroundColor: '{surface}'
  borderColor: '{border}'
  radius: '{radius.lg}'
  padding: '{spacing.space-24}'
  boxShadow: '0 16px 48px rgba(0,0,0,0.5)'
dialog-title:
  typography: '{heading-sm}'
  textColor: '{ink}'
dialog-description:
  typography: '{caption}'
  textColor: '{ink-muted}'
dialog-close:
  color: '{icon-default}'
  radius: '{radius.md}'
dialog-close-hovered:
  backgroundColor: '{bg-ghost-default-hovered}'
  color: '{ink-strong}'
detail-title:   # full-size variant's page heading, not dialog-title
  typography: '{display}'
  textColor: '{ink}'
detail-topbar:
  backgroundColor: '{surface}'
  borderBottomColor: '{border}'
input-fields:  # shared by input/textarea/select inside a dialog
  backgroundColor: '{bg-input}'
  borderColor: '{border}'
  radius: '{radius.md}'
  textColor: '{ink-strong}'
  typography: '{label}'
```

## States

`open`/`closed` (`data-state` attribute toggles `display`). Inputs inside the dialog follow the standard field states (focus ring on `:focus-visible`). `dialog-close` follows the button `ghost` hover pattern.

## Accessibility guidelines

- MUST trap focus within the dialog while open and return focus to the triggering element on close.
- MUST be dismissible via Escape in addition to the close button and (for `sm`/`default`) a backdrop click.
- The `full` variant, despite dropping the visual backdrop, MUST still behave as a dismissible overlay for keyboard/screen-reader purposes — it is a dialog semantically even though it reads as a page visually.
- Confirm before dismissing if the dialog contains unsaved form input (see `usage-rules.md`).

## Notes

- The `full` variant is a sibling of the base dialog, not a restyle — its own layout (`detail-topbar`, `detail-body`, `detail-side`) is documented here but composed from `card`/`badge`/`prop-row` primitives elsewhere, not new tokens.
- `detail-body` caps at 1120px total width (720px content + 320px side rail) and centers as one unit on wide viewports — a structural constant, not a spacing-scale value.

# Toast

## Purpose

A bottom-left transient message confirming or reporting the result of an action (settings save, task creation).

## When to use

- Confirming a completed async action that doesn't need the user's further attention.
- Reporting a non-blocking error from an action just taken.

## When not to use

- For anything requiring a user response — use a dialog.
- For a persistent status (e.g. an ongoing run's state) — that belongs on the card/badge, not a toast.

## Properties

```
variant:
  default — confirmation. surface-card background, standard border.
  error — action failed. Dedicated danger border/text pair (toast-danger-border/ink — not the flat `danger` token; chosen for readability on the dark toast surface).
```

## Token bindings

```yaml
toast:
  backgroundColor: '{surface-card}'
  borderColor: '{border-strong}'
  radius: '{radius.lg}'
  textColor: '{ink-strong}'
  typography: '{label}'
toast-error:
  borderColor: '{toast-danger-border}'
  textColor: '{toast-danger-ink}'
toast-shown:
  opacity: 1
  transition: 'opacity 0.2s'
toast-hidden:
  opacity: 0
  pointerEvents: none
```

## States

`hidden` (default, opacity 0, no pointer events) / `shown` (`.show` class, opacity 1). No `hover`/`focus` — toasts are not interactive.

## Accessibility guidelines

- MUST be marked `aria-live="polite"` for the default variant and `aria-live="assertive"` for `error`, so it's announced without requiring focus to move — not currently implemented in the shipped markup; required when this component is rebuilt.
- MUST auto-dismiss after a reasonable delay (do not require a manual close for routine confirmations) but MUST NOT auto-dismiss error toasts before the message can reasonably be read.

## Notes

- Fixed bottom-left position is deliberate — the FAB occupies bottom-right, so the two never overlap. Keep this pairing if either position changes.

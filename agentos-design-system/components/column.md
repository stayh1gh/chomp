# Column

## Purpose

One board lane: header (icon, label, count, hover-revealed actions) plus a scrollable stack of `components/card.md` instances.

## When to use

- One instance per column declared in `flow.yaml`, in its declared order.

## When not to use

- As a generic "list container" elsewhere — its header anatomy (icon + count + hover actions) is board-specific; a plain list belongs in `usage-rules.md`'s other patterns, not this component.

## Properties

```
state:
  default — resting.
  hover — reveals column-actions (opacity 0 → 1); no background change on the column itself.
  empty — column-cards contains only the `column-empty` placeholder message.
```

## Token bindings

```yaml
column:
  width: 'var(--column-w)'   # 348px, structural constant
column-inner:
  radius: '{radius.sm} {radius.sm} 0 0'
  background: 'linear-gradient(to bottom, rgba(9,9,10,0.4) 0%, rgba(9,9,10,0.1) 100%)'
column-heading:
  typography: '{caption-strong}'
  textColor: '{ink-strong}'
column-count:
  typography: '{caption}'
  textColor: '{ink-subtle}'
column-actions:
  opacity: 0
column-actions-visible:   # on .column:hover or :focus-within
  opacity: 1
column-empty:
  typography: '{caption}'
  textColor: '{ink-disabled}'
```

## States

`default`, `hover` (reveals header actions only — see Token bindings), `empty` (content state, not an interaction state).

## Accessibility guidelines

- `column-actions` MUST remain reachable via `:focus-within`, not `:hover` alone (already implemented — preserve this when touching the CSS).
- Each column's `h2` heading MUST stay a real heading element (not a styled `div`) so screen-reader users can navigate the board by column via heading navigation.

## Notes

- The gutter math (`board` padding-left 4px + each `column`'s own 4px inset) reproduces an 8px visual gutter between the panel edge and the first column — do not simplify this to a single 8px padding without checking the first-column alignment against the panel edge.

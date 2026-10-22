# Select

## Purpose

A native `<select>` restyled with a custom chevron — the only form control in the system beyond dialog text inputs. Used exclusively today in the Agents settings pane to pick a model/reasoning tier per agent.

## When to use

- Choosing one value from a small, known, enumerable set (a model name, a reasoning-effort tier).

## When not to use

- More than ~8-10 options or when the user needs to search — this system has no combobox/searchable-select component; don't fake one by overloading `<select>`.

## Properties

```
size: single size only — 32px height, 148px min-width. No variants shipped.
state:
  enabled — default.
  disabled — 0.55 opacity, no pointer events (distinct opacity value from buttons' 0.5 — matches the shipped CSS exactly, do not normalize to 0.5 without checking contrast at 0.55 first).
```

## Token bindings

```yaml
select:
  backgroundColor: '{bg-input}'
  borderColor: '{border-strong}'
  radius: '{radius.md}'
  textColor: '{ink-strong}'
  typography: '{label}'
  chevronColor: '{ink-muted}'
select-hovered:
  borderColor: '{border-strong-hovered}'
select-focused:
  outline: '{focus-ring}'
  outlineWidth: '{borders.width-focus}'
  outlineOffset: '{borders.focus-offset}'
select-disabled:
  opacity: 0.55
  pointerEvents: none
```

## States

`default`, `hover` (border only, no background change), `focus-visible` (the system's one shipped focus-ring implementation — use this as the reference when adding focus states elsewhere), `disabled`.

## Accessibility guidelines

- MUST be paired with a visible `label` (the `setting-label` it sits beside) — never rely on placeholder-style option text as the only label.
- The custom chevron is decorative (`background-image`, not an `<svg>` in the accessibility tree) — no `aria-hidden` needed since it's a CSS background, but do not convert it to an inline SVG without adding `aria-hidden="true"`.

## Notes

- This is the only component in the system with a fully implemented, spec-correct focus ring today — copy its `select-focused` binding verbatim onto Button and Dialog-close when those are rebuilt, rather than re-deriving it.

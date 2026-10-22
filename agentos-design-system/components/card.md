# Card

## Purpose

The board's primary content unit (shadcn Card anatomy, restyled) — one run per card, its sub-tasks, tags, and an optional Approve footer.

## When to use

- Representing one board item inside a column.
- Any future list of similarly-shaped items that benefits from the same title/meta/description/tags/footer anatomy (do not fork a new card-like component for that — extend this one's slots).

## When not to use

- As a generic content box — that's what `surface-card` alone (without the card's specific padding/slot structure) is for. A `setting-row` uses the same background token but is not a Card instance.

## Properties

```
footer:
  true — renders the Approve footer with the divider rule; padding-bottom drops to 0 to let the footer sit flush.
  false — default. No footer, standard 12px vertical padding all around.
```

### Token bindings

```yaml
card:
  backgroundColor: '{surface-card}'
  radius: '{radius.lg}'
  boxShadow: '0 0 0 0 rgba(255,255,255,0.05), 0 0.5px 1px 0 rgba(0,0,0,0.3)'
  paddingBlock: '{spacing.space-12}'
card-hovered:
  boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 0.5px 1px 0 rgba(0,0,0,0.3)'
card-title:
  typography: '{title}'
  textColor: '{ink}'
card-meta:
  typography: '{caption}'
  textColor: '{ink-muted}'
card-description:
  backgroundColor: '{surface-inset}'
  radius: '{radius.lg}'
  padding: '{spacing.space-8}'
card-description-text:
  typography: '{caption}'
  textColor: '{ink-body}'
  lineClamp: 4
card-footer:
  borderTopColor: '{divider}'
```

## States

`default`, `hover` (adds a 1px inset ring — see `card-hovered` above; does not change background). No `focus`/`disabled` state — the card itself is not a focus target, its contents (title link, Approve button) are.

## Accessibility guidelines

- The card's clickable area (opens the run detail page) MUST be reachable by keyboard, not mouse-only — wrap it in a real interactive element (link or button) rather than a `div` with only a click handler.
- `card-description`'s 4-line clamp MUST NOT be the only way to read the full description — the full, unclamped text is available on the run detail page this card links to.

## Notes

- `card-description` is the only place `surface-inset` is used — do not reuse that token for a second nested box inside the same card.
- The Approve footer is a `components/button.md` `approve-ghost` instance, not a card-specific button style.

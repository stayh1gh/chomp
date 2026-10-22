# Badge

## Purpose

A non-interactive status pill (shadcn Badge anatomy, restyled). Communicates run/step state or metadata inline on a card or in the run detail sidebar — never a control.

## When to use

- Showing a card or sub-task's live status (Running, Waiting for User, Waiting for Approval, Done).
- Tagging metadata that isn't a status but still deserves a labeled chip (outline variant: model name, gate number, a warning note).

## When not to use

- As a clickable filter or toggle — badges have no interactive states (see `states.md`); use a button or select for anything the user acts on.
- For a status not in the defined variant set — add a new variant deliberately (with a token pair in `semantic-tokens.md`) rather than approximating with an existing color.

## Properties

```
variant:
  running — the Running status only. Solid success fill.
  approval — the Waiting for Approval status only. Solid danger fill.
  user — the Waiting for User status only. Solid warning fill.
  done — the Done status/ring only. Solid brand fill — the one non-status use of brand.
  outline — generic metadata with no dedicated status color. Default choice for anything else.
  gate — marks a step as one of the 4 numbered human gates. Always paired with the gate number.
  warn — a non-blocking caution note (e.g. an agent config gap). Distinct from the `user`/`approval` statuses.
  model — names the model/agent tier a step is running under.
```

## Token bindings

```yaml
badge-running:  { backgroundColor: '{bg-badge-running}',  textColor: '{ink-on-status}' }  # not ink-inverse — see Notes
badge-approval: { backgroundColor: '{bg-badge-approval}', textColor: '{ink-on-status}' }
badge-user:     { backgroundColor: '{bg-badge-user}',     textColor: '{ink-on-status}' }
badge-done:     { backgroundColor: '{bg-badge-done}',     textColor: '{ink-inverse}' }   # white — passes on brand only
badge-outline:  { backgroundColor: '{bg-badge-outline}', borderColor: '{border-badge-outline}', textColor: '{ink-badge-outline}', fontWeight: 400 }
badge-gate:     { backgroundColor: '{bg-badge-gate}',  textColor: '{ink-badge-gate}',  height: 20px, fontWeight: 400 }
badge-warn:     { backgroundColor: '{bg-badge-warn}',  textColor: '{ink-badge-warn}',  height: 20px, fontWeight: 400 }
badge-model:    { backgroundColor: '{bg-badge-model}', textColor: '{ink-badge-model}', height: 20px, fontWeight: 400 }
common:
  radius: '{radius.pill}'
  typography: '{caption-strong}'
  height: 24px   # gate/warn/model override to 20px
  paddingInline: '{spacing.space-8}'
```

## States

None. Badges are non-interactive and define no `hover`/`focus`/`disabled` state.

## Accessibility guidelines

- Never the sole carrier of status — the label text inside the badge (not just its color) is the accessible signal; do not ship a color-only variant.
- `outline` variant's border MUST remain visible (not just a color fill) since it's the low-contrast variant — do not drop `border-badge-outline` for a flatter look.

## Notes

- `running`/`approval`/`user`/`done` are mutually exclusive per card — a card shows exactly one status badge at a time.
- `gate`/`warn`/`model` are additive metadata and can appear alongside a status badge in `card-tags`.
- `running`/`approval`/`user` use `ink-on-status` (near-black), not the usual `ink-inverse` (white) — white text fails WCAG AA (2.2–3.3:1) on the green/orange/red fills; `ink-on-status` clears 6–9:1. `done` is the one variant that keeps white, since it clears 4.5:1 on the darker indigo fill. This was a real contrast bug in the original Figma-sampled design, fixed during token generation — see `primitive-tokens.md`.

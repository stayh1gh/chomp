# Interactive states

How each state changes tokens visually. No hex — token names only (see `semantic-tokens.md`). This is a pointer-driven desktop surface: `hover` is the primary feedback channel, and there is no `pressed` state distinct from `active` shipped anywhere today (add one only if a component genuinely needs it).

## default

The component's resting appearance as bound in its `components/<name>.md` recipe. All borders are `border-default` (1px) unless the component's recipe says otherwise.

## hover

Applied via `:hover`, transition `background-color 0.1s, color 0.1s` (buttons) or no transition (links, static swaps). Three distinct mechanisms are in use — a component's recipe states which:

1. **Token swap** — background moves from a `-default` token to a dedicated `-hovered` token (`bg-secondary-default` → `bg-secondary-default-hovered`, `bg-ghost-default` → `bg-ghost-default-hovered`, sidebar item background, select/file-chip border `border-strong` → `border-strong-hovered`).
2. **Brightness filter** — `filter: brightness(1.1)` over the existing fill, no token change (primary button, FAB). Used only where the filled surface is already the brand color and a literal lighter token would drift from it.
3. **Overlay tint** — a semi-transparent color laid over the existing surface (`bg-approve-ghost-hovered`, the only true overlay tint in the system). Prefer this pattern over (1) for any new hover state on a transparent/ghost-background component.

Cards use hover to gain, not change, a ring: `box-shadow: 0 0 0 1px rgba(255,255,255,0.08)` appears on top of the resting elevation shadow. This is the one hover effect that is not a color-token change.

## focus

`:focus-visible` only (not `:focus`) gets a 2px `focus-ring` (brand-colored) outline, offset 1px from the element edge. Applies to the select and any future keyboard-operable control. MUST NOT be suppressed without a replacement — see `accessibility.md`.

## active

Not separately defined in the shipped CSS beyond `cursor: pointer`/`cursor: default` — components rely on hover + the resulting action (dialog open, navigation) rather than a distinct pressed visual. Do not invent one; if a future component needs press feedback, add a `-pressed` token pair following the hover pattern above rather than reusing `:active` browser defaults.

## disabled

`pointer-events: none; opacity: 0.5` on the element (buttons, selects). Text-only disabled states (column-empty, unset subtask dot) instead use the dedicated `ink-disabled` token directly rather than opacity, since they are never interactive to begin with.

## error

Used only in two places, both status-communication rather than form validation (this system has no form-field-level validation yet): `settings-status[data-state="error"]` sets text to `danger`; `toast.error` sets border to `toast-danger-border` and text to `toast-danger-ink` (a dedicated darker/lighter red pair, not the flat `danger` token, chosen for readability on the dark toast surface).

## success

`settings-status[data-state="ok"]` sets text to `success`. No other success-state surface exists yet.

## loading

Not implemented in the shipped UI. `usage-rules.md`'s Loading & feedback rules apply if/when async affordances (settings save, task creation) grow a loading indicator — disable the triggering control and prefer a spinner past ~300ms rather than adding a new token tier ad hoc.

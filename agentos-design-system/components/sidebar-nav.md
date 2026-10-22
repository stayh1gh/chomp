# Sidebar nav

## Purpose

The fixed 220px left rail (shadcn Sidebar anatomy): brand mark, a 5-item nav list (only "Tasks" is a live route today), and a footer disclosure.

## When to use

- The one persistent app-level navigation surface. There is exactly one instance per page render.

## When not to use

- As a pattern for any secondary/contextual navigation (e.g. within the run detail page) — that page uses `detail-breadcrumb` instead, not a second sidebar.

## Properties

```
item state:
  active — the current route (only "Tasks" today). Brighter label color, deliberately no pill/background — a static design frame had no current-page variant to draw from, so this is a considered minimum rather than an incomplete implementation.
  inert — the four not-yet-built routes (Skills, Agents, Context, Connectors) render as non-interactive spans with the same visual treatment as a link, minus the href — never present an unbuilt page as a working link.
  default — a real, navigable, non-active item.
```

## Token bindings

```yaml
sidebar:
  width: 'var(--sidebar-w)'   # 220px, structural constant
  padding: '26px 12px 0'
sidebar-logo:
  backgroundColor: '{accent-tile}'
  radius: '{radius.lg}'
  size: 32px
sidebar-item:
  textColor: '{ink-nav}'
  typography: '{nav-item}'
  radius: '{radius.lg}'
  height: 40px
sidebar-item-hovered:
  backgroundColor: '#141415'   # sampled, one-off — not reused elsewhere
  textColor: '#d8d8da'          # text.text-2
sidebar-item-active:
  textColor: '{ink-strong}'
sidebar-note:
  textColor: '#46464a'   # sampled, one-off — deliberately below ink-disabled for a near-invisible disclosure
  typography: '{nano}'
```

## States

`default`, `hover` (real links only — inert items have no hover state since they carry no `href`), `active` (current-route only, applied at render time, not by interaction). No `focus` ring currently implemented — required when rebuilt (see `accessibility.md`).

## Accessibility guidelines

- Inert nav items (no working route yet) MUST NOT be rendered as `<a>` tags with a dead `href` — keep them as non-interactive elements exactly as shipped, so assistive tech doesn't announce them as broken links.
- The active item MUST be identifiable to screen readers (e.g. `aria-current="page"`), not by color alone.

## Notes

- The brand mark (`sidebar-logo`) is purely decorative branding, not a control — it MUST NOT be wrapped in a clickable element that implies a home-navigation action unless that's an intentional future addition.

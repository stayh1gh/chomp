# Chomp Dashboard — Design System

- **Project:** Chomp Dashboard (the Kanban board at `harness/dashboard/`)
- **Product / platform:** web app, desktop-first, single-column fallback ≤900px, no dedicated touch layer
- **Font:** Inter (system sans fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`)
- **Figma file:** `figma.com/design/sM9waRlCvYsI8tNcB8TQrp`, node `1:12996` ("Kanban") — the original source of every measurement/color extracted into this knowledge base
- **Build source:** `codebase` — this knowledge base formalizes an already-implemented design language (the `STYLE` CSS template string and header comment in `harness/dashboard/index.mjs`), not a fresh design
- **Dark mode:** `yes` (dark-only — `color-scheme: dark`, no light theme exists or is planned)

## Tech stack

The existing dashboard itself is plain server-rendered HTML/CSS/vanilla JS with **no frontend framework or build step** (`package.json` has no React/Vue/Tailwind — only `js-yaml`, `minimatch`, `pixelmatch`, `playwright`, `pngjs`). This design system's downstream phases (`generate-tokens`, `build-components`, `generate-documentation`) scaffold a **separate** React + TypeScript + Vite + Tailwind 4 + Vitest project inside this same `agentos-design-system/` directory, producing a documented, reusable component catalog and an internal DS Viewer (no Storybook). That scaffolded project does not replace `harness/dashboard/index.mjs` — it is the reference implementation of the tokens and components this file documents; wiring it back into the live dashboard renderer (or migrating the renderer to consume it) is a separate, later decision, not assumed here.

## Entry point for agents

`DESIGN.md` is the self-contained hub — resolved YAML tokens (colors, typography, spacing, radius, icon sizes) plus RFC 2119 prose and the "what to load when" file map. Every other file in this directory is loaded only for the specific task it names.

## Component catalog

Full catalog (everything currently implemented in the shipped dashboard, all built as part of this pass — this system formalizes an existing UI rather than picking a "default subset" of a new one):

`Button, Badge, Card, Dialog, Select, Toast, Sidebar Nav, Column`

Not yet part of the catalog (present in the shipped markup but too structural/singular to treat as a reusable component — documented instead as layout patterns in `usage-rules.md`): the app shell/panel, the settings pane, the run-detail page's `prop-row`/`phase-group`/`file-chip` sub-patterns, and the FAB (documented as a `Button` `primary` variant, not a separate component).

## Progress

| Phase | Status | Approved | Date |
|---|---|---|---|
| design-md | done | — | 2026-08-21 |
| generate-tokens | done | approved | 2026-08-21 |
| tokens-to-figma | pending | — | — |
| build-components | in progress (awaiting gallery approval) | pending | 2026-08-21 |
| generate-documentation | pending | — | — |
| components-to-figma | pending | — | — |
| ds-publish | pending | — | — |

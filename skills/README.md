# Skills

A skill is method: `skills/<agent>/<skill>/SKILL.md`, named in that agent's frontmatter
(`skills: [...]`) and inlined into its prompt at dispatch.

**A skill reads the profile; a skill never names a project.** Repo paths, Figma files,
design-system locations and commands come from `profiles/<name>.yaml`. A skill that
hardcodes a project's paths or product language is a bug.

## The skill-sourcing protocol (the crivo)

No skill is built, adapted, or sourced — from this repo, `~/.claude/skills`, or the
internet — without Bruno ruling on it individually first:

| Verdict | What happens next |
|---|---|
| **Search** | Look online for an existing skill. Report what was found before adopting anything. |
| **Create** | Write it from scratch for Chomp. |
| **Adapt** | Rework a specific existing skill Bruno names. |

Never default to an existing skill because its name matches, and never search the
internet for one unless told to, for that skill.

## Current skills

| Agent | Skill | Ruling |
|---|---|---|
| planner | `write-spec` | Adapt — Chomp grill-me + format-spec (2026-10-13) |
| planner | `plan` | Adapt — Chomp create-plan (2026-10-13) |
| planner | `research-mobbin` | Adapt — Chomp internal-pattern-search + reference-research (2026-10-13) |
| designer | `figma-ds-lint` | Create — the DS contract + `harness/figma/ds-lint.js` (2026-10-13) |
| designer | `figma-taste` | Adapt — [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) v2 (MIT), composition and critique only; no scripts, palettes, type, imagery or motion (2026-10-22) |
| designer | `figma-design-ui` | Adapt — Chomp generate-ideas, information-architecture, draft-surface, figma-page-scaffold, constrain-to-library + Figma's figma-generate-design (2026-10-13) |
| designer | `figma-states` | Adapt — Chomp flow-and-states, generate-prototype (2026-10-13) |
| builder | `build-from-figma` | Adapt — Chomp component-handoff, implement, tdd, code-review, build-components-from-manifest, ds-conventions, run-lint, run-tests, create-pr + Figma's figma-design-to-code (2026-10-13) |

Figma's own `figma-use` / `figma-generate-design` skills aren't copied here: the designer
reads them from the Figma MCP server (`skill://figma/...`) so they always match the server.

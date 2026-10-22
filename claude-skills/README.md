# claude-skills — Claude Code skills, not chain-stage skills

Everything here is a real Claude Code skill (`SKILL.md`, discovered by name/description,
never named in an agent's `skills:`) that shapes how Claude itself communicates while
working *on* a profile-bound repo — not a step in the design → frontend pipeline. That's
the line that separates this directory from `skills/`: a `skills/<agent>/<name>/SKILL.md`
reads the active profile and is inlined into an agent's prompt; a `claude-skills/<name>/`
skill takes no profile input.

Default-on for every profile-bound repo: symlinked per-directory into this repo's own
`.claude/skills/`, and into a bound repo's `.claude/skills/`, so it applies to
Claude sessions in either repo.

| Skill | Source | License | Notes |
|---|---|---|---|
| `stop-slop` | [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) (via [skills.sh](https://www.skills.sh/hardikpandya/stop-slop/stop-slop)) | MIT | Vendored unchanged. |

`caveman` (JuliusBrussee/caveman) was tried and dropped as default-on, 2026-08-26 —
Bruno's call. Not in this directory.

Sourced under the skill-sourcing protocol in `skills/README.md` (verdict: Adapt, Bruno,
2026-08-26) even though that protocol's directory-shape rule targets `skills/`, not this
directory — the same "no adoption without a ruling" principle applies here too.

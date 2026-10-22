# Chomp — agent map

Chomp takes a request from the board's owner (`settings.owner`, "you" below and `{{owner}}`
in prompts) to a designed-in-Figma, built-in-code draft PR on one board. A **profile**
binds it to one project; new ones start from `profiles/example.yaml.template`
(profiles are yours: gitignored). Glossary: `CONTEXT.md`.

## The flow (`flow.yaml`)

```
Plan ──auto──▶ Ideation ──auto──▶ Designing ──you──▶ Refinement ──you──▶ Development ──you──▶ Draft PR ──you──▶ Done
planner        designer           you, in Figma      designer             builder                builder
```

- Entering an agent column starts that column's agent. Plan and Ideation hand off on their
  own; Refinement, Development and Draft PR stop at **Ready** and wait for the owner.
- Development builds and ends with `qa.md` (screenshots of every state) and no PR. The owner
  reviews it, then moves the card to Draft PR, where the builder opens the draft PR.
- Only the owner moves a card out of Designing, Refinement, Development, Draft PR or Done — agents and
  any session driving Chomp stop there, even on test tasks. They alone open a PR for review
  (the task panel's "Open PR for review") or deletes a task (to `board/trash`).
- Each task has one chat. Agents ask questions there (planner: one round, at most 5);
  the owner's messages go to the column's agent, resuming its session.

## Where things live

| Path | What |
|---|---|
| `flow.yaml` | Columns, their agent, checklist steps, required MCP servers |
| `settings.yaml` | Yours (gitignored; `settings.example.yaml` until saved): owner name, active profile, Claude account, model version + effort per agent |
| `profiles/<name>.yaml` | Repo, Figma library + work file + reference pages, DS paths, commands, viewports, `design_requirements`, `app_reference` |
| `agents/<name>.md` | One agent per role. Frontmatter: `tools`, `skills`, optional `writes`, optional `bash` allowlist |
| `skills/<agent>/<skill>/SKILL.md` | Method, inlined into the agent's prompt at dispatch |
| `board/store.mjs` | The only writer of `board/tasks/<id>/{task.yaml,chat.jsonl}` |
| `harness/runner/` | Picks work, pre-flight, dispatch, guard, turn-result contract |
| `harness/figma/` | The DS lint (`ds-lint.js`) and the runner's independent run of it; the DS cheat sheet (`cheatsheet.mjs`) |
| `harness/qa/` | Screenshots: the real app (`app-reference.mjs`) and visual QA (`capture.mjs`) |
| `harness/dashboard/` | Board server (`serve.mjs`: `agentos serve`, or the Chomp desktop app) and its UI, `web/` (React + shadcn/ui, built on start) |
| `schemas/` | `task` and `turn-result` contracts |

## Hard rules (enforced by `harness/runner/guard.mjs`, not by prompt)

1. Agents never write the board. They may write only their task folder's top-level
   documents and their declared `writes` roots; `task.yaml` and `chat.jsonl` are the runner's.
2. Questions go in the turn result (`needs_input`), never `AskUserQuestion`. An agent with a
   `bash:` allowlist (the designer) runs only those commands, unchained.
3. Never push to, force-push, or merge `main`/`master`. PRs are created with `--draft`;
   only the owner marks one ready or merges it.
4. `use_figma` runs only on the profile's `figma.work_file`; the library is read-only and
   never published. Designs use library instances bound to library variables and styles;
   a missing component becomes a `⚠ Missing: <Name>` placeholder, never a lookalike.
5. Code is written only in the task's own git worktree (`agentos/<task id>`, cut from the
   base branch on origin), which the runner creates and removes when the card reaches Done.
6. A design leaves its column only when the runner's own DS lint
   (`harness/figma/ds-lint.js`, run independently of the designer) reports 0 errors; Ready
   to review only when `gh pr view` confirms a draft PR from the task branch to the base branch.

The profile's `design_requirements` are the project owner's standing rules (e.g.
look at the real app first, latest layouts, full pages with the app chrome).
Every agent treats them as mandatory, and the lint enforces the full-page part.

## Writing skills

A skill reads the profile; it never names a project, repo path or product term. No skill
is built, adapted or sourced without the owner ruling search / create / adapt on it
(`skills/README.md`).

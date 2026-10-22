# Chomp glossary

**Task / card**: one request on the board, stored as `board/tasks/<id>/` — `task.yaml`
(where it is and what it's doing), `chat.jsonl` (its chat), and the agents' documents.
Each card has an ID people use, `<id_prefix>-<n>` (e.g. AOS-12), from a board-wide counter
that never reuses a number.

**Column**: a stage of the flow, declared in `flow.yaml`. An *agent column* is worked by
one agent; a *human column* (Designing, Done) waits for the owner.

**Checklist / progress line**: the up-to-5 steps of the card's current column
(`steps` in `flow.yaml`). A step ticks when its file is written, its tool is first called,
or the column's verify passes, and each tick posts a "✓ <step>" line in the chat.

**Status**: where a card stands inside its column — `queued` (agent about to start),
`working`, `needs_input` (questions in the chat), `ready` (agent finished; the owner moves it),
`blocked` (see Blocker), `idle` (human column), `paused` (the owner paused it from the card;
the runner skips it until Start, which resumes an interrupted run's session).

**Blocker**: why a card can't proceed. `connection` (a Claude login or MCP server is
missing) and `missing_agent` recheck every minute and clear on their own; `agent` (the
agent asked for something) clears when the owner replies in the chat; `error` waits for Retry.

**Turn result**: the fenced json block every agent turn ends with
(`schemas/turn-result.schema.json`) — `done`, `needs_input` with questions, or `blocked`.
The runner, never the agent, turns it into card state and chat messages.

**Edit**: a chat message on a card in a human column with a `chat_agent` — the agent makes
that one change and the card stays put.

**Pre-flight**: before every dispatch the runner checks the agent exists and the column's
`requires_mcp` servers are connected for the task's Claude account.

**Profile**: `profiles/<name>.yaml`, the one file that binds Chomp to a project: repo,
Figma library, work file and reference pages, design-system paths, commands, viewports,
constraints, design requirements and the app reference. It can also name the `account` its
tasks run as and narrow the `task_kinds` it takes (`[design]` for a design-only project). The owner
picks the profile per task in the New task dialog.

**Design system (library)**: a profile covering several products lists one Figma library per
product under `figma.libraries` (e.g. a web app and a newsroom tool), each with its own
work file, docs and viewports. Each task picks one (`library` on the card); the runner folds
it into the profile it hands the agents, so they only ever see that library and work file.

**Task type**: `full` (designed in Figma, then built in Development and opened as a draft PR
in Draft PR) or `design` (design only — ends after Refinement, never reaches Development). Columns declare the types they
serve with `kinds` in `flow.yaml`; a card can't be moved into a column outside its type.

**Standing rules**: `standing_rules` in `flow.yaml` — the owner's rules for every project,
whatever the profile (always design with the Figma library's components, variables and
styles). The runner puts them in every dispatch, ahead of the profile's own rules.

**Design requirements**: the project owner's standing design rules, in the profile
(`design_requirements`). Mandatory for every agent; they win over a skill's defaults.

**App reference**: how agents see the real app — the profile's `app_reference` (e.g. a dev
gallery that renders shipped screens in the real shell), served by
`harness/qa/app-reference.mjs` from a worktree pinned to the base branch.

**Owner**: the person running this board — `owner` in `settings.yaml`, set in Settings → You.
Prompts, agents and skills say `{{owner}}`; the runner fills in the name at dispatch.

**Account**: the Claude login agents run as — a directory under
`~/.local/share/claude-profiles/`, or `default` for `~/.claude`. MCP servers (Mobbin,
Figma) must be connected on that account.

**DS lint**: `harness/figma/ds-lint.js`, the mechanical check that a task's Figma page uses
only library instances bound to library variables and styles, with a full page at the
viewports the column needs (Ideation: the profile's primary viewport; Refinement: every
one). The runner runs it itself after each design pass; errors go back to the designer.

**Primary viewport**: the profile viewport marked `primary: true` (else the only or the
widest). Ideation draws only it; every other viewport gets its own `<section> — <width>`
sections on the task page ("Final — 390"), filled in Refinement.

**DS cheat sheet**: `board/cache/ds/<library_file>.md`, a compact map of a Figma library's
component keys, variant and property names, and variable and style keys, built by
`harness/figma/cheatsheet.mjs` and named in every designer dispatch.

**Worktree**: the task's own git checkout (`<repo>/.claude/worktrees/agentos-<id>`, branch
`agentos/<id>`, cut from the base branch on origin). The builder's only place to write code.

**Visual QA**: what Development ends with — `qa.md`, the app's screenshots of every state at
every viewport next to the Figma frames. The owner reviews it before any PR exists.

**Draft PR**: what the Draft PR column ends with, once the owner approved the visual QA. The runner
verifies it's a draft from the task branch; only the owner opens it for review.

**Trash**: `board/trash/` — where a deleted task's folder goes, recoverable by moving it back.

**The crivo**: the skill-sourcing protocol in `skills/README.md` — the owner rules search,
create or adapt on every skill before it's written.

# Chomp

A local board for product designers: a request becomes a spec, a plan, Mobbin research, a
Figma design built from your design system, and finally a draft PR. Claude agents do the
legwork; you step in to pick a direction, refine it, review it, and decide when the PR opens.

```
Plan ──▶ Ideation ──▶ Designing ──▶ Refinement ──▶ Development ──▶ Draft PR ──▶ Done
planner   designer     you, in Figma  designer       builder          builder
```

## What's new

**October 26, 2026**

- **A tighter board.** Text is 14px and buttons are 36px tall. Cards and lanes have less padding,
  and lanes stop at 268px wide instead of stretching across the screen.
- **A roomier chat.** Messages sit in a centered 720px column at 16px, with more space between
  them. The name and date above each message are gone; "Not read yet" still marks yours.
- **Shorter agent updates.** When an agent finishes a step, it says what's done first, lists
  what you need to see, and puts caveats last.
- **Daily Recap:** long project names end in "…" instead of wrapping.

## Set it up

You need a Mac, [Claude Code](https://claude.com/claude-code) with a Claude subscription, a
Figma design system, and a [Mobbin](https://mobbin.com) account. Open Claude Code in the
Terminal and paste:

```
Set up Chomp on my Mac from https://github.com/stayh1gh/chomp
```

Claude installs everything and asks you a few questions about your project. You only sign in
to Mobbin, Figma and (for code) GitHub in your browser. [GETTING-STARTED.md](GETTING-STARTED.md)
explains what happens and how to use the board.

> **Claude Code, setting this up for someone:** clone this repo to `~/chomp`, then read and
> follow `.claude/skills/setup-chomp/SKILL.md` there, step by step.

Each task has a chat in the bottom-right corner: agents ask questions and report there, and
anything you write goes to the agent working that column.

Ideation is kept short so you can pick fast: 10–14 Mobbin references (plus current-app
captures) on the page, and 2–3 directions at the profile's `primary` viewport, each
drawing what you asked for: one screen, or every step of a flow's main path. Refinement then takes the direction you put in `Final` to every
viewport and surface, with its flows and states. Each non-primary viewport has its own
sections next to the primary one's (`Final` · `Final — 390` · `Flows & states` ·
`Flows & states — 390` · `Notes`).

## Run it

```bash
npm ci
npm run serve          # board + runner at http://127.0.0.1:4400
npm test
npm run test:web       # the board UI's tests
```

Or open the **Chomp** desktop app (`desktop/`), which starts the same server. The app runs
this checkout on `main` and pulls `main` each time it starts the server, so keep this
checkout on `main` and do branch work in worktrees (it warns when the checkout is elsewhere).

The board UI is `harness/dashboard/web/` (React, Vite, Tailwind, shadcn/ui). The server
installs its packages and builds it on start whenever the build is missing or older than its
sources, so a pull needs nothing extra. To work on it with hot reload:
`npm --prefix harness/dashboard/web run dev` (http://127.0.0.1:4403, no runner).

## Before the first task

The agents run as the Claude account in **Settings → You** (`default` is `~/.claude`; named
accounts are claude-profile folders in `~/.local/share/claude-profiles`). That account
needs a valid login and the Mobbin and Figma MCP servers — the board's **Connections**
page shows what's missing and the exact command to fix it. Cards wait, blocked, until
the connection exists, then continue on their own.

Google Drive (`gdrive`) is optional: with it, agents read Google Docs, Sheets and Slides
links. The easy way is the Google Drive connector at claude.ai → Settings → Connectors,
on the claude.ai login the account uses: agent runs load claude.ai connectors. Or add it
as `gdrive` with your own OAuth client (Google Cloud: enable the Google Drive API, create
an OAuth client ID of type *Desktop app*), using the command Connections shows, then sign
in through `/mcp`.

## Layout

`flow.yaml` (columns) · `settings.yaml` (yours, gitignored; defaults in `settings.example.yaml`) ·
`profiles/` (one per project; template `profiles/example.yaml.template`) · `agents/` + `skills/` ·
`board/` (tasks and the store) · `harness/runner/` · `harness/dashboard/` · `schemas/`.
Also `harness/figma/` (the DS lint and the DS cheat sheet) and `harness/qa/` (app and QA
screenshots).

The DS cheat sheet is a map of a profile's Figma library (component set keys, variant and
property names, variable and style keys by name) that the runner builds the first time a
designer works with that library, caches in `board/cache/ds/<library_file>.md` for a week,
and names in every designer dispatch. Rebuild it by hand with
`node harness/figma/cheatsheet.mjs --profile <name> [--library <id>] --refresh`.
See `AGENTS.md` for the rules agents work under and `CONTEXT.md` for the vocabulary.

## Settings

**You** sets your name (agents address you by it: prompts say `{{owner}}`), the Claude account
agents run as, and the project new tasks start in. Per project (a tab each): how many agents run
at once, each agent's model (exact versions — Opus 5.5 by default) and effort, the assistant's
model, and the Figma task page's colors. A task can be deleted from its panel;
it moves to `board/trash`, and its Figma page, branch and PR are left alone.

## Phone chats

Turn on **I'm AFK** in the sidebar and a task that stops because it needs you (the agent
has questions, it's stuck, a step finished and waits for you, or the card reached Designing)
opens a chat about it in the Claude app ("AOS-12 · Vault page", under Code). The chat sends a
notification and explains in plain words what's needed. Answer there and the agent carries
on: it can answer questions, pass on instructions, and retry, pause or start the card, but it
can't move cards or open PRs. Each stop opens a new chat that carries on from the last one;
nothing runs in between. The account needs a claude.ai login and has to trust this folder
(Connections shows the fix). `node cli/agentos.mjs companion start|stop|status AOS-2` drives
one card by hand. Code: `harness/companion/`.

## Slack

Settings → Notifications → **Notify me via: Slack** sends those same stops as a Slack DM
instead, one thread per card. Reply in the thread and an assistant with the phone chat's
tools and limits passes it on; Retry, Pause and Start are buttons on the message. It uses
Socket Mode, so no public URL: it runs while the board does. Setup, once: at
api.slack.com/apps create an app from `harness/slack/manifest.yaml`, generate an app-level
token (scope `connections:write`), install it, then paste the `xapp-` and `xoxb-` tokens
and your member ID (Slack profile → ⋯ → Copy member ID) in Settings. They're kept in
`board/.slack.json` (gitignored); only your messages and clicks count. The assistant runs
as the task's account with that account's assistant model. Code: `harness/slack/`.

## Status

Working: planner, designer (runner-enforced DS lint, real-app
references, full pages) and builder (worktree per task, the repo's checks, visual QA
against Figma for your review, then the draft PR once you move the card to Draft
PR). Only you open a PR for review, from the task's panel.

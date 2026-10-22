# Claude instructions — Chomp

## Setting up

When someone asks to set up, install or start using Chomp, add a project, or there's no
`profiles/*.yaml` yet, follow `.claude/skills/setup-chomp/SKILL.md` (also `/setup-chomp`).
"Start Chomp" means run `npm run serve` in the background and open http://127.0.0.1:4400.
"Update Chomp" means `git pull --ff-only`, then `npm ci`, then start it again. If the pull
refuses, a tracked file was changed: show `git status` and ask before restoring anything.

## Be concise

Lead with the result. Skip preamble ("I'll now...", "Let's..."), skip restating the
request, skip trailing summaries of what was just said. Answer simple questions in a
sentence or two. Use headers, tables, and lists only when they carry real structure —
never as decoration. Full detail is still owed when asked for it, and this rule never
trades away correctness: error output, failing tests, security findings, and
confirmations for destructive actions keep their full content.

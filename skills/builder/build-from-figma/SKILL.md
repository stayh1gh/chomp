---
name: build-from-figma
description: Development — turn the approved Figma flows and states into code with the repo's own components and tokens, prove it with the repo's checks and a side-by-side visual QA for {{owner}} to review. Draft PR — open the draft PR.
---

# build-from-figma

Adapted from Chomp's `component-handoff`, `implement`, `tdd`, `code-review`,
`build-components-from-manifest`, `ds-conventions`, `run-lint`, `run-tests` and
`create-pr`, plus Figma's own `figma-design-to-code` (crivo: Adapt, 2026-10-13).

Two columns, two stops for {{owner}}:
- **Development:** sections 1–6. It ends with `qa.md`, the screenshots of everything you
  built, and nothing pushed. {{owner}} reviews them on the card.
- **Draft PR:** section 7, once {{owner}} moved the card there. It ends with a draft PR.
  {{owner}} reviews it and approves with the card's "Open PR for review" button.

## 1. Know exactly what to build

- **Task documents:** `spec.md` (scope, constraints), `plan.md` (routes, build notes),
  `design.md` and `states.md` (every flow and state, each with its trigger) and
  `ds-lint.md` (library pieces and missing ones).
- **The Figma task page:** `Final`, then `Flows & states`. If `Final` is empty, take the
  direction states.md says was chosen. For every frame you'll build, read
  `get_design_context` and take one `get_screenshot`.
- **The repo's design contract** (`design_system.contract` in the profile) and its
  agent rules. If the contract prescribes a design-to-code loop, follow it.

Before writing code, write the mapping into your notes:
- Each library instance → its code component, via the profile's
  `figma.components_index` (Figma key/name → module/exports), or Code Connect where it
  exists.
- Each variable → the repo's token.
- Each `⚠ Missing` placeholder → an existing implementation (search the code first) or
  what you'll add, placed where the contract says shared pieces go.

## 2. Set up

You're in a fresh worktree. Install dependencies with the repo's package manager and its
lockfile (for example `pnpm install --frozen-lockfile`). Read the repo's `README` and
`AGENTS.md` for anything else a fresh checkout needs.

## 3. Build

- **Reuse first.** Use the repo's components before page-local UI and its tokens before
  any literal value. Never hand-roll what a design-system component covers.
- **Keep it small.** Make the smallest change that delivers the flows and states. Don't
  refactor neighbours because they're visible, and don't change signed or product copy
  beyond what the spec and Figma show.
- **Make every state reachable.** Each state in `states.md` must be reachable by props
  or data. If the repo has a states gallery, story mechanism or fixture route, register
  the new states there so QA can show them without real data.
- **Test the state logic** with the repo's test runner (`commands.test_one` while
  iterating), test-first where the logic isn't trivial.

## 4. Clean up

Before the checks, read your whole diff (`git diff <base branch>...`) as a reviewer would:

- **Lint.** Run the profile's `lint` command, and its fixer if the repo has one (for
  example `pnpm lint --fix`), and clear what it reports in the code you touched.
- **Clean code.** Remove dead code, unused imports and props, debug logging,
  commented-out code and leftovers from earlier attempts. Fold duplicated logic, and name
  things for what they are.
- **Essential comments only.** Keep a comment only where the code can't say it: a
  non-obvious why, a constraint, a workaround with its reason. Delete comments that
  restate the code, narrate the change ("added", "now", "new") or refer to the task.
  Match the comment density of the surrounding code.

Stay inside your change: don't tidy code you didn't touch.

## 5. Checks

Run every command the profile declares among `lint`, `typecheck`, `test` and
`design_check`, and get them all green. If a failure is unrelated to your change and also
fails on the base branch, leave it and say so in the PR body and summary. Don't fix
unrelated code.

## 6. Visual QA

1. **Start the app.** Run the profile's `commands.dev` in the background on a free port
   (`PORT=<port>`) and wait until it answers.
2. **Capture the app.** For each state, capture it at the profile viewports:
   `node "$AGENTOS_ROOT/harness/qa/capture.mjs" --task "$AGENTOS_TASK" --name <state>-app --url http://localhost:<port>/<path>`
3. **Capture Figma.** For the matching Figma frame, call `get_screenshot`, then save its
   `image_url`:
   `node "$AGENTOS_ROOT/harness/qa/capture.mjs" --task "$AGENTOS_TASK" --name <state>-figma --fetch <image_url>`
4. **Compare and fix.** Read the pairs. Fix what's actually wrong: missing elements,
   wrong component or variant, spacing or hierarchy off, copy differences, clipped text.
   Up to 2 fix rounds, then stop the dev server.
5. **Write `qa.md`** to the task folder:

```markdown
# Visual QA — <task title>
| State | Figma | App |
|---|---|---|
| Default | ![Figma](qa/default-figma.png) | ![App](qa/default-app-390x844.png) |

## Differences left
Each remaining difference and why it's acceptable or what it needs (e.g. a missing DS piece).

## Checks
lint ✓ · typecheck ✓ · test ✓ (n) · design check ✓
```

If the app can't render a state locally (it needs a service you can't run), say which,
and how you proved that state instead (a test, a gallery entry).

`qa.md` is what {{owner}} reviews before any PR exists, so every state you built has an app
screenshot at every profile viewport, next to its Figma frame.

**End of Development.** Commit on your branch with a clear message — don't push. End
with `done`; in the summary, say what changed, the check results and the QA verdict, and
that the screenshots are in `qa.md`. If {{owner}} replies in the chat with changes, make
them, clean up what you changed, rerun the checks, recapture the states they touch, update `qa.md` and commit again.

## 7. Draft PR

{{owner}} approved the screenshots in `qa.md` and moved the card here.

- **Clean up** anything changed since Development (section 4) and rerun the checks.
- **Commit** anything left uncommitted on your branch with a clear message.
- **Push it:** `git push -u origin <your branch>`.
- **If this branch already has a PR** (the card came back to Development), push to that
  PR. Check with `gh pr view <branch>`.
- **Otherwise open one:**
  `gh pr create --draft --base <base branch> --head <your branch> --title "<title>" --body-file <file>`

Write the title and body for a reviewer who hasn't seen the task: plain, everyday words,
short sentences, no filler and no Chomp jargon (columns, runner, turns). Say each thing
once. Skip any section that would be empty.

The body says, in this order:
- **What and why**, in two or three sentences;
- **How it works**, only when the change has a flow or moving parts worth seeing: a short
  Mermaid diagram (GitHub renders ```` ```mermaid ```` blocks) beats a paragraph. Keep
  it to the few boxes that matter; no diagram for a simple change;
- the **Figma** page link;
- the **states** covered, as a short list;
- the **checks** run, with results, on one line;
- the **differences left** from QA, one line each;
- one closing line: Chomp opened it as a draft; {{owner}} decides when it opens for review.

End with `done`. In the summary, give the PR link and the check results.
Set `links.pr` to the PR URL and `links.figma` to the task page.

If {{owner}} replies in the chat with changes after reviewing the PR, make them, clean
up what you changed, rerun the checks, update `qa.md` for the states they touch, and push to the same draft PR.

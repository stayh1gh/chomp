---
name: setup-chomp
description: Set up Chomp on this Mac for a designer, end to end, by asking a few plain questions and doing the technical work yourself. Use when the user asks to set up, install or configure Chomp, pastes the Chomp GitHub link, wants to add another project to Chomp, or the board has no project yet.
---

# Set up Chomp

The person you're helping is a designer, often not technical. They want a working Chomp board
for their project. You do the terminal work. They answer a handful of questions and sign in
to services in their browser.

**How to talk to them**
- Plain words. Say "the board", "your design system", "sign in". Don't say MCP, YAML, CLI,
  repo or worktree unless they use those words first.
- Ask one question at a time, and say why you're asking in half a sentence.
- Don't ask what you can find out yourself: check the machine, read their project, look at Figma.
- Ask before you install anything, and before you clone anything outside the Chomp folder.
- Never ask for passwords, tokens or keys. Sign-ins happen in their browser.
- Before each step, say in one line what's happening ("Installing Chomp's parts, about a minute.").

Work through the steps in order. A step that's already done gets checked and skipped, so
this also works for adding a second project, or for fixing a half-finished setup.

## 1. The Chomp folder

If the current folder contains `harness/dashboard/serve.mjs`, you're in Chomp: use it.
Otherwise, unless `~/chomp` already has Chomp, clone it there:

```bash
git clone https://github.com/stayh1gh/chomp.git ~/chomp
```

Run every command below from that folder.

If `git` is missing, macOS offers to install it on first use. Run `xcode-select --install`,
tell them a window will pop up, and ask them to click **Install** and tell you when it's done.

## 2. The Mac

Check these without asking:
- `node -v`: needs 22.12 or newer.
- `brew -v`: optional, but it makes installing easier.

If Node is missing or old:
- With Homebrew: offer to run `brew install node`.
- Without Homebrew: send them to <https://nodejs.org> for the "LTS" macOS installer, have them
  run it, then check again.

Never install Homebrew yourself. It needs their Mac password in the terminal.

## 3. Install Chomp

```bash
npm ci
npx playwright install chromium
```

The second command downloads the small browser Chomp uses to take screenshots. Use `npm ci`,
never `npm install`: it keeps the files that come from GitHub unchanged, so updates apply cleanly.

## 4. Connections

Chomp's agents run as this Claude Code login. They need two connections, named exactly
`mobbin` (research) and `figma` (designing). Check:

```bash
claude mcp list
```

Look for `mobbin` and `figma` with "Connected". A Figma *plugin* or claude.ai connector with
another name doesn't count: Chomp looks for `figma`. Add whatever is missing:

```bash
claude mcp add --scope user --transport http mobbin https://api.mobbin.com/mcp
claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp
```

Next they sign in, and they have to do this part themselves. Tell them to type `/mcp` in
this window, pick **mobbin**, choose **Authenticate**, and finish in the browser. Then the
same for **figma**. If they don't have a Mobbin account yet, they need one (mobbin.com).
Run `claude mcp list` again to confirm both are connected.

Google Drive is optional: with it, agents can read Docs, Sheets and Slides links. Mention it
once. If they want it, the easy way is claude.ai → Settings → Connectors → Google Drive.

## 5. Questions

Ask these one at a time.

1. **"What's your name?"** The agents address them by it.
2. **"What's the project called?"** For example "Acme web app". Make a short lowercase id
   from it (`acme-web`) for the file name. Don't ask for the id.
3. **"Will Chomp only design, or also build it in code?"**
   - *Design only*: Chomp plans, researches and designs in Figma, and stops when they
     approve the design. Their engineers build it.
   - *Design + code*: after that, Chomp builds it in the project's code and opens a draft
     pull request for their team to review.
4. **Only for design + code: "Where's the project's code? Paste its GitHub link, or tell me
   the folder on your Mac."**
   - Given a link: look for an existing clone first (`~/code`, `~/Developer`, `~/Projects`,
     `~/GitHub`). If there's none, offer to clone it to `~/code/<name>`.
   - Check `gh auth status`. If they're not signed in to GitHub, ask them to type
     `! gh auth login` in this window and pick GitHub.com, HTTPS, and "Login with a web browser".
     If `gh` is missing, offer `brew install gh`.
   - Find out yourself, don't ask:
     - the main branch (`git symbolic-ref refs/remotes/origin/HEAD`);
     - how the app starts locally (`package.json` scripts, plus the lockfile for pnpm, yarn or npm);
     - the lint, typecheck and test commands;
     - where the components and tokens live;
     - any design docs (`DESIGN.md`, `AGENTS.md`, `docs/`).
5. **"Paste the Figma link to your design system library."** The agents only ever use
   its components, colors and text styles.
   - The key is the part after `figma.com/design/` in the link.
   - Check you can open it: `get_metadata` on the file, or `search_design_system`. If you can't,
     their Figma login may lack access, or the library may not be published. Say which.
   - If it has several products with separate libraries, take one link per product and use
     `figma.libraries` (see the template).
6. **"Where should Chomp draw? Paste a Figma file you can edit, or say 'ask me each time'."**
   Chomp adds one page per task to that file. With "each time", set `work_file: TODO`, and
   every new task asks for a file.
7. **"Which screens do you design for: desktop, mobile, or both?"** Use desktop 1440×900
   and mobile 390×844, unless the library's frames or the code's breakpoints show other
   sizes; then suggest those. The main one gets `primary: true`. Ideation draws only that one.
8. **"Any rules every design must follow?"** Optional. Offer these as a starting point: full
   pages inside the product's real navigation, never floating components; realistic content,
   never lorem ipsum. Add theirs as short, checkable sentences.

## 6. Learn the design system: DESIGN.md

The agents read a `DESIGN.md` before every design. If the project already has one (in the
code, or a link they give you), use it and skip this step. Otherwise write one at
`board/projects/<id>/DESIGN.md`. Chomp keeps that folder on this Mac only.

Ask once: **"Is your design system also in code, or only in Figma?"** Learn it from what exists:
- **Figma:**
  - `get_variable_defs` for color, spacing, radius and type variables;
  - `search_design_system` and `get_metadata` for components and their variants;
  - two or three `get_screenshot`s of key components or full screens, for the overall look.
- **Code:**
  - tokens: CSS variables, `tailwind.config.*`, `tokens.json`;
  - the components folder: names, props, variants;
  - any existing docs or Storybook stories.

Keep it under about 250 lines. Use names exactly as the library or code spells them, and
never invent a value. Sections:
1. **Overview**: what the product is, who uses it, its tone, in 3–5 lines.
2. **Color**: the semantic tokens and what each one is for, with values.
3. **Type**: the scale, and which style is for what.
4. **Space, radius, elevation**: the scales.
5. **Layout**: breakpoints, grid, and the app's chrome (navigation, headers, tab bars) at each viewport.
6. **Components**: one line each, saying when to use it, plus its main variants and properties.
7. **Rules**: do's and don'ts you can see in the system.
8. **Gaps**: anything you couldn't find, so the agents flag it instead of guessing.

Show them a five-line summary and ask if anything looks wrong. You don't need to build a
component index: the designer agent maps the library itself the first time it works with it.

## 7. Write the project and settings

Create `profiles/<id>.yaml` from `profiles/example.yaml.template`. Fill in what you learned,
delete the comment lines that don't apply, and leave no `TODO` (except
`work_file: TODO` for "ask me each time").
- **Design only:** leave out `repo`, `github`, `commands` and `app_reference`. Without a
  `repo`, Chomp treats the project as design only.
- **Design + code:** set `repo` (an absolute path), `github` (`owner/name`), `base_branch`
  and `commands`.
- Set `design_system.context` to the DESIGN.md path (absolute when it's in `board/projects/`).

Check that the file parses:

```bash
node -e "require('js-yaml').load(require('fs').readFileSync('profiles/<id>.yaml','utf8'))"
```

Then the settings. If `settings.yaml` doesn't exist, copy `settings.example.yaml` to it. Set
`owner` to their name and `profile` to the id. Leave `account: default` unless they told
you they use a separate claude-profile login.

## 8. Start the board

Run `npm run serve` in the background. The first start takes about a minute while it builds.
Open <http://127.0.0.1:4400> for them.

Check it works:
- `curl -s http://127.0.0.1:4400/api/connections` should list `mobbin` and `figma` as
  connected. Fix anything that isn't.
- The project shows in Settings → You.

Then tell them, briefly:
- how to create a task (**New task**, describe it, attach links) and where the chat is (bottom right of a card);
- what's theirs: picking a direction in Figma (put it in the `Final` section, then move the
  card to Refinement), and moving cards forward. Agents never move cards out of their columns;
- that GETTING-STARTED.md explains each column.

**Next time:** they can run `cd ~/chomp && npm run serve`, or open Claude Code in `~/chomp`
and say "start Chomp". Offer the Mac app as an option:

```bash
cd desktop && npm ci && npm run install-app
```

That installs Chomp in `~/Applications`, and it updates itself each time it opens.

## If something fails

- **`npm ci` fails:** check the Node version first.
- **Port 4400 is taken:** another board is probably running. Open it, or use
  `npm run serve -- --port 4410`.
- **A card is blocked:** its message says why, and the board's **Connections** page shows
  the fix for a missing sign-in.
- **The server stops:** the error is in its output, or in `~/Library/Logs/Chomp/server.log`
  when it was started from the app.

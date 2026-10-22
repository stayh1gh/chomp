# Getting started with Chomp

Chomp is a board on your Mac where AI agents help you design. You write a request on a card.
A **planner** turns it into a short spec and finds references on Mobbin. A **designer** draws
2–3 directions in Figma with your design system's components. You pick one and refine it,
and the designer takes it to every screen size and state. If you want, a **builder** then
codes it and opens a draft pull request. You decide at every step.

```
Plan ──▶ Ideation ──▶ Designing ──▶ Refinement ──▶ Development ──▶ Draft PR ──▶ Done
planner   designer     you, in Figma  designer       builder          builder
                                                     └──── only for design + code ────┘
```

## What you need

- **A Mac.**
- **Claude Code** with a Claude subscription: [claude.com/claude-code](https://claude.com/claude-code).
  Chomp's agents run as your Claude login.
- **Figma**, with your product's design system published as a library. Chomp only uses its
  components, colors and text styles.
- **Mobbin**: an account at [mobbin.com](https://mobbin.com), for the research.
- **Only for design + code:** the project on GitHub, with permission to push to it.

## Set it up (about 15 minutes)

Open the **Terminal** app, type `claude` and press Enter. Then paste:

```
Set up Chomp on my Mac from https://github.com/stayh1gh/chomp
```

Claude takes it from there. It installs what's missing (it asks first), downloads Chomp to a
`chomp` folder in your home folder, and checks what's already connected. Then it asks you:

1. **Your name.** The agents use it when they talk to you.
2. **The project's name.**
3. **Design only, or design + code?** Design only stops once you approve the design in
   Figma, and your engineers build it. Design + code also builds it and opens a draft pull
   request for your team.
4. **Where the code is** (design + code only): a GitHub link or a folder on your Mac.
5. **Your design system's Figma link.**
6. **Which Figma file to draw in**, or "ask me each time".
7. **Desktop, mobile, or both.**
8. **Any rules every design must follow** (optional).

Along the way you'll sign in, in your browser, to:
- **Mobbin and Figma**, so the agents can research and draw. Claude tells you when to type
  `/mcp` and what to pick.
- **GitHub**, for design + code only.

Chomp never asks for passwords or keys in the chat.

If your project doesn't have a `DESIGN.md` yet, Claude studies your design system (in Figma,
in code, or both) and writes one. It's a short guide to your colors, type, spacing and
components that the agents read before every design. Claude shows you a summary so you can
correct it.

At the end, Claude starts the board and opens it at <http://127.0.0.1:4400>.

**Adding another project later:** open Claude Code in the `chomp` folder and say "add a
Chomp project".

## Starting it again

Any of these works:
- **The Chomp app.** Claude offers to install it at the end of setup. It updates itself
  each time it opens.
- **Ask Claude.** Open Claude Code in the `chomp` folder and say "start Chomp".
- **The Terminal.** Run `cd ~/chomp && npm run serve`, then open <http://127.0.0.1:4400>.

## Your first task

Click **New task**, describe what you want (a screen, a flow, a change), add any links, and
create it. Every card has a chat in its bottom-right corner. The agents ask questions and
report there, and anything you write there goes to the agent working on the card.

| Column | Who | What happens | What you do |
|---|---|---|---|
| **Plan** | planner | Writes a short spec and plan, and collects Mobbin references. It may ask you up to 5 questions. | Answer in the card's chat |
| **Ideation** | designer | Makes the task's page in Figma: references, then 2–3 directions at your main screen size. | Open the Figma link on the card |
| **Designing** | **you** | Nothing runs: this step is yours. | In Figma, put the direction you like in the `Final` section (refine it as much as you want), then drag the card to Refinement |
| **Refinement** | designer | Takes `Final` to every screen size, with its flows, states and a clickable prototype. | Review in Figma, ask for changes in the chat, and move the card on when you're happy. Design-only tasks end here |
| **Development** | builder | Builds it in your code, checks it, and screenshots every state next to the Figma design. | Review the screenshots on the card, then move it to Draft PR |
| **Draft PR** | builder | Opens a draft pull request. | Review it on GitHub, then click **Open PR for review** on the card |

Good to know:
- **The agents never move cards out of your columns,** and never merge anything. Those calls are yours.
- **A blocked card says why,** for example a missing sign-in. Fix it and the card carries
  on by itself, or click **Retry**.
- **Designs only use your design system.** A component your library doesn't have shows up
  as a `⚠ Missing: <Name>` placeholder, never a lookalike.
- **Settings** (left sidebar) is where you change your name, project and agent models.
  **Connections** shows what's signed in and how to fix what isn't.

## Optional extras

- **Phone chats.** When a card needs you, a chat opens in the Claude app on your phone, and
  you answer there. Turn on **I'm AFK** in the sidebar.
- **Slack.** The same alerts as Slack messages. See [Slack](README.md#slack).
- **Google Drive.** Agents can read the Docs, Sheets and Slides you link. Connect it at
  claude.ai → Settings → Connectors.

## Updating

The Chomp app updates itself each time it opens. Otherwise, ask Claude to "update Chomp", or
run `git pull` in the `chomp` folder and start the board again.

Your settings and projects are never touched by updates.

## If something's wrong

Open Claude Code in the `chomp` folder and describe what you see. It can read the board's
state and logs. Common ones:

| You see | What it means |
|---|---|
| A card is blocked on a connection | Mobbin or Figma isn't signed in for this account. Connections shows the fix |
| "This task has no Figma file yet" | The project has no file to draw in. Paste a Figma link on the card |
| The board doesn't open | It isn't running. Start it again (see above) |
| The app says the server didn't start | Ask Claude to check `~/Library/Logs/Chomp/server.log` |

---

<details>
<summary>Setting it up by hand, without Claude</summary>

1. Install Node.js 22.12+ ([nodejs.org](https://nodejs.org)) and git (`xcode-select --install`).
2. Get Chomp and install it:
   ```bash
   git clone https://github.com/stayh1gh/chomp.git ~/chomp && cd ~/chomp
   npm ci && npx playwright install chromium
   ```
3. Add the connections, then type `/mcp` inside `claude` and Authenticate each one:
   ```bash
   claude mcp add --scope user --transport http mobbin https://api.mobbin.com/mcp
   claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp
   ```
4. Copy `profiles/example.yaml.template` to `profiles/<name>.yaml` and fill it in. The
   comments explain every field; leave out `repo` for design only.
5. Run `npm run serve`, open <http://127.0.0.1:4400>, and set your name and project in
   Settings → You.
6. Optional Mac app: `cd desktop && npm ci && npm run install-app`.

</details>

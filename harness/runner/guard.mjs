/**
 * What an agent may and may not do, checked on every tool call. Runs as a PreToolUse hook
 * inside the SDK query (harness/runner/index.mjs), so a bound repo's own permission
 * allow-rules can't skip it. Pure function — tested in guard.test.mjs.
 *
 * The rules:
 *   1. Only tools the agent declares (agents/<name>.md `tools:`; `mcp__x__*` wildcards).
 *   2. No questions through tools — questions go in the turn result, to the chat.
 *   3. File writes only inside the agent's write roots. The task folder is a write root
 *      for its documents only — never task.yaml or chat.jsonl, which the runner owns.
 *   4. use_figma (arbitrary Plugin API code) only on the profile's Figma work file — the
 *      library is read-only to agents and is never published by one.
 *   5. Bash never touches the board, never pushes to or force-pushes main/master, and
 *      never marks a PR ready or merges one. PRs are created as drafts only; the owner
 *      decides when one opens for review.
 */

import path from "node:path";

const ALWAYS_ALLOWED = new Set(["ToolSearch", "TodoWrite"]);
const WRITE_TOOLS = { Write: "file_path", Edit: "file_path", MultiEdit: "file_path", NotebookEdit: "notebook_path" };
const RUNNER_OWNED = new Set(["task.yaml", "chat.jsonl"]);

export function toolAllowed(toolName, patterns) {
  if (ALWAYS_ALLOWED.has(toolName)) return true;
  return patterns.some((p) => (p.endsWith("*") ? toolName.startsWith(p.slice(0, -1)) : toolName === p));
}

function inside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** @returns {{allow: true} | {allow: false, reason: string}} */
export function checkTool(toolName, input, ctx) {
  const { tools, cwd, agentosRoot, taskDir, writeRoots = [] } = ctx;
  const deny = (reason) => ({ allow: false, reason });

  if (toolName === "AskUserQuestion") {
    return deny("Nobody is watching this session. Put questions in your turn result (status needs_input) and they'll reach the chat.");
  }
  if (!toolAllowed(toolName, tools)) {
    return deny(`${toolName} isn't in this agent's tools (${tools.join(", ")}).`);
  }

  if (WRITE_TOOLS[toolName]) {
    const raw = input?.[WRITE_TOOLS[toolName]];
    if (typeof raw !== "string") return deny("No file path given.");
    const file = path.resolve(cwd, raw);
    if (inside(file, taskDir)) {
      if (path.dirname(file) !== taskDir || RUNNER_OWNED.has(path.basename(file)) || !/\.(md|json)$/.test(file)) {
        return deny(`In the task folder you may only write top-level .md/.json documents, not ${path.basename(file)}.`);
      }
      return { allow: true };
    }
    if (inside(file, path.join(agentosRoot, "board"))) return deny("The board is the runner's; agents never write it.");
    if (writeRoots.some((root) => inside(file, root))) return { allow: true };
    return deny(`Writes are limited to ${[taskDir, ...writeRoots].join(", ")}.`);
  }

  if (toolName === "Bash") {
    const command = String(input?.command ?? "");
    if (ctx.bashAllow?.length) {
      const verdict = checkBashAllowlist(command, ctx);
      if (!verdict.allow) return verdict;
    }
    return checkBash(command, ctx);
  }

  // use_figma runs arbitrary Plugin API code, so it's confined to the work file: the
  // library is read through search_design_system / get_metadata, never scripted.
  if (toolName.endsWith("__use_figma") && input?.fileKey !== ctx.figmaFile) {
    return deny(`use_figma only runs on the work file (${ctx.figmaFile ?? "none set in the profile"}). Read the library with search_design_system or get_metadata.`);
  }
  return { allow: true };
}

export function checkBash(command, { agentosRoot }) {
  const deny = (reason) => ({ allow: false, reason });
  if (command.includes(path.join(agentosRoot, "board"))) return deny("The board is the runner's; agents never touch it.");
  // The same through the API: GraphQL mutations or the REST merge endpoint.
  if (/\bgh\s+api\b/.test(command) && /markPullRequestReadyForReview|mergePullRequest|enablePullRequestAutoMerge|\/pulls\/\d+\/merge\b/.test(command)) {
    return deny("Only the board's owner marks a PR ready or merges it.");
  }

  // Split on shell separators so `cd x && git push origin main` is still caught.
  for (const part of command.split(/&&|\|\||;|\|/)) {
    const words = part.trim().split(/\s+/);
    const gitAt = words.indexOf("git");
    if (gitAt !== -1 && words.slice(gitAt + 1).includes("push")) {
      const args = words.slice(words.indexOf("push", gitAt) + 1);
      if (args.some((a) => ["--force", "-f", "--force-with-lease", "--mirror", "--all", "--delete", "-d"].includes(a) || a.startsWith("--force"))) {
        return deny("No force, mirror, delete or all-branch pushes.");
      }
      const refs = args.filter((a) => !a.startsWith("-"));
      if (refs.length < 2) return deny("Push with an explicit remote and feature branch: git push -u origin <branch>.");
      if (refs.slice(1).some((r) => /(^|:|\/)(main|master|HEAD)$/.test(r.replace(/^\+/, "")))) {
        return deny("Never push to main/master. Push your feature branch.");
      }
    }
    const ghAt = words.indexOf("gh");
    if (ghAt !== -1 && words[ghAt + 1] === "pr") {
      const sub = words[ghAt + 2];
      if (sub === "ready" || sub === "merge") return deny("Only the board's owner marks a PR ready or merges it.");
      if (sub === "create" && !words.includes("--draft") && !words.includes("-d")) {
        return deny("PRs are created as drafts: add --draft.");
      }
    }
  }
  return { allow: true };
}

/**
 * For agents whose frontmatter lists `bash:` prefixes (the designer): the command must be
 * one of those commands — no chaining, redirection or substitution, and the only shell
 * variables allowed are $AGENTOS_ROOT and $AGENTOS_TASK.
 */
export function checkBashAllowlist(command, { bashAllow, agentosRoot }) {
  const deny = (reason) => ({ allow: false, reason });
  const withoutVars = command.replace(/\$\{?AGENTOS_(ROOT|TASK)\}?/g, "");
  if (/[;&|`<>\n]|\$/.test(withoutVars)) return deny("Only a single plain command is allowed here: no chaining, redirection or other variables.");
  const normalized = command.replace(/["']/g, "").replace(/\$\{?AGENTOS_ROOT\}?/g, agentosRoot).trim();
  const ok = bashAllow.some((prefix) => {
    const p = prefix.replace(/\$\{?AGENTOS_ROOT\}?/g, agentosRoot);
    return normalized === p || normalized.startsWith(`${p} `);
  });
  return ok ? { allow: true } : deny(`This agent may only run: ${bashAllow.join(" | ")}`);
}

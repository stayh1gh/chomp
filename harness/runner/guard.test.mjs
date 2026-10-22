import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTool, checkBash, toolAllowed } from "./guard.mjs";

const ctx = {
  tools: ["Read", "Write", "Edit", "Bash", "mcp__mobbin__*"],
  cwd: "/repo",
  agentosRoot: "/agentos",
  taskDir: "/agentos/board/tasks/t1",
  writeRoots: ["/repo/.worktrees/t1"],
};

test("tool allowlist with MCP wildcards", () => {
  assert.equal(toolAllowed("mcp__mobbin__search_flows", ctx.tools), true);
  assert.equal(toolAllowed("mcp__figma__use_figma", ctx.tools), false);
  assert.equal(toolAllowed("ToolSearch", ctx.tools), true);
  assert.equal(checkTool("WebSearch", {}, ctx).allow, false);
});

test("questions go through the turn result, never AskUserQuestion", () => {
  assert.equal(checkTool("AskUserQuestion", {}, { ...ctx, tools: ["AskUserQuestion"] }).allow, false);
});

test("writes: task documents yes, runner-owned files and the rest of the board no", () => {
  assert.equal(checkTool("Write", { file_path: "/agentos/board/tasks/t1/spec.md" }, ctx).allow, true);
  assert.equal(checkTool("Write", { file_path: "/agentos/board/tasks/t1/task.yaml" }, ctx).allow, false);
  assert.equal(checkTool("Edit", { file_path: "/agentos/board/tasks/t1/chat.jsonl" }, ctx).allow, false);
  assert.equal(checkTool("Write", { file_path: "/agentos/board/tasks/t1/sub/x.md" }, ctx).allow, false);
  assert.equal(checkTool("Write", { file_path: "/agentos/board/tasks/t2/spec.md" }, ctx).allow, false);
  assert.equal(checkTool("Write", { file_path: "../../agentos/board/tasks/t1/../t1/task.yaml" }, ctx).allow, false);
  assert.equal(checkTool("Write", { file_path: "/agentos/flow.yaml" }, ctx).allow, false);
  assert.equal(checkTool("Write", { file_path: "/repo/src/app.tsx" }, ctx).allow, false);
  assert.equal(checkTool("Write", { file_path: ".worktrees/t1/src/app.tsx" }, ctx).allow, true);
});

test("bash: no pushing main, no force, PRs only as drafts, never ready/merge", () => {
  const ok = (c) => checkBash(c, ctx).allow;
  assert.equal(ok("git push -u origin agentos/t1"), true);
  assert.equal(ok("git push origin main"), false);
  assert.equal(ok("cd x && git push origin HEAD:main"), false);
  assert.equal(ok("git push origin +master"), false);
  assert.equal(ok("git push"), false);
  assert.equal(ok("git push --force origin agentos/t1"), false);
  assert.equal(ok("git push --force-with-lease origin agentos/t1"), false);
  assert.equal(ok("gh pr create --draft --title x --body y"), true);
  assert.equal(ok("gh pr create --title x --body y"), false);
  assert.equal(ok("gh pr ready 12"), false);
  assert.equal(ok("gh pr merge 12 --squash"), false);
  assert.equal(ok(`gh api graphql -f query='mutation { markPullRequestReadyForReview(input: {pullRequestId: "x"}) { clientMutationId } }'`), false);
  assert.equal(ok("gh api -X PUT repos/acme/app/pulls/12/merge"), false);
  assert.equal(ok("gh api repos/acme/app/pulls/12"), true);
  assert.equal(ok("cat /agentos/board/tasks/t1/task.yaml"), false);
  assert.equal(ok("pnpm lint && pnpm typecheck"), true);
});

test("use_figma only on the profile's work file", () => {
  const fctx = { ...ctx, tools: ["mcp__figma__use_figma", "mcp__figma__get_metadata", "ReadMcpResourceTool"], figmaFile: "WORK" };
  assert.equal(checkTool("mcp__figma__use_figma", { fileKey: "WORK", code: "return 1" }, fctx).allow, true);
  assert.equal(checkTool("mcp__figma__use_figma", { fileKey: "LIBRARY", code: "return 1" }, fctx).allow, false);
  assert.equal(checkTool("mcp__figma__use_figma", { fileKey: "WORK" }, { ...fctx, figmaFile: null }).allow, false);
  assert.equal(checkTool("mcp__figma__get_metadata", { fileKey: "LIBRARY" }, fctx).allow, true);
  assert.equal(checkTool("ReadMcpResourceTool", { server: "figma", uri: "skill://figma/figma-use/SKILL.md" }, fctx).allow, true);
  assert.equal(checkTool("mcp__figma__create_new_file", {}, fctx).allow, false);
});

test("bash allowlist: one plain allowed command, nothing else", () => {
  const dctx = { ...ctx, tools: ["Bash"], bashAllow: ["node $AGENTOS_ROOT/harness/qa/app-reference.mjs"] };
  const ok = (c) => checkTool("Bash", { command: c }, dctx).allow;
  assert.equal(ok('node "$AGENTOS_ROOT/harness/qa/app-reference.mjs" --task "$AGENTOS_TASK" --name vault --path "/dev/talent-states/z/vault?w=1280"'), true);
  assert.equal(ok("node /agentos/harness/qa/app-reference.mjs --task t1 --name a --path /dev/states"), true);
  assert.equal(ok("node /agentos/harness/qa/app-reference.mjs --stop"), true);
  assert.equal(ok("node /agentos/harness/qa/app-reference.mjs --task t1; rm -rf /"), false);
  assert.equal(ok("node /agentos/harness/qa/app-reference.mjs $(whoami)"), false);
  assert.equal(ok("node /agentos/harness/qa/capture.mjs --task t1"), false);
  assert.equal(ok("pnpm dev"), false);
  assert.equal(ok("node /agentos/harness/qa/app-reference.mjs > /tmp/x"), false);
});

test("planner reads Figma but can't script it", () => {
  const pctx = { ...ctx, tools: ["mcp__figma__get_metadata", "mcp__figma__get_screenshot", "mcp__figma__get_figjam"], figmaFile: "WORK" };
  assert.equal(checkTool("mcp__figma__get_screenshot", { fileKey: "ANY", nodeId: "1956:2" }, pctx).allow, true);
  assert.equal(checkTool("mcp__figma__use_figma", { fileKey: "WORK", code: "x" }, pctx).allow, false);
});

test("designer may run the reference uploader too, and nothing else", () => {
  const dctx = { ...ctx, tools: ["Bash"], bashAllow: ["node $AGENTOS_ROOT/harness/qa/app-reference.mjs", "node $AGENTOS_ROOT/harness/figma/upload-references.mjs"] };
  const ok = (c) => checkTool("Bash", { command: c }, dctx).allow;
  assert.equal(ok('node "$AGENTOS_ROOT/harness/figma/upload-references.mjs" --task "$AGENTOS_TASK"'), true);
  assert.equal(ok("node /agentos/harness/figma/lint.mjs"), false);
  assert.equal(ok("curl -X POST https://mcp.figma.com/mcp/upload/x/submit"), false);
});

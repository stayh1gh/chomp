/**
 * Runs the DS lint (ds-lint.js) against a task's Figma page, independently of the
 * designer: a tiny query whose only permitted tool call is use_figma with exactly this
 * script on exactly this file. The designer's own claim that the page is clean is never
 * trusted — this result is what decides whether a card leaves its column.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { envFor } from "../runner/connections.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LINT_SCRIPT_PATH = path.join(HERE, "ds-lint.js");

/** Design System component names, from the repo's own snapshot (profile.figma.components_index). */
export function dsNamesFor(profile) {
  const file = profile?.figma?.components_index && path.join(profile.repo, profile.figma.components_index);
  if (!file || !existsSync(file)) return [];
  const snap = JSON.parse(readFileSync(file, "utf8"));
  return [...new Set((snap.components ?? []).map((c) => c.figma?.name).filter(Boolean))];
}

/**
 * The profile's viewports, marked for one column's lint. The primary one is the viewport
 * flagged `primary: true` (else the only one, else the widest): Ideation draws only it.
 * mode "primary" requires a full page at the primary viewport only; "all" (Refinement,
 * and any column that doesn't say) at every one.
 */
export function primaryViewport(viewports = []) {
  if (!viewports.length) return null;
  return viewports.find((v) => v.primary) ?? [...viewports].sort((a, b) => Number(b.w) - Number(a.w))[0];
}

export function lintViewports(viewports = [], mode = "all") {
  const primary = primaryViewport(viewports);
  return viewports.map((v) => ({ w: Number(v.w), h: Number(v.h), primary: v === primary, required: mode !== "primary" || v === primary }));
}

/** The script as sent: comments and blank lines stripped (shorter to copy exactly). */
export function buildLintScript(pageId, dsNames, viewports = [], nodeIds = [], fullPageGroups = []) {
  for (const id of [pageId, ...nodeIds]) if (!/^\d+:\d+$/.test(id)) throw new Error(`bad Figma node id "${id}"`);
  return readFileSync(LINT_SCRIPT_PATH, "utf8")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line) && line.trim())
    .join("\n")
    .replace("__PAGE_ID__", pageId)
    .replace("__NODE_IDS__", JSON.stringify(nodeIds))
    .replace("__DS_NAMES__", JSON.stringify(dsNames))
    .replace("__VIEWPORTS__", JSON.stringify(viewports.map((v) => ({ w: Number(v.w), h: Number(v.h), primary: Boolean(v.primary), required: v.required !== false }))))
    .replace("__FULL_PAGE_GROUPS__", JSON.stringify(fullPageGroups.map(String)));
}

/** Whitespace-insensitive equality: a copy that only reflowed whitespace is the same script. */
export const sameScript = (a, b) => typeof a === "string" && a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

/** { fileKey, nodeId } from a figma.com/design URL, or null. node-id uses '-' in URLs. */
export function parseFigmaUrl(url) {
  const m = String(url ?? "").match(/figma\.com\/(?:design|file)\/([A-Za-z0-9]+)[^?#]*(?:\?[^#]*?node-id=([0-9]+[-:][0-9]+))?/);
  if (!m) return null;
  return { fileKey: m[1], nodeId: m[2] ? m[2].replace("-", ":") : null };
}

export function figmaPageUrl(fileKey, pageId) {
  return `https://www.figma.com/design/${fileKey}/?node-id=${pageId.replace(":", "-")}`;
}

/**
 * @returns lint result object from ds-lint.js ({ ok, errorCount, errors, ... })
 * @throws when the lint couldn't run at all (no access, page gone, tool unavailable)
 */
export async function runLint({ account, cwd, fileKey, pageId, nodeIds = [], dsNames, viewports = [], fullPageGroups = [], queryImpl = query }) {
  const code = buildLintScript(pageId, dsNames, viewports, nodeIds, fullPageGroups);
  let toolResult = null;
  let called = 0;
  let lastMismatch = null;
  const onlyThisCall = async (input) => {
    const ok = input.tool_name.endsWith("__use_figma") && input.tool_input?.fileKey === fileKey && sameScript(input.tool_input?.code, code) && called === 0;
    if (!ok && input.tool_name.endsWith("__use_figma")) lastMismatch = input.tool_input?.code ?? "";
    if (ok) called += 1;
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: ok || input.tool_name === "ToolSearch" ? "allow" : "deny",
        permissionDecisionReason: ok ? undefined : "Only the single verbatim lint call is allowed.",
      },
    };
  };
  const prompt = [
    "Call the Figma use_figma tool exactly once with these arguments, then reply DONE.",
    `fileKey: ${fileKey}`,
    `description: Chomp DS lint (read-only)`,
    `skillNames: figma-use`,
    "code: the script between the markers below, copied exactly — every character, no edits:",
    "<<<SCRIPT",
    code,
    "SCRIPT>>>",
  ].join("\n");

  const q = queryImpl({
    prompt,
    options: {
      cwd,
      env: envFor(account),
      model: "claude-sonnet-5-5", // haiku paraphrases long scripts; sonnet copies them
      settingSources: ["user"],
      // No allowedTools: they'd auto-approve and skip the hook. The hook is the gate.
      hooks: { PreToolUse: [{ hooks: [onlyThisCall] }] },
      canUseTool: async (_n, input) => ({ behavior: "allow", updatedInput: input }),
      maxTurns: 6,
    },
  });
  for await (const msg of q) {
    if (msg.type !== "user") continue;
    for (const block of msg.message?.content ?? []) {
      if (block.type !== "tool_result") continue;
      const text = Array.isArray(block.content) ? block.content.map((c) => c.text ?? "").join("") : String(block.content ?? "");
      if (block.is_error) {
        if (!called) continue; // a denied, mis-copied attempt — the model gets to try again
        throw new Error(`use_figma failed: ${text.slice(0, 300)}`);
      }
      try {
        toolResult = JSON.parse(text);
      } catch {
        if (called) throw new Error(`lint returned something that isn't JSON: ${text.slice(0, 200)}`);
      }
    }
  }
  if (!called || !toolResult) {
    throw new Error(`the lint call never ran${lastMismatch !== null ? ` (the script was copied with changes, first difference at char ${firstDiff(lastMismatch.replace(/\s+/g, ""), code.replace(/\s+/g, ""))})` : ""}`);
  }
  if (toolResult.ok === false) throw new Error(toolResult.error ?? "lint failed");
  return toolResult;
}

/** The lint result as a task document (ds-lint.md). */
export function lintMarkdown(result, url) {
  const rows = (list) => list.map((e) => `| ${e.rule} | ${e.name.replace(/\|/g, "/")} | ${e.detail.replace(/\|/g, "/")} | \`${e.id}\` |`).join("\n");
  return [
    `# DS lint — ${result.page}`,
    "",
    `${result.errorCount === 0 ? "✅ No errors." : `❌ ${result.errorCount} error${result.errorCount > 1 ? "s" : ""}.`} ${result.warningCount} warning${result.warningCount === 1 ? "" : "s"}. ` +
      `${result.counts.libraryInstances} library instances, ${result.counts.localInstances} local composites, ${result.counts.texts} text layers.`,
    url ? `\n[Open the page in Figma](${url})` : "",
    result.scope ? `\n**Linted:** ${result.scope.join(", ")} — the rest of the page isn't the designer's and isn't judged.` : "",
    result.placeholders.length ? `\n**Missing from the Design System:** ${result.placeholders.join(", ")}` : "",
    result.errors.length ? `\n## Errors\n\n| Rule | Layer | Problem | Node |\n|---|---|---|---|\n${rows(result.errors)}` : "",
    result.warnings.length ? `\n## Warnings\n\n| Rule | Layer | Problem | Node |\n|---|---|---|---|\n${rows(result.warnings)}` : "",
  ].filter(Boolean).join("\n");
}

function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i += 1;
  return `${i}: got "${a.slice(i, i + 30)}" expected "${b.slice(i, i + 30)}"`;
}

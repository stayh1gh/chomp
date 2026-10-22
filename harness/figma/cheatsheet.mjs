/**
 * The DS cheat sheet: a compact map of one Figma library — component set keys with their
 * variant and property names, variables and styles by name with their import keys — built
 * once per library file and cached at board/cache/ds/<library_file>.md. The runner points
 * every designer dispatch at it, so the designer reads one file instead of rediscovering
 * the library with search_design_system (2–5 minutes a run).
 *
 * Built like the DS lint: a small query whose only permitted tool calls are use_figma with
 * exactly ds-cheatsheet.js (read-only, the OFFSET number aside) on the library file, paging
 * through its rows. Rebuilt when older than a week, or with --refresh:
 *
 *   node harness/figma/cheatsheet.mjs --profile <name> [--library <id>] [--refresh]
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { envFor } from "../runner/connections.mjs";
import { sameScript } from "./lint.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CHEATSHEET_SCRIPT_PATH = path.join(HERE, "ds-cheatsheet.js");
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const OFFSET_RE = /const OFFSET = (\d+);/;
const inflight = new Map(); // library file key → Promise<path>

export const cheatsheetPath = (root, fileKey) => path.join(root, "board", "cache", "ds", `${fileKey}.md`);

/** The script as sent: comments and blank lines stripped, starting at row `offset`. */
export function buildCheatsheetScript(offset = 0) {
  return readFileSync(CHEATSHEET_SCRIPT_PATH, "utf8")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line) && line.trim())
    .join("\n")
    .replace(OFFSET_RE, `const OFFSET = ${Number(offset)};`);
}

/** A copy of the script for row `offset`: the template, only the OFFSET number changed. */
export function isCheatsheetCall(code, offset) {
  const m = typeof code === "string" && code.match(OFFSET_RE);
  return Boolean(m) && Number(m[1]) === offset && sameScript(code.replace(OFFSET_RE, "const OFFSET = 0;"), buildCheatsheetScript(0));
}

/** Every row of the library, paging through use_figma calls (≤ 20 KB each). */
export async function fetchRows({ account, cwd, fileKey, queryImpl = query }) {
  const rows = [];
  let next = 0;
  let file = null;
  for (let session = 0; next !== null && session < 4; session += 1) {
    const startedAt = next;
    let pending = false;
    const onlyTheScript = async (input) => {
      const ok = input.tool_name.endsWith("__use_figma") && input.tool_input?.fileKey === fileKey && !pending && isCheatsheetCall(input.tool_input?.code, next);
      if (ok) pending = true;
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: ok || input.tool_name === "ToolSearch" ? "allow" : "deny",
          permissionDecisionReason: ok ? undefined : `Only the verbatim cheat-sheet script, one call at a time, with const OFFSET = ${next};`,
        },
      };
    };
    const prompt = [
      "Call the Figma use_figma tool with these arguments.",
      `fileKey: ${fileKey}`,
      "description: Chomp DS cheat sheet (read-only)",
      "skillNames: figma-use",
      "code: the script between the markers below, copied exactly — every character, no edits:",
      "<<<SCRIPT",
      buildCheatsheetScript(next),
      "SCRIPT>>>",
      "The result is JSON with a `next` field. While `next` is a number, call use_figma again with the same script, " +
        "changing only the number in `const OFFSET = …;` to that `next` — one call at a time. When `next` is null, reply DONE.",
    ].join("\n");
    const q = queryImpl({
      prompt,
      options: {
        cwd,
        env: envFor(account),
        model: "claude-sonnet-5-5", // copies long scripts exactly
        settingSources: ["user"],
        hooks: { PreToolUse: [{ hooks: [onlyTheScript] }] },
        canUseTool: async (_n, input) => ({ behavior: "allow", updatedInput: input }),
        maxTurns: 40,
      },
    });
    for await (const msg of q) {
      if (msg.type !== "user") continue;
      for (const block of msg.message?.content ?? []) {
        if (block.type !== "tool_result" || !pending) continue;
        pending = false;
        const text = Array.isArray(block.content) ? block.content.map((c) => c.text ?? "").join("") : String(block.content ?? "");
        if (block.is_error) throw new Error(`use_figma failed on the library file: ${text.slice(0, 300)}`);
        let r;
        try { r = JSON.parse(text); } catch { throw new Error(`the cheat-sheet script returned something that isn't JSON: ${text.slice(0, 200)}`); }
        if (r.ok === false) throw new Error(r.error ?? "the cheat-sheet script failed");
        rows.push(...(r.rows ?? []));
        file = r.file ?? file;
        next = r.next ?? null;
      }
    }
    if (next === startedAt) throw new Error(`the cheat-sheet script never ran (stuck at row ${next})`);
  }
  if (next !== null) throw new Error(`the library read stopped at row ${next}`);
  return { file, rows };
}

/** The rows as the Markdown file the designer reads. */
export function cheatsheetMarkdown({ label, fileKey, file, rows, builtAt = new Date() }) {
  if (file === "Document") file = null; // the Plugin API's name for every file's root
  const of = (kind) => rows.filter((r) => r[0] === kind);
  const [sets, comps, colls, vars] = [of("set"), of("comp"), of("coll"), of("var")];
  const styles = [["text", "Text styles"], ["effect", "Effect styles"], ["paint", "Color styles"]];
  const styleCount = styles.reduce((n, [k]) => n + of(k).length, 0);
  const comp = ([, name, key, props]) => `- **${name}** \`${key}\`${props ? ` — ${props.split(", ").join(" · ")}` : ""}`;
  const out = [
    `# DS cheat sheet — ${label ?? file ?? fileKey}`,
    "",
    `Library file \`${fileKey}\`${file ? ` ("${file}")` : ""}, read ${builtAt.toISOString().slice(0, 10)} by harness/figma/cheatsheet.mjs ` +
      `(rebuilt weekly). ${sets.length} component sets, ${comps.length} components, ${vars.length} variables, ${styleCount} styles.`,
    "",
    "Keys are import keys, for use_figma on the work file:",
    "- component set → `await figma.importComponentSetByKeyAsync(key)`, pick the variant from `set.children` (or `set.defaultVariant`), `createInstance()`",
    "- component → `await figma.importComponentByKeyAsync(key)`",
    "- variable → `await figma.variables.importVariableByKeyAsync(key)`",
    "- style → `await figma.importStyleByKeyAsync(key)` (load a text style's `fontName` before applying it)",
    "",
    "Properties: `Name=a|b` is a variant and its values; `text:` / `bool:` / `swap:` names are the exact keys `setProperties` takes, `#id` included. " +
      "A key that fails to import means the library changed since this was read: find that piece with `search_design_system` instead.",
  ];
  if (sets.length) out.push("", `## Component sets (${sets.length})`, ...sets.map(comp));
  if (comps.length) out.push("", `## Components (${comps.length})`, ...comps.map(comp));
  if (vars.length) {
    out.push("", `## Variables (${vars.length})`);
    for (const [, name, modes] of colls) {
      const inColl = vars.filter((v) => v[1] === name);
      if (!inColl.length) continue;
      out.push("", `### ${name}${modes ? ` — modes ${modes.split("|").join(", ")}` : ""}`, ...inColl.map(([, , n, key, type]) => `- \`${n}\` \`${key}\` ${type}`));
    }
  }
  for (const [kind, title] of styles) {
    const list = of(kind);
    if (list.length) out.push("", `## ${title} (${list.length})`, ...list.map(([, name, key]) => `- \`${name}\` \`${key}\``));
  }
  return out.join("\n") + "\n";
}

const isTodo = (v) => !v || /^todo$/i.test(String(v).trim());

/**
 * The cheat sheet's path for a (resolved) profile's library, built first when missing or
 * older than maxAgeMs. Null when the profile has no library file. When a rebuild fails, an
 * older copy is still returned; with none, it throws.
 */
export async function ensureCheatsheet({ root, profile, account, cwd, queryImpl = query, refresh = false, maxAgeMs = MAX_AGE_MS, now = Date.now(), log = () => {} }) {
  const fileKey = profile?.figma?.library_file;
  if (isTodo(fileKey)) return null;
  const file = cheatsheetPath(root, fileKey);
  const fresh = existsSync(file) && now - statSync(file).mtimeMs < maxAgeMs;
  if (fresh && !refresh) return file;
  if (inflight.has(fileKey)) return inflight.get(fileKey);
  const build = (async () => {
    try {
      const { file: name, rows } = await fetchRows({ account, cwd, fileKey, queryImpl });
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(`${file}.tmp`, cheatsheetMarkdown({ label: profile.figma.library?.label ?? profile.label, fileKey, file: name, rows, builtAt: new Date(now) }));
      renameSync(`${file}.tmp`, file);
      return file;
    } catch (err) {
      if (existsSync(file)) {
        log(`[cheatsheet] ${fileKey}: rebuild failed (${err.message}); using the older copy`);
        return file;
      }
      throw err;
    } finally {
      inflight.delete(fileKey);
    }
  })();
  inflight.set(fileKey, build);
  return build;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? undefined : process.argv[i + 1]; };
  const store = await import("../../board/store.mjs");
  const settings = store.loadSettings();
  const name = arg("profile") ?? settings.profile;
  const profile = store.resolveProfile(store.loadProfile(name), { library: arg("library") });
  try {
    const file = await ensureCheatsheet({
      root: store.AGENTOS_ROOT, profile, account: profile.account ?? settings.account, cwd: existsSync(profile.repo ?? "") ? profile.repo : store.AGENTOS_ROOT,
      refresh: process.argv.includes("--refresh"), log: console.log,
    });
    console.log(file ? `✓ ${file}` : `profile ${name} has no library_file`);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}

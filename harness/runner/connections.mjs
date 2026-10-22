/**
 * Which MCP servers a Claude account can actually reach, asked of the SDK itself
 * (`mcpServerStatus()` on a query that never sends a prompt — no tokens spent). The runner
 * checks a column's `requires_mcp` against this before dispatching, so a missing Mobbin or
 * Figma connection blocks the card with a plain fix instead of failing mid-run.
 */

import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

const PROFILES_DIR = path.join(os.homedir(), ".local", "share", "claude-profiles");
const CACHE_MS = 60_000;
const cache = new Map();

export const MCP_URLS = {
  mobbin: "https://api.mobbin.com/mcp",
  figma: "https://mcp.figma.com/mcp",
  gdrive: "https://drivemcp.googleapis.com/mcp/v1",
};

// Google's sign-in has no dynamic client registration: `mcp add` needs your own OAuth
// client (Google Cloud → APIs & Services → Credentials → OAuth client ID, type Desktop app).
const ADD_FLAGS = { gdrive: "--client-id <google-oauth-client-id> --client-secret" };

/** The `claude mcp add` command that sets up server `name` for an account. */
export function mcpAddCommand(name, account) {
  const flags = ADD_FLAGS[name] ? ` ${ADD_FLAGS[name]}` : "";
  return `${claudeAs(account)} mcp add --scope user --transport http${flags} ${name} ${MCP_URLS[name] ?? "<url>"}`;
}

/** `default` → the regular ~/.claude login; anything else → a claude-profiles directory. */
export function configDirFor(account) {
  if (!account || account === "default") return null;
  const dir = path.join(PROFILES_DIR, account);
  if (!existsSync(dir)) throw new Error(`Claude account "${account}" has no directory at ${dir}`);
  return dir;
}

/**
 * The shell command that runs `claude` as an account, for fix hints. Named accounts switch
 * with claude-profile (github.com/quinnjr/claude-code-profiles), which exports the same
 * CLAUDE_CONFIG_DIR envFor sets; `default` bypasses its wrapper to reach plain ~/.claude.
 */
export function claudeAs(account) {
  return account && account !== "default" ? `claude-profile use ${account} && claude` : "command claude";
}

export function envFor(account, extra = {}) {
  const env = { ...process.env, ...extra };
  const dir = configDirFor(account);
  if (dir) env.CLAUDE_CONFIG_DIR = dir;
  else delete env.CLAUDE_CONFIG_DIR;
  return env;
}

/** [{ name, status }] for every MCP server the account loads in `cwd`. Cached for a minute. */
export async function mcpStatus(account, cwd, { fresh = false } = {}) {
  const key = `${account}::${cwd}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.servers;

  let release;
  const hold = new Promise((r) => (release = r));
  async function* noPrompt() {
    await hold;
  }
  const q = query({
    prompt: noPrompt(),
    options: { cwd, env: envFor(account), settingSources: ["user", "project", "local"] },
  });
  try {
    let servers = [];
    const deadline = Date.now() + 15_000;
    do {
      servers = (await q.mcpServerStatus()).map((s) => ({ name: s.name, status: s.status, error: s.error ?? null }));
      if (!servers.some((s) => s.status === "pending")) break;
      await new Promise((r) => setTimeout(r, 750));
    } while (Date.now() < deadline);
    const login = await q.accountInfo().then((a) => a.email ?? null).catch(() => null);
    servers.login = login; // which login the account uses; expiry only shows up on a real run
    cache.set(key, { at: Date.now(), servers });
    return servers;
  } finally {
    release();
    q.close();
  }
}

/** The first required server that isn't connected, as a human-readable fix, or null. */
export function missingMcp(required, servers, account) {
  for (const name of required ?? []) {
    // Agents call mcp__<name>__* tools, so only the server named exactly <name> counts as
    // connected; a lookalike (plugin:figma:figma) is just the next best thing to point at.
    const match = servers.filter((s) => s.name.toLowerCase().includes(name.toLowerCase()));
    const exact = match.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (exact?.status === "connected") continue;
    const seen = exact ?? match[0];
    const why = !seen ? "isn't set up" : seen.status === "needs-auth" ? "needs you to sign in" : `is ${seen.status}`;
    const fix = !seen
      ? mcpAddCommand(name, account)
      : `${claudeAs(account)}, then /mcp → ${seen.name} → Authenticate`;
    return { name, title: `${name[0].toUpperCase()}${name.slice(1)} ${why} for the ${account} account`, fix };
  }
  return null;
}

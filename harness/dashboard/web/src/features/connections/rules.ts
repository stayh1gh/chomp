// What Connections says about each MCP server and notification channel, apart from the page.

import type { Channel, Column, Connections, McpServer } from '@/lib/types'

const MCP_URLS: Record<string, string> = { mobbin: 'https://api.mobbin.com/mcp', figma: 'https://mcp.figma.com/mcp', gdrive: 'https://drivemcp.googleapis.com/mcp/v1' }
// Same as ADD_FLAGS in harness/runner/connections.mjs: Google needs your own OAuth client.
const MCP_ADD_FLAGS: Record<string, string> = { gdrive: '--client-id <google-oauth-client-id> --client-secret' }
// The claude.ai connector runs the same server and loads in agent runs too; agents list both tool names.
const MCP_ALIASES: Record<string, string> = { gdrive: 'claude.ai google drive' }

/** Same as claudeAs() in harness/runner/connections.mjs: named accounts switch with claude-profile. */
export const claudeFor = (account: string) => (account === 'default' ? 'command claude' : `claude-profile use ${account} && claude`)

export type ServerRow = {
  name: string
  needed: boolean
  columns: string[]
  ok: boolean
  /** The server the account has under that name (or one that looks like it), if any. */
  seen: McpServer | null
  /** Point at the claude.ai connector before the CLI command (Google Drive). */
  connectorHint: boolean
  /** The command that fixes it, while it isn't connected. */
  fix: string | null
}

/** One row per server the flow names: the required ones first, then the optional ones. */
export function serverRows(columns: Column[], c: Connections | null, account: string): ServerRow[] {
  const required: Record<string, string[]> = {}
  for (const col of columns) for (const name of col.requires_mcp ?? []) (required[name] ??= []).push(col.title)
  const optional: Record<string, string[]> = {}
  for (const col of columns) for (const name of col.optional_mcp ?? []) if (!required[name]) (optional[name] ??= []).push(col.title)
  const servers = c?.servers ?? []
  const loading = !c

  return [...Object.entries(required), ...Object.entries(optional)].map(([name, cols]) => {
    const needed = Boolean(required[name])
    // Same rule as missingMcp(): agents call mcp__<name>__*, so only the exact name counts.
    const match = servers.filter((s) => s.name.toLowerCase().includes(name))
    const exact = match.find((s) => s.name.toLowerCase() === name) ?? servers.find((s) => s.name.toLowerCase() === MCP_ALIASES[name])
    const ok = exact?.status === 'connected'
    const seen = exact ?? match[0] ?? null
    const fix = ok || loading ? null
      : seen ? `${claudeFor(account)}  →  /mcp  →  ${seen.name}  →  Authenticate`
      : `${claudeFor(account)} mcp add --scope user --transport http${MCP_ADD_FLAGS[name] ? ` ${MCP_ADD_FLAGS[name]}` : ''} ${name} ${MCP_URLS[name] ?? '<url>'}`
    return { name, needed, columns: cols, ok, seen, connectorHint: !ok && !loading && Boolean(MCP_ALIASES[name]) && !seen, fix }
  })
}

/** Connected servers the flow doesn't name. Only connected ones: an account can carry dozens awaiting sign-in. */
export function otherServers(columns: Column[], c: Connections | null): McpServer[] {
  const named = columns.flatMap((col) => [...(col.requires_mcp ?? []), ...(col.optional_mcp ?? [])])
  return (c?.servers ?? []).filter((s) => s.status === 'connected' && !named.some((n) => s.name.toLowerCase().includes(n) || s.name.toLowerCase() === MCP_ALIASES[n]))
}

/** A Notify me via channel's line: where it sends, whether it's the one in use, and if it can. */
export function channelText(channel: 'phone' | 'slack', n: Channel, via: string, enabled: boolean) {
  const slack = channel === 'slack'
  const inUse = via === channel
  const on = !inUse ? 'not in use' : enabled ? 'in use · on' : 'in use · off in the sidebar'
  return {
    inUse,
    name: slack ? 'Slack notifications' : 'Phone notifications',
    detail: `${slack ? `Socket Mode${n.team ? ` · ${n.team}` : ''}` : 'Remote Control'} · ${on}`,
    note: n.ready ? (slack ? `A task that needs you messages ${n.user_id ?? 'you'} on Slack` : 'A task that needs you opens a chat in the Claude app') : n.title ?? '',
    hint: n.ready && !inUse ? 'Switch in Settings → Notifications → Notify me via' : null,
  }
}

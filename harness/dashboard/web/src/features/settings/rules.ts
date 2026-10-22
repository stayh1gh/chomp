// Settings' reading of settings.yaml, apart from how the page looks.

import type { AgentConfig, Options, Settings } from '@/lib/types'

export const EFFORTS = ['default', 'low', 'medium', 'high', 'xhigh', 'max']

/** Same as accountSettings() in board/store.mjs: the account's own values, else the top-level ones. */
export function accountSettings(settings: Settings, account: string) {
  const own = settings.per_account?.[account] ?? {}
  const agents: Record<string, AgentConfig> = {}
  for (const [name, cfg] of Object.entries(settings.agents ?? {})) agents[name] = { ...cfg, ...own.agents?.[name] }
  return {
    agents,
    companion_model: own.companion_model ?? settings.companions?.model ?? 'claude-sonnet-5-5',
    max_parallel: own.max_parallel ?? settings.max_parallel ?? 2,
  }
}

export type Option = { value: string; label: string }

/** The model list, with a model it doesn't know kept at the top so the select can show it. */
export function modelOptions(settings: Settings, id: string): Option[] {
  const models = (settings.models ?? []).map((m) => ({ value: m.id, label: m.label }))
  return models.some((m) => m.value === id) ? models : [{ value: id, label: `${id} (not in the list)` }, ...models]
}

/**
 * The account tabs: the named claude-profiles, plus plain ~/.claude ("default") when the board runs
 * as it or there's nothing else. The tab you picked, else the account the board runs as, else the first.
 */
export function settingsAccounts(options: Options | null, settings: Settings, picked: string | null) {
  const all = options?.accounts ?? []
  const named = all.filter((a) => a !== 'default')
  const accounts = all.includes('default') && (settings.account === 'default' || !named.length) ? ['default', ...named] : named
  const account = picked && accounts.includes(picked) ? picked : accounts.includes(settings.account) ? settings.account : accounts[0] ?? null
  return { accounts, account }
}

export const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1)

/** The line under Slack in Notifications. */
export function slackNote(s: { loading?: boolean; configured?: boolean; connected?: boolean; team?: string; user_id?: string; error?: string }): string {
  if (s.loading) return 'Checking…'
  if (!s.configured) return 'Not set up yet. Create the app from harness/slack/manifest.yaml at api.slack.com/apps, then paste its tokens here.'
  if (s.connected) return `Connected${s.team ? ` to ${s.team}` : ''}. Messages go to ${s.user_id}.`
  return `Not connected${s.error ? `: ${s.error}` : ''}.`
}

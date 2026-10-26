// Settings' reading of settings.yaml, apart from how the page looks.

import type { AgentConfig, Options, Settings } from '@/lib/types'

export const EFFORTS = ['default', 'low', 'medium', 'high', 'xhigh', 'max']

/** Same as projectSettings() in board/store.mjs: the project's own values, else the top-level ones. */
export function projectSettings(settings: Settings, project: string) {
  const own = settings.per_project?.[project] ?? {}
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

/** The project tabs: every profile. The tab you picked, else the project new tasks start in, else the first. */
export function settingsProjects(options: Options | null, settings: Settings, picked: string | null) {
  const projects = options?.profiles ?? []
  const names = projects.map((p) => p.name)
  const project = picked && names.includes(picked) ? picked : settings.profile && names.includes(settings.profile) ? settings.profile : names[0] ?? null
  return { projects, project }
}

/** Same as figmaColors() in board/store.mjs. */
export const FIGMA_DEFAULTS = { page_bg: '#1e1e1e', section_fill: '#404040' }

/** A typed color as #rrggbb ("1E1E1E", "#abc" and " #1e1e1e " all work), or null if it isn't one. */
export function hexColor(input: string): string | null {
  const v = input.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(v)) return `#${[...v].map((c) => c + c).join('')}`
  return /^[0-9a-f]{6}$/.test(v) ? `#${v}` : null
}

export function figmaColors(settings: Settings, project: string | null = null) {
  const own = { ...settings.figma, ...(project ? settings.per_project?.[project]?.figma : undefined) }
  return {
    page_bg: hexColor(own.page_bg ?? '') ?? FIGMA_DEFAULTS.page_bg,
    section_fill: hexColor(own.section_fill ?? '') ?? FIGMA_DEFAULTS.section_fill,
  }
}

export const capitalize =(s: string) => s[0].toUpperCase() + s.slice(1)

/** The line under Slack in Notifications. */
export function slackNote(s: { loading?: boolean; configured?: boolean; connected?: boolean; team?: string; user_id?: string; error?: string }): string {
  if (s.loading) return 'Checking…'
  if (!s.configured) return 'Not set up yet. Create the app from harness/slack/manifest.yaml at api.slack.com/apps, then paste its tokens here.'
  if (s.connected) return `Connected${s.team ? ` to ${s.team}` : ''}. Messages go to ${s.user_id}.`
  return `Not connected${s.error ? `: ${s.error}` : ''}.`
}

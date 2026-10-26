import { describe, expect, it } from 'vitest'
import type { ProjectOption, Settings } from '@/lib/types'
import { figmaColors, hexColor, modelOptions, projectSettings, settingsProjects, slackNote } from './rules'

const SETTINGS: Settings = {
  account: 'studio',
  profile: 'site',
  max_parallel: 4,
  agents: { planner: { model: 'claude-opus-5-5', effort: 'high' }, designer: { model: 'claude-opus-5-5', effort: 'high' } },
  models: [{ id: 'claude-opus-5-5', label: 'Opus 5.5' }, { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' }],
  companions: { model: 'claude-sonnet-5-5' },
  per_project: { app: { agents: { designer: { effort: 'max' } }, max_parallel: 1, figma: { page_bg: '#000000' } } },
}

const project = (name: string): ProjectOption => ({ name, label: name.toUpperCase(), account: null, task_kinds: [], libraries: [], has_work_file: false })

describe('settings rules', () => {
  it("reads a project's own values over the top-level ones", () => {
    expect(projectSettings(SETTINGS, 'app')).toEqual({
      agents: { planner: { model: 'claude-opus-5-5', effort: 'high' }, designer: { model: 'claude-opus-5-5', effort: 'max' } },
      companion_model: 'claude-sonnet-5-5',
      max_parallel: 1,
    })
    expect(projectSettings(SETTINGS, 'site').max_parallel).toBe(4)
  })

  it('keeps a model the list lacks, at the top', () => {
    expect(modelOptions(SETTINGS, 'claude-opus-5-5').map((o) => o.value)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5'])
    expect(modelOptions(SETTINGS, 'claude-old')[0]).toEqual({ value: 'claude-old', label: 'claude-old (not in the list)' })
  })

  it('tabs every project and opens the picked one, else the default project, else the first', () => {
    const options = { accounts: ['studio'], profiles: [project('app'), project('site')] }
    expect(settingsProjects(options, SETTINGS, null).project).toBe('site')
    expect(settingsProjects(options, SETTINGS, 'app').project).toBe('app')
    expect(settingsProjects(options, SETTINGS, 'gone').project).toBe('site')
    expect(settingsProjects(options, { ...SETTINGS, profile: undefined }, null).project).toBe('app')
    expect(settingsProjects({ accounts: [], profiles: [] }, SETTINGS, null).project).toBeNull()
  })

  it("says where Slack stands", () => {
    expect(slackNote({ loading: true })).toBe('Checking…')
    expect(slackNote({ configured: false })).toMatch(/^Not set up yet/)
    expect(slackNote({ configured: true, connected: true, team: 'Studio', user_id: 'U1' })).toBe('Connected to Studio. Messages go to U1.')
    expect(slackNote({ configured: true, connected: false, error: 'invalid_auth' })).toBe('Not connected: invalid_auth.')
  })

  it('reads typed colors as #rrggbb, and nothing else', () => {
    expect(hexColor('1E1E1E')).toBe('#1e1e1e')
    expect(hexColor(' #404040 ')).toBe('#404040')
    expect(hexColor('#abc')).toBe('#aabbcc')
    expect(hexColor('grey')).toBeNull()
    expect(hexColor('#12345')).toBeNull()
  })

  it('falls back to the default Figma colors for any that are missing or invalid', () => {
    expect(figmaColors(SETTINGS)).toEqual({ page_bg: '#1e1e1e', section_fill: '#404040' })
    expect(figmaColors({ ...SETTINGS, figma: { page_bg: '#000000', section_fill: 'nope' } })).toEqual({ page_bg: '#000000', section_fill: '#404040' })
  })

  it("reads a project's own Figma colors over the top-level ones", () => {
    const settings = { ...SETTINGS, figma: { section_fill: '#222222' } }
    expect(figmaColors(settings, 'app')).toEqual({ page_bg: '#000000', section_fill: '#222222' })
    expect(figmaColors(settings, 'site')).toEqual({ page_bg: '#1e1e1e', section_fill: '#222222' })
  })
})

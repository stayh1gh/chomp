import { describe, expect, it } from 'vitest'
import type { Settings } from '@/lib/types'
import { accountSettings, modelOptions, settingsAccounts, slackNote } from './rules'

const SETTINGS: Settings = {
  account: 'studio',
  max_parallel: 4,
  agents: { planner: { model: 'claude-opus-5-5', effort: 'high' }, designer: { model: 'claude-opus-5-5', effort: 'high' } },
  models: [{ id: 'claude-opus-5-5', label: 'Opus 5.5' }, { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' }],
  companions: { model: 'claude-sonnet-5-5' },
  per_account: { client: { agents: { designer: { effort: 'max' } }, max_parallel: 1 } },
}

describe('settings rules', () => {
  it("reads an account's own values over the top-level ones", () => {
    expect(accountSettings(SETTINGS, 'client')).toEqual({
      agents: { planner: { model: 'claude-opus-5-5', effort: 'high' }, designer: { model: 'claude-opus-5-5', effort: 'max' } },
      companion_model: 'claude-sonnet-5-5',
      max_parallel: 1,
    })
    expect(accountSettings(SETTINGS, 'studio').max_parallel).toBe(4)
  })

  it('keeps a model the list lacks, at the top', () => {
    expect(modelOptions(SETTINGS, 'claude-opus-5-5').map((o) => o.value)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5'])
    expect(modelOptions(SETTINGS, 'claude-old')[0]).toEqual({ value: 'claude-old', label: 'claude-old (not in the list)' })
  })

  it('tabs the named accounts and opens the picked one, else the board account', () => {
    const options = { accounts: ['default', 'client', 'studio'], profiles: [] }
    expect(settingsAccounts(options, SETTINGS, null)).toEqual({ accounts: ['client', 'studio'], account: 'studio' })
    expect(settingsAccounts(options, SETTINGS, 'client').account).toBe('client')
    expect(settingsAccounts(options, SETTINGS, 'gone').account).toBe('studio')
    expect(settingsAccounts({ accounts: [], profiles: [] }, SETTINGS, null).account).toBeNull()
  })

  it('tabs plain ~/.claude when the board runs as it, or it is the only account', () => {
    expect(settingsAccounts({ accounts: ['default'], profiles: [] }, SETTINGS, null)).toEqual({ accounts: ['default'], account: 'default' })
    const options = { accounts: ['default', 'client'], profiles: [] }
    expect(settingsAccounts(options, { ...SETTINGS, account: 'default' }, null)).toEqual({ accounts: ['default', 'client'], account: 'default' })
  })

  it("says where Slack stands", () => {
    expect(slackNote({ loading: true })).toBe('Checking…')
    expect(slackNote({ configured: false })).toMatch(/^Not set up yet/)
    expect(slackNote({ configured: true, connected: true, team: 'Studio', user_id: 'U1' })).toBe('Connected to Studio. Messages go to U1.')
    expect(slackNote({ configured: true, connected: false, error: 'invalid_auth' })).toBe('Not connected: invalid_auth.')
  })
})

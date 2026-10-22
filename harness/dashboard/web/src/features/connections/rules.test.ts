import { describe, expect, it } from 'vitest'
import { column } from '@/test/fixtures'
import type { Connections } from '@/lib/types'
import { channelText, claudeFor, otherServers, serverRows } from './rules'

const COLUMNS = [
  column({ id: 'plan', title: 'Plan', requires_mcp: ['mobbin'], optional_mcp: ['gdrive'] }),
  column({ id: 'ideation', title: 'Ideation', requires_mcp: ['figma'], optional_mcp: ['gdrive'] }),
]
const conn = (servers: Connections['servers']): Connections => ({ account: 'studio', servers })

describe('connections rules', () => {
  it('lists required servers before optional ones, with who needs them', () => {
    const rows = serverRows(COLUMNS, conn([]), 'studio')
    expect(rows.map((r) => [r.name, r.needed, r.columns])).toEqual([
      ['mobbin', true, ['Plan']], ['figma', true, ['Ideation']], ['gdrive', false, ['Plan', 'Ideation']],
    ])
  })

  it('counts only the exact name (or the Drive connector), and says how to fix the rest', () => {
    const rows = serverRows(COLUMNS, conn([
      { name: 'figma-old', status: 'needs auth' },
      { name: 'mobbin', status: 'connected' },
      { name: 'claude.ai Google Drive', status: 'connected' },
    ]), 'studio')
    const by = Object.fromEntries(rows.map((r) => [r.name, r]))
    expect(by.mobbin.ok).toBe(true)
    expect(by.mobbin.fix).toBeNull()
    expect(by.gdrive.ok).toBe(true)
    expect(by.figma.ok).toBe(false)
    expect(by.figma.fix).toBe('claude-profile use studio && claude  →  /mcp  →  figma-old  →  Authenticate')
  })

  it('gives the add command, and the connector hint for Drive, when nothing matches', () => {
    const by = Object.fromEntries(serverRows(COLUMNS, conn([]), 'default').map((r) => [r.name, r]))
    expect(by.figma.fix).toBe('command claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp')
    expect(by.gdrive.connectorHint).toBe(true)
    expect(by.gdrive.fix).toContain('--client-id <google-oauth-client-id> --client-secret gdrive')
  })

  it('shows nothing to fix while checking', () => {
    expect(serverRows(COLUMNS, null, 'studio').every((r) => r.fix === null && !r.connectorHint)).toBe(true)
  })

  it('lists other connected servers only', () => {
    expect(otherServers(COLUMNS, conn([
      { name: 'linear', status: 'connected' }, { name: 'notion', status: 'needs auth' }, { name: 'figma', status: 'connected' },
    ])).map((s) => s.name)).toEqual(['linear'])
  })

  it('names the notification channel in use', () => {
    expect(channelText('slack', { ready: true, team: 'Studio', user_id: 'U1' }, 'slack', true))
      .toEqual({ inUse: true, name: 'Slack notifications', detail: 'Socket Mode · Studio · in use · on', note: 'A task that needs you messages U1 on Slack', hint: null })
    expect(channelText('phone', { ready: true }, 'slack', true).hint).toBe('Switch in Settings → Notifications → Notify me via')
    expect(channelText('phone', { ready: false, title: 'Remote Control is off' }, 'phone', false).detail).toBe('Remote Control · in use · off in the sidebar')
    expect(claudeFor('default')).toBe('command claude')
  })
})

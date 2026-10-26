import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { store } from '@/lib/store'
import type { Board, Options } from '@/lib/types'
import { SettingsPage } from './settings-page'

const api = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ api }))

const OPTIONS: Options = {
  accounts: ['personal'],
  profiles: [
    { name: 'chomp', label: 'Chomp', account: 'personal', task_kinds: ['full'], libraries: [], has_work_file: true },
    { name: 'canvas', label: 'Canvas', account: null, task_kinds: ['full'], libraries: [], has_work_file: true },
  ],
}
const BOARD = {
  columns: [], tasks: [], runner: { running: true, active: [] }, app: null,
  settings: {
    account: 'personal', profile: 'chomp', max_parallel: 2,
    agents: { planner: { model: 'claude-opus-5-5', effort: 'high' } },
    models: [{ id: 'claude-opus-5-5', label: 'Opus 5.5' }],
    per_project: { canvas: { max_parallel: 3, figma: { page_bg: '#000000' } } },
  },
} as unknown as Board

function open() {
  render(<SettingsPage />)
  act(() => store.set({ board: BOARD, options: OPTIONS, settingsProject: null }))
}

beforeEach(() => {
  api.mockReset()
  api.mockImplementation(async (path: string) => ({ '/api/options': OPTIONS, '/api/state': BOARD })[path] ?? {})
})

describe('SettingsPage', () => {
  it('tabs the projects and opens the default one, with its own settings', async () => {
    open()
    expect(screen.getByRole('tab', { name: 'Chomp' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Canvas' })).toBeInTheDocument()
    expect(screen.getByLabelText('Agents at once')).toHaveTextContent('2')
    expect(screen.queryByRole('button', { name: /Reset to defaults/ })).toBeNull()

    await userEvent.click(screen.getByRole('tab', { name: 'Canvas' }))
    expect(screen.getByLabelText('Agents at once')).toHaveTextContent('3')
    expect(screen.getByLabelText('Page background')).toHaveValue('#000000')
  })

  it("resets only the open project's settings", async () => {
    open()
    await userEvent.click(screen.getByRole('tab', { name: 'Canvas' }))
    await userEvent.click(screen.getByRole('button', { name: /Reset to defaults/ }))
    expect(api).toHaveBeenCalledWith('/api/settings', { reset_project: 'canvas' })
  })
})

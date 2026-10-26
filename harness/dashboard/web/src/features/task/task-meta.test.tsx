import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmProvider } from '@/components/confirm'
import { store } from '@/lib/store'
import type { Board, TaskApp } from '@/lib/types'
import { column, task } from '@/test/fixtures'
import { RunLocally, TaskFacts } from './task-meta'

const api = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ api }))

const dev = { id: 'development', title: 'Development' }
const COLUMNS = [
  column({ id: 'development', title: 'Development', agent: 'builder', group: dev }),
  column({ id: 'review', title: 'Draft PR', agent: 'builder', group: dev, enter_label: 'Create draft PR' }),
]
const board = (app: TaskApp = null, tasks = [task({ id: 't' })]): Board => ({
  columns: COLUMNS, tasks, app, runner: { running: true, active: [] }, settings: { account: 'me' },
})
const detail = (t = task({ id: 't' })) => ({ task: t, chat: [], docs: [], openQuestions: null })

describe('RunLocally', () => {
  const t = task({ id: 't', workspace: { branch: 'b' } })
  it.each([
    [null, 'Not running', ['Run locally']],
    [{ task: 't', state: 'starting' } as const, 'Starting… the first run installs dependencies and takes a few minutes', ['Cancel']],
    [{ task: 't', state: 'running', url: 'http://127.0.0.1:4403' } as const, 'Running at 127.0.0.1:4403', ['Open', 'Stop']],
    [{ task: 't', state: 'failed', error: 'npm ci failed' } as const, 'npm ci failed', ['Retry']],
  ])('shows %o as a status line and its actions', (app, text, actions) => {
    render(<RunLocally task={t} board={board(app, [t])} />)
    expect(screen.getByText(text)).toBeInTheDocument()
    for (const name of actions) expect(screen.getByRole(name === 'Open' ? 'link' : 'button', { name })).toBeInTheDocument()
  })
})

describe('TaskFacts', () => {
  it('moves a ready Build card into Draft PR with Create draft PR', async () => {
    vi.spyOn(store, 'refresh').mockResolvedValue()
    api.mockResolvedValue({})
    const t = task({ id: 't', column: 'development', status: 'ready' })
    render(<ConfirmProvider><TaskFacts task={t} detail={detail(t)} board={board(null, [t])} /></ConfirmProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Create draft PR' }))
    expect(api).toHaveBeenCalledWith('/api/tasks/t/move', { column: 'review' })
  })

  it('offers Open PR for review once the draft PR is up, and no Create draft PR', () => {
    const t = task({ id: 't', column: 'review', status: 'ready', pr: { url: 'https://github.com/o/r/pull/42', draft: true } })
    render(<ConfirmProvider><TaskFacts task={t} detail={detail(t)} board={board(null, [t])} /></ConfirmProvider>)
    expect(screen.getByRole('button', { name: 'Open PR for review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create draft PR' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Draft PR #42' })).toHaveAttribute('href', 'https://github.com/o/r/pull/42')
  })
})

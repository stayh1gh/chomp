import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmProvider } from '@/components/confirm'
import { store } from '@/lib/store'
import type { Board } from '@/lib/types'
import { FLOW, task } from '@/test/fixtures'
import { DocTabs } from './doc-tabs'

const api = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ api }))

describe('DocTabs › Delete', () => {
  it('asks in place, says what happens, and deletes only on the second click', async () => {
    vi.spyOn(store, 'navigate').mockResolvedValue()
    api.mockResolvedValue({})
    const t = task({ id: 't', ref: 'AOS-4', column: 'designing', links: { figma: 'https://figma.com/x' } })
    const board: Board = { columns: FLOW, tasks: [t], app: null, runner: { running: true, active: [] }, settings: { account: 'me' } }
    render(<ConfirmProvider><DocTabs task={t} detail={{ task: t, chat: [], docs: [], openQuestions: null }} board={board} /></ConfirmProvider>)

    await userEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    expect(screen.getByText(/Any agent working on AOS-4 stops.*This doesn't touch its Figma page\./)).toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Delete AOS-4' }))
    expect(api).toHaveBeenCalledWith('/api/tasks/t/delete', {})
    expect(store.navigate).toHaveBeenCalledWith('/')
  })
})

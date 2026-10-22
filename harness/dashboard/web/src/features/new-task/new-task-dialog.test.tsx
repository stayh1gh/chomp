import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { store } from '@/lib/store'
import type { Board, Options } from '@/lib/types'
import { NewTaskDialog } from './new-task-dialog'

const api = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ api }))

const OPTIONS: Options = {
  accounts: ['default'],
  profiles: [
    { name: 'chomp', label: 'Chomp', account: null, task_kinds: ['full', 'design'], libraries: [], has_work_file: true },
    { name: 'newsroom', label: 'Newsroom', account: 'studio', task_kinds: ['design'], libraries: [{ id: 'web', label: 'Web', has_work_file: false }], has_work_file: false },
  ],
}
const board = (profile: string) => ({ columns: [], tasks: [], runner: { running: true, active: [] }, settings: { account: 'default', profile }, app: null }) as Board

function open(profile: string) {
  render(<NewTaskDialog />)
  act(() => store.set({ board: board(profile), options: OPTIONS, newTaskOpen: true }))
}

beforeEach(() => {
  api.mockReset()
  act(() => store.set({ newTaskOpen: false }))
})

describe('NewTaskDialog', () => {
  it('opens on the default project with its rules applied', async () => {
    open('newsroom')
    expect(await screen.findByRole('dialog', { name: 'New task' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.getByLabelText('Design system')).toHaveTextContent('Web')
    expect(screen.getByLabelText('Figma file')).toBeRequired()
    expect(screen.getByRole('radio', { name: /^Full/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^Design only/ })).toBeChecked()
    expect(screen.getByText('Runs as the studio Claude account. Newsroom is design only.')).toBeInTheDocument()
  })

  it('makes Figma optional for a project with a work file, and hides Design system without one', async () => {
    open('chomp')
    await screen.findByRole('dialog')
    expect(screen.getByLabelText('Figma file (optional)')).not.toBeRequired()
    expect(screen.queryByLabelText('Design system')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Full/ })).toBeChecked()
  })

  it('fills the Figma field from a link in the request', async () => {
    open('chomp')
    await screen.findByRole('dialog')
    // Pasted, as links are: typed one key at a time, the first partial link would win (as on the classic board).
    await userEvent.click(screen.getByLabelText('What should happen?'))
    await userEvent.paste('Frames at https://www.figma.com/design/abc/X ')
    expect(screen.getByLabelText('Figma file (optional)')).toHaveValue('https://www.figma.com/design/abc/X')
  })

  it('creates the task, clears the draft and opens it', async () => {
    const navigate = vi.spyOn(store, 'navigate').mockResolvedValue()
    api.mockResolvedValueOnce({ id: '2026-10-16-login' })
    open('newsroom')
    await screen.findByRole('dialog')
    await userEvent.type(screen.getByLabelText('Title'), 'Login')
    await userEvent.type(screen.getByLabelText('What should happen?'), 'A login screen')
    await userEvent.type(screen.getByLabelText('Figma file'), 'https://www.figma.com/design/abc/X')
    await userEvent.click(screen.getByLabelText('Redesigning an existing screen'))
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(api).toHaveBeenCalledWith('/api/tasks', {
      title: 'Login', prompt: 'A login screen', redesign: true, profile: 'newsroom', kind: 'design', library: 'web',
      figma_file: 'https://www.figma.com/design/abc/X',
    })
    expect(navigate).toHaveBeenCalledWith('/task/2026-10-16-login')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the draft when closed without creating', async () => {
    open('chomp')
    await screen.findByRole('dialog')
    await userEvent.type(screen.getByLabelText('Title'), 'Half typed')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    act(() => store.set({ newTaskOpen: true }))
    expect(await screen.findByLabelText('Title')).toHaveValue('Half typed')
  })
})

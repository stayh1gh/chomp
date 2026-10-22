import { describe, expect, it, vi } from 'vitest'
import { createBoardStore } from './store'
import type { Board } from './types'
import { column, task } from '@/test/fixtures'

const board = (taskIds: string[]): Board => ({
  columns: [column({ id: 'todo', title: 'To do' })],
  tasks: taskIds.map((id) => task({ id, column: 'todo' })),
  runner: { running: true, active: [] },
  settings: { account: 'default' },
  app: null,
})

function setup(pathname: string, routes: Record<string, () => unknown>) {
  const calls: string[] = []
  const api = vi.fn(async (path: string) => {
    calls.push(path)
    const answer = routes[path]
    if (!answer) throw new Error(`no route ${path}`)
    return answer()
  })
  const location = { pathname }
  const history = {
    pushState: vi.fn((_s: unknown, _t: string, url: string) => { location.pathname = url }),
    replaceState: vi.fn((_s: unknown, _t: string, url: string) => { location.pathname = url }),
  }
  const notify = { info: vi.fn(), error: vi.fn() }
  const store = createBoardStore({ api: api as never, notify, location, history: history as never })
  return { store, calls, history, notify }
}

describe('board store', () => {
  it('coalesces refreshes that arrive while one is in flight into one more', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    let n = 0
    const { store, calls } = setup('/', {
      '/api/state': async () => {
        if (n++ === 0) await gate
        return board([])
      },
    })
    const first = store.refresh()
    void store.refresh()
    void store.refresh()
    release()
    await first
    await vi.waitFor(() => expect(calls).toEqual(['/api/state', '/api/state']))
  })

  it('loads the open task with its board', async () => {
    const detail = { task: { id: 't-1' }, chat: [], docs: [], openQuestions: null }
    const { store } = setup('/task/t-1', { '/api/state': () => board(['t-1']), '/api/tasks/t-1': () => detail })
    await store.refresh()
    expect(store.getState().detail).toEqual(detail)
  })

  it('goes back to the board once when the open task was deleted', async () => {
    const { store, history, notify } = setup('/task/gone', { '/api/state': () => board(['t-1']) })
    await store.refresh()
    expect(store.getState().route).toEqual({ page: 'tasks', taskId: null, docName: null })
    expect(history.replaceState).toHaveBeenCalledWith({}, '', '/')
    expect(notify.info).toHaveBeenCalledWith('That task was deleted')
  })

  it('says when the board is unreachable', async () => {
    const { store, notify } = setup('/', {})
    await store.refresh()
    expect(notify.error).toHaveBeenCalledWith("Couldn't reach the board: no route /api/state")
  })

  it('clears the last task when navigating to another', async () => {
    const detail = (id: string) => ({ task: { id }, chat: [], docs: [], openQuestions: null })
    const { store, history } = setup('/task/t-1', {
      '/api/state': () => board(['t-1', 't-2']),
      '/api/tasks/t-1': () => detail('t-1'),
      '/api/tasks/t-2': () => detail('t-2'),
    })
    await store.refresh()
    store.set({ doc: { name: 'plan.md', html: '' } })
    const pending = store.navigate('/task/t-2')
    expect(store.getState().doc).toBeNull()
    expect(store.getState().detail).toBeNull()
    await pending
    expect(history.pushState).toHaveBeenCalledWith({}, '', '/task/t-2')
    expect(store.getState().detail?.task.id).toBe('t-2')
  })
})

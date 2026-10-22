import { describe, expect, it, vi } from 'vitest'
import { moveTask } from './move'
import { FLOW, task } from '@/test/fixtures'

function deps(answer = true) {
  return {
    api: vi.fn(async () => ({})),
    confirm: vi.fn(async () => answer),
    notify: { info: vi.fn(), error: vi.fn() },
    refresh: vi.fn(async () => {}),
  }
}
const ideation = FLOW[1]

describe('moveTask', () => {
  it('moves an idle card without asking', async () => {
    const d = deps()
    await moveTask(d, task({ id: 'a', column: 'plan' }), ideation)
    expect(d.confirm).not.toHaveBeenCalled()
    expect(d.api).toHaveBeenCalledWith('/api/tasks/a/move', { column: 'ideation' })
    expect(d.notify.info).toHaveBeenCalledWith('Moved to Ideation')
    expect(d.refresh).toHaveBeenCalled()
  })

  it('asks before stopping a working agent, and stays put on no', async () => {
    const d = deps(false)
    await moveTask(d, task({ id: 'a', title: 'Login', column: 'plan', status: 'working' }), ideation)
    expect(d.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'An agent is working on "Login"', action: 'Stop and move', destructive: true }))
    expect(d.api).not.toHaveBeenCalled()
    expect(d.refresh).toHaveBeenCalled()
  })

  it('moves a working card on yes', async () => {
    const d = deps(true)
    await moveTask(d, task({ id: 'a', column: 'plan', status: 'working' }), ideation)
    expect(d.api).toHaveBeenCalledWith('/api/tasks/a/move', { column: 'ideation' })
  })

  it('does nothing but refresh when dropped on its own column', async () => {
    const d = deps()
    await moveTask(d, task({ id: 'a', column: 'ideation', status: 'working' }), ideation)
    expect(d.confirm).not.toHaveBeenCalled()
    expect(d.api).not.toHaveBeenCalled()
    expect(d.refresh).toHaveBeenCalled()
  })

  it("toasts the server's refusal", async () => {
    const d = deps()
    d.api.mockRejectedValueOnce(new Error("Development isn't part of a design-only task."))
    await moveTask(d, task({ id: 'a', column: 'plan' }), ideation)
    expect(d.notify.error).toHaveBeenCalledWith("Development isn't part of a design-only task.")
  })
})

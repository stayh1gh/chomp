import { describe, expect, it, vi } from 'vitest'
import { task } from '@/test/fixtures'
import { deleteNote, openPr, removeTask } from './actions'

function deps(answer: boolean) {
  return {
    api: vi.fn(async () => ({})),
    confirm: vi.fn(async () => answer),
    notify: { info: vi.fn(), error: vi.fn() },
    refresh: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
  }
}
const pr = { url: 'https://github.com/o/r/pull/7', draft: true }

describe('deleteNote', () => {
  it("names what deleting leaves alone", () => {
    expect(deleteNote(task({ id: 'a' }))).toBeNull()
    expect(deleteNote(task({ id: 'a', links: { figma: 'https://figma.com/x' }, pr, workspace: { branch: 'b' } })))
      .toBe("This doesn't touch its Figma page, its pull request, its git branch.")
    expect(deleteNote(task({ id: 'a', workspace: { branch: 'b', removed: true } }))).toBeNull()
  })
})

describe('openPr', () => {
  it('opens the PR only on yes', async () => {
    const no = deps(false)
    await openPr(no, task({ id: 'a', pr }))
    expect(no.api).not.toHaveBeenCalled()

    const yes = deps(true)
    await openPr(yes, task({ id: 'a', title: 'Login', pr }))
    expect(yes.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Open the PR for "Login" for review?', action: 'Open PR for review' }))
    expect(yes.api).toHaveBeenCalledWith('/api/tasks/a/pr-ready', {})
    expect(yes.notify.info).toHaveBeenCalledWith('PR opened for review — the card is in Done')
    expect(yes.refresh).toHaveBeenCalled()
  })
})

describe('removeTask', () => {
  it('deletes on yes, says what it leaves, and goes back to the board', async () => {
    const d = deps(true)
    await removeTask(d, task({ id: 'a', title: 'Login', pr }))
    expect(d.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Delete "Login"?',
      description: "Any agent working on it stops, and it leaves the board. This doesn't touch its pull request.",
      destructive: true,
    }))
    expect(d.api).toHaveBeenCalledWith('/api/tasks/a/delete', {})
    expect(d.navigate).toHaveBeenCalledWith('/')
  })

  it('keeps the task on no, and stays put on a failure', async () => {
    const no = deps(false)
    await removeTask(no, task({ id: 'a' }))
    expect(no.api).not.toHaveBeenCalled()

    const fails = deps(true)
    fails.api.mockRejectedValueOnce(new Error('no such task'))
    await removeTask(fails, task({ id: 'a' }))
    expect(fails.notify.error).toHaveBeenCalledWith('no such task')
    expect(fails.navigate).not.toHaveBeenCalled()
  })
})

import { describe, expect, it } from 'vitest'
import { columnServes, taskStatus } from './status'
import { FLOW, task } from '@/test/fixtures'

const status = (fields: Parameters<typeof task>[0]) => taskStatus(task(fields), FLOW)

describe('taskStatus', () => {
  it('names a working card by what its column does', () => {
    expect(status({ id: 'a', column: 'development', status: 'working' })).toEqual({ key: 'working', label: 'Building code…' })
    expect(status({ id: 'a', column: 'ideation', status: 'working' })).toEqual({ key: 'working', label: 'Working in Figma…' })
    expect(status({ id: 'a', column: 'unknown', status: 'working' }).label).toBe('Running…')
  })

  it('treats an agent asking a question like a card waiting on you', () => {
    expect(status({ id: 'a', status: 'needs_input' }).key).toBe('waiting')
    expect(status({ id: 'a', status: 'blocked', blocker: { kind: 'agent', title: 'Which one?' } }).key).toBe('waiting')
    expect(status({ id: 'a', status: 'blocked', blocker: { kind: 'mcp', title: 'Figma is off' } })).toEqual({ key: 'blocked', label: 'Blocked' })
  })

  it('says PR open once the PR left draft, in Review or Done', () => {
    expect(status({ id: 'a', column: 'done', status: 'ready', pr: { url: 'https://github.com/o/r/pull/1', draft: false } })).toEqual({ key: 'pr-open', label: 'PR open' })
    expect(status({ id: 'a', column: 'review', status: 'ready', pr: { url: 'https://github.com/o/r/pull/1', draft: true } })).toEqual({ key: 'ready', label: 'Draft PR ready' })
    expect(status({ id: 'a', column: 'refinement', status: 'ready' })).toEqual({ key: 'ready', label: 'Ready for review' })
  })

  it('reads an idle card by its column', () => {
    expect(status({ id: 'a', column: 'done' }).key).toBe('done')
    expect(status({ id: 'a', column: 'designing' })).toEqual({ key: 'waiting', label: 'Waiting for user' })
    expect(status({ id: 'a', column: 'plan' })).toEqual({ key: 'idle', label: 'Idle' })
  })
})

describe('columnServes', () => {
  const development = FLOW.find((c) => c.id === 'development')!
  it('keeps design-only tasks out of code columns', () => {
    expect(columnServes(development, task({ id: 'a', kind: 'design' }))).toBe(false)
    expect(columnServes(development, task({ id: 'a', kind: 'full' }))).toBe(true)
    expect(columnServes(development, task({ id: 'a' }))).toBe(true) // no kind means full
    expect(columnServes(FLOW[0], task({ id: 'a', kind: 'design' }))).toBe(true)
  })
})

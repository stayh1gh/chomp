import { describe, expect, it } from 'vitest'
import { parseRoute, routeTaskId } from './router'

describe('parseRoute', () => {
  it('reads the board, a task, and a task document', () => {
    expect(parseRoute('/')).toEqual({ page: 'tasks', taskId: null, docName: null })
    expect(parseRoute('/task/t-42')).toEqual({ page: 'tasks', taskId: 't-42', docName: null })
    expect(parseRoute('/task/t-42/doc/plan.md')).toEqual({ page: 'tasks', taskId: 't-42', docName: 'plan.md' })
  })

  it('reads settings and connections', () => {
    expect(parseRoute('/settings')).toEqual({ page: 'settings' })
    expect(parseRoute('/connections')).toEqual({ page: 'connections' })
  })

  it('sends anything else to the board', () => {
    expect(parseRoute('/task/UPPER')).toEqual({ page: 'tasks', taskId: null, docName: null })
    expect(parseRoute('/task/t-1/doc/notes.txt')).toEqual({ page: 'tasks', taskId: null, docName: null })
    expect(parseRoute('/nope')).toEqual({ page: 'tasks', taskId: null, docName: null })
  })

  it('names the open task only on the tasks page', () => {
    expect(routeTaskId(parseRoute('/task/t-1'))).toBe('t-1')
    expect(routeTaskId(parseRoute('/settings'))).toBeNull()
  })
})

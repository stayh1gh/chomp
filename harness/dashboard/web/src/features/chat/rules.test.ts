import { describe, expect, it } from 'vitest'
import { FLOW, task } from '@/test/fixtures'
import type { ChatMessage, QuestionSet } from '@/lib/types'
import { chatAgent, collectAnswers, composerPlaceholder, messageMeta, messageText, openSet, waitingTasks } from './rules'

const now = Date.parse('2026-10-16T12:00:00Z')
const at = '2026-10-16T11:55:00Z'
const SET: QuestionSet = {
  id: 'set1',
  questions: [
    { id: 'q1', question: 'Which page?', options: ['License', 'Vault'], recommended: 'Vault' },
    { id: 'q2', question: 'Any notes?', options: [] },
    { id: 'q3', question: 'Mobile too?', options: ['Yes', 'No'], recommended: 'Yes' },
  ],
}

describe('chat rules', () => {
  it("reaches the column's agent, or a human column's chat agent", () => {
    expect(chatAgent(FLOW[0])).toBe('planner')
    expect(chatAgent({ ...FLOW[2], chat_agent: 'designer' })).toBe('designer')
    expect(chatAgent(FLOW[6])).toBeNull()
  })

  it('invites you to talk to the agent, if the column has one', () => {
    expect(composerPlaceholder('designer')).toBe('Talk to the agent')
    expect(composerPlaceholder(null)).toBe('No agent works this column')
  })

  it('lists the tasks waiting on you', () => {
    const tasks = [task({ id: 'a', status: 'needs_input' }), task({ id: 'b', status: 'blocked' }), task({ id: 'c', status: 'working' })]
    expect(waitingTasks(tasks).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('shows the open questions as a form only while the task waits on them', () => {
    const detail = (status: 'needs_input' | 'idle') => ({ task: task({ id: 'a', status }), chat: [], docs: [], openQuestions: SET })
    expect(openSet(detail('needs_input'))).toBe(SET)
    expect(openSet(detail('idle'))).toBeNull()
  })

  it('names who said what, and when', () => {
    const m = (fields: Partial<ChatMessage>): ChatMessage => ({ id: 'm', at, from: 'agent', ...fields })
    expect(messageMeta(m({ agent: 'designer' }), now)).toBe('designer · 5m ago')
    expect(messageMeta(m({ from: 'you', delivered: false }), now)).toBe('You · 5m ago · not read yet')
    expect(messageMeta(m({ from: 'system' }), now)).toBeNull()
    expect(messageMeta(m({ kind: 'questions', agent: 'planner' }), now)).toBe('planner asked · 5m ago')
    expect(messageText(m({ kind: 'answers', questions: SET.questions.slice(0, 2), answers: { q1: 'Vault', q2: '' } })))
      .toBe('Which page?\n→ Vault\n\nAny notes?\n→ Use your judgment')
  })

  it('sends the recommended option when unanswered, blank for "use your judgment"', () => {
    expect(collectAnswers(SET, { q1: 'License', q2: null })).toEqual({ q1: 'License', q2: '', q3: 'Yes' })
    expect(collectAnswers(SET, { q1: '  ', q2: ' typed ' })).toEqual({ q1: 'Vault', q2: 'typed', q3: 'Yes' })
    expect(collectAnswers(SET, { q1: 'License' }, true)).toEqual({})
  })
})

// What the chat says and sends, apart from how it looks.

import type { ChatMessage, Column, QuestionSet, Task, TaskDetail } from '@/lib/types'

/** The agent your messages reach: the column's own agent, or a human column's chat agent. */
export function chatAgent(col: Column | undefined): string | null {
  if (!col) return null
  return col.owner === 'agent' ? col.agent ?? null : col.chat_agent ?? null
}

export function composerPlaceholder(who: string | null): string {
  if (!who) return 'No agent works this column'
  return 'Talk to the agent'
}

/** With no task open, the dock lists the tasks that need you. */
export const waitingTasks = (tasks: Task[]) => tasks.filter((t) => t.status === 'needs_input' || t.status === 'blocked')

/** The question set to answer here, if the task is waiting on one; it shows as a form, not a message. */
export function openSet(detail: TaskDetail): QuestionSet | null {
  return detail.openQuestions && detail.task.status === 'needs_input' ? detail.openQuestions : null
}

/** The line above a message: only "Not read yet", on yours the agent hasn't picked up. Who and when
    are left out; the bubble already says it's yours, and the log reads in order. */
export function messageMeta(m: ChatMessage): string | null {
  return m.from === 'you' && m.kind !== 'answers' && m.delivered === false ? 'Not read yet' : null
}

/** The body of a questions or answers message, as plain text. */
export function messageText(m: ChatMessage): string {
  if (m.kind === 'questions') return (m.questions ?? []).map((q, i) => `${i + 1}. ${q.question}`).join('\n')
  if (m.kind === 'answers') return (m.questions ?? []).map((q) => `${q.question}\n→ ${m.answers?.[q.id] || 'Use your judgment'}`).join('\n\n')
  return m.text ?? ''
}

/**
 * The answers to send. Per question: null means "use your judgment" (sent blank, the agent
 * decides); unanswered means the recommended option. Skipping the whole set sends nothing.
 */
export function collectAnswers(set: QuestionSet, picked: Record<string, string | null>, skipAll = false): Record<string, string> {
  if (skipAll) return {}
  return Object.fromEntries(set.questions.map((q) => {
    const a = picked[q.id]
    return [q.id, a === null ? '' : (a ?? '').trim() || q.recommended || '']
  }))
}

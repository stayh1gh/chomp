// Where a card stands, named the same way on its status button and in the task panel.

import type { Column, Task } from './types'

export type StatusKey = 'working' | 'queued' | 'paused' | 'waiting' | 'blocked' | 'pr-open' | 'ready' | 'done' | 'idle'

const WORKING_LABEL: Record<string, string> = {
  plan: 'Planning…',
  ideation: 'Generating ideas…',
  designing: 'Working in Figma…',
  refinement: 'Working in Figma…',
  development: 'Building code…',
  review: 'Generating PR…',
}

export function taskStatus(task: Task, columns: Column[]): { key: StatusKey; label: string } {
  const col = columns.find((c) => c.id === task.column)
  const s = task.status
  if (s === 'working') return { key: 'working', label: WORKING_LABEL[task.column] ?? 'Running…' }
  if (s === 'queued') return { key: 'queued', label: 'Queued' }
  if (s === 'paused') return { key: 'paused', label: 'Paused' }
  // An agent that stopped to ask the owner something waits on a reply, same as a question.
  if (s === 'needs_input' || (s === 'blocked' && task.blocker?.kind === 'agent')) return { key: 'waiting', label: 'Waiting for user' }
  if (s === 'blocked') return { key: 'blocked', label: 'Blocked' }
  // Opening the PR for review finishes the task: the card sits in Done as "PR open".
  if (task.pr && !task.pr.draft && ['review', 'done'].includes(task.column)) return { key: 'pr-open', label: 'PR open' }
  if (s === 'ready') return { key: 'ready', label: task.column === 'review' && task.pr ? 'Draft PR ready' : 'Ready for review' }
  if (col?.id === 'done') return { key: 'done', label: 'Done' }
  if (col?.owner === 'human') return { key: 'waiting', label: 'Waiting for user' }
  return { key: 'idle', label: 'Idle' }
}

/** The text color each status is named in (card button, panel status text). */
export const STATUS_INK: Record<StatusKey, string> = {
  working: 'text-[var(--green-200)]',
  done: 'text-[var(--green-200)]',
  waiting: 'text-[var(--orange-200)]',
  blocked: 'text-[var(--red-200)]',
  ready: 'text-[var(--indigo-200)]',
  queued: 'text-[var(--indigo-200)]',
  'pr-open': 'text-model-ink',
  paused: 'text-ink-muted',
  idle: 'text-ink-muted',
}

/** A column takes a card if it's part of the card's kind of task (design-only skips some). */
export function columnServes(col: Column, task: Task | null | undefined): boolean {
  return !col.kinds || !task || col.kinds.includes(task.kind ?? 'full')
}

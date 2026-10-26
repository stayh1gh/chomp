// The board draws flow.yaml's columns as lanes: neighbouring columns that share a `group` are
// one lane (Plan + Ideation, Development + Draft PR). Nothing here names a column.

import { columnServes } from './status'
import type { Column, Task, Tone } from './types'

export type Lane = { id: string; title: string; icon?: string; tone?: Tone; columns: Column[] }

export function lanesOf(columns: Column[]): Lane[] {
  const lanes: Lane[] = []
  for (const col of columns) {
    const last = lanes.at(-1)
    if (col.group && last && last.columns.at(-1)?.group?.id === col.group.id) {
      last.columns.push(col)
      continue
    }
    const { id, title, icon, tone } = col.group ?? col
    lanes.push({ id, title, icon, tone, columns: [col] })
  }
  return lanes
}

/** Who works the lane: "@planner", "2 agents", or "@you" for a human column. */
export function laneOwner(lane: Lane): string {
  const agents = [...new Set(lane.columns.map((c) => (c.owner === 'agent' ? c.agent : null)).filter(Boolean))]
  if (!agents.length) return '@you'
  return agents.length === 1 ? `@${agents[0]}` : `${agents.length} agents`
}

/** Where a card dropped on the lane goes: its first column that takes the card. */
export function dropColumn(lane: Lane, task: Task | null | undefined): Column | null {
  return lane.columns.find((c) => columnServes(c, task)) ?? null
}

/** The button a ready card gets when the next column in its lane has an `enter_label`. */
export function nextStep(task: Task, columns: Column[]): { label: string; column: Column } | null {
  if (task.status !== 'ready') return null
  const i = columns.findIndex((c) => c.id === task.column)
  const here = columns[i]
  const next = columns[i + 1]
  if (!here?.group || !next?.enter_label || next.group?.id !== here.group.id) return null
  return { label: next.enter_label, column: next }
}

/** The tasks of the project the board's filter shows; null shows every project. */
export function shownTasks(tasks: Task[], project: string | null): Task[] {
  return project ? tasks.filter((t) => t.profile === project) : tasks
}

/** A Tailwind text colour per tone, from the semantic tokens. */
export const TONE_INK: Record<Tone | 'muted', string> = {
  brand: 'text-[var(--indigo-200)]',
  warn: 'text-warn-ink',
  model: 'text-model-ink',
  success: 'text-success',
  muted: 'text-ink-muted',
}

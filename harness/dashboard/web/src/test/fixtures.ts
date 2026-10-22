import type { Column, Task } from '@/lib/types'

export const task = (fields: Partial<Task> & { id: string }): Task => ({
  title: fields.id, column: 'plan', status: 'idle', steps: [], docs: 0, messages: 0, unread: 0, unanswered: false, ...fields,
})

export const column = (fields: Partial<Column> & { id: string }): Column => ({ title: fields.id, owner: 'agent', ...fields })

/** The columns of flow.yaml, as the status rules see them. */
export const FLOW: Column[] = [
  column({ id: 'plan', title: 'Plan', agent: 'planner' }),
  column({ id: 'ideation', title: 'Ideation', agent: 'designer' }),
  column({ id: 'designing', title: 'Designing', owner: 'human' }),
  column({ id: 'refinement', title: 'Refinement', agent: 'designer' }),
  column({ id: 'development', title: 'Development', agent: 'builder', kinds: ['full'] }),
  column({ id: 'review', title: 'Review', agent: 'builder', kinds: ['full'] }),
  column({ id: 'done', title: 'Done', owner: 'human' }),
]

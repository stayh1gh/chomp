import type { ConfirmOptions } from '@/components/confirm'
import type { Column, Task } from '@/lib/types'

type Deps = {
  api: (path: string, body: unknown) => Promise<unknown>
  confirm: (options: ConfirmOptions) => Promise<boolean>
  notify: { info: (text: string) => void; error: (text: string) => void }
  refresh: () => Promise<void>
}

/** Move a card to a column. Moving one an agent is working on stops the agent, so it asks first. */
export async function moveTask({ api, confirm, notify, refresh }: Deps, task: Task, column: Column) {
  if (task.column === column.id) return refresh()
  if (task.status === 'working') {
    const yes = await confirm({
      title: `An agent is working on "${task.title}"`,
      description: 'Stop it and move the card?',
      action: 'Stop and move',
      destructive: true,
    })
    if (!yes) return refresh()
  }
  try {
    await api(`/api/tasks/${task.id}/move`, { column: column.id })
    notify.info(`Moved to ${column.title}`)
  } catch (err) {
    notify.error((err as Error).message)
  }
  return refresh()
}

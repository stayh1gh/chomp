// The task panel's two actions that are hard to take back. Opening the PR asks in a dialog;
// deleting asks in place, in the panel (doc-tabs.tsx), before it calls deleteTask.

import type { ConfirmOptions } from '@/components/confirm'
import type { Task } from '@/lib/types'

type Deps = {
  api: (path: string, body: unknown) => Promise<unknown>
  confirm: (options: ConfirmOptions) => Promise<boolean>
  notify: { info: (text: string) => void; error: (text: string) => void }
  refresh: () => Promise<void>
  navigate: (path: string) => Promise<void>
}

/** What deleting leaves alone, said up front so nobody expects it gone. */
export function deleteNote(task: Task): string | null {
  const extras = [
    task.links?.figma && 'its Figma page',
    task.pr && 'its pull request',
    task.workspace && !task.workspace.removed && 'its git branch',
  ].filter(Boolean)
  return extras.length ? `This doesn't touch ${extras.join(', ')}.` : null
}

/** Opening the draft PR for review is the owner's call: it notifies reviewers and finishes the task. */
export async function openPr({ api, confirm, notify, refresh }: Deps, task: Task) {
  const yes = await confirm({
    title: `Open the PR for "${task.title}" for review?`,
    description: 'It stops being a draft, reviewers are notified and the card moves to Done.',
    action: 'Open PR for review',
  })
  if (!yes) return
  try {
    await api(`/api/tasks/${task.id}/pr-ready`, {})
    notify.info('PR opened for review — the card is in Done')
  } catch (err) {
    notify.error((err as Error).message)
  }
  await refresh()
}

export async function deleteTask({ api, notify, navigate }: Pick<Deps, 'api' | 'notify' | 'navigate'>, task: Task) {
  try {
    await api(`/api/tasks/${task.id}/delete`, {})
    notify.info('Task deleted')
    await navigate('/')
  } catch (err) {
    notify.error((err as Error).message)
  }
}

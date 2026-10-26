import { Maximize2, Minus } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { StatusText } from '@/components/status-text'
import { store, useStore } from '@/lib/store'
import { waitingTasks } from './rules'

/**
 * The dock in the bottom-right corner of the board: the tasks that need you. It isn't there
 * while a task is open (its chat is in the task panel) or when nothing needs you.
 */
export function ChatDock() {
  const { board, route, chatCollapsed } = useStore()
  const waiting = board && route.page === 'tasks' && !route.taskId ? waitingTasks(board.tasks) : []
  if (!board || !waiting.length) return null

  return (
    <section aria-label="Tasks that need you" className="fixed right-4 bottom-4 z-30 flex w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-border bg-surface-card shadow-[0_24px_64px_rgba(0,0,0,.55)]">
      <header className={cn('flex h-12 shrink-0 items-center gap-2 pr-3 pl-4', !chatCollapsed && 'shadow-[inset_0_-1px_0_var(--semantic-divider)]')}>
        <strong className="min-w-0 flex-1 truncate font-semibold text-ink-strong">
          {waiting.length} task{waiting.length > 1 ? 's need' : ' needs'} you
        </strong>
        <Button
          variant="ghost" size="icon" aria-expanded={!chatCollapsed} aria-label={chatCollapsed ? 'Open the list' : 'Minimize the list'}
          onClick={() => store.set({ chatCollapsed: !chatCollapsed })}
        >
          {chatCollapsed ? <Maximize2 /> : <Minus />}
        </Button>
      </header>
      {chatCollapsed ? null : (
        <ul className="m-0 flex list-none flex-col p-1">
          {waiting.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void store.navigate(`/task/${t.id}`)}
                className="flex min-h-9 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-ink-body hover:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <StatusText task={t} columns={board.columns} className="shrink-0 text-sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { DynamicIcon, type IconName } from 'lucide-react/dynamic'
import { cn } from 'cn'
import { lanesOf, shownTasks, TONE_INK, type Lane } from '@/lib/lanes'
import { STATUS_INK, taskStatus } from '@/lib/status'
import { useStore } from '@/lib/store'
import type { Board, Task } from '@/lib/types'
import { Link } from '@/features/shell/link'
import { TaskView } from './task-panel'

const card = 'flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-card shadow-[0_24px_64px_rgba(0,0,0,.55)]'

/** The open task as a full page: every task, grouped by lane, beside the task itself. */
export function TaskPage() {
  const { board, detail, project } = useStore()
  if (!board) return null
  const tasks = shownTasks(board.tasks, project)
  return (
    <div className="flex min-w-0 flex-1 gap-2 py-2 pr-2">
      <nav aria-label="Tasks" className={cn(card, 'w-[273px] shrink-0')}>
        <header className="flex h-14 shrink-0 items-center px-4 shadow-[inset_0_-1px_0_var(--semantic-divider)]">
          <h2 className="m-0 text-lg font-semibold text-ink-strong">Tasks</h2>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-5">
          {[...lanesOf(board.columns)].reverse().map((lane) => (
            <LaneGroup key={lane.id} lane={lane} tasks={tasks.filter((t) => lane.columns.some((c) => c.id === t.column))} board={board} openId={detail?.task.id ?? null} />
          ))}
        </div>
      </nav>
      <main aria-label="Task details" className={cn(card, 'min-w-0 flex-1')}>
        {detail ? <TaskView key={detail.task.id} detail={detail} board={board} full /> : null}
      </main>
    </div>
  )
}

/** A lane's tasks, folded unless it holds the open task or one that's waiting on you. */
function LaneGroup({ lane, tasks, board, openId }: { lane: Lane; tasks: Task[]; board: Board; openId: string | null }) {
  const needsYou = tasks.some((t) => ['waiting', 'ready', 'blocked'].includes(taskStatus(t, board.columns).key))
  const [open, setOpen] = useState(needsYou || tasks.some((t) => t.id === openId))
  return (
    <section aria-label={lane.title} className="flex flex-col">
      <button
        type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-2 px-4 py-1 text-left outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        {lane.icon ? <DynamicIcon name={lane.icon as IconName} className={cn('size-4 shrink-0', TONE_INK[lane.tone ?? 'muted'])} aria-hidden="true" /> : null}
        <span className="text-sm font-semibold text-ink-strong">{lane.title}</span>
        <span className="flex-1 text-sm text-ink-subtle">{tasks.length}</span>
        <ChevronDown className={cn('size-4 text-ink-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && tasks.length ? (
        <ul className="m-0 ml-6 mr-4 mt-2 flex list-none flex-col gap-2 border-l border-border p-0 pl-2">
          {tasks.map((t) => {
            const st = taskStatus(t, board.columns)
            const current = t.id === openId
            return (
              <li key={t.id}>
                <Link
                  href={`/task/${t.id}`}
                  aria-current={current || undefined}
                  className={cn(
                    'flex flex-col items-start gap-2 rounded-lg border border-transparent px-2.5 py-2 no-underline hover:bg-accent',
                    current && 'border-border bg-surface-inset hover:bg-surface-inset',
                  )}
                >
                  <span className="w-full truncate text-sm font-semibold text-ink-strong">{t.title}</span>
                  <span className={cn('inline-flex h-5 items-center rounded-sm border border-border px-2 text-xs', STATUS_INK[st.key])}>{st.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

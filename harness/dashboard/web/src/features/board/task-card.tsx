import { useState, type ReactNode } from 'react'
import { CircleAlert, PenTool, RotateCcw } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { store } from '@/lib/store'
import { taskStatus } from '@/lib/status'
import type { Column, Task } from '@/lib/types'
import { Ring } from './ring'
import { StatusButton } from './status-button'


export function TaskCard({ task, columns, current }: { task: Task; columns: Column[]; current: boolean }) {
  const [dragging, setDragging] = useState(false)
  const done = task.steps.filter((s) => s.done).length
  const pct = task.steps.length ? Math.round((done / task.steps.length) * 100) : null
  const open = () => void store.navigate(`/task/${task.id}`)
  const status = taskStatus(task, columns)
  const columnTitle = columns.find((c) => c.id === task.column)?.title ?? ''

  return (
    <div
      draggable
      aria-current={current}
      data-dragging={dragging || undefined}
      onClick={open}
      onDragStart={(e) => {
        store.setDragging(task.id)
        e.dataTransfer.setData('text/plain', task.id)
        setDragging(true)
      }}
      onDragEnd={() => {
        setDragging(false)
        store.setDragging(null)
        void store.refresh()
      }}
      className={cn(
        'flex w-full shrink-0 cursor-pointer flex-col gap-2 rounded-xl border border-border-subtle bg-surface-card p-4 text-left hover:border-border-hover',
        current && 'border-brand hover:border-brand',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex min-h-5 items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-[.04em] text-ink-muted tabular-nums">{task.ref ?? ''}</span>
        {pct !== null ? (
          <span className="text-xs text-ink-subtle tabular-nums">
            <Meta tip={`${done} of ${task.steps.length} steps in ${columnTitle}`}><Ring pct={pct} />{pct}%</Meta>
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className="line-clamp-2 cursor-pointer rounded-sm text-left text-sm font-semibold text-ink-strong outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={`${task.ref ? `${task.ref} ` : ''}${task.title} — ${status.label}${task.activity && task.status === 'working' ? `, ${task.activity}` : ''}`}
        onClick={(e) => { e.stopPropagation(); open() }}
      >
        {task.title}
      </button>
      {task.prompt ? <p className="m-0 line-clamp-2 text-sm whitespace-pre-line text-ink-muted">{task.prompt}</p> : null}
      <Tags task={task} />
      {task.status === 'blocked' && task.blocker && task.blocker.kind !== 'agent' ? (
        <span className="flex items-center gap-2 text-xs text-ink-body">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{task.blocker.title}
        </span>
      ) : null}
      <StatusButton task={task} columns={columns} />
    </div>
  )
}

/** What kind of task it is. Status lives on the button, not here. */
function Tags({ task }: { task: Task }) {
  const tags = [
    task.kind === 'design' ? <Badge key="design" variant="purple"><PenTool />Design only</Badge> : null,
    task.redesign ? <Badge key="redesign"><RotateCcw />Redesign</Badge> : null,
  ].filter(Boolean)
  return tags.length ? <div className="flex flex-wrap items-center gap-1">{tags}</div> : null
}

function Meta({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1">{children}</span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

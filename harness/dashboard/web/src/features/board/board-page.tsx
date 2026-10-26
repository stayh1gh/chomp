import { useEffect, useState, type DragEvent } from 'react'
import { Funnel, History, Plus } from 'lucide-react'
import { DynamicIcon, type IconName } from 'lucide-react/dynamic'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm } from '@/components/confirm'
import { api } from '@/lib/api'
import { dropColumn, laneOwner, lanesOf, shownTasks, TONE_INK, type Lane } from '@/lib/lanes'
import { store, useStore } from '@/lib/store'
import { routeTaskId } from '@/lib/router'
import type { Board, Task } from '@/lib/types'
import { Page } from '@/features/shell/page'
import { openNewTask } from '@/features/new-task/new-task-dialog'
import { openRecap } from '@/features/recap/recap-dialog'
import { moveTask } from './move'
import { TaskCard } from './task-card'

const ALL = 'all'

export function BoardPage() {
  const { board, route, project } = useStore()
  const tasks = board ? shownTasks(board.tasks, project) : []
  const lanes = board ? lanesOf(board.columns) : []
  return (
    <Page
      title="Tasks"
      bare
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="toolbar" onClick={openRecap}><History />Recap</Button>
          <ProjectFilter board={board} />
          <Button variant="inverse" size="toolbar" onClick={() => void openNewTask()}><Plus />New task</Button>
        </div>
      }
    >
      {/* Lanes with cards share the width up to 268px each (six open lanes fill a 1920px screen);
          empty ones fold into rails. Each lane scrolls on its own. */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden px-5 pt-3 pb-5">
        {!board ? <Loading /> : lanes.map((lane, i) => {
          const mine = tasks.filter((t) => lane.columns.some((c) => c.id === t.column))
          // With nothing on the board at all, the first lane stays open to say so.
          return mine.length || (!tasks.length && i === 0)
            ? <OpenLane key={lane.id} lane={lane} tasks={mine} board={board} openId={routeTaskId(route)} />
            : <Rail key={lane.id} lane={lane} board={board} />
        })}
      </div>
    </Page>
  )
}

/** Filters: the board shows one project's tasks, or every project's. */
function ProjectFilter({ board }: { board: Board | null }) {
  const { project, options } = useStore()
  useEffect(() => void store.loadOptions().catch(() => {}), [])
  const names = [...new Set([...(board?.tasks.map((t) => t.profile) ?? []), project])].filter((p): p is string => Boolean(p))
  const label = (name: string) => options?.profiles.find((p) => p.name === name)?.label ?? name
  return (
    <Select value={project ?? ALL} onValueChange={(v) => store.setPref({ project: v === ALL ? null : v })}>
      <SelectTrigger
        aria-label="Filter by project"
        className="gap-2 border-border data-[size=default]:h-9 bg-secondary px-3 text-sm font-semibold hover:bg-[var(--semantic-bg-secondary-default-hovered)] [&>svg:last-child]:hidden"
      >
        <Funnel />{project ? label(project) : 'Filters'}
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        <SelectItem value={ALL}>All projects</SelectItem>
        {names.map((name) => <SelectItem key={name} value={name}>{label(name)}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/** Drop handling shared by lanes and rails: a card goes to the lane's first column that takes it. */
function useDrop(lane: Lane, board: Board) {
  const confirm = useConfirm()
  const [over, setOver] = useState(false)
  const taskById = (id: string | null) => board.tasks.find((t) => t.id === id) ?? null
  return {
    over,
    handlers: {
      onDragOver(e: DragEvent) {
        const dragged = store.getDragging()
        if (!dragged || !dropColumn(lane, taskById(dragged))) return // no preventDefault → no drop
        e.preventDefault()
        setOver(true)
      },
      onDragLeave() {
        setOver(false)
      },
      onDrop(e: DragEvent) {
        e.preventDefault()
        setOver(false)
        const task = taskById(e.dataTransfer.getData('text/plain'))
        store.setDragging(null)
        const target = dropColumn(lane, task)
        if (!task || !target) return
        void moveTask({ api, confirm, notify: { info: (t) => toast(t), error: (t) => toast.error(t) }, refresh: store.refresh }, task, target)
      },
    },
  }
}

function LaneIcon({ lane }: { lane: Lane }) {
  if (!lane.icon) return null
  return <DynamicIcon name={lane.icon as IconName} className={cn('size-4 shrink-0', TONE_INK[lane.tone ?? 'muted'])} aria-hidden="true" />
}

function OpenLane({ lane, tasks, board, openId }: { lane: Lane; tasks: Task[]; board: Board; openId: string | null }) {
  const { over, handlers } = useDrop(lane, board)
  return (
    <section
      aria-label={lane.title}
      {...handlers}
      className={cn('flex min-h-0 max-w-67 min-w-62 flex-1 basis-0 flex-col gap-1 rounded-xl', over && 'outline outline-ring')}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 px-3">
        <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-ink-strong">
          <LaneIcon lane={lane} />
          {lane.title}
        </h2>
        <span className="text-sm text-ink-subtle">{tasks.length}</span>
        <span className="ml-auto text-sm text-ink-subtle">{laneOwner(lane)}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {tasks.length ? tasks.map((t) => <TaskCard key={t.id} task={t} columns={board.columns} current={openId === t.id} />) : (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border p-4">
            <p className="m-0 text-sm font-semibold text-ink-strong">No tasks yet</p>
            <p className="m-0 text-sm text-ink-muted">Write what you want built. It waits here until you drag it to the next lane.</p>
            <Button variant="outline" size="sm" onClick={() => void openNewTask()}>New task</Button>
          </div>
        )}
      </div>
    </section>
  )
}

/** An empty lane, folded to a 56px rail that still takes drops. */
function Rail({ lane, board }: { lane: Lane; board: Board }) {
  const { over, handlers } = useDrop(lane, board)
  const owner = laneOwner(lane)
  const agent = lane.columns[0].owner === 'agent' ? lane.columns[0].agent : null
  const label = owner.startsWith('@') && owner !== '@you' ? `${lane.title} · ${owner}` : lane.title
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <section
          aria-label={`${lane.title}, empty`}
          {...handlers}
          className={cn(
            'flex w-14 shrink-0 flex-col items-center gap-3 rounded-xl border border-dashed border-border-subtle py-3',
            over && 'border-solid border-ring bg-accent',
          )}
        >
          <LaneIcon lane={lane} />
          <h2 className="m-0 text-sm font-medium whitespace-nowrap text-ink-body [writing-mode:vertical-rl]">{label}</h2>
        </section>
      </TooltipTrigger>
      <TooltipContent side="right">
        {lane.title} · {owner} — empty. {agent ? `Drop a card here to start the ${agent}` : 'Drop a card here'}
      </TooltipContent>
    </Tooltip>
  )
}

/** Before the first /api/state answers: the lanes' shape, with flat bars for cards. */
function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading the board" className="flex flex-1 gap-3">
      {[3, 2, 3, 1].map((n, i) => (
        <div key={i} className="flex max-w-67 min-w-62 flex-1 basis-0 flex-col gap-2">
          <div className="flex h-11 items-center px-3"><div className="h-4 w-28 rounded-sm bg-surface-inset" /></div>
          {Array.from({ length: n }, (_, j) => <div key={j} className="h-40 rounded-xl border border-border-subtle bg-surface-card" />)}
        </div>
      ))}
    </div>
  )
}

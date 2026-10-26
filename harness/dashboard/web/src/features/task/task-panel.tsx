import { useEffect, useState } from 'react'
import { ArrowLeft, Maximize2, MessageSquare, Minimize2, PanelLeftClose, X } from 'lucide-react'
import { cn } from 'cn'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useConfirm } from '@/components/confirm'
import { api } from '@/lib/api'
import { columnServes, taskStatus } from '@/lib/status'
import { act, fullTask, store, useStore } from '@/lib/store'
import type { Board, Task, TaskDetail } from '@/lib/types'
import { moveTask } from '@/features/board/move'
import { TaskChat } from '@/features/chat/task-chat'
import { DocTabs } from './doc-tabs'

const card = 'flex flex-col overflow-hidden rounded-xl border border-border bg-surface-card shadow-[0_24px_64px_rgba(0,0,0,.55)]'

/**
 * The open task as a panel over the board's right side. A document opened full page
 * (/task/<id>/doc/<name>) takes the window instead: QA screenshots need the width. As a full
 * page, the task is drawn by TaskPage in place of the board.
 */
export function TaskPanel() {
  const state = useStore()
  const { route, detail, board, pageDoc } = state
  if (route.page !== 'tasks' || !route.taskId || fullTask(state)) return null
  if (route.docName) {
    if (!detail) return null
    return (
      <aside aria-label="Document" className={cn(card, 'fixed inset-2 z-40 bg-surface')}>
        <DocPage task={detail.task} name={route.docName} html={pageDoc?.name === route.docName ? pageDoc.html : null} />
      </aside>
    )
  }
  return (
    <aside aria-label="Task details" className={cn(card, 'fixed top-2 right-2 bottom-2 z-20 w-[min(730px,calc(100vw-16px))]')}>
      {detail && board ? <TaskView key={detail.task.id} detail={detail} board={board} full={false} /> : <TaskLoading />}
    </aside>
  )
}

/** The task: its header (title, Stop/Start, Column), then the chat beside its tabs. */
export function TaskView({ detail, board, full }: { detail: TaskDetail; board: Board; full: boolean }) {
  const { task } = detail
  const [chatOpen, setChatOpen] = useState(true)
  useEffect(() => void store.loadOptions().catch(() => {}), []) // project and design-system labels; cached after the first call
  const st = taskStatus(task, board.columns)

  return (
    <>
      <header className="flex shrink-0 items-center gap-4 p-4 shadow-[inset_0_-1px_0_var(--semantic-divider)]">
        <h2 className="m-0 min-w-0 flex-1 truncate text-lg font-semibold text-ink-strong" title={task.title}>{task.title}</h2>
        {st.key === 'working' || st.key === 'queued' ? <Button variant="outline" size="sm" onClick={() => act(task.id, 'pause')}>Stop</Button> : null}
        {st.key === 'paused' ? <Button variant="outline" size="sm" onClick={() => act(task.id, 'start')}>Start</Button> : null}
        <ColumnSelect task={task} board={board} />
        <div className="flex items-center gap-1">
          {!chatOpen ? <Button variant="ghost" size="icon" aria-label="Show chat" title="Show chat" onClick={() => setChatOpen(true)}><MessageSquare /></Button> : null}
          <Button variant="ghost" size="icon" aria-label={full ? 'Show as panel' : 'Open as page'} title={full ? 'Show as panel' : 'Open as page'} onClick={() => store.setPref({ taskFull: !full })}>
            {full ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={() => void store.navigate('/')}><X /></Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {chatOpen ? (
          <div className={cn('flex min-h-0 min-w-0 flex-col shadow-[inset_-1px_0_0_var(--semantic-border-strong)]', full ? 'flex-1' : 'w-[405px] shrink-0')}>
            <TaskChat
              detail={detail} board={board}
              actions={<Button variant="ghost" size="icon" aria-label="Hide chat" title="Hide chat" onClick={() => setChatOpen(false)}><PanelLeftClose /></Button>}
            />
          </div>
        ) : null}
        <div className={cn('flex min-h-0 min-w-0 flex-col', chatOpen && full ? 'w-[425px] shrink-0' : 'flex-1')}>
          <DocTabs task={task} detail={detail} board={board} />
        </div>
      </div>
    </>
  )
}

/** The Column select, in brand: where the card is, and where you can move it. */
function ColumnSelect({ task, board }: { task: Task; board: Board }) {
  const confirm = useConfirm()
  const notify = { info: (t: string) => toast(t), error: (t: string) => toast.error(t) }
  return (
    <Select value={task.column} onValueChange={(id) => {
      const target = board.columns.find((c) => c.id === id)
      if (target) void moveTask({ api, confirm, notify, refresh: store.refresh }, task, target)
    }}>
      <SelectTrigger
        aria-label="Move to column"
        className="h-8 gap-2 border-0 bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 [&_svg]:text-primary-foreground!"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {board.columns.map((c) => <SelectItem key={c.id} value={c.id} disabled={!columnServes(c, task)}>{c.title}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/** Before /api/tasks/<id> answers: the panel's shape, with flat bars for the facts. */
function TaskLoading() {
  return (
    <div aria-busy="true" aria-label="Loading the task" className="flex flex-1 flex-col">
      <div className="flex h-16 shrink-0 items-center px-4 shadow-[inset_0_-1px_0_var(--semantic-divider)]"><div className="h-5 w-64 rounded-sm bg-surface-inset" /></div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[405px] shrink-0 shadow-[inset_-1px_0_0_var(--semantic-border-strong)]" />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-20">
          {[40, 56, 32, 48, 64].map((w, i) => <div key={i} className="h-3 rounded-sm bg-surface-inset" style={{ width: `${w}%` }} />)}
        </div>
      </div>
    </div>
  )
}

function DocPage({ task, name, html }: { task: Task; name: string; html: string | null }) {
  const back = () => void store.navigate(`/task/${task.id}`)
  return (
    <>
      <header className="flex shrink-0 items-start gap-3 px-6 py-5 shadow-[inset_0_-1px_0_var(--semantic-divider)]">
        <Button variant="ghost" size="sm" onClick={back}><ArrowLeft />Back to card</Button>
        <div className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-semibold tracking-[.04em] text-ink-subtle tabular-nums">{task.ref ? `${task.ref} · ` : ''}{task.title}</span>
          <h2 className="m-0 text-xl font-semibold text-ink-strong">{name}</h2>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={back}><X /></Button>
      </header>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pt-5 pb-6">
        {html !== null
          ? <article className="doc doc-full" dangerouslySetInnerHTML={{ __html: html }} />
          : <p className="text-sm text-ink-muted">This document isn't there.</p>}
      </div>
    </>
  )
}

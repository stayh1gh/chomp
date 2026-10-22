import { useEffect } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { cn } from 'cn'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm'
import { api } from '@/lib/api'
import { act, chatMode, store, useStore } from '@/lib/store'
import type { Board, Task, TaskDetail } from '@/lib/types'
import { removeTask } from './actions'
import { DocTabs } from './doc-tabs'
import { FigmaFileForm, TaskMeta } from './task-meta'

const head = 'flex shrink-0 items-start gap-3 px-6 py-5'
const body = 'flex flex-1 flex-col gap-6 overflow-y-auto px-6 pt-5'

/**
 * The open task, docked in the main panel under its header (main's 8px margin + 1px border +
 * 64px head). A document opened full page (/task/<id>/doc/<name>) takes the window instead:
 * QA screenshots need the width.
 */
export function TaskPanel() {
  const state = useStore()
  const { route, detail, board, pageDoc } = state
  const besideChat = chatMode(state) === 'panel' // the maximized chat takes the right edge
  if (route.page !== 'tasks' || !route.taskId || !detail || !board) return null
  const full = Boolean(route.docName)
  return (
    <aside
      aria-label="Task details"
      className={cn(
        'fixed flex flex-col overflow-hidden bg-surface',
        full
          ? 'inset-2 z-40 rounded-xl border border-border shadow-[0_24px_64px_rgba(0,0,0,.5)]'
          : 'top-[73px] right-[9px] bottom-[9px] z-20 w-[min(600px,calc(100vw-18px))] rounded-br-[11px] shadow-[inset_1px_0_0_var(--semantic-divider)]',
        !full && besideChat && 'right-[calc(var(--chat-panel)+16px)] w-[min(600px,calc(100vw-var(--chat-panel)-224px))] max-[720px]:right-[9px]',
      )}
    >
      {full
        ? <DocPage key="doc" task={detail.task} name={route.docName!} html={pageDoc?.name === route.docName ? pageDoc.html : null} />
        : <CardView key="card" task={detail.task} detail={detail} board={board} />}
    </aside>
  )
}

function CardView({ task, detail, board }: { task: Task; detail: TaskDetail; board: Board }) {
  const confirm = useConfirm()
  useEffect(() => void store.loadOptions().catch(() => {}), []) // design-system labels; cached after the first call
  const deps = { api, confirm, notify: { info: (t: string) => toast(t), error: (t: string) => toast.error(t) }, refresh: store.refresh, navigate: store.navigate }
  // An agent's own blocker is its ask, already in the chat; only the board's need an alert.
  const blocker = task.status === 'blocked' && task.blocker && task.blocker.kind !== 'agent' ? task.blocker : null

  return (
    <>
      <header className={cn(head, 'shadow-[inset_0_-1px_0_var(--semantic-divider),inset_1px_0_0_var(--semantic-divider)]')}>
        <div className="min-w-0 flex-1">
          {task.ref ? <span className="mb-1 block text-xs font-semibold tracking-[.04em] text-ink-subtle tabular-nums">{task.ref}</span> : null}
          <h2 className="m-0 text-xl font-semibold text-ink-strong">{task.title}</h2>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={() => void store.navigate('/')}><X /></Button>
      </header>
      <div className={cn(body, 'pb-[var(--chat-clearance,24px)]')}>
        {blocker ? (
          <Alert variant="warning" role="alert">
            <AlertTitle>{blocker.title}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              {blocker.detail?.startsWith('Fix: ') ? (
                <>
                  <span>Run this in a terminal, then the card retries on its own within a minute:</span>
                  <code className="block rounded-sm bg-background px-3 py-2 text-sm break-all whitespace-pre-wrap text-ink-body">{blocker.detail.slice(5)}</code>
                </>
              ) : <span>{blocker.detail ?? ''}</span>}
              {blocker.needs === 'figma_file' ? <FigmaFileForm task={task} /> : null}
              {blocker.kind === 'error' ? <div><Button variant="outline" size="sm" onClick={() => act(task.id, 'retry')}>Retry</Button></div> : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <TaskMeta task={task} detail={detail} board={board} />
        <DocTabs key={task.id} task={task} detail={detail} board={board} />
        <div><Button variant="destructive" size="sm" onClick={() => void removeTask(deps, task)}>Delete task</Button></div>
      </div>
    </>
  )
}

function DocPage({ task, name, html }: { task: Task; name: string; html: string | null }) {
  const back = () => void store.navigate(`/task/${task.id}`)
  return (
    <>
      <header className={cn(head, 'shadow-[inset_0_-1px_0_var(--semantic-divider)]')}>
        <Button variant="ghost" size="sm" onClick={back}><ArrowLeft />Back to card</Button>
        <div className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-semibold tracking-[.04em] text-ink-subtle tabular-nums">{task.ref ? `${task.ref} · ` : ''}{task.title}</span>
          <h2 className="m-0 text-xl font-semibold text-ink-strong">{name}</h2>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={back}><X /></Button>
      </header>
      <div className={cn(body, 'pb-6')}>
        {html !== null
          ? <article className="doc doc-full" dangerouslySetInnerHTML={{ __html: html }} />
          : <p className="text-sm text-ink-muted">This document isn't there.</p>}
      </div>
    </>
  )
}

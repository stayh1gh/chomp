import { useState } from 'react'
import { Check, ChevronDown, Loader, Maximize2, User } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { docLabel, timeAgo } from '@/lib/format'
import { act, store, useStore } from '@/lib/store'
import type { Board, Task, TaskDetail } from '@/lib/types'
import { Link } from '@/features/shell/link'
import { deleteNote, deleteTask } from './actions'
import { FigmaFileForm, RunLocally, TaskFacts } from './task-meta'

const OVERVIEW = 'overview'
const sectionTitle = 'm-0 text-sm font-semibold text-ink-strong'
const section = 'flex flex-col pb-6 shadow-[inset_0_-1px_0_var(--semantic-border-strong)]'

/** Open a document's tab and bring the tabs into view (from a tab, a step or a chat message). */
export async function showDoc(taskId: string, name: string) {
  await store.openDoc(taskId, name)
  document.getElementById('task-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** The task's tabs: Overview (facts, request, sub-tasks, activity), then one per document. */
export function DocTabs({ task, detail, board }: { task: Task; detail: TaskDetail; board: Board }) {
  const { doc } = useStore()
  const active = doc && detail.docs.includes(doc.name) ? doc.name : null

  return (
    <Tabs
      id="task-tabs"
      value={active ?? OVERVIEW}
      onValueChange={(v) => (v === OVERVIEW ? store.set({ doc: null }) : void showDoc(task.id, v))}
      className="min-h-0 flex-1 gap-0"
    >
      <TabsList variant="page" aria-label="Task details" className="h-12! w-full shrink-0 justify-start gap-0 overflow-x-auto px-2 shadow-[inset_0_-1px_0_var(--semantic-border-strong)]">
        <TabsTrigger value={OVERVIEW} className={tab}>Overview</TabsTrigger>
        {detail.docs.map((name) => <TabsTrigger key={name} value={name} title={name} className={tab}>{docLabel(name)}</TabsTrigger>)}
      </TabsList>
      <TabsContent value={OVERVIEW} className="min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-6 px-4 pt-7 pb-6">
          <Overview task={task} detail={detail} board={board} />
        </div>
      </TabsContent>
      {active && doc ? (
        <TabsContent value={active} className="min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-4 px-4 pt-5 pb-6 text-base">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-subtle">{active}</span>
              <Button variant="ghost" size="icon" asChild>
                <Link href={`/task/${task.id}/doc/${active}`} aria-label={`Open ${active} full page`} title="Open full page"><Maximize2 /></Link>
              </Button>
            </div>
            {/* Server-escaped Markdown (harness/dashboard/markdown.mjs): the board's one raw HTML. */}
            <article className="doc" dangerouslySetInnerHTML={{ __html: doc.html }} />
          </div>
        </TabsContent>
      ) : null}
    </Tabs>
  )
}

// Text tabs with a 2px underline, 48px tall, as wide as their label plus 16px a side.
const tab = 'h-12! px-4! text-ink-body'

function Overview({ task, detail, board }: { task: Task; detail: TaskDetail; board: Board }) {
  const [clamped, setClamped] = useState((task.prompt ?? '').length > 400)
  // An agent's own blocker is its ask, already in the chat; only the board's need an alert.
  const blocker = task.status === 'blocked' && task.blocker && task.blocker.kind !== 'agent' ? task.blocker : null
  const workspace = task.workspace && !task.workspace.removed
  return (
    <>
      {blocker ? (
        <div className={cn(section, 'gap-3')}>
          <Alert variant="warning" role="alert">
            <AlertTitle className="text-sm">{blocker.title}</AlertTitle>
            <AlertDescription className="text-sm">
              {blocker.detail?.startsWith('Fix: ') ? 'Run this in a terminal, then the card retries on its own within a minute.' : blocker.detail ?? ''}
            </AlertDescription>
          </Alert>
          {blocker.detail?.startsWith('Fix: ')
            ? <code className="block rounded-lg bg-background px-3 py-2 text-sm break-all whitespace-pre-wrap text-ink-body">{blocker.detail.slice(5)}</code>
            : null}
          {blocker.needs === 'figma_file' ? <FigmaFileForm task={task} /> : null}
          {blocker.kind === 'error' ? <div><Button variant="outline" size="sm" onClick={() => act(task.id, 'retry')}>Retry</Button></div> : null}
        </div>
      ) : null}
      {workspace ? <div className={section}><RunLocally task={task} board={board} /></div> : null}
      <div className={section}><TaskFacts task={task} detail={detail} board={board} /></div>
      {task.prompt ? (
        <section className={cn(section, 'gap-2')}>
          <h3 className={sectionTitle}>Request</h3>
          <p
            onClick={() => setClamped(false)}
            className={cn(
              'm-0 text-sm whitespace-pre-wrap text-ink-body [overflow-wrap:anywhere]',
              clamped && 'max-h-30 overflow-hidden [mask-image:linear-gradient(#000_60%,transparent)]',
            )}
          >
            {task.prompt}
          </p>
        </section>
      ) : null}
      <SubTasks task={task} detail={detail} board={board} />
      <Activity task={task} board={board} />
      <DeleteTask task={task} />
    </>
  )
}

/** The current column's checklist. The runner ticks the steps, not you; a step's document opens its tab. */
function SubTasks({ task, detail, board }: { task: Task; detail: TaskDetail; board: Board }) {
  const [open, setOpen] = useState(true)
  const col = board.columns.find((c) => c.id === task.column)
  if (!task.steps.length || !col) return null
  const who = `@${col.owner === 'agent' ? col.agent : 'you'}`
  return (
    <section className={cn(section, 'gap-2')}>
      <button
        type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-2 rounded-sm text-left outline-none focus-visible:outline-2 focus-visible:outline-ring"
      >
        <h3 className={cn(sectionTitle, 'flex-1')}>Sub-tasks</h3>
        <ChevronDown className={cn('size-4 text-ink-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? (
        <ul className="m-0 flex list-none flex-col gap-4 p-0 text-sm">
          {task.steps.map((s, i) => {
            const file = col.steps?.find((c) => c.name === s.name)?.file
            const label = file && detail.docs.includes(file)
              ? <button type="button" className="cursor-pointer text-left underline-offset-3 hover:underline" onClick={() => void showDoc(task.id, file)}>{s.name}</button>
              : s.name
            return (
              <li key={i} className="flex items-center gap-2">
                {s.done
                  ? <span aria-label="Done" className="grid size-4 shrink-0 place-items-center rounded-sm bg-brand"><Check className="size-3 text-white" strokeWidth={3} /></span>
                  : <Loader aria-label="To do" className="size-4 shrink-0 text-ink-muted" />}
                <span className={cn('min-w-0 flex-1', s.done ? 'text-ink-muted' : 'text-ink-body')}>{label}</span>
                <span className="shrink-0 text-ink-subtle">{who}</span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

/** The card's moves, newest first: who moved it where, and when. */
function Activity({ task, board }: { task: Task; board: Board }) {
  const title = (id: string) => board.columns.find((c) => c.id === id)?.title ?? id
  const events = [...(task.history ?? [])].reverse().slice(0, 8)
  if (!events.length) return null
  return (
    <section className="flex flex-col gap-4">
      <h3 className={sectionTitle}>Activity</h3>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
        {events.map((e, i) => {
          const you = e.by === 'you'
          const what = !e.from ? 'created the task' : `moved it to ${title(e.to)}`
          return (
            <li key={i} className="flex items-center gap-2">
              {you
                ? <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-inset"><User className="size-3.5 text-ink-muted" aria-hidden="true" /></span>
                : <img src="/logo.svg" alt="" className="size-6 shrink-0" />}
              <span className="min-w-0 flex-1 truncate text-ink-muted" title={`${you ? 'You' : `@${e.by}`} ${what}`}>
                <span className="font-medium text-ink-strong">{you ? 'You' : `@${e.by}`}</span> {what}
              </span>
              <span className="shrink-0 text-ink-muted">{timeAgo(e.at)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Delete, last and out of the reading path: it asks right here before it does anything. */
function DeleteTask({ task }: { task: Task }) {
  const [asking, setAsking] = useState(false)
  const name = task.ref ?? 'task'
  const deps = { api, notify: { info: (t: string) => toast(t), error: (t: string) => toast.error(t) }, navigate: store.navigate }
  if (!asking) return <div><Button variant="ghost" size="sm" className="-ml-3 text-danger-ink" onClick={() => setAsking(true)}>Delete task</Button></div>
  return (
    <section aria-label="Delete task" className="flex flex-col gap-3 rounded-xl border border-danger-border p-4">
      <h3 className={sectionTitle}>Delete task</h3>
      <p className="m-0 text-sm text-ink-body">
        Any agent working on {name} stops, and it leaves the board with its documents and chat. {deleteNote(task)}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="destructive" size="sm" onClick={() => void deleteTask(deps, task)}>Delete {name}</Button>
        <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>Cancel</Button>
      </div>
    </section>
  )
}

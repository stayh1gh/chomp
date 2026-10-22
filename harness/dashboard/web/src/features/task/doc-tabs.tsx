import { useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { docLabel, timeAgo } from '@/lib/format'
import { store, useStore } from '@/lib/store'
import type { Board, Task, TaskDetail } from '@/lib/types'
import { Link } from '@/features/shell/link'

const OVERVIEW = 'overview'
const sectionTitle = 'm-0 mb-2 text-xs font-semibold tracking-[.05em] text-ink-subtle uppercase'
const panel = 'flex flex-col gap-6 rounded-xl bg-background p-4 shadow-[inset_0_0_0_1px_var(--semantic-border)]'

/** Open a document's tab and bring the tabs into view (from a tab, a step or a chat message). */
export async function showDoc(taskId: string, name: string) {
  await store.openDoc(taskId, name)
  document.getElementById('task-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * The panel's tabs: Overview (request, activity, the column's steps), then one per document,
 * shown inline. "See more" opens the open document full page.
 */
export function DocTabs({ task, detail, board }: { task: Task; detail: TaskDetail; board: Board }) {
  const { doc } = useStore()
  const active = doc && detail.docs.includes(doc.name) ? doc.name : null

  return (
    <Tabs
      id="task-tabs"
      value={active ?? OVERVIEW}
      onValueChange={(v) => (v === OVERVIEW ? store.set({ doc: null }) : void showDoc(task.id, v))}
      className="scroll-mt-5 gap-3"
    >
      <TabsList variant="pills" aria-label="Task details">
        <TabsTrigger value={OVERVIEW}>Overview</TabsTrigger>
        {detail.docs.map((name) => <TabsTrigger key={name} value={name} title={name}>{docLabel(name)}</TabsTrigger>)}
      </TabsList>
      <TabsContent value={OVERVIEW} className={cn(panel, 'text-base')}>
        <Overview task={task} detail={detail} board={board} />
      </TabsContent>
      {active && doc ? (
        <TabsContent value={active} className={cn(panel, 'text-base')}>
          <div className="-mb-2 flex items-center justify-between gap-3">
            <span className="text-sm text-ink-subtle">{active}</span>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/task/${task.id}/doc/${active}`}><Maximize2 />See more</Link>
            </Button>
          </div>
          {/* Server-escaped Markdown (harness/dashboard/markdown.mjs): the board's one raw HTML. */}
          <article className="doc" dangerouslySetInnerHTML={{ __html: doc.html }} />
        </TabsContent>
      ) : null}
    </Tabs>
  )
}

function Overview({ task, detail, board }: { task: Task; detail: TaskDetail; board: Board }) {
  const [clamped, setClamped] = useState((task.prompt ?? '').length > 400)
  const col = board.columns.find((c) => c.id === task.column)
  const title = (id: string) => board.columns.find((c) => c.id === id)?.title ?? id
  return (
    <>
      <section>
        <h3 className={sectionTitle}>Request</h3>
        <p
          onClick={() => setClamped(false)}
          className={cn(
            'm-0 whitespace-pre-wrap text-ink-body [overflow-wrap:anywhere]',
            clamped && 'max-h-30 overflow-hidden [mask-image:linear-gradient(#000_60%,transparent)]',
          )}
        >
          {task.prompt}
        </p>
      </section>
      <section>
        <h3 className={sectionTitle}>Activity</h3>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-ink-muted">
          {[...(task.history ?? [])].reverse().slice(0, 8).map((e, i) => (
            <li key={i}>{timeAgo(e.at)} — {e.from ? `${title(e.from)} → ` : ''}{title(e.to)} ({e.by})</li>
          ))}
        </ul>
      </section>
      {task.steps.length && col ? (
        <section>
          <h3 className={sectionTitle}>{col.title}</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {task.steps.map((s, i) => {
              // A step that writes a document (flow.yaml `file:`) opens its tab once it exists.
              const file = col.steps?.find((c) => c.name === s.name)?.file
              return (
                <li key={i} className={cn('flex items-center gap-2', s.done && 'text-ink-muted')}>
                  <CheckBox done={Boolean(s.done)} />
                  {s.name}
                  {file && detail.docs.includes(file) ? <Button variant="link" onClick={() => void showDoc(task.id, file)}>{docLabel(file)}</Button> : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </>
  )
}

/** A read-only tick: the runner checks steps off, not you. */
function CheckBox({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-sm border border-border',
        done && "border-transparent bg-brand after:h-1 after:w-2 after:translate-x-px after:-translate-y-px after:-rotate-45 after:border-b-2 after:border-l-2 after:border-solid after:border-white after:content-['']",
      )}
    />
  )
}

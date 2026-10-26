import { useState, type FormEvent, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusDot } from '@/components/status-dot'
import { StatusText } from '@/components/status-text'
import { useConfirm } from '@/components/confirm'
import { api } from '@/lib/api'
import { nextStep } from '@/lib/lanes'
import { act, store, useStore } from '@/lib/store'
import { docLabel, plural } from '@/lib/format'
import type { Board, Task, TaskDetail } from '@/lib/types'
import { moveTask } from '@/features/board/move'
import { Link } from '@/features/shell/link'
import { openPr } from './actions'

const notify = { info: (t: string) => toast(t), error: (t: string) => toast.error(t) }
const external = { target: '_blank', rel: 'noopener noreferrer' }
const resource = 'inline-flex items-center gap-1.5 text-xs text-[var(--indigo-100)] no-underline hover:underline'
const wideAction = 'h-8 w-full text-sm text-[var(--indigo-200)]'

/** The facts about a task, then the one step it's ready for (Create draft PR, Open PR for review). */
export function TaskFacts({ task, detail, board }: { task: Task; detail: TaskDetail; board: Board }) {
  const confirm = useConfirm()
  const { options } = useStore()
  const col = board.columns.find((c) => c.id === task.column)
  const profile = options?.profiles.find((p) => p.name === task.profile)
  const library = task.library ? profile?.libraries.find((l) => l.id === task.library)?.label ?? task.library : null
  const workspace = task.workspace && !task.workspace.removed ? task.workspace : null
  const step = nextStep(task, board.columns)
  const deps = { api, confirm, notify, refresh: store.refresh, navigate: store.navigate }

  const links: { key: string; href: string; label: string; internal?: boolean }[] = [
    ...(task.figma_file ? [{ key: 'figma-file', href: task.figma_file.url, label: 'Figma file' }] : []),
    ...Object.entries(task.links ?? {})
      .filter(([k]) => !(k === 'pr' && task.pr)) // the verified PR is listed below
      .map(([k, url]) => ({ key: k, href: url, label: k === 'pr' ? 'Pull request' : k[0].toUpperCase() + k.slice(1) })),
    ...(task.pr ? [{ key: 'verified-pr', href: task.pr.url, label: `${task.pr.draft ? 'Draft PR' : 'PR'} #${task.pr.url.split('/').pop()}` }] : []),
    ...(detail.docs.includes('qa.md') ? [{ key: 'qa', href: `/task/${task.id}/doc/qa.md`, label: `${docLabel('qa.md')} screenshots`, internal: true }] : []),
  ]

  return (
    <section className="flex flex-col gap-4">
      <dl className="m-0 grid grid-cols-[118px_minmax(0,1fr)] items-start gap-x-1.5 gap-y-4 text-xs">
        <Fact label="Project">{profile?.label ?? task.profile}</Fact>
        <Fact label="Type">{[task.kind === 'design' ? 'Design only' : 'Full', task.redesign ? 'Redesign' : null].filter(Boolean).join(' • ')}</Fact>
        <Fact label="Status">
          <StatusText task={task} columns={board.columns} className="font-semibold" />
          {task.status === 'working' && task.activity ? <span className="text-ink-muted"> · {task.activity}</span> : null}
        </Fact>
        {library ? <Fact label="Design System">{library}</Fact> : null}
        {workspace?.branch ? <Fact label="Branch">{workspace.branch}</Fact> : null}
        {task.lint ? (
          <Fact label="DS lint">
            {task.lint.errors ? plural(task.lint.errors, 'error') : 'No errors'} · {plural(task.lint.warnings ?? 0, 'warning')}
            {task.lint.placeholders?.length ? ` · missing: ${task.lint.placeholders.join(', ')}` : ''}
          </Fact>
        ) : null}
        {!task.pr && col?.verify === 'draft-pr' ? (
          <Fact label="Pull request">
            <span className="text-ink-muted">{task.status === 'working' ? "The builder is opening the draft PR. It shows here once it's up." : 'No draft PR yet.'}</span>
          </Fact>
        ) : null}
        {links.length ? (
          <Fact label="Resources">
            <span className="flex flex-col items-start gap-1.5">
              {links.map((l) => l.internal
                ? <Link key={l.key} href={l.href} className={resource}>{l.label}</Link>
                : <a key={l.key} href={l.href} {...external} className={resource}>{l.label}<ExternalLink className="size-4" aria-hidden="true" /></a>)}
            </span>
          </Fact>
        ) : null}
      </dl>
      {step ? (
        <Button variant="outline" className={wideAction} onClick={() => void moveTask({ api, confirm, notify, refresh: store.refresh }, task, step.column)}>
          {step.label}
        </Button>
      ) : null}
      {task.pr?.draft ? <Button variant="outline" className={wideAction} onClick={() => openPr(deps, task)}>Open PR for review</Button> : null}
    </section>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="m-0 min-w-0 text-ink-strong [overflow-wrap:anywhere]">{children}</dd>
    </>
  )
}

/** "Run locally": the task's build served from its worktree, one task at a time. */
export function RunLocally({ task, board }: { task: Task; board: Board }) {
  const app = board.app
  const mine = app?.task === task.id ? app : null
  const other = app && !mine && ['running', 'starting'].includes(app.state) ? board.tasks.find((t) => t.id === app.task) : null
  const stop = <Button variant="ghost" size="sm" onClick={() => act(task.id, 'app-stop')}>Stop</Button>
  const [tone, text, buttons]: [Parameters<typeof StatusDot>[0]['tone'], string, ReactNode] =
    mine?.state === 'running' ? ['on', `Running at ${mine.url?.replace(/^https?:\/\//, '') ?? ''}`, <><Button variant="outline" size="sm" asChild><a href={mine.url} {...external}>Open</a></Button>{stop}</>]
    : mine?.state === 'starting' ? ['warn', 'Starting… the first run installs dependencies and takes a few minutes', <Button variant="ghost" size="sm" onClick={() => act(task.id, 'app-stop')}>Cancel</Button>]
    : mine?.state === 'failed' ? ['bad', mine.error ?? "The dev server didn't start", <Button variant="outline" size="sm" onClick={() => act(task.id, 'app-start')}>Retry</Button>]
    : ['off', other ? `Not running. Starting it stops ${other.ref ?? other.title}'s app` : 'Not running', (
      <Button variant="outline" size="sm" disabled={task.status === 'working'} onClick={() => act(task.id, 'app-start')}>Run locally</Button>
    )]
  return (
    <section className="flex flex-col gap-3">
      <h3 className="m-0 text-sm font-semibold text-ink-strong">Run locally</h3>
      <p className="m-0 flex items-center gap-2 text-sm text-ink-body"><StatusDot tone={tone} />{text}</p>
      <div className="flex items-center gap-2">{buttons}</div>
    </section>
  )
}

/** Inside the blocker: paste the task's Figma file and the card goes back in the queue. */
export function FigmaFileForm({ task }: { task: Task }) {
  const [url, setUrl] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      await api(`/api/tasks/${task.id}/figma-file`, { url })
      toast('Figma file saved')
    } catch (err) {
      toast.error((err as Error).message)
    }
    await store.refresh()
  }
  return (
    <form onSubmit={save} className="flex gap-2">
      <Input
        type="url" required placeholder="https://www.figma.com/design/…" aria-label="Figma file link"
        value={url} onChange={(e) => setUrl(e.target.value)} className="h-8 min-w-0 flex-1 text-sm"
      />
      <Button type="submit" size="sm">Save</Button>
    </form>
  )
}

import { Fragment, useState, type FormEvent, type ReactNode } from 'react'
import { GitPullRequest } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusText } from '@/components/status-text'
import { useConfirm } from '@/components/confirm'
import { api } from '@/lib/api'
import { columnServes, taskStatus } from '@/lib/status'
import { act, store, useStore } from '@/lib/store'
import { plural } from '@/lib/format'
import type { Board, Task, TaskDetail } from '@/lib/types'
import { moveTask } from '@/features/board/move'
import { Link } from '@/features/shell/link'
import { FigmaLogo } from './figma-logo'
import { openPr } from './actions'

const notify = { info: (t: string) => toast(t), error: (t: string) => toast.error(t) }
const external = { target: '_blank', rel: 'noopener noreferrer' }

/** The facts about a task, two columns: label, then the value and what you can do about it. */
export function TaskMeta({ task, detail, board }: { task: Task; detail: TaskDetail; board: Board }) {
  const confirm = useConfirm()
  const { options } = useStore()
  const col = board.columns.find((c) => c.id === task.column)
  const st = taskStatus(task, board.columns)
  const deps = { api, confirm, notify, refresh: store.refresh, navigate: store.navigate }

  // Status row: the colored status, then what you can do about it right here.
  const statusLinks = [
    st.key === 'working' || st.key === 'queued' ? <Button key="stop" variant="link" onClick={() => act(task.id, 'pause')}>Stop</Button> : null,
    st.key === 'paused' ? <Button key="start" variant="link" onClick={() => act(task.id, 'start')}>Start</Button> : null,
    detail.docs.includes('qa.md') ? <Button key="qa" variant="link" asChild><Link href={`/task/${task.id}/doc/qa.md`}>See screenshots</Link></Button> : null,
  ].filter(Boolean)

  const library = task.library
    ? options?.profiles.find((p) => p.name === task.profile)?.libraries.find((l) => l.id === task.library)?.label ?? task.library
    : null
  const links = Object.entries(task.links ?? {}).filter(([k]) => !(k === 'pr' && task.pr)) // the PR has its own row once verified
  const workspace = task.workspace && !task.workspace.removed ? task.workspace : null

  return (
    <dl className="my-4 grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-2">
      <Row label="Status">
        <StatusText task={task} columns={board.columns} />
        {statusLinks.map((el, i) => <Fragment key={i}><span aria-hidden="true" className="text-ink-faint">•</span>{el}</Fragment>)}
        {task.status === 'working' && task.activity ? <span className="text-sm text-ink-muted">{task.activity}</span> : null}
      </Row>
      <Row label="Column">
        <Select value={task.column} onValueChange={(id) => {
          const target = board.columns.find((c) => c.id === id)
          if (target) void moveTask({ api, confirm, notify, refresh: store.refresh }, task, target)
        }}>
          <SelectTrigger aria-label="Move to column" className="w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            {board.columns.map((c) => <SelectItem key={c.id} value={c.id} disabled={!columnServes(c, task)}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Project">{task.profile} · {task.account}</Row>
      {library ? <Row label="Design system">{library}</Row> : null}
      <Row label="Type">{task.kind === 'design' ? 'Design only — ends after Refinement' : 'Full — through a draft PR'}</Row>
      {task.pr ? (
        <Row label="Pull request">
          <Button variant="outline" size="sm" asChild>
            <a href={task.pr.url} {...external}><GitPullRequest />{task.pr.draft ? 'View draft PR' : 'View PR'} #{task.pr.url.split('/').pop()}</a>
          </Button>
          {task.pr.draft ? <Button size="sm" onClick={() => openPr(deps, task)}>Open PR for review</Button> : null}
        </Row>
      ) : col?.verify === 'draft-pr' ? (
        <Row label="Pull request">
          <span className="text-sm text-ink-muted">
            {task.status === 'working' ? "The builder is opening the draft PR. Its button shows here once it's up." : 'No draft PR yet.'}
          </span>
        </Row>
      ) : null}
      {workspace ? <Row label="Branch">{workspace.branch}</Row> : null}
      {workspace ? <Row label="Local app"><LocalApp task={task} board={board} /></Row> : null}
      {task.lint ? (
        <Row label="DS lint">
          {task.lint.errors ? plural(task.lint.errors, 'error') : 'No errors'} · {plural(task.lint.warnings ?? 0, 'warning')}
          {task.lint.placeholders?.length ? ` · missing: ${task.lint.placeholders.join(', ')}` : ''}
        </Row>
      ) : null}
      {task.figma_file ? (
        <Row label="Figma file">
          <Button variant="outline" size="sm" asChild><a href={task.figma_file.url} {...external}><FigmaLogo />Open in Figma</a></Button>
        </Row>
      ) : null}
      {task.redesign ? <Row label="Scope">Redesign of an existing screen</Row> : null}
      {links.length ? (
        <Row label="Links">
          {links.map(([k, url]) => (
            <Button key={k} variant="outline" size="sm" asChild>
              <a href={url} {...external}>{k === 'figma' ? <FigmaLogo /> : null}{k === 'pr' ? 'Pull request' : k[0].toUpperCase() + k.slice(1)}</a>
            </Button>
          ))}
        </Row>
      ) : null}
    </dl>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-sm text-ink-subtle">{label}</dt>
      <dd className="m-0 flex min-h-8 flex-wrap items-center gap-2 text-ink-strong">{children}</dd>
    </>
  )
}

/** "Run locally": the task's build served from its worktree, one task at a time. */
function LocalApp({ task, board }: { task: Task; board: Board }) {
  const app = board.app
  const mine = app?.task === task.id ? app : null
  const stop = <Button variant="link" onClick={() => act(task.id, 'app-stop')}>Stop</Button>
  if (mine?.state === 'running') return <><Button variant="link" asChild><a href={mine.url} {...external}>Open app</a></Button>{stop}</>
  if (mine?.state === 'starting') return <><span className="text-sm text-ink-muted">Starting… the first run installs dependencies and takes a few minutes</span>{stop}</>
  const other = app && !mine ? board.tasks.find((t) => t.id === app.task) : null
  return (
    <>
      <Button variant="link" disabled={task.status === 'working'} onClick={() => act(task.id, 'app-start')}>
        {mine?.state === 'failed' ? 'Try again' : 'Run locally'}
      </Button>
      {mine?.state === 'failed' ? <span className="text-sm text-ink-muted">{mine.error}</span> : null}
      {other ? <span className="text-sm text-ink-muted">Stops {other.ref ?? other.title}'s app</span> : null}
    </>
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

import { Fragment, useCallback, useEffect, useState } from 'react'
import { ExternalLink, Folder } from 'lucide-react'
import { DynamicIcon, type IconName } from 'lucide-react/dynamic'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { dayLabel, localDay } from '@/lib/format'
import { STATUS_INK, taskStatus } from '@/lib/status'
import { store, useStore } from '@/lib/store'
import type { Recap, RecapTask, RecapWaiting } from '@/lib/types'

/** Opens the recap from anywhere (the sidebar), whether or not it was seen today. */
export function openRecap() {
  store.set({ recapOpen: true })
}

/**
 * The daily recap: the first time the board opens on a new day (or comes back into view on
 * one), what got done on the last day with work, one tab per project. Closing it marks the
 * day seen, so it shows once a day.
 */
export function RecapDialog() {
  const { recapOpen } = useStore()
  const [recap, setRecap] = useState<Recap | null>(null)
  const [tab, setTab] = useState('')
  const [today, setToday] = useState(localDay)

  const load = useCallback(async (day: string) => {
    const next = await api<Recap>(`/api/recap?today=${day}`)
    setRecap(next)
    setToday(day)
    setTab(next.projects[0]?.name ?? '')
    return next
  }, [])

  // On load, and whenever the window comes back on a day it hasn't shown yet.
  useEffect(() => {
    let checked = ''
    const check = () => {
      const day = localDay()
      if (day === checked || document.visibilityState !== 'visible') return
      checked = day
      load(day)
        .then((r) => { if (!r.seen && r.projects.length) store.set({ recapOpen: true }) })
        .catch(() => { checked = '' })
    }
    check()
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [load])

  // Opened from the sidebar: refresh it first, so it's never a stale day.
  useEffect(() => {
    if (recapOpen && localDay() !== today) load(localDay()).catch((err) => toast.error((err as Error).message))
  }, [recapOpen, today, load])

  function onOpenChange(open: boolean) {
    store.set({ recapOpen: open })
    if (!open && recap && !recap.seen) {
      setRecap({ ...recap, seen: true })
      api('/api/recap/seen', { today }).catch(() => {})
    }
  }

  const projects = recap?.projects ?? []
  const index = Math.max(0, projects.findIndex((p) => p.name === tab))
  const when = recap?.day ? dayLabel(recap.day, today) : null
  const done = projects.reduce((n, p) => n + p.tasks.length, 0)
  const waiting = projects.reduce((n, p) => n + p.waiting.length, 0)

  return (
    <Dialog open={recapOpen} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(630px,calc(100dvh-2rem))] gap-0 overflow-hidden border-border bg-surface-card p-0 sm:max-w-[810px]">
        <Tabs
          value={tab}
          onValueChange={setTab}
          orientation="vertical"
          className="grid min-h-0 grid-cols-[242px_minmax(0,1fr)] gap-0 max-[640px]:grid-cols-1 max-[640px]:grid-rows-[auto_minmax(0,1fr)]"
        >
          <aside className="flex min-h-0 flex-col gap-4 p-4 shadow-[inset_-1px_0_0_var(--semantic-divider)] max-[640px]:shadow-[inset_0_-1px_0_var(--semantic-divider)]">
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-lg font-semibold text-ink-strong">Daily Recap</DialogTitle>
              <DialogDescription className="text-sm text-ink-muted">
                {when ? `What got done ${when === 'Yesterday' ? 'yesterday' : `on ${when}`}, by project.` : 'Nothing to recap yet.'}
              </DialogDescription>
            </div>
            <TabsList className="w-full gap-1 bg-transparent p-0 max-[640px]:flex-row! max-[640px]:justify-start max-[640px]:overflow-x-auto">
              {projects.map((p) => (
                <TabsTrigger
                  key={p.name}
                  value={p.name}
                  className="h-auto min-h-9 flex-none gap-2 rounded-md px-4 py-2 text-sm font-semibold whitespace-normal text-ink-muted hover:bg-sidebar-accent hover:text-ink-strong data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-surface-inset dark:data-active:text-ink-strong max-[640px]:w-auto"
                >
                  <Folder aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-left">{p.label}</span>
                  <span className="font-normal text-ink-subtle">{p.tasks.length + p.waiting.length}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <p className="mt-auto text-sm text-ink-muted max-[640px]:hidden">
              {done} done · {waiting} waiting on you
            </p>
          </aside>

          <section className="flex min-h-0 flex-col">
            <header className="flex shrink-0 items-center py-4 pr-12 pl-4 shadow-[inset_0_-1px_0_var(--semantic-divider)]">
              <h3 className="truncate text-base font-semibold text-ink-strong">{projects[index]?.label}</h3>
            </header>
            {projects.map((p) => (
              <TabsContent key={p.name} value={p.name} className="min-h-0">
                <ScrollArea className="h-full [&_[data-slot=scroll-area-viewport]>div]:block!">
                  <ul className="m-0 flex list-none flex-col gap-5 px-7 pt-5 pb-6">
                    {p.waiting.map((t) => <RecapItem key={t.id} task={t} today={today} />)}
                    {p.tasks.map((t) => <RecapItem key={t.id} task={t} />)}
                  </ul>
                </ScrollArea>
              </TabsContent>
            ))}
          </section>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

const resource = 'inline-flex items-center gap-1.5 text-[var(--indigo-100)] no-underline hover:underline'

/** One task: where it stands, what got done (or the day it was last worked on), the next step, its links. */
function RecapItem({ task, today }: { task: RecapTask | RecapWaiting; today?: string }) {
  const { board } = useStore()
  const live = board?.tasks.find((t) => t.id === task.id)
  const status = live && board ? taskStatus(live, board.columns) : null
  const icon = board?.columns.find((c) => c.id === live?.column)?.icon
  const day = today && 'day' in task && task.day ? dayLabel(task.day, today) : null
  const open = () => {
    store.set({ recapOpen: false })
    void store.navigate(`/task/${task.id}`)
  }
  const links = [
    task.links.figma ? { href: task.links.figma, label: 'Figma' } : null,
    task.links.pr ? { href: task.links.pr, label: 'Pull request' } : null,
  ].filter((l): l is { href: string; label: string } => Boolean(l))

  return (
    <li className="flex flex-col gap-2 pb-6 shadow-[inset_0_-1px_0_var(--semantic-divider)] last:shadow-none">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {task.ref ? <span className="text-xs font-semibold tracking-[.04em] text-ink-muted tabular-nums">{task.ref}</span> : null}
          <button type="button" onClick={open} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-sm text-left outline-none hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            {icon ? <DynamicIcon name={icon as IconName} className="size-4 shrink-0 text-[var(--indigo-200)]" aria-hidden="true" /> : null}
            <span className="truncate text-base font-semibold text-ink-strong">{task.title}</span>
          </button>
        </div>
        {status ? <span className={cn('inline-flex h-6 shrink-0 items-center rounded-sm border border-divider px-2 text-sm font-medium', STATUS_INK[status.key])}>{status.label}</span> : null}
      </div>
      {day ? <p className="m-0 text-sm text-ink-muted">Last worked on {day === 'Yesterday' ? 'yesterday' : day}</p> : null}
      {task.done ? <p className="m-0 text-sm text-ink-body">{task.done}</p> : null}
      <p className="m-0 text-sm text-ink-body"><span className="font-medium text-ink-strong">Next: </span>{task.next}</p>
      {links.length ? (
        <p className="m-0 flex items-center gap-2 text-sm text-ink-body">
          <span className="w-[118px] shrink-0">Resources</span>
          {links.map((l, i) => (
            <Fragment key={l.label}>
              {i ? <span aria-hidden="true">/</span> : null}
              <a href={l.href} target="_blank" rel="noreferrer" className={resource}>{l.label}<ExternalLink className="size-4" aria-hidden="true" /></a>
            </Fragment>
          ))}
        </p>
      ) : null}
    </li>
  )
}

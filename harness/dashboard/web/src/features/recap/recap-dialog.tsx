import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, Folder, History } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { dayLabel, localDay } from '@/lib/format'
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
      <DialogContent className="h-[min(680px,calc(100dvh-2rem))] gap-0 overflow-hidden p-0 sm:max-w-[1000px]">
        <Tabs
          value={tab}
          onValueChange={setTab}
          orientation="vertical"
          className="grid min-h-0 grid-cols-[360px_minmax(0,1fr)] gap-0 max-[640px]:grid-cols-1 max-[640px]:grid-rows-[auto_minmax(0,1fr)]"
        >
          <aside className="flex min-h-0 flex-col gap-5 border-r border-border-subtle bg-surface-card p-5 max-[640px]:border-r-0 max-[640px]:border-b">
            <div className="flex flex-col gap-2">
              <DialogTitle className="flex items-center gap-2 text-base">
                <History className="size-4 text-ink-muted" aria-hidden="true" />
                Daily recap
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-ink-body">
                {when ? `What got done ${when === 'Yesterday' ? 'yesterday' : `on ${when}`}, by project.` : 'Nothing to recap yet.'}
              </DialogDescription>
            </div>
            <TabsList className="w-full gap-1 bg-transparent p-0 max-[640px]:flex-row! max-[640px]:justify-start max-[640px]:overflow-x-auto">
              {projects.map((p) => (
                <TabsTrigger
                  key={p.name}
                  value={p.name}
                  className="h-auto min-h-10 flex-none gap-3 px-3 py-2 text-base whitespace-normal font-medium text-ink-body hover:bg-sidebar-accent hover:text-ink-strong data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-surface-inset dark:data-active:text-ink-strong max-[640px]:w-auto"
                >
                  <Folder aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-left">{p.label}</span>
                  <Badge variant="outline" className="h-5 px-1.5 text-xs">{p.tasks.length + p.waiting.length}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>
            <p className="mt-auto text-sm text-ink-body max-[640px]:hidden">
              {done} done · {waiting} waiting on you
            </p>
          </aside>

          <section className="flex min-h-0 flex-col">
            <header className="flex h-16 shrink-0 items-center px-6 pr-12">
              <h3 className="truncate text-lg font-semibold text-ink-strong">{projects[index]?.label}</h3>
            </header>
            {projects.map((p) => (
              <TabsContent key={p.name} value={p.name} className="min-h-0">
                <ScrollArea className="h-full [&_[data-slot=scroll-area-viewport]>div]:block!">
                  <div className="flex flex-col gap-6 px-6 pb-6">
                    {p.waiting.length > 0 && (
                      <RecapSection title="Waiting on you">
                        {p.waiting.map((t) => <RecapItem key={t.id} task={t} today={today} />)}
                      </RecapSection>
                    )}
                    {p.tasks.length > 0 && (
                      <RecapSection title={when ? `Done ${when === 'Yesterday' ? 'yesterday' : `on ${when}`}` : 'Done'}>
                        {p.tasks.map((t) => <RecapItem key={t.id} task={t} />)}
                      </RecapSection>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </section>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/** Opens a task's panel from the recap. */
function TaskHeading({ task }: { task: Pick<RecapTask, 'id' | 'ref' | 'title' | 'links'> }) {
  const open = () => {
    store.set({ recapOpen: false })
    void store.navigate(`/task/${task.id}`)
  }
  const link = task.links.pr ? { href: task.links.pr, label: 'Pull request' } : task.links.figma ? { href: task.links.figma, label: 'Figma' } : null
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2">
      {task.ref && <Badge variant="outline">{task.ref}</Badge>}
      <Button variant="link" className="min-w-0 shrink text-left text-lg font-semibold whitespace-normal no-underline hover:underline" onClick={open}>
        {task.title}
      </Button>
      {link && (
        <Button asChild variant="outline" size="sm" className="ml-auto border-border-hover bg-[var(--semantic-bg-secondary-default-hovered)] hover:border-ink-faint hover:bg-[var(--semantic-border-strong)]">
          <a href={link.href} target="_blank" rel="noreferrer">
            {link.label}
            <ExternalLink data-icon="inline-end" />
          </a>
        </Button>
      )}
    </div>
  )
}

function Next({ text }: { text: string }) {
  return (
    <p className="text-base leading-relaxed text-ink-body">
      <span className="font-medium text-ink-strong">Next: </span>
      {text}
    </p>
  )
}

function RecapSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-base font-semibold text-ink-strong">{title}</h4>
      <ul className="flex flex-col gap-3">{children}</ul>
    </section>
  )
}

/** A task card: what got done, then the next step. A waiting task says which day that was. */
function RecapItem({ task, today }: { task: RecapTask | RecapWaiting; today?: string }) {
  const day = today && 'day' in task && task.day ? dayLabel(task.day, today) : null
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-surface-inset p-5">
      <TaskHeading task={task} />
      {day && <p className="text-sm text-ink-muted">Last worked on {day === 'Yesterday' ? 'yesterday' : day}</p>}
      {task.done && <p className="text-base leading-relaxed text-ink-strong">{task.done}</p>}
      {task.done && <Separator className="my-2" />}
      <Next text={task.next} />
    </li>
  )
}

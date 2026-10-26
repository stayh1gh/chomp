import { useState } from 'react'
import { History, LayoutGrid, PanelLeft, PanelLeftClose, Plug, Settings, Vibrate, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { StatusDot } from '@/components/status-dot'
import { api } from '@/lib/api'
import { act, store, useStore } from '@/lib/store'
import type { Route } from '@/lib/router'
import { openRecap } from '@/features/recap/recap-dialog'
import { Link } from './link'

const PAGES: { page: Route['page']; href: string; label: string; icon: LucideIcon }[] = [
  { page: 'tasks', href: '/', label: 'Tasks', icon: LayoutGrid },
  { page: 'connections', href: '/connections', label: 'Connections', icon: Plug },
  { page: 'settings', href: '/settings', label: 'Settings', icon: Settings },
]

// Folded (by its toggle, by a full-page task, or below 720px), the sidebar keeps only its icons.
const narrow = 'max-[720px]:sr-only group-data-collapsed/nav:sr-only'
const navItem = 'h-9 justify-start gap-3 px-3 text-sm font-medium text-ink-nav hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent aria-[current=page]:bg-surface-card aria-[current=page]:text-ink-strong max-[720px]:justify-center group-data-collapsed/nav:justify-center'

/** `forced`: folded by the page (a full-page task), so it has no toggle of its own. */
export function Sidebar({ forced = false }: { forced?: boolean }) {
  const { route, sidebarCollapsed } = useStore()
  const collapsed = forced || sidebarCollapsed
  const toggle = forced ? null : (
    <Button
      variant="ghost" size="icon" className="max-[720px]:hidden"
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      onClick={() => store.setPref({ sidebarCollapsed: !collapsed })}
    >
      {collapsed ? <PanelLeft /> : <PanelLeftClose />}
    </Button>
  )
  return (
    <nav
      aria-label="Main"
      data-collapsed={collapsed || undefined}
      className="group/nav flex w-50 shrink-0 flex-col gap-1 px-3 py-4 max-[720px]:w-16 max-[720px]:px-2 max-[720px]:py-3 data-collapsed:w-16 data-collapsed:px-2"
    >
      <div className="mb-4 flex items-center justify-between">
        {/* Figma "logo" frame (1:920): 12px inset, 12px gap, 24/36 Nata Sans Bold, 16px below. */}
        <Link href="/" aria-label="Chomp — tasks" className="flex h-9 items-center gap-3 pl-3 font-brand text-2xl/9 font-bold tracking-[-1.2px] text-ink-strong no-underline max-[720px]:mx-auto max-[720px]:pl-0 group-data-collapsed/nav:mx-auto group-data-collapsed/nav:pl-0">
          <img src="/logo.svg" alt="" className="size-8 shrink-0" />
          <span className={narrow}>Chomp</span>
        </Link>
        {collapsed ? null : toggle}
      </div>
      {PAGES.map(({ page, href, label, icon: Icon }) => (
        <Button
          key={page}
          asChild
          variant="ghost"
          className={navItem}
        >
          <Link href={href} aria-current={route.page === page ? 'page' : undefined}>
            <Icon />
            <span className={narrow}>{label}</span>
          </Link>
        </Button>
      ))}
      <Button variant="ghost" className={navItem} onClick={openRecap}>
        <History />
        <span className={narrow}>Recap</span>
      </Button>
      <AfkSwitch />
      <LocalServer />
      <RunnerStatus />
      {collapsed && toggle ? <div className="flex justify-center">{toggle}</div> : null}
    </nav>
  )
}

/** I'm AFK: when on, a task that stops and needs you messages you (Settings → Notify me via). */
function AfkSwitch() {
  const { board } = useStore()
  const [saving, setSaving] = useState(false)
  const on = Boolean(board?.settings.companions?.enabled)

  async function toggle(next: boolean) {
    setSaving(true)
    try {
      await api('/api/settings', { companions: { enabled: next } })
      const slack = board?.settings.companions?.via === 'slack'
      toast(!next ? 'Notifications off'
        : slack ? 'Notifications on: a task that needs you messages you on Slack'
        : 'Notifications on: a task that needs you opens a chat in the Claude app')
      await store.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <label
      title="When a task stops and needs you, message you (Settings → Notify me via)"
      className={cn(
        'mt-auto flex min-h-9 cursor-pointer items-center gap-2 rounded-lg py-1 pr-2 pl-3 text-sm text-ink-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-[720px]:justify-center max-[720px]:p-0 group-data-collapsed/nav:justify-center group-data-collapsed/nav:p-0',
        saving && 'cursor-progress opacity-60',
      )}
    >
      <Vibrate className="size-4 shrink-0 max-[720px]:hidden group-data-collapsed/nav:hidden" aria-hidden="true" />
      <span className={cn('min-w-0 flex-1', narrow)}>I'm AFK</span>
      <Switch
        checked={on}
        disabled={saving || !board}
        onCheckedChange={toggle}
        aria-label="I'm AFK"
      />
    </label>
  )
}

const footer = 'flex min-h-8 items-center gap-2 px-3 py-1 text-sm text-ink-muted max-[720px]:justify-center group-data-collapsed/nav:justify-center'

/** A task's build running locally ("Run locally" in its panel), stoppable from here too. */
function LocalServer() {
  const { board } = useStore()
  const app = board?.app
  if (!app || !['running', 'starting'].includes(app.state)) return null
  const title = board.tasks.find((t) => t.id === app.task)?.title ?? ''
  return (
    <div className={footer}>
      <StatusDot tone={app.state === 'running' ? 'on' : 'warn'} />
      <span title={title} className={narrow}>{app.state === 'running' ? 'Local server' : 'Local server starting'}</span>
      <Button
        variant="link"
        className="ml-1 h-auto p-0 text-sm text-[var(--red-300)] max-[720px]:text-xs group-data-collapsed/nav:text-xs"
        onClick={() => act(app.task, 'app-stop')}
      >
        Stop
      </Button>
    </div>
  )
}

function RunnerStatus() {
  const runner = useStore().board?.runner
  if (!runner) return <div className={footer} aria-live="polite" />
  const n = runner.active.length
  const text = !runner.running ? 'Runner stopped' : n ? `${n} agent${n > 1 ? 's' : ''} working` : 'Agents idle'
  return (
    <div className={footer} aria-live="polite" title={text}>
      {n ? <Spinner className="size-3 text-success" aria-hidden="true" /> : <StatusDot tone={runner.running ? 'on' : 'bad'} />}
      <span className={narrow}>{text}</span>
    </div>
  )
}

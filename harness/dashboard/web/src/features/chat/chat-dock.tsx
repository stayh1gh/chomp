import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowUp, Columns2, Maximize2, Minimize2, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/status-dot'
import { StatusText } from '@/components/status-text'
import { api } from '@/lib/api'
import { chatMode, store, useStore } from '@/lib/store'
import type { Board, TaskDetail } from '@/lib/types'
import { Message } from './message'
import { Questions } from './questions'
import { chatAgent, composerPlaceholder, openSet, waitingTasks } from './rules'

/**
 * The chat: a dock in the bottom-right corner or, maximized, a full-height panel on the right
 * that the page makes room for (Claude desktop's split view). With no task open it lists the
 * tasks that need you, or isn't there at all.
 */
export function ChatDock() {
  const state = useStore()
  const mode = chatMode(state)
  const ref = useRef<HTMLElement>(null)
  const { board, detail, chatCollapsed } = state
  const waiting = board && !detail ? waitingTasks(board.tasks) : []
  const shown = Boolean(mode !== 'none' && board && (detail || waiting.length))

  // Keep the task panel's last lines scrollable above the floating dock (the panel sits beside it).
  useLayoutEffect(() => {
    const root = document.documentElement
    const el = ref.current
    if (!shown || mode === 'panel' || !el) {
      root.style.setProperty('--chat-clearance', '24px')
      return
    }
    const fit = () => root.style.setProperty('--chat-clearance', `${el.offsetHeight + 40}px`)
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [shown, mode, chatCollapsed]) // measured on each change too, not only when the observer fires

  if (!shown || !board) return null
  const panel = mode === 'panel'
  const collapsed = chatCollapsed && !panel

  return (
    <section
      ref={ref}
      aria-label="Task chat"
      data-mode={panel ? 'panel' : 'dock'}
      className={cn(
        'fixed z-30 flex flex-col overflow-hidden rounded-xl border',
        panel
          ? 'top-2 right-2 bottom-2 w-(--chat-panel) border-border-subtle bg-surface max-[720px]:left-2 max-[720px]:w-auto'
          : 'right-5 bottom-5 max-h-[min(720px,72vh)] border-border bg-surface-card shadow-[0_24px_64px_rgba(0,0,0,.55)]',
        !panel && (collapsed ? 'w-auto' : 'w-[min(480px,calc(100vw-40px))]'),
      )}
    >
      {detail ? <TaskChat detail={detail} board={board} panel={panel} collapsed={collapsed} /> : (
        <>
          <Head collapsed={chatCollapsed}>
            <StatusDot tone="warn" />
            <strong className="min-w-0 flex-1 truncate font-semibold text-ink-strong">
              {waiting.length} task{waiting.length > 1 ? 's need' : ' needs'} you
            </strong>
            <CollapseToggle collapsed={chatCollapsed} />
          </Head>
          {chatCollapsed ? null : (
            <ul className="m-0 flex list-none flex-col gap-1 p-2">
              {waiting.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => void store.navigate(`/task/${t.id}`)}
                    className="flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-ink-body hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <StatusText task={t} columns={board.columns} className="shrink-0 text-sm" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function TaskChat({ detail, board, panel, collapsed }: { detail: TaskDetail; board: Board; panel: boolean; collapsed: boolean }) {
  const { task, chat } = detail
  const col = board.columns.find((c) => c.id === task.column)
  const who = chatAgent(col)
  const name = who ? `${who[0].toUpperCase()}${who.slice(1)}` : null
  const set = openSet(detail)
  const messages = chat.filter((m) => !(set && m.id === set.id))
  const replying = Boolean(who && board.runner.replying?.includes(task.id))

  return (
    <>
      <Head collapsed={collapsed} panel={panel}>
        <strong className="min-w-0 flex-1 truncate font-semibold text-ink-strong">{name ? `Chat (${name})` : 'Chat'}</strong>
        {collapsed ? null : (
          <Button variant="ghost" size="icon" aria-label={panel ? 'Restore chat' : 'Maximize chat'} title={panel ? 'Restore' : 'Maximize'} onClick={() => store.setChatMaximized(!panel)}>
            {panel ? <Minimize2 /> : <Columns2 />}
          </Button>
        )}
        <CollapseToggle collapsed={collapsed} panel={panel} />
      </Head>
      {collapsed ? null : (
        <>
          <Log key={`${task.id}-${panel}`} count={chat.length + Number(replying)} panel={panel}>
            {messages.length ? messages.map((m) => <Message key={m.id} m={m} taskId={task.id} />)
              : <p className="m-0 text-sm text-ink-muted">Questions, progress and links from the agent show up here.</p>}
            {replying ? <p className="m-0 animate-pulse text-sm text-ink-muted">{name} is replying…</p> : null}
            {set ? <Questions key={set.id} taskId={task.id} set={set} /> : null}
          </Log>
          <Composer key={task.id} taskId={task.id} placeholder={composerPlaceholder(who)} panel={panel} />
        </>
      )}
    </>
  )
}

function Head({ collapsed, panel, children }: { collapsed: boolean; panel?: boolean; children: React.ReactNode }) {
  return (
    <header className={cn(
      'flex shrink-0 items-center gap-2',
      panel ? 'h-16 pr-4 pl-6' : 'h-12 pr-3 pl-4',
      !collapsed && 'shadow-[inset_0_-1px_0_var(--semantic-divider)]',
    )}>
      {children}
    </header>
  )
}

/** The minimize / restore button. Minimizing the maximized panel drops it back to the dock, collapsed. */
function CollapseToggle({ collapsed, panel }: { collapsed: boolean; panel?: boolean }) {
  const toggle = () => {
    if (panel) store.setChatMaximized(false)
    store.set({ chatCollapsed: !collapsed })
  }
  return (
    <Button variant="ghost" size="icon" aria-expanded={!collapsed} aria-label={collapsed ? 'Open chat' : 'Minimize chat'} onClick={toggle}>
      {collapsed ? <Maximize2 /> : <Minus />}
    </Button>
  )
}

/** The message log. It follows new messages while you're at the bottom, and opens there. */
function Log({ count, panel, children }: { count: number; panel: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [count])
  return (
    <div
      ref={ref}
      aria-live="polite"
      onScroll={(e) => {
        const el = e.currentTarget
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
      className={cn('min-h-40 flex-1 overflow-y-auto', panel ? 'p-6' : 'px-4 py-5')}
    >
      <div className="mx-auto flex max-w-(--chat-column) flex-col gap-5">{children}</div>
    </div>
  )
}

/** A rounded box: the textarea grows with its text, the send button sits inside at the bottom right. */
function Composer({ taskId, placeholder, panel }: { taskId: string; placeholder: string; panel: boolean }) {
  const [text, setText] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)

  // Grow with the text, up to its max-height (then it scrolls).
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    if (!text.trim()) return
    try {
      store.set({ detail: await api<TaskDetail>(`/api/tasks/${taskId}/chat`, { text: text.trim() }) })
      setText('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter is a new line; leave Enter alone while an IME is composing.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <form onSubmit={send} className={cn('shrink-0', panel ? 'px-6 pb-6' : 'px-4 pb-4')}>
      <div
        onClick={(e) => e.target === e.currentTarget && box.current?.focus()}
        className="mx-auto flex max-w-(--chat-column) cursor-text items-end gap-2 rounded-xl bg-input-bg p-2 shadow-[inset_0_0_0_1px_var(--semantic-border-strong)] hover:shadow-[inset_0_0_0_1px_var(--semantic-border-hover)] focus-within:shadow-[inset_0_0_0_1px_var(--semantic-focus-ring)]"
      >
        <textarea
          ref={box}
          name="composer"
          rows={1}
          aria-label="Message"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          className="max-h-[200px] min-h-8 flex-1 resize-none bg-transparent px-2 py-1 text-base text-ink-strong outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="icon" aria-label="Send" title="Send (Enter)" disabled={!text.trim()}><ArrowUp /></Button>
      </div>
    </form>
  )
}

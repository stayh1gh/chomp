import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { CornerDownLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { store } from '@/lib/store'
import type { Board, TaskDetail } from '@/lib/types'
import { Message } from './message'
import { Questions } from './questions'
import { chatAgent, composerPlaceholder, openSet } from './rules'

/** The task's chat, a pane of the task panel: its messages, open questions, then the composer. */
export function TaskChat({ detail, board, actions }: { detail: TaskDetail; board: Board; actions?: ReactNode }) {
  const { task, chat } = detail
  const col = board.columns.find((c) => c.id === task.column)
  const who = chatAgent(col)
  const name = who ? `${who[0].toUpperCase()}${who.slice(1)}` : null
  const set = openSet(detail)
  const messages = chat.filter((m) => !(set && m.id === set.id))
  const replying = Boolean(who && board.runner.replying?.includes(task.id))

  return (
    <section aria-label="Task chat" className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 pr-3 pl-4 shadow-[inset_0_-1px_0_var(--semantic-divider)]">
        <h3 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-ink-strong">{name ? `Chat (${name})` : 'Chat'}</h3>
        {actions}
      </header>
      <Log count={chat.length + Number(replying)}>
        {messages.length ? messages.map((m) => <Message key={m.id} m={m} taskId={task.id} />)
          : <p className="m-0 text-sm text-ink-muted">Questions, progress and links from the agent show up here.</p>}
        {replying ? <p className="m-0 animate-pulse text-sm text-ink-muted">{name} is replying…</p> : null}
        {set ? <Questions key={set.id} taskId={task.id} set={set} /> : null}
      </Log>
      <Composer taskId={task.id} placeholder={composerPlaceholder(who)} />
    </section>
  )
}

/** The message log, newest at the bottom. It follows new messages while you're at the bottom, and opens there. */
function Log({ count, children }: { count: number; children: ReactNode }) {
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
      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-5 pb-4"
    >
      <div className="mt-auto flex flex-col gap-6">{children}</div>
    </div>
  )
}

/** A rounded box: the textarea grows with its text, the send button sits inside at the bottom right. */
function Composer({ taskId, placeholder }: { taskId: string; placeholder: string }) {
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
    <form onSubmit={send} className="shrink-0 px-4 pb-4">
      <div
        onClick={(e) => e.target === e.currentTarget && box.current?.focus()}
        className="flex cursor-text items-end gap-2 rounded-xl border border-border bg-input-bg p-2 hover:border-border-hover focus-within:border-ring"
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
        <Button type="submit" variant="ghost" size="icon" aria-label="Send" title="Send (Enter)" disabled={!text.trim()}><CornerDownLeft /></Button>
      </div>
    </form>
  )
}

import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { docLabel } from '@/lib/format'
import type { ChatMessage } from '@/lib/types'
import { showDoc } from '@/features/task/doc-tabs'
import { messageMeta, messageText } from './rules'

/** Claude-style rows: yours are bubbles on the right, the agent's Markdown prose, board lines quiet one-liners. */
export function Message({ m, taskId }: { m: ChatMessage; taskId: string }) {
  const from = m.kind === 'questions' ? 'agent' : m.kind === 'answers' ? 'you' : m.from
  const meta = messageMeta(m)
  const plain = m.kind !== 'questions' && m.kind !== 'answers' // question and answer sets carry no links or docs
  const links = plain && m.links ? Object.entries(m.links) : []
  const docs = plain ? m.docs ?? [] : []
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 text-left', from === 'you' && 'max-w-[85%] items-end self-end')}>
      {meta ? <span className="text-xs text-ink-subtle">{meta}</span> : null}
      {m.html ? (
        // Escaped by the server's renderer (harness/dashboard/markdown.mjs), which only emits http(s) links.
        <div className="doc doc-chat" dangerouslySetInnerHTML={{ __html: m.html }} />
      ) : (
        <div
          className={cn(
            'whitespace-pre-wrap text-ink-body [overflow-wrap:anywhere]',
            from === 'you' && 'rounded-xl bg-surface-inset px-4 py-2 text-ink-strong',
            from === 'system' && 'text-sm text-ink-muted',
          )}
        >
          {messageText(m)}
        </div>
      )}
      {links.length || docs.length ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {links.map(([k, url]) => (
            <a key={k} href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-ink-strong underline">{k} ↗</a>
          ))}
          {docs.map((doc) => <Button key={doc} variant="outline" size="sm" onClick={() => void showDoc(taskId, doc)}>{docLabel(doc)}</Button>)}
        </div>
      ) : null}
    </div>
  )
}

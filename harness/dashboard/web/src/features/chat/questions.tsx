import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { api } from '@/lib/api'
import { store } from '@/lib/store'
import type { QuestionSet, TaskDetail } from '@/lib/types'
import { collectAnswers } from './rules'

/** One question at a time: pick (or type) → next; the answers go together after the last. */
export function Questions({ taskId, set }: { taskId: string; set: QuestionSet }) {
  const [index, setIndex] = useState(0)
  // null = "use your judgment"; a missing key = not answered yet (the recommended option goes).
  const [picked, setPicked] = useState<Record<string, string | null>>({})
  const [sending, setSending] = useState(false)
  const total = set.questions.length
  const i = Math.min(index, total - 1)
  const q = set.questions[i]
  const last = i === total - 1

  async function send(answers: Record<string, string | null>) {
    setSending(true)
    try {
      const detail = await api<TaskDetail>(`/api/tasks/${taskId}/chat`, { answers: collectAnswers(set, answers) })
      store.set({ detail })
      toast('Answers sent — the agent picks it back up')
      void store.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSending(false)
    }
  }
  const next = (answers = picked) => (last ? void send(answers) : setIndex(i + 1))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    next()
  }
  const typed = picked[q.id] == null || q.options.includes(picked[q.id]!) ? '' : picked[q.id]!

  return (
    <form
      onSubmit={submit}
      aria-label={`Question ${i + 1} of ${total}`}
      className="flex flex-col gap-6 rounded-xl bg-surface p-5 shadow-[inset_0_0_0_1px_var(--semantic-brand)]"
    >
      <div>
        {total > 1 ? <span className="mb-2 block text-xs font-semibold tracking-[.05em] text-ink-subtle uppercase">Question {i + 1} of {total}</span> : null}
        <p className="m-0 mb-3 text-left font-semibold text-ink-strong">{q.question}</p>
        {q.options.length ? (
          <ToggleGroup
            type="single"
            orientation="vertical"
            spacing={2}
            value={picked[q.id] && q.options.includes(picked[q.id]!) ? picked[q.id]! : ''}
            aria-label={q.question}
            className="mb-3 w-full"
          >
            {q.options.map((opt) => (
              <ToggleGroupItem
                key={opt}
                value={opt}
                onClick={() => {
                  const answers = { ...picked, [q.id]: opt }
                  setPicked(answers)
                  if (!last) setTimeout(() => setIndex(i + 1), 180) // let the pick register before moving on
                }}
                className="group/option h-auto min-h-10 justify-start rounded-lg bg-secondary px-4 py-2 text-left text-base font-normal whitespace-normal text-ink-body shadow-[inset_0_0_0_1px_var(--semantic-border-strong)] hover:bg-secondary hover:text-ink-body hover:shadow-[inset_0_0_0_1px_var(--semantic-border-hover)] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-none"
              >
                <span>
                  {opt}
                  {q.recommended === opt ? ' ' : null}
                  {q.recommended === opt ? <span className="ml-1 inline-block text-sm text-ink-subtle group-data-[state=on]/option:text-inherit group-data-[state=on]/option:opacity-80">· recommended</span> : null}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        <Input
          name={`answer-${q.id}`}
          placeholder={q.options.length ? 'Or type your own answer' : q.recommended ? `Recommended: ${q.recommended}` : 'Your answer'}
          value={typed}
          onChange={(e) => setPicked({ ...picked, [q.id]: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        {i > 0 ? <Button type="button" variant="ghost" size="sm" onClick={() => setIndex(i - 1)}>Back</Button> : null}
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="sm" disabled={sending} onClick={() => { const answers = { ...picked, [q.id]: null }; setPicked(answers); next(answers) }}>
          Use your judgment
        </Button>
        <Button type="submit" size="sm" disabled={sending}>{last ? 'Send answers' : 'Next'}</Button>
      </div>
    </form>
  )
}

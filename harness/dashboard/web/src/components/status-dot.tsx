import { cn } from 'cn'

const tones = {
  off: 'bg-ink-disabled',
  on: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-danger',
} as const

/** An 8px status light: on (connected, running), warn (starting), bad (stopped, broken), off. */
export function StatusDot({ tone, className }: { tone: keyof typeof tones; className?: string }) {
  return <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', tones[tone], className)} />
}

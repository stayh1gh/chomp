import type { MouseEvent } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { act, store } from '@/lib/store'
import { STATUS_INK, taskStatus } from '@/lib/status'
import type { Column, Task } from '@/lib/types'

const shape = 'h-9 w-full px-3 text-sm'

/**
 * The status button at the bottom of every card: it names where the card stands ("Building
 * code…", "Waiting for user", "Ready for review", …). Hovered, a working or queued card offers
 * Stop and a card ready for review offers View; any other status stays as it is and a click
 * just opens the card. Paused, it's the primary "Start". Both labels share one grid cell, so
 * the button keeps its width when the label swaps.
 */
export function StatusButton({ task, columns }: { task: Task; columns: Column[] }) {
  const st = taskStatus(task, columns)
  const name = task.ref ?? task.title
  if (st.key === 'paused') {
    return (
      <Button className={shape} aria-label={`Start ${name}`} onClick={(e) => { e.stopPropagation(); void act(task.id, 'start') }}>
        Start
      </Button>
    )
  }

  const hover = st.key === 'working' || st.key === 'queued' ? 'Stop' : st.key === 'ready' || st.key === 'pr-open' ? 'View' : null
  const activity = st.key === 'working' || !hover ? task.activity : null
  const labels = (
    <span className="inline-grid *:col-start-1 *:row-start-1 *:text-center">
      <span className={cn(STATUS_INK[st.key], hover && 'group-hover/button:invisible group-focus-visible/button:invisible')}>{st.label}</span>
      {hover ? <span className="invisible text-ink-strong group-hover/button:visible group-focus-visible/button:visible">{hover}</span> : null}
    </span>
  )
  const look = cn(shape, 'border-border bg-surface')

  const button = hover ? (
    <Button
      variant="outline"
      className={cn(look, 'hover:bg-surface')}
      aria-label={`${st.label} — ${hover.toLowerCase()} ${name}`}
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        if (hover === 'Stop') void act(task.id, 'pause')
        else void store.navigate(`/task/${task.id}`)
      }}
    >
      {labels}
    </Button>
  ) : (
    // Not a control: the status alone. A click falls through to the card, which opens it.
    <span className={cn('inline-flex items-center justify-center rounded-lg border font-semibold', look)}>{labels}</span>
  )

  if (!activity) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{activity}</TooltipContent>
    </Tooltip>
  )
}

import { cn } from 'cn'
import { STATUS_INK, taskStatus } from '@/lib/status'
import type { Column, Task } from '@/lib/types'

/** Where a card stands, in its status color (task panel, chat list). */
export function StatusText({ task, columns, className }: { task: Task; columns: Column[]; className?: string }) {
  const st = taskStatus(task, columns)
  return <span className={cn('font-medium', STATUS_INK[st.key], className)}>{st.label}</span>
}

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { DynamicIcon, type IconName } from 'lucide-react/dynamic'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm'
import { api } from '@/lib/api'
import { columnServes } from '@/lib/status'
import { store, useStore } from '@/lib/store'
import { routeTaskId } from '@/lib/router'
import type { Board, Column } from '@/lib/types'
import { Page } from '@/features/shell/page'
import { openNewTask } from '@/features/new-task/new-task-dialog'
import { moveTask } from './move'
import { TaskCard } from './task-card'

export function BoardPage() {
  const { board, route } = useStore()
  return (
    <Page
      title="Tasks"
      bare
      actions={
        <Button onClick={() => void openNewTask()}><Plus />New task</Button>
      }
    >
      {/* Columns share the full width; below 248px each the board scrolls sideways. */}
      <div className="flex flex-1 gap-3 overflow-x-auto overflow-y-hidden p-4">
        {board?.columns.map((col) => <BoardColumn key={col.id} col={col} board={board} openId={routeTaskId(route)} />)}
      </div>
    </Page>
  )
}

function BoardColumn({ col, board, openId }: { col: Column; board: Board; openId: string | null }) {
  const confirm = useConfirm()
  const [over, setOver] = useState(false)
  const mine = board.tasks.filter((t) => t.column === col.id)
  const taskById = (id: string | null) => board.tasks.find((t) => t.id === id) ?? null

  return (
    <section
      aria-label={col.title}
      onDragOver={(e) => {
        const dragged = store.getDragging()
        if (!dragged || !columnServes(col, taskById(dragged))) return // no preventDefault → no drop
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const task = taskById(e.dataTransfer.getData('text/plain'))
        store.setDragging(null)
        if (!task || !columnServes(col, task)) return
        void moveTask({ api, confirm, notify: { info: (t) => toast(t), error: (t) => toast.error(t) }, refresh: store.refresh }, task, col)
      }}
      className={cn(
        'flex min-h-0 min-w-62 flex-1 basis-0 flex-col rounded-xl border border-border-subtle bg-background',
        over && 'border-brand',
      )}
    >
      <header className="flex h-12 items-center gap-2 px-4">
        <h2 className="m-0 flex items-center gap-2 text-base font-semibold text-ink-strong">
          {col.icon ? <DynamicIcon name={col.icon as IconName} className="size-4 shrink-0 text-ink-muted" aria-hidden="true" /> : null}
          {col.title}
        </h2>
        <span className="text-sm text-ink-subtle">{mine.length || ''}</span>
        <span className="ml-auto text-sm text-ink-subtle">@{col.owner === 'agent' ? col.agent : 'you'}</span>
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pt-1 pb-3">
        {mine.length
          ? mine.map((t) => <TaskCard key={t.id} task={t} columns={board.columns} current={openId === t.id} />)
          : <p className="py-4 text-center text-sm text-ink-faint">{col.owner === 'agent' ? `Drop a card to start the ${col.agent}` : 'Nothing here'}</p>}
      </div>
    </section>
  )
}

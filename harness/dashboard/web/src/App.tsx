import { useEffect } from 'react'
import { cn } from 'cn'
import { Toaster } from '@/components/ui/sonner'
import { ConfirmProvider } from '@/components/confirm'
import { TooltipProvider } from '@/components/ui/tooltip'
import { chatMode, store, useStore } from '@/lib/store'
import { routeTaskId } from '@/lib/router'
import { Sidebar } from '@/features/shell/sidebar'
import { BoardPage } from '@/features/board/board-page'
import { NewTaskDialog } from '@/features/new-task/new-task-dialog'
import { RecapDialog } from '@/features/recap/recap-dialog'
import { TaskPanel } from '@/features/task/task-panel'
import { ChatDock } from '@/features/chat/chat-dock'
import { SettingsPage } from '@/features/settings/settings-page'
import { ConnectionsPage } from '@/features/connections/connections-page'

export function App() {
  const panelChat = chatMode(useStore()) === 'panel'
  useEffect(() => {
    void store.refresh()
    store.listen()
    const back = () => void store.navigate(location.pathname)
    // Escape closes the open task (or its full-page document), unless a dialog has it.
    const escape = (e: KeyboardEvent) => {
      const { route } = store.getState()
      const taskId = routeTaskId(route)
      if (e.key !== 'Escape' || !taskId || document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      void store.navigate(route.page === 'tasks' && route.docName ? `/task/${taskId}` : '/')
    }
    window.addEventListener('popstate', back)
    document.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('popstate', back)
      document.removeEventListener('keydown', escape)
    }
  }, [])

  return (
    <TooltipProvider delayDuration={400}>
      <ConfirmProvider>
        {/* A maximized chat is a panel on the right; the page makes room (below 720px it covers it). */}
        <div className={cn('flex h-screen', panelChat && 'mr-[calc(var(--chat-panel)+8px)] max-[720px]:mr-0')}>
          <Sidebar />
          <main className="m-2 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface">
            <CurrentPage />
          </main>
        </div>
        <TaskPanel />
        <ChatDock />
        <NewTaskDialog />
        <RecapDialog />
        <Toaster position="bottom-center" />
      </ConfirmProvider>
    </TooltipProvider>
  )
}

function CurrentPage() {
  const { route } = useStore()
  if (route.page === 'settings') return <SettingsPage />
  if (route.page === 'connections') return <ConnectionsPage />
  return <BoardPage />
}

// The board's yes/no question, for actions that stop an agent or can't be taken back. Replaces
// window.confirm():  const confirm = useConfirm(); if (!(await confirm({ ... }))) return

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export type ConfirmOptions = {
  title: string
  description?: ReactNode
  /** The yes button's label, saying what happens ("Delete task"), not "OK". */
  action: string
  cancel?: string
  /** The yes button reads as dangerous: deletes, stops an agent. */
  destructive?: boolean
}

type Ask = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Ask | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<ConfirmOptions | null>(null)
  const resolve = useRef<((yes: boolean) => void) | null>(null)

  const ask = useCallback<Ask>((options) => {
    resolve.current?.(false) // a second question replaces the first, which counts as a no
    setOpen(options)
    return new Promise((r) => {
      resolve.current = r
    })
  }, [])

  const answer = (yes: boolean) => {
    resolve.current?.(yes)
    resolve.current = null
    setOpen(null)
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <AlertDialog open={open !== null} onOpenChange={(isOpen) => !isOpen && answer(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{open?.title}</AlertDialogTitle>
            {open?.description ? <AlertDialogDescription>{open.description}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{open?.cancel ?? 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction variant={open?.destructive ? 'destructive' : 'default'} onClick={() => answer(true)}>
              {open?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext)
  if (!ask) throw new Error('useConfirm needs a <ConfirmProvider> above it')
  return ask
}

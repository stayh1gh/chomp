import type { ReactNode } from 'react'

/** A page in the main panel: its title bar, then a scrolling body. */
/** `bare` hands the body to the page (the board scrolls its own columns); otherwise it pads and scrolls. */
export function Page({ title, actions, bare, children }: { title: string; actions?: ReactNode; bare?: boolean; children?: ReactNode }) {
  return (
    <>
      <header className="flex min-h-16 items-center justify-between gap-3 px-6 py-3 shadow-[inset_0_-1px_0_var(--semantic-divider)]">
        <h1 className="m-0 text-2xl font-semibold text-ink-strong">{title}</h1>
        {actions}
      </header>
      {bare ? children : <div className="flex-1 overflow-auto p-6">{children}</div>}
    </>
  )
}

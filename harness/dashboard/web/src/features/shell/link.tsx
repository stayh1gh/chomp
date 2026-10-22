import type { ComponentProps, MouseEvent } from 'react'
import { store } from '@/lib/store'

/** An in-app link: a real <a> (so cmd-click and copy-link work) that navigates without a reload. */
export function Link({ href, onClick, ...props }: ComponentProps<'a'> & { href: string }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void store.navigate(href)
  }
  return <a href={href} onClick={go} {...props} />
}

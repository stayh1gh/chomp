import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusDot } from '@/components/status-dot'
import { api } from '@/lib/api'
import { store, useStore } from '@/lib/store'
import type { Connections } from '@/lib/types'
import { capitalize } from '@/features/settings/rules'
import { channelText, otherServers, serverRows } from './rules'

const note = 'text-sm text-ink-muted'

export function ConnectionsPage() {
  const { board, options, connAccount } = useStore()
  const [c, setC] = useState<Connections | null>(null) // null while checking
  const request = useRef(0)
  const account = connAccount ?? board?.settings.account ?? 'default'

  const load = useCallback(async (fresh: boolean) => {
    const mine = ++request.current // switching accounts mid-check: only the newest answer counts
    setC(null)
    const q = new URLSearchParams()
    if (connAccount) q.set('account', connAccount)
    if (fresh) q.set('fresh', '1')
    let result: Connections
    try {
      result = await api<Connections>(`/api/connections${q.size ? `?${q}` : ''}`)
    } catch (err) {
      result = { account, servers: [], error: (err as Error).message }
    }
    if (mine === request.current) setC(result)
  }, [connAccount, account])

  useEffect(() => void load(false), [load])
  useEffect(() => void store.loadOptions().catch(() => {}), [])
  if (!board) return null

  const rows = serverRows(board.columns, c, account)
  const others = otherServers(board.columns, c)
  const via = board.settings.companions?.via ?? 'phone'
  const enabled = Boolean(board.settings.companions?.enabled)

  return (
    <>
      <header className="flex min-h-16 items-center gap-3 px-6 py-3 shadow-[inset_0_-1px_0_var(--semantic-divider)]">
        <h1 className="m-0 text-2xl font-semibold text-ink-strong">Connections</h1>
        {options ? (
          <Select value={account} onValueChange={(a) => store.set({ connAccount: a })}>
            <SelectTrigger aria-label="Claude account" className="ml-auto w-auto"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.accounts.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : <span className="ml-auto" />}
        <Button variant="outline" disabled={!c} onClick={() => void load(true)}>{c ? 'Check again' : 'Checking…'}</Button>
      </header>
      <div className="flex-1 overflow-auto p-6">
        <p className={note + ' m-0'}>
          What the {account} Claude account{c?.login ? ` (${c.login})` : ''} can reach. Cards wait in their column, blocked, until what they need is connected — then retry on their own within a minute.
        </p>
        {c?.error ? <p role="alert" className={note + ' m-0'}>{c.error}</p> : null}
        <List>
          {rows.map((r) => (
            <Row key={r.name} tone={r.ok ? 'on' : r.needed && c ? 'bad' : 'off'}>
              <div className="text-ink-strong">
                {capitalize(r.name)}
                {r.seen ? <span className={note}>{`  ${r.seen.name} · ${r.seen.status}`}</span> : null}
              </div>
              <div className={note}>{r.needed ? `Needed by ${r.columns.join(', ')}` : `Optional · used by ${r.columns.join(', ')} when connected`}</div>
              {r.connectorHint ? (
                <div className={note}>
                  Easiest: connect Google Drive at claude.ai → Settings → Connectors{c?.login ? `, signed in as ${c.login}` : ''}, then Check again. Or add it with your own Google OAuth client:
                </div>
              ) : null}
              {r.fix ? <Code>{r.fix}</Code> : null}
            </Row>
          ))}
          {c ? (['phone', 'slack'] as const).map((channel) => {
            const n = c[channel]
            if (!n) return null
            const t = channelText(channel, n, via, enabled)
            return (
              <Row key={channel} tone={n.ready ? 'on' : t.inUse ? 'bad' : 'off'}>
                <div className="text-ink-strong">{t.name}<span className={note}>{`  ${t.detail}`}</span></div>
                <div className={note}>{t.note}</div>
                {t.hint ? <div className={note}>{t.hint}</div> : null}
                {!n.ready && n.fix ? <Code>{n.fix}</Code> : null}
              </Row>
            )
          }) : null}
        </List>
        {others.length ? (
          <>
            <p className={note + ' m-0 mt-6'}>Also connected on this account</p>
            <List>
              {others.map((s) => (
                <Row key={s.name} tone="on">
                  <div className="text-ink-strong">{s.name}</div>
                  <div className={note}>{s.status}</div>
                </Row>
              ))}
            </List>
          </>
        ) : null}
      </div>
    </>
  )
}

function List({ children }: { children: ReactNode }) {
  return <ul className="m-0 mt-4 flex max-w-180 list-none flex-col gap-2 p-0">{children}</ul>
}

function Row({ tone, children }: { tone: 'on' | 'off' | 'bad'; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-lg bg-card p-4 shadow-[inset_0_0_0_1px_var(--semantic-border)]">
      <StatusDot tone={tone} className="mt-2" />
      <div className="min-w-0">{children}</div>
    </li>
  )
}

function Code({ children }: { children: ReactNode }) {
  return <code className="mt-2 block rounded-sm bg-background px-3 py-2 text-sm break-all text-ink-body">{children}</code>
}

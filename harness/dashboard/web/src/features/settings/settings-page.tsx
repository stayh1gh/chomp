import { useEffect, useState, type FormEvent } from 'react'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusDot } from '@/components/status-dot'
import { api } from '@/lib/api'
import { store, useStore } from '@/lib/store'
import type { Board, Options, SlackStatus } from '@/lib/types'
import { SettingRow, SettingSection, SettingSelect } from './setting'
import { EFFORTS, accountSettings, capitalize, modelOptions, settingsAccounts, slackNote } from './rules'

async function saveSettings(patch: unknown) {
  try {
    await api('/api/settings', patch)
    toast('Saved')
    await store.refresh()
  } catch (err) {
    toast.error((err as Error).message)
  }
}

/** Settings, after Retool's resource pages: tabs under the title pick the Claude account, then
 * labelled cards of setting rows. Notifications apply to every account, below the tabs' panel. */
export function SettingsPage() {
  const { board, options, settingsAccount } = useStore()
  useEffect(() => void store.loadOptions().catch((err: Error) => toast.error(err.message)), [])
  if (!board) return null
  const { accounts, account } = settingsAccounts(options, board.settings, settingsAccount)

  return (
    <Tabs value={account ?? ''} onValueChange={(a) => store.set({ settingsAccount: a })} className="min-h-0 flex-1 gap-0">
      <header className="flex min-h-16 flex-col items-start justify-end gap-2 px-6 pt-3 shadow-[inset_0_-1px_0_var(--semantic-divider)]">
        <h1 className="m-0 text-2xl font-semibold text-ink-strong">Settings</h1>
        <TabsList variant="page" aria-label="Claude account">
          {accounts.map((a) => <TabsTrigger key={a} value={a}>{capitalize(a)}</TabsTrigger>)}
        </TabsList>
      </header>
      {options ? (
        <div className="flex-1 overflow-auto p-6">
          <You board={board} options={options} />
          {account ? (
            <TabsContent value={account} aria-label={account} className="text-base">
              <AccountSettings account={account} board={board} />
            </TabsContent>
          ) : <p className="m-0 text-sm text-ink-muted">No Claude accounts in ~/.local/share/claude-profiles yet.</p>}
          <Notifications board={board} />
        </div>
      ) : null}
    </Tabs>
  )
}

/** Who runs this board: your name for the agents, the account they run as, the project new tasks start in. */
function You({ board, options }: { board: Board; options: Options }) {
  const s = board.settings
  const [name, setName] = useState(s.owner ?? '')
  useEffect(() => setName(s.owner ?? ''), [s.owner])
  const saveName = () => { if (name.trim() !== (s.owner ?? '')) void saveSettings({ owner: name.trim() }) }
  const projects = options.profiles.map((p) => ({ value: p.name, label: p.label }))

  return (
    <div className="mb-8 flex max-w-180 flex-col gap-8">
      <SettingSection title="You · all accounts">
        <SettingRow glyph="user" name="Your name" note="How the agents address you in chats and prompts." forId="owner">
          <Input
            id="owner" value={name} placeholder="e.g. Ana" autoComplete="off" className="h-8 w-56 text-sm max-[720px]:flex-1"
            onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === 'Enter') saveName() }}
          />
        </SettingRow>
        <SettingRow glyph="key-round" name="Claude account" note="The account agents run as, unless a project names its own. Connections shows what it's missing." forId="board-account">
          <SettingSelect id="board-account" label="Claude account" options={options.accounts.map((a) => ({ value: a, label: a === 'default' ? 'default (~/.claude)' : a }))} value={s.account} onChange={(v) => saveSettings({ account: v })} />
        </SettingRow>
        <SettingRow glyph="folder-git-2" name="Project" note={projects.length ? 'New tasks start in this project.' : 'No projects yet: copy profiles/example.yaml.template to profiles/<name>.yaml (GETTING-STARTED.md).'} forId="board-profile">
          {projects.length ? <SettingSelect id="board-profile" label="Project" options={projects} value={s.profile || ''} onChange={(v) => saveSettings({ profile: v })} /> : null}
        </SettingRow>
      </SettingSection>
    </div>
  )
}

function AccountSettings({ account, board }: { account: string; board: Board }) {
  const s = board.settings
  const own = accountSettings(s, account)
  const custom = Boolean(s.per_account?.[account])
  const saveOwn = (patch: object) => saveSettings({ per_account: { account, ...patch } })
  // An agent's line says which columns it works, and its tile borrows the first one's icon.
  const columnsOf = (name: string) => board.columns.filter((c) => c.agent === name || c.chat_agent === name)

  return (
    <div className="flex max-w-180 flex-col gap-8">
      <SettingSection title="Runner">
        <SettingRow glyph="layout-grid" name="Agents at once" note={`How many of ${account}'s cards agents work on at the same time.`} forId="max_parallel">
          <SettingSelect id="max_parallel" options={['1', '2', '3', '4']} value={String(own.max_parallel)} onChange={(v) => saveOwn({ max_parallel: Number(v) })} label="Agents at once" size="effort" />
        </SettingRow>
      </SettingSection>
      <SettingSection title="Agents">
        {Object.entries(own.agents).map(([name, cfg]) => {
          const cols = columnsOf(name)
          return (
            <SettingRow key={name} glyph={cols[0]?.icon ?? 'bot'} name={capitalize(name)} note={cols.length ? `Works ${cols.map((c) => c.title).join(', ')}` : null}>
              <SettingSelect id={`${name}-model`} options={modelOptions(s, cfg.model)} value={cfg.model} onChange={(v) => saveOwn({ agents: { [name]: { ...cfg, model: v } } })} label={`${name} model`} size="model" />
              <SettingSelect id={`${name}-effort`} options={EFFORTS} value={cfg.effort} onChange={(v) => saveOwn({ agents: { [name]: { ...cfg, effort: v } } })} label={`${name} effort`} size="effort" />
            </SettingRow>
          )
        })}
      </SettingSection>
      <SettingSection title="Assistant">
        <SettingRow glyph="message-square" name="Assistant" note="Writes your phone chat or Slack messages when one of this account's tasks needs you.">
          <SettingSelect id="companion-model" options={modelOptions(s, own.companion_model)} value={own.companion_model} onChange={(v) => saveOwn({ companion_model: v })} label="Assistant model" size="model" />
        </SettingRow>
      </SettingSection>
      {custom ? (
        <div className="-mt-4 flex min-h-8 items-center justify-end gap-3">
          <Button variant="outline" size="sm" onClick={() => saveSettings({ reset_account: account })}><RotateCcw />Reset to defaults</Button>
        </div>
      ) : null}
    </div>
  )
}

/** Notify me via, for every account: a phone chat in the Claude app, or a Slack DM (harness/slack). */
function Notifications({ board }: { board: Board }) {
  const via = board.settings.companions?.via ?? 'phone'
  return (
    <div className="mt-8 flex max-w-180 flex-col gap-8">
      <SettingSection title="Notifications · all accounts">
        <SettingRow glyph="vibrate" name="Notify me via" note="When a task stops and needs you, while I'm AFK is on in the sidebar." forId="notify-via">
          <SettingSelect
            id="notify-via" label="Notify me via" size="model" value={via}
            options={[{ value: 'phone', label: 'Phone chat' }, { value: 'slack', label: 'Slack' }]}
            onChange={(v) => saveSettings({ companions: { via: v } })}
          />
        </SettingRow>
        {via === 'slack' ? <SlackSetup /> : null}
      </SettingSection>
    </div>
  )
}

/** Slack's state, the tokens and member ID to paste, and a test DM. */
function SlackSetup() {
  const [status, setStatus] = useState<SlackStatus & { loading?: boolean }>({ loading: true })
  const [draft, setDraft] = useState({ bot_token: '', app_token: '', user_id: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<SlackStatus>('/api/slack').then(
      (s) => { setStatus(s); setDraft((d) => ({ ...d, user_id: d.user_id || s.user_id || '' })) },
      (err: Error) => setStatus({ error: err.message }),
    )
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const s = await api<SlackStatus>('/api/slack', draft)
      setStatus(s)
      setDraft({ bot_token: '', app_token: '', user_id: s.user_id ?? '' })
      if (s.connected) toast('Slack connected')
      else toast.error(`Saved, but Slack isn't connected${s.error ? `: ${s.error}` : ''}`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }
  async function test() {
    try {
      await api('/api/slack/test', {})
      toast('Sent a test message to your Slack DMs')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }
  const field = (name: keyof typeof draft) => ({
    name, value: draft[name], autoComplete: 'off', required: true, className: 'h-8 min-w-0 text-sm',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [name]: e.target.value }),
  })

  return (
    <SettingRow
      glyph="message-square"
      align="start"
      name={<span className="inline-flex items-center gap-2">Slack<StatusDot tone={status.connected ? 'on' : status.loading ? 'off' : 'bad'} /></span>}
      note={slackNote(status)}
      extra={
        <form onSubmit={save} className="mt-3 grid grid-cols-3 gap-2 max-[720px]:grid-cols-1">
          <Input {...field('bot_token')} type="password" placeholder="Bot token (xoxb-…)" aria-label="Slack bot token" />
          <Input {...field('app_token')} type="password" placeholder="App-level token (xapp-…)" aria-label="Slack app-level token" />
          <Input {...field('user_id')} placeholder="Your member ID (U…)" aria-label="Your Slack member ID" />
          <div className="col-span-full flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>{status.configured ? 'Save and reconnect' : 'Connect'}</Button>
            {status.configured ? <Button type="button" variant="outline" size="sm" onClick={test}>Send test</Button> : null}
          </div>
        </form>
      }
    />
  )
}

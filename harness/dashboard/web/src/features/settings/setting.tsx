import type { ReactNode } from 'react'
import { DynamicIcon, type IconName } from 'lucide-react/dynamic'
import { cn } from 'cn'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Option } from './rules'

/** A labelled card of setting rows. */
export function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="m-0 mb-3 text-sm font-semibold text-ink-strong">{title}</h2>
      <div className="rounded-xl bg-card px-4 shadow-[inset_0_0_0_1px_var(--semantic-border-strong)] [&>*+*]:shadow-[inset_0_1px_0_var(--semantic-divider)]">{children}</div>
    </section>
  )
}

/** One setting: an icon tile, a name with a line under it, controls on the right. */
export function SettingRow({ glyph, name, note, forId, align = 'center', children, extra }: {
  glyph?: string
  name: ReactNode
  note?: ReactNode
  forId?: string
  align?: 'center' | 'start'
  children?: ReactNode
  /** Below the name and note, full width (the Slack form). */
  extra?: ReactNode
}) {
  return (
    <div className={cn('flex min-h-16 gap-3 py-3 max-[720px]:flex-wrap', align === 'start' ? 'items-start' : 'items-center')}>
      {glyph ? (
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-inset text-ink-muted">
          <DynamicIcon name={glyph as IconName} className="size-4" aria-hidden="true" />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        {forId ? <label htmlFor={forId} className="font-medium text-ink-strong">{name}</label> : <span className="font-medium text-ink-strong">{name}</span>}
        {note ? <span className="text-sm text-ink-muted">{note}</span> : null}
        {extra}
      </div>
      {children ? <div className="flex shrink-0 gap-2 max-[720px]:w-full">{children}</div> : null}
    </div>
  )
}

const WIDTH = { default: 'w-56 max-[720px]:flex-1', model: 'w-44 max-[720px]:flex-[3]', effort: 'w-32 max-[720px]:flex-[2]' }

/** A setting's select. Widths line up down the card: models 176px, efforts 128px. */
export function SettingSelect({ id, options, value, onChange, label, size = 'default' }: {
  id: string
  options: (string | Option)[]
  value: string
  onChange: (value: string) => void
  label: string
  size?: keyof typeof WIDTH
}) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={label} className={cn(WIDTH[size], 'max-[720px]:w-full')}><SelectValue /></SelectTrigger>
      <SelectContent>
        {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

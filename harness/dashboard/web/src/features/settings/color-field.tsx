import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { hexColor } from './rules'

/**
 * A color setting: a swatch that opens the system picker, and the hex to type. Saves once the
 * picker closes or the hex is done (blur, Enter), never on every step of a drag.
 */
export function ColorField({ id, label, value, onChange }: {
  id: string
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const picker = useRef<HTMLInputElement>(null)
  useEffect(() => setDraft(value), [value])

  const commit = (input: string) => {
    const hex = hexColor(input)
    if (!hex) return setDraft(value)
    setDraft(hex)
    if (hex !== value) onChange(hex)
  }
  // React's onChange is the native "input" event (every step of a drag); "change" fires once, when the picker closes.
  const commitRef = useRef(commit)
  commitRef.current = commit
  useEffect(() => {
    const el = picker.current
    const done = () => commitRef.current(el!.value)
    el?.addEventListener('change', done)
    return () => el?.removeEventListener('change', done)
  }, [])

  const swatch = hexColor(draft) ?? value
  return (
    <div className="flex items-center gap-2 max-[720px]:flex-1">
      <label
        className="relative size-8 shrink-0 cursor-pointer rounded-lg shadow-[inset_0_0_0_1px_var(--semantic-border-strong)] focus-within:ring-3 focus-within:ring-ring/50"
        style={{ background: swatch }}
      >
        <input
          ref={picker} type="color" value={swatch} aria-label={`${label} picker`}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <Input
        id={id} value={draft} aria-label={label} spellCheck={false} autoComplete="off" maxLength={7}
        className="h-8 w-28 font-mono text-sm max-[720px]:flex-1"
        aria-invalid={hexColor(draft) ? undefined : true}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(draft) }}
      />
    </div>
  )
}

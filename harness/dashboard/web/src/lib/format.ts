/** "just now", "5m ago", "3h ago", then a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.round((now - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** "plan.md" → "Plan", "ds-lint.md" → "DS Lint", "qa.md" → "QA". */
export function docLabel(name: string): string {
  return name.replace(/\.md$/, '').split(/[-_]/).map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ')
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Today (or `date`) as YYYY-MM-DD in local time. */
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** "2026-10-16" → "Friday, Oct 16"; "Yesterday" when it was. */
export function dayLabel(day: string, today = localDay()): string {
  const date = new Date(`${day}T12:00:00`)
  const yesterday = new Date(`${today}T12:00:00`)
  yesterday.setDate(yesterday.getDate() - 1)
  if (localDay(date) === localDay(yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

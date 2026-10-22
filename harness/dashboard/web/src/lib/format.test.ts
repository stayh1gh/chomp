import { describe, expect, it } from 'vitest'
import { docLabel, timeAgo } from './format'

describe('format', () => {
  it('labels documents by name', () => {
    expect(docLabel('plan.md')).toBe('Plan')
    expect(docLabel('ds-lint.md')).toBe('DS Lint')
    expect(docLabel('qa.md')).toBe('QA')
  })

  it('says how long ago', () => {
    const now = Date.parse('2026-10-16T12:00:00Z')
    expect(timeAgo('2026-10-16T11:59:30Z', now)).toBe('just now')
    expect(timeAgo('2026-10-16T11:55:00Z', now)).toBe('5m ago')
    expect(timeAgo('2026-10-16T09:00:00Z', now)).toBe('3h ago')
  })
})

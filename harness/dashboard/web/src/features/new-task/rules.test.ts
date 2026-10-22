import { describe, expect, it } from 'vitest'
import type { ProjectOption } from '@/lib/types'
import { chooseProject, figmaLinkIn, figmaRequired, initialChoice, projectHint } from './rules'

const project = (fields: Partial<ProjectOption> & { name: string }): ProjectOption => ({
  label: fields.name, account: null, task_kinds: ['full', 'design'], libraries: [], has_work_file: false, ...fields,
})

const PROJECTS = [
  project({ name: 'chomp', label: 'Chomp', has_work_file: true }),
  project({
    name: 'newsroom', label: 'Newsroom', account: 'studio', task_kinds: ['design'],
    libraries: [{ id: 'web', label: 'Web', has_work_file: true }, { id: 'app', label: 'App', has_work_file: false }],
  }),
  project({ name: 'acme', label: 'Acme', libraries: [{ id: 'web', label: 'Web', has_work_file: false }] }),
]

describe('new-task rules', () => {
  it('opens on the default project, its first design system and first type', () => {
    expect(initialChoice(PROJECTS, 'newsroom')).toEqual({ profile: 'newsroom', library: 'web', kind: 'design' })
    expect(initialChoice(PROJECTS, undefined)).toEqual({ profile: 'chomp', library: null, kind: 'full' })
    expect(initialChoice(PROJECTS, 'gone').profile).toBe('chomp')
  })

  it('keeps the design system and type across projects when the new one has them', () => {
    const start = { profile: 'acme', library: 'web', kind: 'full' as const }
    expect(chooseProject(PROJECTS, start, 'newsroom')).toEqual({ profile: 'newsroom', library: 'web', kind: 'design' })
    const app = { profile: 'newsroom', library: 'app', kind: 'design' as const }
    expect(chooseProject(PROJECTS, app, 'acme')).toEqual({ profile: 'acme', library: 'web', kind: 'design' })
    expect(chooseProject(PROJECTS, app, 'chomp')).toEqual({ profile: 'chomp', library: null, kind: 'design' })
  })

  it('needs a Figma file unless the project or design system has a work file', () => {
    expect(figmaRequired(PROJECTS, { profile: 'chomp', library: null, kind: 'full' })).toBe(false)
    expect(figmaRequired(PROJECTS, { profile: 'newsroom', library: 'web', kind: 'design' })).toBe(false)
    expect(figmaRequired(PROJECTS, { profile: 'newsroom', library: 'app', kind: 'design' })).toBe(true)
    expect(figmaRequired(PROJECTS, { profile: 'acme', library: 'web', kind: 'full' })).toBe(true)
  })

  it('names the account, and the only type a project takes', () => {
    expect(projectHint(PROJECTS[0], 'default')).toBe('Runs as the default Claude account.')
    expect(projectHint(PROJECTS[1], 'default')).toBe('Runs as the studio Claude account. Newsroom is design only.')
  })

  it('finds a Figma link in the request', () => {
    expect(figmaLinkIn('see https://www.figma.com/design/abc/Portal?node-id=1-2 for the frames'))
      .toBe('https://www.figma.com/design/abc/Portal?node-id=1-2')
    expect(figmaLinkIn('https://figma.com/file/xyz')).toBe('https://figma.com/file/xyz')
    expect(figmaLinkIn('no link here https://example.com')).toBeNull()
  })
})

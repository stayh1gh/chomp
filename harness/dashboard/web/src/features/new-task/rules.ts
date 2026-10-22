// What the new-task dialog offers, per project: its design systems, the task types it takes, and
// whether it needs a Figma file. Pure, so the dialog only renders what these decide.

import type { ProjectOption, TaskKind } from '@/lib/types'

export type Choice = { profile: string; library: string | null; kind: TaskKind }

const find = (projects: ProjectOption[], name: string) => projects.find((p) => p.name === name) ?? projects[0]

/** Opening the dialog: the default project, its first design system and its first task type. */
export function initialChoice(projects: ProjectOption[], defaultProject: string | undefined): Choice {
  const p = find(projects, defaultProject ?? '')
  return { profile: p.name, library: p.libraries[0]?.id ?? null, kind: p.task_kinds[0] }
}

/** Switching project keeps the design system and type when the new project has them. */
export function chooseProject(projects: ProjectOption[], prev: Choice, name: string): Choice {
  const p = find(projects, name)
  return {
    profile: p.name,
    library: p.libraries.some((l) => l.id === prev.library) ? prev.library : p.libraries[0]?.id ?? null,
    kind: p.task_kinds.includes(prev.kind) ? prev.kind : p.task_kinds[0],
  }
}

/** The Figma file is required unless the project (or its design system) already has a work file. */
export function figmaRequired(projects: ProjectOption[], choice: Choice): boolean {
  const p = find(projects, choice.profile)
  const lib = p.libraries.find((l) => l.id === choice.library)
  return !(lib ?? p).has_work_file
}

/** Under the form: the account it runs as, and the type it's locked to, if only one. */
export function projectHint(project: ProjectOption, settingsAccount: string): string {
  const account = project.account ?? settingsAccount
  const only = project.task_kinds.length === 1
    ? ` ${project.label} is ${project.task_kinds[0] === 'design' ? 'design only' : 'full tasks only'}.`
    : ''
  return `Runs as the ${account} Claude account.${only}`
}

/** A Figma link pasted into the request fills the Figma field, if it's still empty. */
export function figmaLinkIn(text: string): string | null {
  return text.match(/https:\/\/(?:www\.)?figma\.com\/(?:design|file)\/\S+/)?.[0] ?? null
}

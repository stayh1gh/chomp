import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { store, useStore } from '@/lib/store'
import type { Task, TaskKind } from '@/lib/types'
import { chooseProject, figmaLinkIn, figmaRequired, initialChoice, projectHint, type Choice } from './rules'

const KINDS: { value: TaskKind; label: string }[] = [
  { value: 'full', label: 'Full — designed in Figma, then built in code with a draft PR' },
  { value: 'design', label: 'Design only — ends after Refinement, no code' },
]

const EMPTY = { title: '', prompt: '', figma: '', redesign: false }

/** Opens the dialog once the projects are known; a failure to load them is a toast. */
export async function openNewTask() {
  try {
    await store.loadOptions()
    store.set({ newTaskOpen: true })
  } catch (err) {
    toast.error((err as Error).message)
  }
}

/**
 * New task. What you type survives closing the dialog (it's a draft until created); the project,
 * design system and type reset to the defaults each time it opens.
 */
export function NewTaskDialog() {
  const { options, board, newTaskOpen } = useStore()
  const [draft, setDraft] = useState(EMPTY)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [saving, setSaving] = useState(false)
  const projects = options?.profiles ?? []

  const [wasOpen, setWasOpen] = useState(false)
  if (newTaskOpen !== wasOpen) {
    setWasOpen(newTaskOpen)
    if (newTaskOpen && projects.length) setChoice(initialChoice(projects, board?.settings.profile))
  }

  const close = () => store.set({ newTaskOpen: false })
  const project = choice ? projects.find((p) => p.name === choice.profile) : undefined
  const needsFigma = choice ? figmaRequired(projects, choice) : true

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!choice || !project) return
    setSaving(true)
    try {
      const task = await api<Task>('/api/tasks', {
        title: draft.title,
        prompt: draft.prompt,
        redesign: draft.redesign,
        profile: choice.profile,
        kind: choice.kind,
        library: project.libraries.length ? choice.library : undefined,
        figma_file: draft.figma,
      })
      setDraft(EMPTY)
      close()
      void store.navigate(`/task/${task.id}`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={newTaskOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent showCloseButton={false}>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogTitle>New task</DialogTitle>
          <DialogDescription className="sr-only">Describe the screen or change for the agents to design and build.</DialogDescription>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="nt-title">Title</FieldLabel>
              <Input
                id="nt-title" name="title" required maxLength={120} autoFocus
                placeholder="Talent onboarding: first upload"
                value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="nt-prompt">What should happen?</FieldLabel>
              <Textarea
                id="nt-prompt" name="prompt" required rows={7} className="resize-y"
                placeholder="Describe the screen or change. Paste links to notes, docs or Figma."
                value={draft.prompt}
                onChange={(e) => {
                  const prompt = e.target.value
                  const link = draft.figma ? null : figmaLinkIn(prompt)
                  setDraft({ ...draft, prompt, figma: link ?? draft.figma })
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="nt-profile">Project</FieldLabel>
              <Select value={choice?.profile} onValueChange={(name) => choice && setChoice(chooseProject(projects, choice, name))}>
                <SelectTrigger id="nt-profile" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.name} value={p.name}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {project?.libraries.length ? (
              <Field>
                <FieldLabel htmlFor="nt-library">Design system</FieldLabel>
                <Select value={choice?.library ?? undefined} onValueChange={(library) => choice && setChoice({ ...choice, library })}>
                  <SelectTrigger id="nt-library" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {project.libraries.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="nt-figma">{needsFigma ? 'Figma file' : 'Figma file (optional)'}</FieldLabel>
              <Input
                id="nt-figma" name="figma_file" type="url" required={needsFigma}
                placeholder="https://www.figma.com/design/…"
                value={draft.figma} onChange={(e) => setDraft({ ...draft, figma: e.target.value })}
              />
            </Field>
            <FieldSet>
              <FieldLegend variant="label" className="mb-2 font-normal text-ink-subtle">Type</FieldLegend>
              <RadioGroup value={choice?.kind} onValueChange={(kind) => choice && setChoice({ ...choice, kind: kind as TaskKind })} name="kind">
                {KINDS.map((k) => (
                  <Field key={k.value} orientation="horizontal" data-disabled={!project?.task_kinds.includes(k.value) || undefined}>
                    <RadioGroupItem id={`nt-kind-${k.value}`} value={k.value} disabled={!project?.task_kinds.includes(k.value)} />
                    <Label htmlFor={`nt-kind-${k.value}`} className="text-base leading-6 text-ink-body">{k.label}</Label>
                  </Field>
                ))}
              </RadioGroup>
            </FieldSet>
            <Field orientation="horizontal">
              <Checkbox id="nt-redesign" name="redesign" checked={draft.redesign} onCheckedChange={(on) => setDraft({ ...draft, redesign: on === true })} />
              <Label htmlFor="nt-redesign" className="text-base leading-6 text-ink-body">Redesigning an existing screen</Label>
            </Field>
          </FieldGroup>
          {project && board ? <p className="m-0 text-sm text-ink-muted">{projectHint(project, board.settings.account)}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={saving || !choice}>Create task</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// What serve.mjs sends. Grows with each phase of PLAN-shadcn.md as pages need more fields.

/** The icon colour a column or lane is drawn with (flow.yaml `tone`); absent means muted. */
export type Tone = 'brand' | 'warn' | 'model' | 'success'

/** Neighbouring columns with the same group share one lane on the board. */
export type ColumnGroup = { id: string; title: string; icon?: string; tone?: Tone }

export type Column = {
  id: string
  title: string
  icon?: string
  tone?: Tone
  group?: ColumnGroup
  /** On a column in a shared lane: the button that moves a ready card here from the column before. */
  enter_label?: string
  /** agent: the runner dispatches `agent` when a card enters; human: the card waits for you. */
  owner: 'agent' | 'human'
  agent?: string
  /** On a human column: the agent your chat messages go to. */
  chat_agent?: string
  /** The task kinds the column is part of; absent means every kind. */
  kinds?: TaskKind[]
  /** A check the runner runs after the agent says it's done (`draft-pr`, `figma-ds-lint`). */
  verify?: string
  /** MCP servers the runner checks before dispatching, and ones the agent uses when connected. */
  requires_mcp?: string[]
  optional_mcp?: string[]
  /** The column's checklist; a step with `file` writes that document. */
  steps?: { name: string; file?: string; verify?: boolean }[]
}

export type TaskKind = 'full' | 'design'

export type TaskStatusName = 'idle' | 'queued' | 'working' | 'paused' | 'needs_input' | 'blocked' | 'ready'

export type Task = {
  id: string
  ref?: string
  title: string
  prompt?: string
  column: string
  status: TaskStatusName
  kind?: TaskKind
  redesign?: boolean
  /** What the agent is doing right now, while working. */
  activity?: string | null
  steps: { name?: string; done?: boolean }[]
  blocker?: { kind?: string; title: string; detail?: string; needs?: string } | null
  pr?: { url: string; draft?: boolean } | null
  lint?: { errors?: number; warnings?: number; placeholders?: string[] } | null
  profile?: string
  account?: string
  library?: string | null
  figma_file?: { key?: string; url: string } | null
  workspace?: { branch?: string; removed?: boolean } | null
  links?: Record<string, string>
  history?: { at: string; from?: string; to: string; by: string }[]
  /** Counts the board adds (serve.mjs boardState). */
  docs: number
  messages: number
  unread: number
  unanswered: boolean
  [field: string]: unknown
}

/** `replying`: tasks whose chat is getting a quick reply right now. */
export type RunnerStatus = { running: boolean; active: string[]; replying?: string[] }

/** A task's build running locally ("Run locally"); null when none ever started. */
export type TaskApp = { task: string; state: 'starting' | 'running' | 'failed' | 'stopped'; url?: string; error?: string } | null

export type AgentConfig = { model: string; effort: string }

/** What an account sets for itself; anything missing falls back to the top level. */
export type ProjectOverrides = {
  agents?: Record<string, Partial<AgentConfig>>
  companion_model?: string
  max_parallel?: number
  figma?: { page_bg?: string; section_fill?: string }
}

export type Settings = {
  /** Your name, as the agents address you. */
  owner?: string
  account: string
  /** The project new tasks default to. */
  profile?: string
  companions?: { enabled?: boolean; via?: 'phone' | 'slack'; model?: string }
  agents?: Record<string, AgentConfig>
  models?: { id: string; label: string }[]
  max_parallel?: number
  /** The designer's Figma task page: its background and its sections' fill, #rrggbb. */
  figma?: { page_bg?: string; section_fill?: string }
  per_project?: Record<string, ProjectOverrides>
  [field: string]: unknown
}

export type Board = {
  columns: Column[]
  tasks: Task[]
  runner: RunnerStatus
  settings: Settings
  app: TaskApp
}

export type Doc = { name: string; html: string }

export type Question = { id: string; question: string; options: string[]; recommended?: string }

/** A set of questions an agent asked; the task waits until they're answered. */
export type QuestionSet = { id: string; questions: Question[] }

export type ChatMessage = {
  id: string
  at: string
  from: 'you' | 'agent' | 'system'
  kind?: 'message' | 'questions' | 'answers' | 'progress'
  agent?: string
  text?: string
  /** The agent's Markdown text, rendered by the server (harness/dashboard/markdown.mjs). */
  html?: string
  links?: Record<string, string>
  docs?: string[]
  /** Yours, before the agent has read it. */
  delivered?: boolean
  questions?: Question[]
  answers?: Record<string, string>
}

export type TaskDetail = {
  task: Task
  chat: ChatMessage[]
  docs: string[]
  openQuestions: QuestionSet | null
}

/** A project the new-task dialog offers (serve.mjs profileOptions). */
export type ProjectOption = {
  name: string
  label: string
  /** The Claude account it runs as; null means the settings account. */
  account: string | null
  task_kinds: TaskKind[]
  libraries: { id: string; label: string; has_work_file: boolean }[]
  has_work_file: boolean
}

export type Options = { accounts: string[]; profiles: ProjectOption[] }

/** /api/slack: the Slack app's state. */
export type SlackStatus = { configured?: boolean; connected?: boolean; team?: string; user_id?: string; error?: string }

/** /api/connections: what an account's Claude can reach. */
export type McpServer = { name: string; status: string }
export type Channel = { ready: boolean; title?: string; fix?: string; team?: string; user_id?: string }
export type Connections = {
  account: string
  login?: string | null
  servers: McpServer[]
  phone?: Channel
  slack?: Channel
  error?: string
}

/** /api/recap: what happened on the last day with work, per project (../recap.mjs). */
export type RecapTask = {
  id: string
  ref: string | null
  title: string
  /** What got done that day, in a few plain sentences. */
  done: string
  /** What to do next with it, one sentence. */
  next: string
  links: { pr?: string; figma?: string }
}

/** A task that sits on you, however long ago it was touched. */
export type RecapWaiting = Pick<RecapTask, 'id' | 'ref' | 'title' | 'next' | 'links'> & {
  /** The last day it was worked on and what got done then; null when nothing worth saying. */
  day: string | null
  done: string | null
}

export type Recap = {
  /** The day recapped (YYYY-MM-DD); null when nothing happened before today. */
  day: string | null
  /** tasks: what got done that day; waiting: everything else that needs you. */
  projects: { name: string; label: string; tasks: RecapTask[]; waiting: RecapWaiting[] }[]
  /** Already dismissed today. */
  seen: boolean
}

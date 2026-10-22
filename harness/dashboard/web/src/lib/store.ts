// The board's state: one snapshot, replaced on every change and read with useStore(). The
// server pushes "something changed" over SSE and the store re-fetches what's on screen, as the
// classic board did. Local UI state (drafts, collapsed panels) lives in the components.

import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { api as defaultApi } from './api'
import { parseRoute, routeTaskId, type Route } from './router'
import type { Board, Doc, Options, TaskDetail } from './types'

export type State = {
  board: Board | null
  route: Route
  /** The open task: its card, chat, documents and open questions. */
  detail: TaskDetail | null
  /** The document tab open in the task panel. */
  doc: Doc | null
  /** The document open full page (/task/<id>/doc/<name>). */
  pageDoc: Doc | null
  /** Accounts and projects (/api/options), loaded once when first needed. */
  options: Options | null
  newTaskOpen: boolean
  /** The daily recap dialog: opens itself on the first visit of a day, or from the sidebar. */
  recapOpen: boolean
  /** The chat dock folded to its header. Resets when another task opens. */
  chatCollapsed: boolean
  /** The chat as a full-height panel on the right instead of the corner dock (kept per browser). */
  chatMaximized: boolean
  /** The account tab open on Settings; null → the account the board runs as. */
  settingsAccount: string | null
  /** The account Connections shows; null → the account the board runs as. */
  connAccount: string | null
}

/** Per-browser preferences. Storage can be missing or throw (private windows); then defaults. */
const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(`agentos.${key}`)
      return v == null ? fallback : (JSON.parse(v) as T)
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`agentos.${key}`, JSON.stringify(value))
    } catch {
      // not kept; fine
    }
  },
}

type Deps = {
  api: <T>(path: string, body?: unknown) => Promise<T>
  notify: { info: (text: string) => void; error: (text: string) => void }
  location: { pathname: string }
  history: Pick<History, 'pushState' | 'replaceState'>
}

export function createBoardStore({ api, notify, location, history }: Deps) {
  let state: State = {
    board: null, route: parseRoute(location.pathname), detail: null, doc: null, pageDoc: null, options: null,
    newTaskOpen: false, recapOpen: false, chatCollapsed: false, chatMaximized: prefs.get('chatMaximized', false),
    settingsAccount: null, connAccount: null,
  }
  const listeners = new Set<() => void>()
  let refreshing = false
  let again = false
  let dragging: string | null = null

  function set(patch: Partial<State>) {
    state = { ...state, ...patch }
    for (const l of listeners) l()
  }

  /** Re-fetch the board and the open task. Calls while one is in flight coalesce into one more. */
  async function refresh(): Promise<void> {
    if (refreshing) {
      again = true
      return
    }
    refreshing = true
    try {
      const board = await api<Board>('/api/state')
      let { route, doc } = state
      let detail: TaskDetail | null = null
      let pageDoc: Doc | null = null
      const taskId = routeTaskId(route)
      if (taskId) {
        detail = await api<TaskDetail>(`/api/tasks/${taskId}`).catch(() => null)
        if (!detail && !board.tasks.some((t) => t.id === taskId)) {
          // The task was deleted (here or in another window): go back to the board, once.
          history.replaceState({}, '', '/')
          route = parseRoute('/')
          doc = null
          notify.info('That task was deleted')
        } else {
          if (route.page === 'tasks' && route.docName) {
            pageDoc = await api<Doc>(`/api/tasks/${taskId}/docs/${route.docName}`).catch(() => null)
          }
          if (doc && detail?.docs.includes(doc.name)) {
            const open = doc
            doc = await api<Doc>(`/api/tasks/${taskId}/docs/${open.name}`).catch(() => open)
          }
        }
      }
      set({ board, route, detail, doc, pageDoc })
    } catch (err) {
      notify.error(`Couldn't reach the board: ${(err as Error).message}`)
    } finally {
      refreshing = false
      if (again) {
        again = false
        void refresh()
      }
    }
  }

  /** Go to a page. Opening a different task clears what belonged to the last one. */
  function navigate(path: string) {
    if (location.pathname !== path) history.pushState({}, '', path)
    const route = parseRoute(path)
    const changedTask = routeTaskId(route) !== routeTaskId(state.route)
    set(changedTask ? { route, detail: null, doc: null, pageDoc: null, chatCollapsed: false } : { route })
    return refresh()
  }

  /** Follow the server's change pings; a drag in progress holds them off. */
  function listen(open: () => EventSource = () => new EventSource('/api/events')) {
    const es = open()
    let timer: ReturnType<typeof setTimeout> | undefined
    es.onmessage = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!dragging) void refresh()
      }, 150)
    }
    es.onerror = () => {
      es.close()
      setTimeout(() => listen(open), 2000)
    }
  }

  /** Open a document's tab in the task panel (from a tab, a step or a chat message). */
  async function openDoc(taskId: string, name: string) {
    try {
      set({ doc: await api<Doc>(`/api/tasks/${taskId}/docs/${name}`) })
    } catch (err) {
      notify.error((err as Error).message)
    }
  }

  /** /api/options, fetched the first time and kept. */
  async function loadOptions(): Promise<Options> {
    if (state.options) return state.options
    const options = await api<Options>('/api/options')
    set({ options })
    return options
  }

  return {
    getState: () => state,
    loadOptions,
    openDoc,
    setChatMaximized(on: boolean) {
      prefs.set('chatMaximized', on)
      set({ chatMaximized: on, chatCollapsed: false })
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set,
    refresh,
    navigate,
    listen,
    /** The card being dragged, if any: columns check it on dragover, and SSE refreshes wait. */
    setDragging(id: string | null) {
      dragging = id
    },
    getDragging: () => dragging,
  }
}

export type BoardStore = ReturnType<typeof createBoardStore>

export const store = createBoardStore({
  api: defaultApi,
  notify: { info: (text) => toast(text), error: (text) => toast.error(text) },
  location: window.location,
  history: window.history,
})

/** Where the chat sits: none, the corner dock, or the full-height panel the page makes room for. */
export function chatMode(s: State): 'none' | 'dock' | 'panel' {
  if (s.route.page !== 'tasks' || !s.board || s.route.docName) return 'none'
  return s.detail && s.chatMaximized ? 'panel' : 'dock'
}

export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.getState)
}

/** POST a task action (/api/tasks/<id>/<action>), toast a failure, then refresh either way. */
export async function act(id: string, action: string, body: unknown = {}) {
  try {
    await defaultApi(`/api/tasks/${id}/${action}`, body)
  } catch (err) {
    toast.error((err as Error).message)
  }
  await store.refresh()
}

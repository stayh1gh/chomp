// The board's four pages, on history.pushState. No router dependency: the URL is the route.

export type Route =
  | { page: 'tasks'; taskId: string | null; docName: string | null }
  | { page: 'settings' }
  | { page: 'connections' }

export function parseRoute(pathname: string): Route {
  const m = pathname.match(/^\/task\/([a-z0-9-]+)(?:\/doc\/([\w.-]+\.md))?$/)
  if (m) return { page: 'tasks', taskId: m[1], docName: m[2] ?? null }
  if (pathname === '/settings') return { page: 'settings' }
  if (pathname === '/connections') return { page: 'connections' }
  return { page: 'tasks', taskId: null, docName: null }
}

/** The task a route has open, if any. */
export function routeTaskId(route: Route): string | null {
  return route.page === 'tasks' ? route.taskId : null
}

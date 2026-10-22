// The board's JSON API (../../serve.mjs). Writes carry the per-process token the server put in
// the page's meta tag; reads need nothing.

const TOKEN = document.querySelector<HTMLMetaElement>('meta[name="agentos-token"]')?.content ?? ''

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agentos-token': TOKEN },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data as T
}

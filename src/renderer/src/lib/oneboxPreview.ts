import DOMPurify from 'dompurify'
import { discourse } from './discourse/client'
import { absolutize } from './discourse/urls'

// url → sanitized onebox HTML ('' = the URL doesn't onebox). Session-lived.
const cache = new Map<string, string>()
const inflight = new Map<string, Promise<void>>()
// Transient failures (429/offline) are NOT negative-cached — just cooled
// down, so a throttled burst doesn't permanently kill previews for a URL.
const retryAt = new Map<string, number>()
const RETRY_COOLDOWN_MS = 30_000

function sanitizeOnebox(html: string): string {
  if (!html.trim()) return ''
  const clean = DOMPurify.sanitize(html)
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  doc.body.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (src) img.setAttribute('src', absolutize(src))
    img.setAttribute('loading', 'lazy')
  })
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href')
    if (href) a.setAttribute('href', absolutize(href))
  })
  return doc.body.innerHTML
}

/** Cached result: undefined = never asked, '' = no onebox, else HTML. */
export function cachedOnebox(url: string): string | undefined {
  return cache.get(url)
}

/** Ask the server once per url; resolves when the cache is settled. */
export function fetchOnebox(url: string): Promise<void> {
  if (cache.has(url)) return Promise.resolve()
  if (Date.now() < (retryAt.get(url) ?? 0)) return Promise.resolve()
  const running = inflight.get(url)
  if (running) return running
  const p = discourse
    .oneboxPreview(url)
    .then((html) => {
      // '' here means a definitive 404 — safe to remember for the session.
      cache.set(url, sanitizeOnebox(html))
    })
    .catch(() => {
      retryAt.set(url, Date.now() + RETRY_COOLDOWN_MS)
    })
    .finally(() => {
      inflight.delete(url)
    })
  inflight.set(url, p)
  return p
}

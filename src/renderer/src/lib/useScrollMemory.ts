import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

/** In-memory scroll offsets per logical page — survives route changes, resets
    on relaunch. Insertion-ordered so the oldest entries can be evicted. */
const positions = new Map<string, number>()
const MAX_ENTRIES = 50

function remember(key: string, top: number): void {
  positions.delete(key)
  positions.set(key, top)
  if (positions.size > MAX_ENTRIES) {
    const oldest = positions.keys().next().value
    if (oldest !== undefined) positions.delete(oldest)
  }
}

/** Restore a scroll container's offset when returning to a page (or switching
    feed tabs on the same mounted instance), and keep recording it as the user
    scrolls. `ready` should flip true once the content is tall enough (data
    rendered) — restoration happens once per key. */
export function useScrollMemory(ref: RefObject<HTMLElement>, key: string, ready: boolean): void {
  const restoredKey = useRef<string | null>(null)

  // Record continuously (rAF-throttled). Recording on scroll — not on
  // unmount — also covers same-instance key changes and StrictMode remounts.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const onScroll = (): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        remember(key, el.scrollTop)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref, key])

  useLayoutEffect(() => {
    if (!ready || restoredKey.current === key) return
    const el = ref.current
    if (!el) return
    el.scrollTop = positions.get(key) ?? 0
    restoredKey.current = key
  }, [ref, key, ready])
}

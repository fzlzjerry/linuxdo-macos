import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useNavigationType } from 'react-router-dom'

/** In-memory last-focused row id per logical page — survives route changes,
    resets on relaunch. Insertion-ordered so the oldest entries can be evicted. */
const focusedRows = new Map<string, string>()
const MAX_ENTRIES = 50

function remember(key: string, rowId: string): void {
  focusedRows.delete(key)
  focusedRows.set(key, rowId)
  if (focusedRows.size > MAX_ENTRIES) {
    const oldest = focusedRows.keys().next().value
    if (oldest !== undefined) focusedRows.delete(oldest)
  }
}

/** Re-focus the row the user last had focused when returning (history POP) to
    a list page. Recording is delegated: any focus landing inside an element
    carrying [data-row-id] within the container is remembered. Restoration
    happens once per key, is focus-only (`preventScroll` — scroll offset is
    managed exclusively by useScrollMemory), and silently no-ops when the
    remembered row is no longer in the list. */
export function useFocusMemory(ref: RefObject<HTMLElement>, key: string, ready: boolean): void {
  const navigationType = useNavigationType()
  const attempted = useRef(false)

  // Record via delegated focusin (j/k moves, tab focus) AND pointerdown —
  // WKWebView never focuses buttons on click, so without the pointer path
  // mouse users would never be remembered.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const record = (target: EventTarget | null): void => {
      if (!(target instanceof Element)) return
      const id = target.closest('[data-row-id]')?.getAttribute('data-row-id')
      if (id) remember(key, id)
    }
    const onFocusIn = (e: FocusEvent): void => record(e.target)
    const onPointerDown = (e: PointerEvent): void => record(e.target)
    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('pointerdown', onPointerDown)
    return () => {
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('pointerdown', onPointerDown)
    }
  }, [ref, key])

  useLayoutEffect(() => {
    // One attempt per mount, and only when this mount IS a history POP.
    // useNavigationType keeps returning 'POP' until the next navigation, so
    // without the once-guard a mere key change (filter switch, new search
    // term) would re-run this and steal focus from whatever control the user
    // is operating.
    if (attempted.current || navigationType !== 'POP' || !ready) return
    const el = ref.current
    if (!el) return
    attempted.current = true
    const id = focusedRows.get(key)
    if (id === undefined) return
    // data-row-id values are plain numeric ids — direct interpolation into the
    // quoted attribute selector is safe, no escaping needed.
    el.querySelector<HTMLElement>(`[data-row-id="${id}"]`)?.focus({ preventScroll: true })
  }, [ref, key, ready, navigationType])
}

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
  const restoredKey = useRef<string | null>(null)

  // Record via delegated focusin — covers j/k list-nav focus moves as well as
  // any click/tab focus that lands on a row.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onFocusIn = (e: FocusEvent): void => {
      if (!(e.target instanceof Element)) return
      const id = e.target.closest('[data-row-id]')?.getAttribute('data-row-id')
      if (id) remember(key, id)
    }
    el.addEventListener('focusin', onFocusIn)
    return () => el.removeEventListener('focusin', onFocusIn)
  }, [ref, key])

  useLayoutEffect(() => {
    if (navigationType !== 'POP' || !ready || restoredKey.current === key) return
    const el = ref.current
    if (!el) return
    restoredKey.current = key
    const id = focusedRows.get(key)
    if (id === undefined) return
    // data-row-id values are plain numeric ids — direct interpolation into the
    // quoted attribute selector is safe, no escaping needed.
    el.querySelector<HTMLElement>(`[data-row-id="${id}"]`)?.focus({ preventScroll: true })
  }, [ref, key, ready, navigationType])
}

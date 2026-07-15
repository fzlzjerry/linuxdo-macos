import { useEffect } from 'react'
import type { RefObject } from 'react'
import { isEditableTarget } from './shortcuts'

/** j/k moves real DOM focus across [data-row] elements inside the scroll
    container (Enter then activates the row natively — it's a real button). */
export function useListNav(scrollRef: RefObject<HTMLElement>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'j' && e.key !== 'k') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditableTarget(e.target)) return
      if (document.querySelector('dialog[open]')) return
      const root = scrollRef.current
      if (!root) return
      const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-row]'))
      if (rows.length === 0) return
      e.preventDefault()
      const active = document.activeElement as HTMLElement | null
      const idx = active ? rows.indexOf(active) : -1
      let next: number
      if (idx === -1) {
        // No row focused yet: start at the first row visible in the viewport.
        const top = root.getBoundingClientRect().top
        next = rows.findIndex((r) => r.getBoundingClientRect().bottom > top)
        if (next === -1) next = 0
      } else {
        next = e.key === 'j' ? Math.min(idx + 1, rows.length - 1) : Math.max(idx - 1, 0)
      }
      const row = rows[next]
      row.focus({ preventScroll: true })
      row.scrollIntoView({ block: 'nearest' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scrollRef])
}

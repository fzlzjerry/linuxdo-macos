import { useEffect } from 'react'

export interface Shortcut {
  /** KeyboardEvent.key, e.g. 'k', 'r', '[', '/'. */
  key: string
  /** Requires ⌘ (or Ctrl). Plain-key shortcuts never fire in editable fields. */
  meta?: boolean
  shift?: boolean
  /** Fire even while a native <dialog> is open (default: blocked). */
  allowInDialog?: boolean
  run: (e: KeyboardEvent) => void
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null
  if (!t || !t.tagName) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

/** One window-level keydown listener for app-wide shortcuts. Native <dialog>
    (modals, lightbox) blocks navigation shortcuts for free. */
export function useGlobalShortcuts(shortcuts: Shortcut[]): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return
      for (const s of shortcuts) {
        if (e.key.toLowerCase() !== s.key.toLowerCase()) continue
        if ((e.metaKey || e.ctrlKey) !== !!s.meta) continue
        if (e.shiftKey !== !!s.shift) continue
        if (!s.meta && isEditableTarget(e.target)) return
        if (!s.allowInDialog && document.querySelector('dialog[open]')) return
        s.run(e)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts])
}

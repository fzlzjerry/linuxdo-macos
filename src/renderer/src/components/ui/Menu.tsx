import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import styles from './Menu.module.css'

export interface MenuItem {
  key: string
  label: ReactNode
  /** Optional secondary line under the label. */
  description?: ReactNode
  icon?: ReactNode
  hint?: ReactNode
  onSelect: () => void
  active?: boolean
  danger?: boolean
  disabled?: boolean
}

interface Props {
  /** Content of the trigger button (icon and/or label). */
  trigger: ReactNode
  items: MenuItem[]
  /** Accessible name for the trigger. */
  label: string
  /** Horizontal edge to pin the panel to the trigger. Default 'end' (right). */
  align?: 'start' | 'end'
  triggerClassName?: string
  /** Marks the trigger as "on" (e.g. a non-default state is active). */
  triggerActive?: boolean
  width?: number
}

/** Generic anchored dropdown menu. Portaled to <body> so the toolbar's
 *  backdrop-filter can't become its containing block (same reason as
 *  TopicFilters' popover). Closes on select / outside / Esc / scroll / resize. */
export function Menu({
  trigger,
  items,
  label,
  align = 'end',
  triggerClassName,
  triggerActive,
  width = 200
}: Props): JSX.Element {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)

  function place(): void {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const left = align === 'end' ? r.right - width : r.left
    setAnchor({
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      top: r.bottom + 6
    })
  }

  function toggle(): void {
    if (open) {
      setOpen(false)
      return
    }
    place()
    setOpen(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={
          triggerClassName
            ? triggerClassName
            : `${styles.trigger} ${triggerActive ? styles.triggerActive : ''}`
        }
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        {trigger}
      </button>
      <MenuPanel
        open={open}
        anchor={anchor}
        width={width}
        triggerRef={btnRef}
        onClose={() => setOpen(false)}
      >
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            className={`${styles.item} ${it.active ? styles.itemActive : ''} ${it.danger ? styles.itemDanger : ''}`}
            disabled={it.disabled}
            onClick={() => {
              setOpen(false)
              it.onSelect()
            }}
          >
            {it.icon && <span className={styles.itemIcon}>{it.icon}</span>}
            <span className={styles.itemText}>
              <span className={styles.itemLabel}>{it.label}</span>
              {it.description != null && (
                <span className={styles.itemDesc}>{it.description}</span>
              )}
            </span>
            {it.hint != null && <span className={styles.itemHint}>{it.hint}</span>}
          </button>
        ))}
      </MenuPanel>
    </>
  )
}

function MenuPanel({
  open,
  anchor,
  width,
  triggerRef,
  onClose,
  children
}: {
  open: boolean
  anchor: { left: number; top: number } | null
  width: number
  triggerRef: RefObject<HTMLElement>
  onClose: () => void
  children: ReactNode
}): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (ref.current?.contains(t) || triggerRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    const onScroll = (e: Event): void => {
      if (ref.current?.contains(e.target as Node)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [open, onClose, triggerRef])

  if (!open || !anchor) return null
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className={styles.panel}
      style={{ left: anchor.left, top: anchor.top, width }}
      data-tauri-drag-region="false"
    >
      {children}
    </div>,
    document.body
  )
}

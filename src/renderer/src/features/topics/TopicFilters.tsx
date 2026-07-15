import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'
import { CategoryBadge } from '../../components/ui/CategoryBadge'
import { SpriteIcon } from '../../components/ui/SpriteIcon'
import { useCategoryMap } from '../../lib/discourse/CategoriesContext'
import { useTagIcons } from '../../lib/tagIcons'
import { discourse } from '../../lib/discourse/client'
import { compactNumber } from '../../lib/format'
import type { Category } from '../../lib/discourse/types'
import styles from './TopicFilters.module.css'

export interface TopicFilterState {
  category?: Category
  tag?: string
}

interface Props {
  value: TopicFilterState
  onChange: (next: TopicFilterState) => void
}

/** The site's 类别/标签 list filters as two toolbar dropdowns. */
export function TopicFilters({ value, onChange }: Props): JSX.Element {
  return (
    <div className={styles.bar}>
      <CategoryFilter value={value} onChange={onChange} />
      <TagFilter value={value} onChange={onChange} />
    </div>
  )
}

/* ---------- shared popover shell ---------- */

function FilterPopover({
  open,
  anchor,
  triggerRef,
  onClose,
  children
}: {
  open: boolean
  anchor: { left: number; top: number } | null
  /** Clicks on the trigger must not count as "outside" (it toggles itself). */
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
  // Portaled to <body>: the toolbar's backdrop-filter turns it into the
  // containing block for fixed descendants, which would shift coordinates.
  return createPortal(
    <div
      ref={ref}
      className={styles.pop}
      style={{ left: anchor.left, top: anchor.top }}
      data-tauri-drag-region="false"
    >
      {children}
    </div>,
    document.body
  )
}

function useAnchor(): {
  btnRef: React.RefObject<HTMLButtonElement>
  anchor: { left: number; top: number } | null
  place: () => void
} {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  const place = (): void => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setAnchor({ left: Math.max(8, Math.min(r.left, window.innerWidth - 296)), top: r.bottom + 6 })
  }
  return { btnRef, anchor, place }
}

/* ---------- 分类 ---------- */

function CategoryFilter({ value, onChange }: Props): JSX.Element {
  const map = useCategoryMap()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const { btnRef, anchor, place } = useAnchor()

  const rows = useMemo(() => {
    const all = [...map.values()]
    const term = q.trim().toLowerCase()
    if (term) {
      return all
        .filter((c) => c.name.toLowerCase().includes(term))
        .map((c) => ({ c, sub: !!c.parent_category_id }))
    }
    const tops = all.filter((c) => !c.parent_category_id)
    const out: { c: Category; sub: boolean }[] = []
    for (const t of tops) {
      out.push({ c: t, sub: false })
      for (const s of all.filter((c) => c.parent_category_id === t.id)) {
        out.push({ c: s, sub: true })
      }
    }
    return out
  }, [map, q])

  function toggle(): void {
    if (open) {
      setOpen(false)
      return
    }
    setQ('')
    place()
    setOpen(true)
  }

  function pick(c?: Category): void {
    onChange({ ...value, category: c })
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${styles.trigger} ${value.category ? styles.triggerActive : ''}`}
        onClick={toggle}
        aria-expanded={open}
        aria-label="按分类筛选"
      >
        {value.category ? <CategoryBadge categoryId={value.category.id} /> : '分类'}
        {value.category ? (
          <span
            role="button"
            aria-label="清除分类筛选"
            tabIndex={0}
            className={styles.clear}
            onClick={(e) => {
              e.stopPropagation()
              pick(undefined)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                pick(undefined)
              }
            }}
          >
            <X size={12} />
          </span>
        ) : (
          <ChevronDown size={13} className={styles.chevron} />
        )}
      </button>

      <FilterPopover open={open} anchor={anchor} triggerRef={btnRef} onClose={() => setOpen(false)}>
        <input
          className={styles.search}
          placeholder="搜索分类"
          aria-label="搜索分类"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
        />
        <div className={styles.list}>
          <button type="button" className={styles.item} onClick={() => pick(undefined)}>
            全部分类
          </button>
          {rows.map(({ c, sub }) => (
            <button
              key={c.id}
              type="button"
              className={`${styles.item} ${sub ? styles.itemSub : ''} ${
                value.category?.id === c.id ? styles.itemActive : ''
              }`}
              onClick={() => pick(c)}
            >
              <CategoryBadge categoryId={c.id} />
              <span className={styles.itemCount}>{compactNumber(c.topic_count)}</span>
            </button>
          ))}
        </div>
      </FilterPopover>
    </>
  )
}

/* ---------- 标签 ---------- */

function TagFilter({ value, onChange }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<{ name: string; count: number }[]>([])
  const { btnRef, anchor, place } = useAnchor()
  const seq = useRef(0)
  const icons = useTagIcons(items.map((i) => i.name))

  useEffect(() => {
    if (!open) return
    const id = ++seq.current
    const t = setTimeout(
      () => {
        discourse
          .searchTags(q.trim())
          .then((list) => {
            if (seq.current === id) setItems(list)
          })
          .catch(() => {
            if (seq.current === id) setItems([])
          })
      },
      q.trim() ? 200 : 0
    )
    return () => clearTimeout(t)
  }, [open, q])

  function toggle(): void {
    if (open) {
      setOpen(false)
      return
    }
    setQ('')
    place()
    setOpen(true)
  }

  function pick(tag?: string): void {
    onChange({ ...value, tag })
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${styles.trigger} ${value.tag ? styles.triggerActive : ''}`}
        onClick={toggle}
        aria-expanded={open}
        aria-label="按标签筛选"
      >
        {value.tag ?? '标签'}
        {value.tag ? (
          <span
            role="button"
            aria-label="清除标签筛选"
            tabIndex={0}
            className={styles.clear}
            onClick={(e) => {
              e.stopPropagation()
              pick(undefined)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                pick(undefined)
              }
            }}
          >
            <X size={12} />
          </span>
        ) : (
          <ChevronDown size={13} className={styles.chevron} />
        )}
      </button>

      <FilterPopover open={open} anchor={anchor} triggerRef={btnRef} onClose={() => setOpen(false)}>
        <input
          className={styles.search}
          placeholder="搜索标签"
          aria-label="搜索标签"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
        />
        <div className={styles.list}>
          <button type="button" className={styles.item} onClick={() => pick(undefined)}>
            全部标签
          </button>
          {items.map((t) => (
            <button
              key={t.name}
              type="button"
              className={`${styles.item} ${value.tag === t.name ? styles.itemActive : ''}`}
              onClick={() => pick(t.name)}
            >
              <span className={styles.tagName}>
                <SpriteIcon name={icons[t.name]} size={12} />
                {t.name}
              </span>
              <span className={styles.itemCount}>{compactNumber(t.count)}</span>
            </button>
          ))}
        </div>
      </FilterPopover>
    </>
  )
}

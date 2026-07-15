import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { EMOJI } from '../../lib/emoji'
import styles from './EmojiPicker.module.css'

interface Group {
  key: string
  label: string
  icon: string
}

const GROUPS: Group[] = [
  { key: 'smileys', label: '表情', icon: '😀' },
  { key: 'gestures', label: '手势', icon: '👍' },
  { key: 'hearts', label: '爱心', icon: '❤️' },
  { key: 'objects', label: '物件', icon: '💡' },
  { key: 'symbols', label: '符号', icon: '✅' }
]

interface Props {
  anchor: { left: number; top: number }
  /** The toolbar trigger — clicks inside it must not count as "outside". */
  triggerRef: RefObject<HTMLElement>
  onClose: () => void
  onPick: (char: string) => void
}

export function EmojiPicker({ anchor, triggerRef, onClose, onPick }: Props): JSX.Element {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState(GROUPS[0].key)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    // Capture-phase scroll fires for inner scroll containers too — ignore scrolls
    // that originate inside the grid, else browsing the emoji list closes it.
    const onScroll = (e: Event): void => {
      if (rootRef.current?.contains(e.target as Node)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose, triggerRef])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term) {
      return EMOJI.filter(
        (e) => e.name.includes(term) || e.keywords.includes(term) || e.char === term
      )
    }
    return EMOJI.filter((e) => e.group === group)
  }, [q, group])

  return (
    <div ref={rootRef} className={styles.popover} style={{ left: anchor.left, top: anchor.top }}>
      <input
        className={styles.search}
        placeholder="搜索表情"
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
      />
      {!q && (
        <div className={styles.tabs}>
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              className={g.key === group ? styles.tabActive : styles.tab}
              title={g.label}
              aria-label={g.label}
              onClick={() => setGroup(g.key)}
            >
              {g.icon}
            </button>
          ))}
        </div>
      )}
      <div className={styles.grid}>
        {list.length === 0 ? (
          <div className={styles.empty}>没有找到表情</div>
        ) : (
          list.map((e) => (
            <button
              key={e.char}
              type="button"
              className={styles.cell}
              title={e.name}
              onClick={() => onPick(e.char)}
            >
              {e.char}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

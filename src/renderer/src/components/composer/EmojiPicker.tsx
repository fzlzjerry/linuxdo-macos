import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useEmojis } from '../../lib/discourse/queries'
import { absolutize } from '../../lib/discourse/urls'
import type { DiscourseEmoji } from '../../lib/discourse/types'
import styles from './EmojiPicker.module.css'

// Friendly labels for the standard Unicode groups; custom packs (b站 / 飞书 / …)
// keep their own group name.
const GROUP_LABELS: Record<string, string> = {
  'smileys_&_emotion': '表情',
  'people_&_body': '人物',
  'animals_&_nature': '动物',
  'food_&_drink': '食物',
  'travel_&_places': '旅行',
  activities: '活动',
  objects: '物件',
  symbols: '符号',
  flags: '旗帜'
}
const groupLabel = (g: string): string => GROUP_LABELS[g] ?? g

interface Props {
  anchor: { left: number; top: number }
  /** The toolbar trigger — clicks inside it must not count as "outside". */
  triggerRef: RefObject<HTMLElement>
  onClose: () => void
  /** Receives the emoji shortcode to insert, e.g. ":clap:". */
  onPick: (text: string) => void
}

/** linux.do (Discourse) emoji picker: renders the site's own emoji images
 *  (twemoji + custom packs) and inserts the `:shortcode:` so sent content
 *  renders identically to the web. */
export function EmojiPicker({ anchor, triggerRef, onClose, onPick }: Props): JSX.Element {
  const { data, isLoading } = useEmojis()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      onClose()
    }
    // Capture + preventDefault: Escape closes ONLY the picker, not the enclosing
    // native <dialog>.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    const onScroll = (e: Event): void => {
      if (rootRef.current?.contains(e.target as Node)) return
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
  }, [onClose, triggerRef])

  const groups = useMemo(() => (data ? Object.keys(data) : []), [data])
  const activeGroup = group ?? groups[0] ?? ''

  const list = useMemo<DiscourseEmoji[]>(() => {
    if (!data) return []
    const term = q.trim().toLowerCase().replace(/[:\s]/g, '')
    if (term) {
      const seen = new Set<string>()
      const out: DiscourseEmoji[] = []
      for (const arr of Object.values(data)) {
        for (const e of arr) {
          if (e.name.includes(term) && !seen.has(e.name)) {
            seen.add(e.name)
            out.push(e)
            if (out.length >= 200) return out
          }
        }
      }
      return out
    }
    return data[activeGroup] ?? []
  }, [data, q, activeGroup])

  return (
    <div ref={rootRef} className={styles.popover} style={{ left: anchor.left, top: anchor.top }}>
      <input
        className={styles.search}
        placeholder="搜索表情"
        aria-label="搜索表情"
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
      />
      {!q && groups.length > 0 && (
        <div className={styles.tabs} role="radiogroup" aria-label="表情分组">
          {groups.map((g) => {
            const icon = data?.[g]?.[0]
            return (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={g === activeGroup}
                className={g === activeGroup ? styles.tabActive : styles.tab}
                title={groupLabel(g)}
                aria-label={groupLabel(g)}
                onClick={() => setGroup(g)}
              >
                {icon ? (
                  <img className={styles.tabImg} src={absolutize(icon.url)} alt="" loading="lazy" />
                ) : (
                  groupLabel(g).slice(0, 1)
                )}
              </button>
            )
          })}
        </div>
      )}
      <div className={styles.grid}>
        {isLoading ? (
          <div className={styles.empty}>加载表情…</div>
        ) : list.length === 0 ? (
          <div className={styles.empty}>没有找到表情</div>
        ) : (
          list.map((e) => (
            <button
              key={e.name}
              type="button"
              className={styles.cell}
              title={`:${e.name}:`}
              onClick={() => onPick(`:${e.name}:`)}
            >
              <img className={styles.cellImg} src={absolutize(e.url)} alt={e.name} loading="lazy" />
            </button>
          ))
        )}
      </div>
    </div>
  )
}

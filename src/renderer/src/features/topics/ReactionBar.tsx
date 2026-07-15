import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'
import { discourse } from '../../lib/discourse/client'
import type { Post, PostReaction } from '../../lib/discourse/types'
import { compactNumber } from '../../lib/format'
import { ENABLED_REACTIONS, reactionEmoji } from '../../lib/discourse/reactions'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import styles from './ReactionBar.module.css'

interface Props {
  post: Post
}

function Emoji({ id }: { id: string }): JSX.Element {
  const e = reactionEmoji(id)
  if (e.img) return <img className={styles.img} src={e.img} alt={id} loading="lazy" />
  return <span className={styles.char}>{e.char}</span>
}

export function ReactionBar({ post }: Props): JSX.Element {
  const auth = useAuth()
  const [reactions, setReactions] = useState<PostReaction[]>(() =>
    (post.reactions ?? []).map((r) => ({ ...r }))
  )
  const [current, setCurrent] = useState<string | null>(post.current_user_reaction?.id ?? null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || pickerRef.current?.contains(t)) return
      setPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    const close = (): void => setPickerOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [pickerOpen])

  function guard(): boolean {
    if (!auth.loggedIn) {
      toast.info('请先登录 linux.do')
      void auth.showLogin()
      return false
    }
    return true
  }

  // Discourse allows a single reaction per post, so toggling a new one replaces
  // the old. Mirror that locally before the request resolves.
  function nextState(id: string): { reactions: PostReaction[]; current: string | null } {
    const list = reactions.map((r) => ({ ...r }))
    const bump = (rid: string, delta: number): void => {
      const idx = list.findIndex((r) => r.id === rid)
      if (idx === -1) {
        if (delta > 0) list.push({ id: rid, count: 1 })
        return
      }
      list[idx] = { ...list[idx], count: list[idx].count + delta }
    }
    if (current === id) {
      bump(id, -1)
      return { reactions: list.filter((r) => r.count > 0), current: null }
    }
    if (current) bump(current, -1)
    bump(id, 1)
    return { reactions: list.filter((r) => r.count > 0), current: id }
  }

  async function toggle(id: string): Promise<void> {
    if (!guard()) return
    setPickerOpen(false)
    const prevReactions = reactions
    const prevCurrent = current
    const next = nextState(id)
    setReactions(next.reactions)
    setCurrent(next.current)
    try {
      await discourse.toggleReaction(post.id, id)
    } catch {
      setReactions(prevReactions)
      setCurrent(prevCurrent)
      toast.error('操作失败')
    }
  }

  function openPicker(): void {
    if (!guard()) return
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAnchor({ left: Math.max(8, Math.min(r.left, window.innerWidth - 268)), top: r.bottom + 6 })
    setPickerOpen(true)
  }

  return (
    <div className={styles.bar}>
      {reactions.map((r) => (
        <button
          key={r.id}
          type="button"
          className={`${styles.chip} ${current === r.id ? styles.active : ''}`}
          onClick={() => void toggle(r.id)}
          title={r.id}
        >
          <Emoji id={r.id} />
          {r.count > 0 && <span className={styles.count}>{compactNumber(r.count)}</span>}
        </button>
      ))}

      <button
        ref={triggerRef}
        type="button"
        className={styles.add}
        onClick={openPicker}
        aria-haspopup="menu"
        aria-expanded={pickerOpen}
        title="添加表情"
      >
        <Plus size={14} />
        <span>表情</span>
      </button>

      {pickerOpen &&
        anchor &&
        createPortal(
          <div
            ref={pickerRef}
            className={styles.picker}
            style={{ left: anchor.left, top: anchor.top }}
            role="menu"
          >
            {ENABLED_REACTIONS.map((id) => (
              <button
                key={id}
                type="button"
                className={`${styles.pick} ${current === id ? styles.pickActive : ''}`}
                onClick={() => void toggle(id)}
                title={id}
                role="menuitem"
              >
                <Emoji id={id} />
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Heart, Plus } from 'lucide-react'
import { discourse } from '../../lib/discourse/client'
import type { Post, PostReaction } from '../../lib/discourse/types'
import { compactNumber } from '../../lib/format'
import {
  primeReactionUrls,
  reactionEmoji,
  useEnabledReactions
} from '../../lib/discourse/reactions'
import { useEmojis } from '../../lib/discourse/queries'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { errorMessage } from '../../lib/errors'
import styles from './ReactionBar.module.css'

interface Props {
  post: Post
}

// Site-emoji images load through the engine proxy (direct cross-origin
// bursts trip Cloudflare — same reason EmojiPicker proxies).
const emojiImgCache = new Map<string, string>() // abs url -> data url ('' = failed)

function Emoji({ id }: { id: string }): JSX.Element {
  const e = reactionEmoji(id)
  const cached = e.img ? emojiImgCache.get(e.img) : undefined
  const [src, setSrc] = useState<string | undefined>(cached || undefined)
  const [failed, setFailed] = useState(cached === '')
  useEffect(() => {
    const url = e.img
    if (!url) return
    const hit = emojiImgCache.get(url)
    if (hit !== undefined) {
      setSrc(hit || undefined)
      setFailed(hit === '')
      return
    }
    let live = true
    window.api
      ?.fetchImage(url)
      .then((data) => {
        emojiImgCache.set(url, data ?? '')
        if (!live) return
        if (data) {
          setSrc(data)
          // The twemoji guess may have failed before /emojis.json supplied
          // the real URL — a late success must clear the shortcode fallback.
          setFailed(false)
        } else {
          setFailed(true)
        }
      })
      .catch(() => {
        emojiImgCache.set(url, '')
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [e.img])
  if (e.char) return <span className={styles.char}>{e.char}</span>
  // /emojis.json still loading — hold a quiet placeholder, don't guess URLs.
  if (e.pending) return <span className={styles.img} aria-hidden />
  // Never render an invisible pill: an unresolvable id falls back to its
  // shortcode, the same convention the emoji picker uses.
  if (failed) return <span className={styles.imgFallback}>:{id}:</span>
  if (!src) return <span className={styles.img} aria-hidden />
  return <img className={styles.img} src={src} alt={id} />
}

export function ReactionBar({ post }: Props): JSX.Element {
  const auth = useAuth()
  const [reactions, setReactions] = useState<PostReaction[]>(() =>
    (post.reactions ?? []).map((r) => ({ ...r }))
  )
  const [current, setCurrent] = useState<string | null>(post.current_user_reaction?.id ?? null)
  const [reacting, setReacting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const liked = current === 'heart'
  const heartCount = reactions.find((r) => r.id === 'heart')?.count ?? 0

  // The picker mirrors the site's enabled reaction set — anything else is
  // rejected server-side. Emoji urls (custom packs) come from /emojis.json.
  const enabledReactions = useEnabledReactions()
  const { data: emojiGroups } = useEmojis()
  useEffect(() => primeReactionUrls(emojiGroups), [emojiGroups])

  // Pop animation only when the like *becomes* active — never on first render
  // (prevLiked starts at the mounted value) and cleared on unlike/rollback so a
  // re-like replays it.
  const [heartPop, setHeartPop] = useState(false)
  const prevLiked = useRef(liked)
  useEffect(() => {
    if (liked && !prevLiked.current) setHeartPop(true)
    else if (!liked) setHeartPop(false)
    prevLiked.current = liked
  }, [liked])

  // Chips present on first render must not play the enter animation; only ids
  // appearing later count as "new". Grow-only: a chip that leaves and comes
  // back (optimistic swap rolled back on failure) is not "new" either.
  const seenChipIds = useRef<Set<string>>(new Set((post.reactions ?? []).map((r) => r.id)))
  useEffect(() => {
    for (const r of reactions) seenChipIds.current.add(r.id)
  }, [reactions])

  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || pickerRef.current?.contains(t)) return
      setPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setPickerOpen(false)
      }
    }
    const close = (): void => setPickerOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
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
    if (!guard() || reacting) return
    setPickerOpen(false)
    setReacting(true)
    const prevReactions = reactions
    const prevCurrent = current
    const next = nextState(id)
    setReactions(next.reactions)
    setCurrent(next.current)
    try {
      await discourse.toggleReaction(post.id, id)
    } catch (e) {
      setReactions(prevReactions)
      setCurrent(prevCurrent)
      toast.error(errorMessage(e))
    } finally {
      setReacting(false)
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
      <button
        type="button"
        className={`${styles.heart} ${liked ? styles.liked : ''}`}
        onClick={() => void toggle('heart')}
        title="点赞"
        aria-label="点赞"
        aria-pressed={liked}
      >
        <span
          className={`${styles.heartIcon} ${heartPop ? styles.heartPop : ''}`}
          onAnimationEnd={() => setHeartPop(false)}
          aria-hidden="true"
        >
          <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
        </span>
        {heartCount > 0 && <span className={styles.count}>{compactNumber(heartCount)}</span>}
      </button>

      {/* heart lives in the persistent button above — keep it out of the chips */}
      {reactions
        .filter((r) => r.id !== 'heart')
        .map((r) => (
          <button
            key={r.id}
            type="button"
            className={`${styles.chip} ${current === r.id ? styles.active : ''} ${
              seenChipIds.current.has(r.id) ? '' : styles.chipIn
            }`}
            onClick={() => void toggle(r.id)}
            title={r.id}
            aria-label={`回应 ${r.id}`}
            aria-pressed={current === r.id}
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
        aria-expanded={pickerOpen}
        title="添加回应"
        aria-label="添加回应"
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
            role="group"
            aria-label="选择回应"
          >
            {enabledReactions.map((id) => (
              <button
                key={id}
                type="button"
                className={`${styles.pick} ${current === id ? styles.pickActive : ''}`}
                onClick={() => void toggle(id)}
                title={id}
                aria-label={id}
                aria-pressed={current === id}
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

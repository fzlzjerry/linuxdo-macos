import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { MapPin, User } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { useUserProfile } from '../../lib/discourse/queries'
import { absolutize } from '../../lib/discourse/urls'
import { relativeTime } from '../../lib/format'
import styles from './UserCard.module.css'

/** bio_excerpt is cooked HTML (emoji come as <img>) — sanitize it and fix
 *  relative asset urls instead of dumping the markup as text. */
export function renderBioHtml(excerpt: string): string {
  const doc = new DOMParser().parseFromString(DOMPurify.sanitize(excerpt), 'text/html')
  doc.body.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (src) img.setAttribute('src', absolutize(src))
    img.setAttribute('loading', 'lazy')
  })
  return doc.body.innerHTML
}

interface Props {
  username: string
  children: ReactNode
  className?: string
  ariaLabel: string
}

/** Click a wrapped avatar to preview a user's profile without leaving the page. */
export function UserCard({ username, children, className, ariaLabel }: Props): JSX.Element {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)

  function toggle(): void {
    if (open) {
      setOpen(false)
      return
    }
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const W = 300
      setAnchor({
        left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)),
        top: r.bottom + 6
      })
    }
    setOpen(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {children}
      </button>
      {open && anchor && (
        <CardPanel
          username={username}
          anchor={anchor}
          triggerRef={btnRef}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function CardPanel({
  username,
  anchor,
  triggerRef,
  onClose
}: {
  username: string
  anchor: { left: number; top: number }
  triggerRef: RefObject<HTMLElement>
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { data, isLoading } = useUserProfile(username)
  const user = data?.user

  useEffect(() => {
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
  }, [onClose, triggerRef])

  function goProfile(): void {
    onClose()
    navigate(`/u/${username}`)
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${username} 的资料`}
      className={styles.card}
      style={{ left: anchor.left, top: anchor.top }}
      data-tauri-drag-region="false"
    >
      {isLoading || !user ? (
        <div className={styles.loading}>加载中…</div>
      ) : (
        <>
          <div className={styles.head}>
            <Avatar
              template={user.avatar_template}
              username={user.username}
              name={user.name}
              size={52}
            />
            <div className={styles.identity}>
              <div className={styles.name}>{user.name || user.username}</div>
              <div className={styles.handle}>@{user.username}</div>
            </div>
          </div>

          {(user.title || user.primary_group_name) && (
            <div className={styles.pill}>{user.title || user.primary_group_name}</div>
          )}

          {user.bio_excerpt && (
            <p
              className={styles.bio}
              dangerouslySetInnerHTML={{ __html: renderBioHtml(user.bio_excerpt) }}
            />
          )}

          <div className={styles.meta}>
            {user.created_at && <span>加入于 {relativeTime(user.created_at)}</span>}
            {user.location && (
              <span className={styles.metaItem}>
                <MapPin size={12} />
                {user.location}
              </span>
            )}
          </div>

          <Button
            variant="secondary"
            size="sm"
            className={styles.fullBtn}
            icon={<User size={14} />}
            onClick={goProfile}
          >
            查看完整资料
          </Button>
        </>
      )}
    </div>,
    document.body
  )
}

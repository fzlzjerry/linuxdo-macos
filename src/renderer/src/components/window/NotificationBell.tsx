import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import { discourse } from '../../lib/discourse/client'
import { useAuth } from '../../store/auth'
import { relativeTime, absoluteTime } from '../../lib/format'
import {
  colorFor,
  describe,
  iconFor,
  markAllNotificationsRead,
  markNotificationRead,
  notificationRoute
} from '../../features/notifications/notificationMeta'
import type { NotificationItem } from '../../lib/discourse/types'
import styles from './NotificationBell.module.css'

const PANEL_WIDTH = 360
const MAX_ROWS = 12

/** Toolbar bell: unread badge always in sight, a click shows the latest
 *  notifications; the footer hands off to the full page for older ones. */
export function NotificationBell(): JSX.Element | null {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  const unread = (auth.unreadNotifications ?? 0) + (auth.unreadPersonalMessages ?? 0)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications-recent'],
    queryFn: () => discourse.notifications(true),
    enabled: open && auth.loggedIn,
    staleTime: 15_000
  })
  const items = (data?.notifications ?? []).slice(0, MAX_ROWS)

  function toggle(): void {
    if (open) {
      setOpen(false)
      return
    }
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    setAnchor({
      left: Math.max(8, Math.min(r.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8)),
      top: r.bottom + 6
    })
    setOpen(true)
    // Fresh look at the badge while the panel is up (poll is 45s otherwise).
    void useAuth.getState().refresh()
    void refetch()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    // Scrolling the page closes the panel; scrolling the panel's own list
    // must not (the capture listener sees both).
    const onScroll = (e: Event): void => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const close = (): void => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  if (!auth.loggedIn) return null

  function openItem(n: NotificationItem): void {
    setOpen(false)
    markNotificationRead(queryClient, n)
    const route = notificationRoute(n)
    if (route) navigate(route)
  }

  async function markAll(): Promise<void> {
    setMarkingAll(true)
    try {
      await markAllNotificationsRead(queryClient)
    } catch {
      /* badge resyncs on the next session poll */
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={styles.bell}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread > 0 ? `通知，${unread} 条未读` : '通知'}
        title="通知"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className={styles.badge} aria-hidden>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open &&
        anchor &&
        createPortal(
          <div
            ref={panelRef}
            className={styles.panel}
            style={{ left: anchor.left, top: anchor.top, width: PANEL_WIDTH }}
            role="dialog"
            aria-label="最近通知"
          >
            <div className={styles.head}>
              <span className={styles.headTitle}>通知</span>
              <button
                type="button"
                className={styles.headAction}
                onClick={() => void markAll()}
                disabled={markingAll || unread === 0}
                title="全部标为已读"
                aria-label="全部标为已读"
              >
                {markingAll ? <Loader2 size={14} className="spin" /> : <CheckCheck size={14} />}
              </button>
            </div>
            <div className={styles.list}>
              {isLoading ? (
                <div className={styles.hint}>
                  <Loader2 size={14} className="spin" /> 加载中…
                </div>
              ) : items.length === 0 ? (
                <div className={styles.hint}>没有新通知</div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`${styles.row} ${n.read ? '' : styles.rowUnread}`}
                    onClick={() => openItem(n)}
                  >
                    <span
                      className={styles.rowIcon}
                      style={{ '--nc': colorFor(n.notification_type) } as CSSProperties}
                      aria-hidden
                    >
                      {iconFor(n.notification_type, 14)}
                    </span>
                    <span className={styles.rowText}>{describe(n)}</span>
                    <span className={styles.rowTime} title={absoluteTime(n.created_at)}>
                      {relativeTime(n.created_at)}
                    </span>
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              className={styles.footer}
              onClick={() => {
                setOpen(false)
                navigate('/notifications')
              }}
            >
              查看全部通知
            </button>
          </div>,
          document.body
        )}
    </>
  )
}

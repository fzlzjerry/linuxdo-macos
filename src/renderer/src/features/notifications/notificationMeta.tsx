import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { AtSign, Award, Bell, Heart, Link2, Mail, Quote, Reply } from 'lucide-react'
import { discourse } from '../../lib/discourse/client'
import { useAuth } from '../../store/auth'
import type { NotificationItem, NotificationsResponse } from '../../lib/discourse/types'

/** Whether this notification type reflects a "like" (rendered with --like). */
export function isLike(type: number): boolean {
  return type === 5 || type === 24
}

/** Leading circular icon chosen by notification_type. */
export function iconFor(type: number, size = 17): JSX.Element {
  switch (type) {
    case 1: // mentioned
    case 15: // group_mentioned
      return <AtSign size={size} />
    case 2: // replied
    case 9: // posted
      return <Reply size={size} />
    case 3: // quoted
      return <Quote size={size} />
    case 5: // liked
    case 24: // liked_consolidated
      return <Heart size={size} />
    case 6: // private_message
      return <Mail size={size} />
    case 11: // linked
      return <Link2 size={size} />
    case 12: // granted_badge
      return <Award size={size} />
    case 17: // watching_first_post
      return <Bell size={size} />
    default:
      return <Bell size={size} />
  }
}

/** Chip color for a notification type — a CSS var expression, never a raw value. */
export function colorFor(type: number): string {
  switch (type) {
    case 5: // liked
    case 24: // liked_consolidated
      return 'var(--like)'
    case 1: // mentioned
    case 15: // group_mentioned
    case 2: // replied
    case 3: // quoted
    case 9: // posted
    case 11: // linked
      return 'var(--accent)'
    case 6: // private_message
      return 'var(--success)'
    case 12: // granted_badge
      return 'var(--warning)'
    case 17: // watching_first_post
    default:
      // --ink-2, not -3: the chip glyph must stay ≥3:1 even composited over
      // an unread row's accent-soft wash in dark theme.
      return 'var(--ink-2)'
  }
}

/** Build a concise Chinese sentence describing the notification from its data. */
export function describe(n: NotificationItem): string {
  const who = n.data.display_username || n.data.original_username || '有人'
  const title = n.data.topic_title || n.fancy_title || '你的帖子'
  switch (n.notification_type) {
    case 1: // mentioned
      return `${who} 提到了你`
    case 15: // group_mentioned
      return `${who} 在 @${n.data.group_name ?? '群组'} 中提到了你`
    case 2: // replied
      return `${who} 回复了「${title}」`
    case 9: // posted
    case 17: // watching_first_post
      return `「${title}」有新回复`
    case 3: // quoted
      return `${who} 引用了你`
    case 5: // liked
    case 24: // liked_consolidated
      return `${who} 赞了你的帖子`
    case 6: // private_message
      return `${who} 给你发了私信${n.data.topic_title ? `：${n.data.topic_title}` : ''}`
    case 11: // linked
      return `${who} 链接了你的帖子`
    case 12: // granted_badge
      return `获得徽章「${n.data.badge_name ?? ''}」`
    default:
      return title ? `「${title}」有新动态` : '你有一条新通知'
  }
}

/** In-app route the notification points at (anchored to its floor), or null. */
export function notificationRoute(n: NotificationItem): string | null {
  if (n.topic_id) {
    const anchor = n.post_number && n.post_number > 1 ? `?post=${n.post_number}` : ''
    return `/t/${n.topic_id}${anchor}`
  }
  if (n.notification_type === 12) return '/badges'
  return null
}

function patchLists(qc: QueryClient, patch: (n: NotificationItem) => NotificationItem): void {
  qc.setQueriesData<InfiniteData<NotificationsResponse>>(
    { queryKey: ['notifications'] },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((p) => ({ ...p, notifications: p.notifications.map(patch) }))
      }
  )
  qc.setQueriesData<NotificationsResponse>({ queryKey: ['notifications-recent'] }, (old) =>
    old ? { ...old, notifications: old.notifications.map(patch) } : old
  )
}

/** Mark one notification read: caches and the sidebar/bell badges update
 *  immediately, the server call rides behind (failures resync on next poll). */
export function markNotificationRead(qc: QueryClient, n: NotificationItem): void {
  if (n.read) return
  patchLists(qc, (item) => (item.id === n.id ? { ...item, read: true } : item))
  useAuth.getState().adjustUnread(n.notification_type === 6 ? 'pms' : 'notifications', -1)
  discourse.markNotificationsRead(n.id).catch(() => {
    /* the 45s session poll restores the true count */
  })
}

/** Mark everything read (server + caches + badges). Throws on failure. */
export async function markAllNotificationsRead(qc: QueryClient): Promise<void> {
  await discourse.markNotificationsRead()
  patchLists(qc, (item) => (item.read ? item : { ...item, read: true }))
  useAuth.getState().clearUnread()
  await qc.invalidateQueries({ queryKey: ['notifications'] })
}

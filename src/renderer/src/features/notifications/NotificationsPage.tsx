import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AtSign, Award, Bell, CheckCheck, Heart, Link2, Mail, Quote, Reply } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Button } from '../../components/ui/Button'
import { InfiniteSentinel } from '../../components/ui/InfiniteSentinel'
import { LoginGate } from '../../components/ui/LoginGate'
import { EmptyState, ErrorState, Spinner, TopicListSkeleton } from '../../components/ui/states'
import { useNotifications } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { relativeTime } from '../../lib/format'
import type { NotificationItem } from '../../lib/discourse/types'
import styles from './NotificationsPage.module.css'

/** Whether this notification type reflects a "like" (rendered with the --like accent). */
function isLike(type: number): boolean {
  return type === 5 || type === 24
}

/** Leading circular icon chosen by notification_type. */
function iconFor(type: number): JSX.Element {
  switch (type) {
    case 1: // mentioned
    case 15: // group_mentioned
      return <AtSign size={17} />
    case 2: // replied
    case 9: // posted
      return <Reply size={17} />
    case 3: // quoted
      return <Quote size={17} />
    case 5: // liked
    case 24: // liked_consolidated
      return <Heart size={17} />
    case 6: // private_message
      return <Mail size={17} />
    case 11: // linked
      return <Link2 size={17} />
    case 12: // granted_badge
      return <Award size={17} />
    case 17: // watching_first_post
      return <Bell size={17} />
    default:
      return <Bell size={17} />
  }
}

/** Build a concise Chinese sentence describing the notification from its data. */
function describe(n: NotificationItem): string {
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

function NotificationRow({
  item,
  onOpen
}: {
  item: NotificationItem
  onOpen: (n: NotificationItem) => void
}): JSX.Element {
  const text = describe(item)
  return (
    <button
      className={`${styles.row} ${item.read ? styles.read : styles.unread}`}
      onClick={() => onOpen(item)}
      aria-label={text}
    >
      <span className={`${styles.icon} ${isLike(item.notification_type) ? styles.iconLike : ''}`} aria-hidden>
        {iconFor(item.notification_type)}
      </span>
      <span className={styles.body}>
        <span className={styles.text}>{text}</span>
      </span>
      <span className={styles.time}>{relativeTime(item.created_at)}</span>
      <span className={styles.trailing} aria-hidden>
        {!item.read && <span className={styles.dot} />}
      </span>
    </button>
  )
}

export function NotificationsPage(): JSX.Element {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [markingAll, setMarkingAll] = useState(false)

  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNotifications()

  const notifications = useMemo(() => {
    const seen = new Set<number>()
    const out: NotificationItem[] = []
    for (const page of data?.pages ?? []) {
      for (const n of page.notifications) {
        if (!seen.has(n.id)) {
          seen.add(n.id)
          out.push(n)
        }
      }
    }
    return out
  }, [data])

  function open(n: NotificationItem): void {
    if (!n.read) {
      discourse
        .markNotificationsRead(n.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
        .catch(() => {})
    }
    if (n.topic_id) navigate(`/t/${n.topic_id}`)
  }

  async function markAll(): Promise<void> {
    setMarkingAll(true)
    try {
      await discourse.markNotificationsRead()
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('已全部标为已读')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setMarkingAll(false)
    }
  }

  if (!auth.loggedIn) {
    return (
      <PageScaffold toolbar={<Toolbar title="通知" />}>
        <LoginGate
          icon={<Bell size={26} strokeWidth={1.6} />}
          title="登录后查看通知"
          description="登录 linux.do 账号，随时接收提及、回复和私信提醒。"
        />
      </PageScaffold>
    )
  }

  const right = (
    <Button
      variant="secondary"
      size="sm"
      icon={<CheckCheck size={15} />}
      onClick={() => void markAll()}
      loading={markingAll}
      disabled={markingAll || notifications.length === 0}
    >
      全部已读
    </Button>
  )

  return (
    <PageScaffold ref={scrollRef} toolbar={<Toolbar title="通知" right={right} />}>
      {isLoading ? (
        <TopicListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell size={26} strokeWidth={1.6} />}
          title="没有通知"
          description="当有人提及、回复或赞了你，会显示在这里。"
        />
      ) : (
        <>
          {notifications.map((n) => (
            <NotificationRow key={n.id} item={n} onOpen={open} />
          ))}
          <InfiniteSentinel
            onReach={() => hasNextPage && !isFetchingNextPage && void fetchNextPage()}
            disabled={!hasNextPage}
            root={scrollRef}
          />
          {isFetchingNextPage && <Spinner label="加载更多…" />}
        </>
      )}
    </PageScaffold>
  )
}

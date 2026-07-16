import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, RefreshCw } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Button } from '../../components/ui/Button'
import { IconButton } from '../../components/ui/IconButton'
import { InfiniteSentinel } from '../../components/ui/InfiniteSentinel'
import { LoginGate } from '../../components/ui/LoginGate'
import { EmptyState, ErrorState, ListSkeleton, Spinner } from '../../components/ui/states'
import { useNotifications } from '../../lib/discourse/queries'
import { useAuth } from '../../store/auth'
import {
  colorFor,
  describe,
  iconFor,
  markAllNotificationsRead,
  markNotificationRead,
  notificationRoute
} from './notificationMeta'
import { toast } from '../../store/toast'
import { relativeTime, absoluteTime } from '../../lib/format'
import { useListNav } from '../../lib/useListNav'
import { useFocusMemory } from '../../lib/useFocusMemory'
import type { NotificationItem } from '../../lib/discourse/types'
import styles from './NotificationsPage.module.css'

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
      data-row
      data-row-id={item.id}
      onClick={() => onOpen(item)}
      aria-label={text}
    >
      <span
        className={styles.icon}
        style={{ '--nc': colorFor(item.notification_type) } as CSSProperties}
        aria-hidden
      >
        {iconFor(item.notification_type)}
      </span>
      <span className={styles.body}>
        <span className={styles.text}>{text}</span>
      </span>
      <span className={styles.time} title={absoluteTime(item.created_at)}>
        {relativeTime(item.created_at)}
      </span>
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

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useNotifications()

  useListNav(scrollRef)
  useFocusMemory(scrollRef, 'notifications', !isLoading && !!data)

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
    // Optimistic: row + sidebar/bell badges flip immediately, the PUT rides
    // behind — no more waiting for the 45s session poll to reach zero.
    markNotificationRead(queryClient, n)
    const route = notificationRoute(n)
    if (route) navigate(route)
  }

  async function markAll(): Promise<void> {
    setMarkingAll(true)
    try {
      await markAllNotificationsRead(queryClient)
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
    <>
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
      <IconButton label="刷新" onClick={() => void refetch()} disabled={isRefetching}>
        <RefreshCw size={16} className={isRefetching ? 'spin' : undefined} />
      </IconButton>
    </>
  )

  return (
    <PageScaffold ref={scrollRef} toolbar={<Toolbar title="通知" right={right} />}>
      {isLoading ? (
        <ListSkeleton leading="icon" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell size={26} strokeWidth={1.6} />}
          title="没有通知"
          description="当有人提及、回复或赞了你，会显示在这里。先去逛逛，参与讨论吧。"
          action={
            <Button variant="primary" size="sm" onClick={() => navigate('/latest')}>
              去逛最新
            </Button>
          }
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

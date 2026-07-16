import { useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { CalendarDays, RefreshCw } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { IconButton } from '../../components/ui/IconButton'
import { CategoryBadge } from '../../components/ui/CategoryBadge'
import { EmptyState, ErrorState, ListSkeleton } from '../../components/ui/states'
import { useEvents } from '../../lib/discourse/queries'
import { useFocusMemory } from '../../lib/useFocusMemory'
import { useListNav } from '../../lib/useListNav'
import { useAuth } from '../../store/auth'
import type { EventItem } from '../../lib/discourse/types'
import styles from './EventsPage.module.css'

function topicIdOf(e: EventItem): number | null {
  if (e.post?.topic?.id) return e.post.topic.id
  const m = e.post?.url?.match(/\/t\/(?:[^/]+\/)?(\d+)/)
  return m ? Number(m[1]) : null
}

function fmtRange(e: EventItem): string {
  const start = new Date(e.starts_at)
  const startStr = e.all_day ? format(start, 'M月d日') : format(start, 'M月d日 HH:mm')
  if (!e.ends_at) return startStr
  const end = new Date(e.ends_at)
  const sameDay = start.toDateString() === end.toDateString()
  const endStr = e.all_day || sameDay ? format(end, sameDay ? 'HH:mm' : 'M月d日') : format(end, 'M月d日 HH:mm')
  return e.all_day && sameDay ? startStr : `${startStr} — ${endStr}`
}

export function EventsPage(): JSX.Element {
  const navigate = useNavigate()
  const auth = useAuth()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { data, isLoading, isError, error, refetch, isRefetching } = useEvents()
  useListNav(scrollRef)
  useFocusMemory(scrollRef, 'events', !isLoading && !!data)

  const events = useMemo(() => {
    const list = [...(data?.events ?? [])]
    list.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    return list
  }, [data])

  const toolbar = (
    <Toolbar
      title="近期活动"
      right={
        <IconButton label="刷新" onClick={() => void refetch()} disabled={isRefetching}>
          <RefreshCw size={16} className={isRefetching ? 'spin' : undefined} />
        </IconButton>
      }
    />
  )

  return (
    <PageScaffold ref={scrollRef} toolbar={toolbar}>
      {isLoading ? (
        <ListSkeleton leading="date" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={26} strokeWidth={1.6} />}
          title="近期没有社区活动"
          description="社区发布的线上线下活动会出现在这里，稍后再来看看。"
        />
      ) : (
        <div className={styles.list}>
          {events.map((e) => {
            const tid = topicIdOf(e)
            const title = e.name?.trim() || e.post?.topic?.title || `活动 #${e.id}`
            return (
              <button
                key={e.id}
                type="button"
                className={styles.row}
                data-row={tid ? true : undefined}
                data-row-id={tid ? e.id : undefined}
                onClick={() => tid && navigate(`/t/${tid}`)}
                disabled={!tid}
                aria-label={title}
              >
                <span className={styles.date} aria-hidden>
                  <span className={styles.month}>{format(new Date(e.starts_at), 'M')}月</span>
                  <span className={styles.day}>{format(new Date(e.starts_at), 'd')}</span>
                </span>
                <span className={styles.main}>
                  <span className={styles.title}>{title}</span>
                  <span className={styles.meta}>
                    <CategoryBadge categoryId={e.category_id} />
                    <span className={styles.time}>{fmtRange(e)}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </PageScaffold>
  )
}

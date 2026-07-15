import { useMemo, useRef, useState } from 'react'
import { Newspaper, RefreshCw } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Segmented } from '../../components/ui/Segmented'
import { IconButton } from '../../components/ui/IconButton'
import { InfiniteSentinel } from '../../components/ui/InfiniteSentinel'
import { EmptyState, ErrorState, Spinner, TopicListSkeleton } from '../../components/ui/states'
import { useTopicList, mergeUsers } from '../../lib/discourse/queries'
import { useScrollMemory } from '../../lib/useScrollMemory'
import { useAuth } from '../../store/auth'
import type { ListingFilter, TopPeriod, TopicListItem } from '../../lib/discourse/types'
import { TopicRow } from './TopicRow'

const TITLES: Record<ListingFilter, string> = {
  latest: '最新',
  new: '新话题',
  unread: '未读',
  hot: '热门',
  top: '排行'
}

const PERIODS: { value: TopPeriod; label: string }[] = [
  { value: 'daily', label: '日' },
  { value: 'weekly', label: '周' },
  { value: 'monthly', label: '月' },
  { value: 'yearly', label: '年' },
  { value: 'all', label: '全部' }
]

export function TopicListPage({ filter }: { filter: ListingFilter }): JSX.Element {
  const [period, setPeriod] = useState<TopPeriod>('weekly')
  const scrollRef = useRef<HTMLDivElement>(null)
  const auth = useAuth()

  const query = useTopicList(filter, period)
  const { data, isLoading, isError, error, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } = query

  useScrollMemory(
    scrollRef,
    filter === 'top' ? `list:top:${period}` : `list:${filter}`,
    !isLoading && !!data
  )

  const users = useMemo(() => mergeUsers(data?.pages), [data])
  const topics = useMemo(() => {
    const seen = new Set<number>()
    const out: TopicListItem[] = []
    for (const page of data?.pages ?? []) {
      for (const t of page.topic_list.topics) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          out.push(t)
        }
      }
    }
    return out
  }, [data])

  const right = (
    <>
      {filter === 'top' && (
        <Segmented options={PERIODS} value={period} onChange={setPeriod} aria-label="时间范围" />
      )}
      <IconButton label="刷新" onClick={() => void refetch()} disabled={isRefetching}>
        <RefreshCw size={16} className={isRefetching ? 'spin' : undefined} />
      </IconButton>
    </>
  )

  return (
    <PageScaffold ref={scrollRef} toolbar={<Toolbar title={TITLES[filter]} right={right} />}>
      {isLoading ? (
        <TopicListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : topics.length === 0 ? (
        <EmptyState
          icon={<Newspaper size={26} strokeWidth={1.6} />}
          title="这里还没有话题"
          description={filter === 'unread' ? '你已读完所有关注的话题。' : '暂时没有可显示的内容。'}
        />
      ) : (
        <>
          {topics.map((t) => (
            <TopicRow key={t.id} topic={t} users={users} />
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

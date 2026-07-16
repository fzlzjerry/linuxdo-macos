import { useMemo, useRef, useState } from 'react'
import { CheckCheck, Newspaper, RefreshCw } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Segmented } from '../../components/ui/Segmented'
import { IconButton } from '../../components/ui/IconButton'
import { InfiniteSentinel } from '../../components/ui/InfiniteSentinel'
import { EmptyState, ErrorState, Spinner, TopicListSkeleton } from '../../components/ui/states'
import { useTopicList, mergeUsers } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { toast } from '../../store/toast'
import { errorMessage } from '../../lib/errors'
import { useScrollMemory } from '../../lib/useScrollMemory'
import { useFocusMemory } from '../../lib/useFocusMemory'
import { useListNav } from '../../lib/useListNav'
import { useAuth } from '../../store/auth'
import type { ListingFilter, TopPeriod, TopicListItem } from '../../lib/discourse/types'
import { TopicRow } from './TopicRow'
import { TopicFilters, type TopicFilterState } from './TopicFilters'

const TITLES: Record<ListingFilter, string> = {
  latest: '最新',
  new: '新话题',
  unread: '未读',
  hot: '热门',
  top: '排行',
  posted: '我的帖子',
  read: '已读'
}

/** Category/tag narrowing only applies to the discovery feeds; the personal
 *  feeds (my posts / read) have no category-scoped route on the site. */
const FILTERABLE: ReadonlySet<ListingFilter> = new Set<ListingFilter>([
  'latest',
  'new',
  'unread',
  'hot',
  'top'
])

const PERIODS: { value: TopPeriod; label: string }[] = [
  { value: 'daily', label: '日' },
  { value: 'weekly', label: '周' },
  { value: 'monthly', label: '月' },
  { value: 'yearly', label: '年' },
  { value: 'all', label: '全部' }
]

export function TopicListPage({ filter }: { filter: ListingFilter }): JSX.Element {
  const [period, setPeriod] = useState<TopPeriod>('weekly')
  const [filters, setFilters] = useState<TopicFilterState>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const auth = useAuth()

  const categoryParam = filters.category
    ? { slug: filters.category.slug, id: filters.category.id }
    : undefined
  const query = useTopicList(filter, period, categoryParam, filters.tag)
  const { data, isLoading, isError, error, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } = query

  const memoryKey = `list:${filter}:${filter === 'top' ? period : ''}:${filters.category?.id ?? ''}:${filters.tag ?? ''}`
  const memoryReady = !isLoading && !!data
  useScrollMemory(scrollRef, memoryKey, memoryReady)
  useFocusMemory(scrollRef, memoryKey, memoryReady)
  useListNav(scrollRef)

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

  const [dismissing, setDismissing] = useState(false)
  const canDismiss = (filter === 'new' || filter === 'unread') && auth.loggedIn && topics.length > 0

  async function dismiss(): Promise<void> {
    if (dismissing) return
    setDismissing(true)
    try {
      if (filter === 'new') await discourse.dismissNew()
      else await discourse.dismissUnread(topics.map((t) => t.id))
      toast.success(filter === 'new' ? '已消除新话题标记' : '已标为已读')
      await Promise.all([refetch(), auth.refresh()])
    } catch (e) {
      toast.error(errorMessage(e, '操作失败'))
    } finally {
      setDismissing(false)
    }
  }

  const right = (
    <>
      {filter === 'top' && (
        <Segmented options={PERIODS} value={period} onChange={setPeriod} aria-label="时间范围" />
      )}
      {canDismiss && (
        <IconButton
          label={filter === 'new' ? '消除新话题标记' : '全部标为已读'}
          onClick={() => void dismiss()}
          disabled={dismissing}
        >
          <CheckCheck size={16} className={dismissing ? 'spin' : undefined} />
        </IconButton>
      )}
      <IconButton label="刷新" onClick={() => void refetch()} disabled={isRefetching}>
        <RefreshCw size={16} className={isRefetching ? 'spin' : undefined} />
      </IconButton>
    </>
  )

  return (
    <PageScaffold
      ref={scrollRef}
      toolbar={
        <Toolbar
          title={TITLES[filter]}
          left={FILTERABLE.has(filter) ? <TopicFilters value={filters} onChange={setFilters} /> : undefined}
          right={right}
        />
      }
    >
      {isLoading ? (
        <TopicListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : topics.length === 0 ? (
        <EmptyState
          icon={<Newspaper size={26} strokeWidth={1.6} />}
          title="这里还没有话题"
          description={
            filter === 'unread'
              ? '你已读完所有关注的话题。'
              : filter === 'posted'
                ? '你还没有发过帖子。'
                : filter === 'read'
                  ? '你读过的话题会出现在这里。'
                  : '暂时没有可显示的内容。'
          }
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

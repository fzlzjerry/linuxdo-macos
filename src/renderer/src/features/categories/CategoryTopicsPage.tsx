import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LayoutGrid, RefreshCw } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Segmented } from '../../components/ui/Segmented'
import { Button } from '../../components/ui/Button'
import { IconButton } from '../../components/ui/IconButton'
import { InfiniteSentinel } from '../../components/ui/InfiniteSentinel'
import { EmptyState, ErrorState, Spinner, TopicListSkeleton } from '../../components/ui/states'
import { useCategoryTopics, mergeUsers } from '../../lib/discourse/queries'
import { useScrollMemory } from '../../lib/useScrollMemory'
import { useFocusMemory } from '../../lib/useFocusMemory'
import { useListNav } from '../../lib/useListNav'
import { useCategory } from '../../lib/discourse/CategoriesContext'
import { useAuth } from '../../store/auth'
import type { ListingFilter, TopicListItem } from '../../lib/discourse/types'
import { TopicRow } from '../topics/TopicRow'

const CATEGORY_FILTERS: { value: ListingFilter; label: string }[] = [
  { value: 'latest', label: '最新' },
  { value: 'new', label: '新' },
  { value: 'hot', label: '热门' },
  { value: 'top', label: '排行' }
]

export function CategoryTopicsPage(): JSX.Element {
  const { slug = '', id: idParam } = useParams()
  const id = Number(idParam)
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const auth = useAuth()
  const category = useCategory(id)
  const [filter, setFilter] = useState<ListingFilter>('latest')

  const { data, isLoading, isError, error, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCategoryTopics(slug, id, filter)

  useScrollMemory(scrollRef, `category:${id}:${filter}`, !isLoading && !!data)
  useFocusMemory(scrollRef, `category:${id}:${filter}`, !isLoading && !!data)
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

  return (
    <PageScaffold
      ref={scrollRef}
      toolbar={
        <Toolbar
          title={category?.name ?? '分类'}
          subtitle={category ? `${category.topic_count} 话题` : undefined}
          right={
            <>
              <Segmented
                options={CATEGORY_FILTERS}
                value={filter}
                onChange={setFilter}
                aria-label="排序"
              />
              <IconButton label="刷新" onClick={() => void refetch()} disabled={isRefetching}>
                <RefreshCw size={16} className={isRefetching ? 'spin' : undefined} />
              </IconButton>
            </>
          }
        />
      }
    >
      {isLoading ? (
        <TopicListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : topics.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid size={26} strokeWidth={1.6} />}
          title="该分类暂无话题"
          description="这里还没有内容，去别的分类逛逛吧。"
          action={
            <Button variant="secondary" onClick={() => navigate('/categories')}>
              查看全部分类
            </Button>
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

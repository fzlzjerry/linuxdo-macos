import { useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { LayoutGrid } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { InfiniteSentinel } from '../../components/ui/InfiniteSentinel'
import { EmptyState, ErrorState, Spinner, TopicListSkeleton } from '../../components/ui/states'
import { useCategoryTopics, mergeUsers } from '../../lib/discourse/queries'
import { useScrollMemory } from '../../lib/useScrollMemory'
import { useCategory } from '../../lib/discourse/CategoriesContext'
import { useAuth } from '../../store/auth'
import type { TopicListItem } from '../../lib/discourse/types'
import { TopicRow } from '../topics/TopicRow'

export function CategoryTopicsPage(): JSX.Element {
  const { slug = '', id: idParam } = useParams()
  const id = Number(idParam)
  const scrollRef = useRef<HTMLDivElement>(null)
  const auth = useAuth()
  const category = useCategory(id)

  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCategoryTopics(slug, id)

  useScrollMemory(scrollRef, `category:${id}`, !isLoading && !!data)

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
      toolbar={<Toolbar title={category?.name ?? '分类'} subtitle={category ? `${category.topic_count} 话题` : undefined} />}
    >
      {isLoading ? (
        <TopicListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : topics.length === 0 ? (
        <EmptyState icon={<LayoutGrid size={26} strokeWidth={1.6} />} title="该分类暂无话题" />
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

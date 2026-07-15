import { useNavigate } from 'react-router-dom'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { ErrorState, TopicListSkeleton } from '../../components/ui/states'
import { useCategories } from '../../lib/discourse/queries'
import { useAuth } from '../../store/auth'
import { compactNumber } from '../../lib/format'
import type { Category } from '../../lib/discourse/types'
import styles from './CategoriesPage.module.css'

export function CategoriesPage(): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useCategories()
  const navigate = useNavigate()
  const auth = useAuth()
  const categories = (data?.category_list.categories ?? []).filter((c) => !c.parent_category_id)

  return (
    <PageScaffold toolbar={<Toolbar title="分类" />}>
      {isLoading ? (
        <TopicListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : (
        <div className={styles.grid}>
          {categories.map((c) => (
            <CategoryCard key={c.id} category={c} onOpen={() => navigate(`/c/${c.slug}/${c.id}`)} />
          ))}
        </div>
      )}
    </PageScaffold>
  )
}

function CategoryCard({
  category,
  onOpen
}: {
  category: Category
  onOpen: () => void
}): JSX.Element {
  return (
    <button className={styles.card} onClick={onOpen}>
      <span className={styles.swatch} style={{ background: `#${category.color}` }} aria-hidden>
        {Array.from(category.name)[0]}
      </span>
      <span className={styles.name}>{category.name}</span>
      {category.description_excerpt && (
        <span className={styles.desc}>{category.description_excerpt}</span>
      )}
      <span className={styles.count}>{compactNumber(category.topic_count)} 话题</span>
    </button>
  )
}

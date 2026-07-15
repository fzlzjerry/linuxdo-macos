import { useNavigate } from 'react-router-dom'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { ErrorState, TopicListSkeleton } from '../../components/ui/states'
import { useCategories } from '../../lib/discourse/queries'
import { useAuth } from '../../store/auth'
import { compactNumber } from '../../lib/format'
import type { Category } from '../../lib/discourse/types'
import { CategoryIcon } from './CategoryIcon'
import styles from './CategoriesPage.module.css'

export function CategoriesPage(): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useCategories()
  const navigate = useNavigate()
  const auth = useAuth()
  const categories = (data?.category_list.categories ?? []).filter((c) => !c.parent_category_id)

  const open = (c: Category): void => navigate(`/c/${c.slug}/${c.id}`)

  return (
    <PageScaffold toolbar={<Toolbar title="分类" />}>
      {isLoading ? (
        <TopicListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : (
        <div className={styles.grid}>
          {categories.map((c) => (
            <CategoryCard key={c.id} category={c} onOpen={open} />
          ))}
        </div>
      )}
    </PageScaffold>
  )
}

/** linux.do prefixes subcategory names with the parent ("开发调优, Lv1");
 *  show only the distinct tail ("Lv1"). */
function subLabel(sub: Category, parent: Category): string {
  const prefix = `${parent.name}, `
  return sub.name.startsWith(prefix) ? sub.name.slice(prefix.length) : sub.name
}

function CategoryCard({
  category,
  onOpen
}: {
  category: Category
  onOpen: (c: Category) => void
}): JSX.Element {
  const subs = category.subcategory_list ?? []
  return (
    <div className={styles.card}>
      <button className={styles.main} onClick={() => onOpen(category)}>
        <CategoryIcon category={category} />
        <span className={styles.name}>{category.name}</span>
        {category.description_excerpt && (
          <span className={styles.desc}>{category.description_excerpt}</span>
        )}
        <span className={styles.count}>{compactNumber(category.topic_count)} 话题</span>
      </button>

      {subs.length > 0 && (
        <div className={styles.subs}>
          {subs.map((s) => (
            <button
              key={s.id}
              className={styles.subChip}
              onClick={() => onOpen(s)}
              title={`${subLabel(s, category)} · ${compactNumber(s.topic_count)} 话题`}
            >
              <span className={styles.subDot} style={{ background: `#${s.color}` }} aria-hidden />
              {subLabel(s, category)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import { useCategory } from '../../lib/discourse/CategoriesContext'
import styles from './CategoryBadge.module.css'

interface Props {
  categoryId?: number
  size?: 'sm' | 'md'
}

export function CategoryBadge({ categoryId, size = 'sm' }: Props): JSX.Element | null {
  const category = useCategory(categoryId)
  if (!category) return null
  return (
    <span className={`${styles.badge} ${styles[size]}`}>
      <span className={styles.dot} style={{ background: `#${category.color}` }} aria-hidden />
      {category.name}
    </span>
  )
}

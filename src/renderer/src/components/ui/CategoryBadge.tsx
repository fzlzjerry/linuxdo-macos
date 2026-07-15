import { useCategory } from '../../lib/discourse/CategoriesContext'
import { useSpriteReady } from '../../lib/svgSprite'
import { SpriteIcon } from './SpriteIcon'
import styles from './CategoryBadge.module.css'

interface Props {
  categoryId?: number
  size?: 'sm' | 'md'
}

export function CategoryBadge({ categoryId, size = 'sm' }: Props): JSX.Element | null {
  const category = useCategory(categoryId)
  const spriteReady = useSpriteReady()
  if (!category) return null
  const useIcon = spriteReady && category.style_type === 'icon' && !!category.icon
  return (
    <span className={`${styles.badge} ${styles[size]}`}>
      {useIcon ? (
        <SpriteIcon
          name={category.icon}
          size={size === 'md' ? 14 : 12}
          color={`#${category.color}`}
        />
      ) : (
        <span className={styles.dot} style={{ background: `#${category.color}` }} aria-hidden />
      )}
      {category.name}
    </span>
  )
}

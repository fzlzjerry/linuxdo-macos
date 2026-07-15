import type { ReactNode } from 'react'
import styles from './Tag.module.css'

/** The one pill: topic tags, draft badges, search-result tags. */
export function Tag({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <span className={`${styles.tag} ${className ?? ''}`}>{children}</span>
}

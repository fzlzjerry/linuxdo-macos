import type { ReactNode } from 'react'
import styles from './Toolbar.module.css'

interface ToolbarProps {
  title: ReactNode
  subtitle?: ReactNode
  left?: ReactNode
  right?: ReactNode
}

export function Toolbar({ title, subtitle, left, right }: ToolbarProps): JSX.Element {
  return (
    <header className={`${styles.toolbar} drag`}>
      {left && <div className={`${styles.left} no-drag`}>{left}</div>}
      <div className={styles.titleWrap}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
      {right && <div className={`${styles.right} no-drag`}>{right}</div>}
    </header>
  )
}

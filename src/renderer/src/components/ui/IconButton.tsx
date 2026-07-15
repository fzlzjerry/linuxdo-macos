import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './IconButton.module.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  active?: boolean
}

export function IconButton({ label, children, active, className, ...rest }: Props): JSX.Element {
  return (
    <button
      className={`${styles.btn} ${active ? styles.active : ''} ${className ?? ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  )
}

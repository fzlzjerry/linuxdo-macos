import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...rest
}: Props): JSX.Element {
  return (
    <button
      className={`${styles.btn} ${styles[variant]} ${styles[size]} ${className ?? ''}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="spin" /> : icon}
      {children && <span>{children}</span>}
    </button>
  )
}

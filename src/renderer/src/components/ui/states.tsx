import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, Loader2, LogIn } from 'lucide-react'
import { DiscourseApiError } from '../../lib/discourse/client'
import { Button } from './Button'
import styles from './states.module.css'

export function Skeleton({
  width,
  height = 12,
  radius = 6,
  className
}: {
  width?: number | string
  height?: number | string
  radius?: number
  className?: string
}): JSX.Element {
  return (
    <span
      className={`${styles.skeleton} ${className ?? ''}`}
      style={{ width, height, borderRadius: radius }}
    />
  )
}

export function TopicListSkeleton({ rows = 8 }: { rows?: number }): JSX.Element {
  return (
    <div className={styles.skeletonList} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.skeletonRow}>
          <Skeleton width={40} height={40} radius={999} />
          <div className={styles.skeletonLines}>
            <Skeleton width={`${55 + ((i * 7) % 35)}%`} height={14} />
            <Skeleton width={`${30 + ((i * 11) % 25)}%`} height={11} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CardGridSkeleton({ cards = 8 }: { cards?: number }): JSX.Element {
  return (
    <div className={styles.skeletonGrid} aria-hidden>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className={styles.skeletonCard}>
          <Skeleton width={`${45 + ((i * 9) % 30)}%`} height={15} />
          <Skeleton width="90%" height={11} />
          <Skeleton width={`${55 + ((i * 13) % 30)}%`} height={11} />
          <Skeleton width={64} height={11} />
        </div>
      ))}
    </div>
  )
}

export function Spinner({ label }: { label?: string }): JSX.Element {
  return (
    <div className={styles.spinner}>
      <Loader2 size={18} className={styles.spin} />
      {label && <span>{label}</span>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}): JSX.Element {
  return (
    <div className={styles.center}>
      <div className={styles.iconWrap}>{icon ?? <Inbox size={26} strokeWidth={1.6} />}</div>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.desc}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  onLogin
}: {
  error: unknown
  onRetry?: () => void
  onLogin?: () => void
}): JSX.Element {
  const needsAuth = error instanceof DiscourseApiError && error.needsAuth
  const message = error instanceof Error ? error.message : '发生未知错误'
  return (
    <div className={styles.center}>
      <div className={`${styles.iconWrap} ${needsAuth ? '' : styles.danger}`}>
        {needsAuth ? <LogIn size={26} strokeWidth={1.6} /> : <AlertTriangle size={26} strokeWidth={1.6} />}
      </div>
      <h3 className={styles.title}>{needsAuth ? '需要登录' : '加载失败'}</h3>
      <p className={styles.desc}>{needsAuth ? '登录 linux.do 后即可查看此内容。' : message}</p>
      <div className={styles.action}>
        {needsAuth && onLogin && (
          <Button variant="primary" onClick={onLogin}>
            登录 linux.do
          </Button>
        )}
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            重试
          </Button>
        )}
      </div>
    </div>
  )
}

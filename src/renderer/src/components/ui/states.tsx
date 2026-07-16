import type { ReactNode } from 'react'
import { AlertTriangle, Hourglass, Inbox, Loader2, LogIn, WifiOff } from 'lucide-react'
import { DiscourseApiError } from '../../lib/discourse/client'
import { errorMessage } from '../../lib/errors'
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

/** Generic list skeleton matching the listRow shell density (padding uses
 *  --list-pad-y). Leading shape mirrors the real row's leading element:
 *  avatar (40 circle) / icon (28 circle) / rank (24 rounded square) /
 *  date (44 rounded square) / none. Widths are index-derived so rows look
 *  varied yet render deterministically. */
export function ListSkeleton({
  rows = 8,
  leading = 'avatar',
  lines = 2,
  trailing = false
}: {
  rows?: number
  leading?: 'avatar' | 'icon' | 'rank' | 'date' | 'none'
  lines?: 1 | 2
  trailing?: boolean
}): JSX.Element {
  return (
    <div className={styles.skeletonList} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.listSkeletonRow}>
          {leading === 'avatar' && <Skeleton width={40} height={40} radius={999} />}
          {leading === 'icon' && <Skeleton width={28} height={28} radius={999} />}
          {leading === 'rank' && <Skeleton width={24} height={24} radius={6} />}
          {leading === 'date' && <Skeleton width={44} height={44} radius={10} />}
          <div className={styles.skeletonLines}>
            <Skeleton width={`${55 + ((i * 7) % 35)}%`} height={14} />
            {lines === 2 && <Skeleton width={`${55 + ((i * 13) % 31)}%`} height={11} />}
          </div>
          {trailing && <Skeleton width={48} height={11} />}
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

/** Load-failure state, classified by error kind: auth → login CTA, offline →
 *  network copy, 429 → rate-limit copy, else generic with the server message.
 *  Props API is intentionally stable — classification is internal. */
export function ErrorState({
  error,
  onRetry,
  onLogin
}: {
  error: unknown
  onRetry?: () => void
  onLogin?: () => void
}): JSX.Element {
  const apiError = error instanceof DiscourseApiError ? error : null
  const needsAuth =
    apiError !== null && (apiError.needsAuth || apiError.status === 401 || apiError.status === 403)
  const offline =
    !needsAuth &&
    (apiError?.status === 0 || (typeof navigator !== 'undefined' && !navigator.onLine))
  const rateLimited = !needsAuth && !offline && apiError?.status === 429

  let icon: ReactNode
  let title: string
  let desc: string
  let iconClass = styles.iconWrap
  if (needsAuth) {
    icon = <LogIn size={26} strokeWidth={1.6} />
    title = '需要登录'
    desc = '登录 linux.do 后即可查看此内容。'
  } else if (offline) {
    icon = <WifiOff size={26} strokeWidth={1.6} />
    title = '网络连接失败'
    desc = '请检查网络连接后重试'
    iconClass = `${styles.iconWrap} ${styles.muted}`
  } else if (rateLimited) {
    icon = <Hourglass size={26} strokeWidth={1.6} />
    title = '操作太频繁'
    desc = 'linux.do 限流中，请稍等片刻再试'
    iconClass = `${styles.iconWrap} ${styles.muted}`
  } else {
    icon = <AlertTriangle size={26} strokeWidth={1.6} />
    title = '加载失败'
    desc = errorMessage(error, '发生未知错误')
    iconClass = `${styles.iconWrap} ${styles.danger}`
  }

  return (
    <div className={styles.center}>
      <div className={iconClass}>{icon}</div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.desc}>{desc}</p>
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

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, RefreshCw } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Segmented } from '../../components/ui/Segmented'
import { IconButton } from '../../components/ui/IconButton'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState, ErrorState, TopicListSkeleton } from '../../components/ui/states'
import { useLeaderboard } from '../../lib/discourse/queries'
import { useAuth } from '../../store/auth'
import { compactNumber } from '../../lib/format'
import type { LeaderboardUser } from '../../lib/discourse/types'
import styles from './LeaderboardPage.module.css'

const PERIODS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'yearly', label: '年' },
  { value: 'monthly', label: '月' },
  { value: 'weekly', label: '周' },
  { value: 'daily', label: '日' }
]

const DEFAULT_LEADERBOARD_ID = 1

export function LeaderboardPage(): JSX.Element {
  const [period, setPeriod] = useState('all')
  const navigate = useNavigate()
  const auth = useAuth()
  const { data, isLoading, isError, error, refetch, isRefetching } = useLeaderboard(
    DEFAULT_LEADERBOARD_ID,
    period === 'all' ? undefined : period
  )

  const users = data?.users ?? []
  const personal = data?.personal
  const filterDisabled = data?.leaderboard?.period_filter_disabled

  const toolbar = (
    <Toolbar
      title={data?.leaderboard?.name ?? '积分排行榜'}
      right={
        <>
          {!filterDisabled && (
            <Segmented options={PERIODS} value={period} onChange={setPeriod} aria-label="时间范围" />
          )}
          <IconButton label="刷新" onClick={() => void refetch()} disabled={isRefetching}>
            <RefreshCw size={16} className={isRefetching ? 'spin' : undefined} />
          </IconButton>
        </>
      }
    />
  )

  return (
    <PageScaffold toolbar={toolbar}>
      {isLoading ? (
        <TopicListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : users.length === 0 ? (
        <EmptyState icon={<Trophy size={26} strokeWidth={1.6} />} title="暂无排行数据" />
      ) : (
        <div className={styles.list}>
          {personal?.user && personal.position != null && (
            <Row
              user={{ ...personal.user, position: personal.position }}
              onClick={() => navigate(`/u/${personal.user?.username}`)}
              highlight
            />
          )}
          {users.map((u) => (
            <Row key={u.id} user={u} onClick={() => navigate(`/u/${u.username}`)} />
          ))}
        </div>
      )}
    </PageScaffold>
  )
}

function Row({
  user,
  onClick,
  highlight
}: {
  user: LeaderboardUser
  onClick: () => void
  highlight?: boolean
}): JSX.Element {
  const rankClass =
    user.position === 1
      ? styles.gold
      : user.position === 2
        ? styles.silver
        : user.position === 3
          ? styles.bronze
          : ''
  return (
    <button
      type="button"
      className={`${styles.row} ${highlight ? styles.highlight : ''}`}
      onClick={onClick}
      aria-label={`第 ${user.position} 名 ${user.name || user.username}`}
    >
      <span className={`${styles.rank} ${rankClass}`}>{user.position}</span>
      <Avatar template={user.avatar_template} username={user.username} name={user.name} size={34} />
      <span className={styles.meta}>
        <span className={styles.name}>{user.name || user.username}</span>
        <span className={styles.handle}>@{user.username}</span>
      </span>
      {highlight && <span className={styles.youTag}>我</span>}
      <span className={styles.score}>{compactNumber(user.total_score)}</span>
    </button>
  )
}

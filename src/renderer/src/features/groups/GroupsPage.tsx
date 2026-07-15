import { Users } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { EmptyState, ErrorState, CardGridSkeleton } from '../../components/ui/states'
import { useGroups } from '../../lib/discourse/queries'
import { useAuth } from '../../store/auth'
import { absolutize, LINUXDO_ORIGIN } from '../../lib/discourse/urls'
import { compactNumber } from '../../lib/format'
import type { GroupItem } from '../../lib/discourse/types'
import styles from './GroupsPage.module.css'

function isImageFlair(u: string | null | undefined): boolean {
  return !!u && (/^(https?:)?\/\//i.test(u) || u.startsWith('/'))
}

export function GroupsPage(): JSX.Element {
  const auth = useAuth()
  const { data, isLoading, isError, error, refetch } = useGroups()
  const groups = data?.groups ?? []

  function open(g: GroupItem): void {
    void window.api?.openExternal(`${LINUXDO_ORIGIN}/g/${encodeURIComponent(g.name)}`)
  }

  return (
    <PageScaffold toolbar={<Toolbar title="群组" />}>
      {isLoading ? (
        <CardGridSkeleton cards={6} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<Users size={26} strokeWidth={1.6} />} title="暂无群组" />
      ) : (
        <div className={styles.grid}>
          {groups.map((g) => (
            <button key={g.id} type="button" className={styles.card} onClick={() => open(g)}>
              <span
                className={styles.flair}
                style={g.flair_bg_color ? { background: `#${g.flair_bg_color}` } : undefined}
              >
                {isImageFlair(g.flair_url) ? (
                  <img className={styles.flairImg} src={absolutize(g.flair_url as string)} alt="" />
                ) : (
                  <Users size={18} />
                )}
              </span>
              <span className={styles.body}>
                <span className={styles.name}>{g.full_name?.trim() || g.name}</span>
                <span className={styles.sub}>
                  <span className={styles.handle}>@{g.name}</span>
                  {g.user_count != null && (
                    <span className={styles.count}>{compactNumber(g.user_count)} 名成员</span>
                  )}
                </span>
                {g.bio_excerpt && <span className={styles.bio}>{g.bio_excerpt}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </PageScaffold>
  )
}

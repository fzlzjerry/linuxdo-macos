import { useMemo } from 'react'
import { Award, Check } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { SpriteIcon } from '../../components/ui/SpriteIcon'
import { EmptyState, ErrorState, CardGridSkeleton } from '../../components/ui/states'
import { useBadges, useUserBadgeIds } from '../../lib/discourse/queries'
import { useAuth } from '../../store/auth'
import { absolutize, LINUXDO_ORIGIN } from '../../lib/discourse/urls'
import { compactNumber } from '../../lib/format'
import type { Badge } from '../../lib/discourse/types'
import styles from './BadgesPage.module.css'

export function BadgesPage(): JSX.Element {
  const auth = useAuth()
  const { data, isLoading, isError, error, refetch } = useBadges()
  const { data: earned } = useUserBadgeIds(auth.loggedIn ? auth.username : undefined)

  const grouped = useMemo(() => {
    const types = data?.badge_types ?? []
    const byType = new Map<number, Badge[]>()
    for (const b of data?.badges ?? []) {
      const key = b.badge_type_id ?? 0
      if (!byType.has(key)) byType.set(key, [])
      byType.get(key)!.push(b)
    }
    return types
      .map((t) => ({ type: t, badges: byType.get(t.id) ?? [] }))
      .filter((g) => g.badges.length > 0)
  }, [data])

  function open(b: Badge): void {
    void window.api?.openExternal(`${LINUXDO_ORIGIN}/badges/${b.id}/${b.slug ?? ''}`)
  }

  return (
    <PageScaffold toolbar={<Toolbar title="徽章" />}>
      {isLoading ? (
        <CardGridSkeleton cards={9} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : grouped.length === 0 ? (
        <EmptyState icon={<Award size={26} strokeWidth={1.6} />} title="暂无徽章" />
      ) : (
        <div className={styles.container}>
          {grouped.map(({ type, badges }) => (
            <section key={type.id} className={styles.section}>
              <h3 className={styles.sectionTitle}>{type.name}</h3>
              <div className={styles.grid}>
                {badges.map((b) => {
                  const has = earned?.has(b.id)
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className={`${styles.card} ${has ? styles.earned : ''}`}
                      onClick={() => open(b)}
                    >
                      <span className={styles.icon}>
                        {b.image_url ? (
                          <img className={styles.iconImg} src={absolutize(b.image_url)} alt="" />
                        ) : (
                          <SpriteIcon name={(b.icon ?? '').replace(/^fa[rbsl]?-/, '')} size={20} />
                        )}
                      </span>
                      <span className={styles.body}>
                        <span className={styles.name}>{b.name}</span>
                        {b.grant_count != null && (
                          <span className={styles.count}>{compactNumber(b.grant_count)} 人获得</span>
                        )}
                      </span>
                      {has && (
                        <span className={styles.earnedBadge} title="已获得">
                          <Check size={13} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageScaffold>
  )
}

import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Award, ExternalLink, Heart, MapPin, MessageSquare, Reply, User } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Avatar } from '../../components/ui/Avatar'
import { CategoryBadge } from '../../components/ui/CategoryBadge'
import { EmptyState, ErrorState, TopicListSkeleton } from '../../components/ui/states'
import { CookedContent } from '../topics/CookedContent'
import { useUserProfile, useUserSummary } from '../../lib/discourse/queries'
import { useAuth } from '../../store/auth'
import { relativeTime, compactNumber } from '../../lib/format'
import { absolutize } from '../../lib/discourse/urls'
import styles from './ProfilePage.module.css'

export function ProfilePage(): JSX.Element {
  const { username = '' } = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const profileQuery = useUserProfile(username)
  const summaryQuery = useUserSummary(username)

  const user = profileQuery.data?.user
  const summary = summaryQuery.data?.user_summary
  const badges = summaryQuery.data?.badges
  const topics = summaryQuery.data?.topics

  // summary.replies only reference topic_id — titles come from the topics list.
  const topicById = useMemo(
    () => new Map((summaryQuery.data?.topics ?? []).map((t) => [t.id, t])),
    [summaryQuery.data]
  )
  const ownTopics = useMemo(() => {
    // The topics array mixes the user's own topics with ones referenced by
    // replies; own topics are the ones the summary's topic_count refers to —
    // keep list order (Discourse returns own topics first) and cap at 8.
    return (topics ?? []).slice(0, 8)
  }, [topics])
  const replies = (summary?.replies ?? []).slice(0, 8)

  const displayName = user?.name || user?.username || username

  const stats: { label: string; display: string }[] = []
  const push = (label: string, v: number | undefined): void => {
    if (v != null) stats.push({ label, display: compactNumber(v) })
  }
  push('收到的赞', summary?.likes_received)
  push('送出的赞', summary?.likes_given)
  push('话题', summary?.topic_count)
  push('帖子', summary?.post_count)
  if (summary?.solved_count) push('解决方案', summary.solved_count)
  push('访问天数', summary?.days_visited)
  push('已读帖子', summary?.posts_read_count)
  if (summary?.time_read) {
    stats.push({
      label: '阅读时长',
      display: `${compactNumber(Math.max(1, Math.round(summary.time_read / 3600)))} 小时`
    })
  }

  const toolbar = (
    <Toolbar title={displayName || '用户'} subtitle={username ? `@${username}` : undefined} />
  )

  return (
    <PageScaffold toolbar={toolbar}>
      {profileQuery.isLoading ? (
        <TopicListSkeleton />
      ) : profileQuery.isError ? (
        <ErrorState
          error={profileQuery.error}
          onRetry={() => void profileQuery.refetch()}
          onLogin={() => void auth.showLogin()}
        />
      ) : !user ? (
        <EmptyState
          icon={<User size={26} strokeWidth={1.6} />}
          title="未找到该用户"
          description="该用户可能不存在或无法访问。"
        />
      ) : (
        <div className={styles.container}>
          <header className={styles.headerCard}>
            <div className={styles.headerTop}>
              <Avatar
                template={user.avatar_template}
                username={user.username}
                name={user.name}
                size={80}
                className={styles.avatar}
              />
              <div className={styles.identity}>
                <div className={styles.nameLine}>
                  <h2 className={styles.name}>{user.name || user.username}</h2>
                  {(user.title || user.primary_group_name) && (
                    <span className={styles.pill}>{user.title || user.primary_group_name}</span>
                  )}
                </div>
                <div className={styles.handle}>@{user.username}</div>
                <div className={styles.metaRow}>
                  {user.created_at && (
                    <span className={styles.metaItem}>加入于 {relativeTime(user.created_at)}</span>
                  )}
                  {user.last_seen_at && (
                    <span className={styles.metaItem}>最后活跃 {relativeTime(user.last_seen_at)}</span>
                  )}
                  {user.location && (
                    <span className={styles.metaItem}>
                      <MapPin size={13} />
                      {user.location}
                    </span>
                  )}
                  {user.website && (
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => {
                        if (user.website) void window.api?.openExternal(user.website)
                      }}
                    >
                      <ExternalLink size={13} />
                      {user.website_name || user.website}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {user.bio_cooked ? (
              <div className={styles.bio}>
                <CookedContent html={user.bio_cooked} />
              </div>
            ) : user.bio_excerpt ? (
              <p className={styles.bioExcerpt}>{user.bio_excerpt}</p>
            ) : null}
          </header>

          {stats.length > 0 && (
            <div className={styles.statStrip}>
              {stats.map((s) => (
                <div key={s.label} className={styles.stat}>
                  <span className={styles.statValue}>{s.display}</span>
                  <span className={styles.statLabel}>{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {badges && badges.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>徽章</h3>
              <div className={styles.badges}>
                {badges.map((b) => (
                  <span key={b.id} className={styles.badge} title={b.description}>
                    {b.image_url ? (
                      <img className={styles.badgeImg} src={absolutize(b.image_url)} alt="" />
                    ) : (
                      <Award size={14} className={styles.badgeIcon} />
                    )}
                    {b.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {ownTopics.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>最近话题</h3>
              <div className={styles.topics}>
                {ownTopics.map((t) => (
                  <button
                    key={t.id}
                    className={styles.topicRow}
                    onClick={() => navigate(`/t/${t.id}`)}
                    aria-label={t.title}
                  >
                    <span className={styles.topicMain}>
                      <span className={styles.topicTitle}>{t.title}</span>
                      <span className={styles.topicSub}>
                        <CategoryBadge categoryId={t.category_id} />
                        {t.posts_count != null && (
                          <span className={styles.subStat}>
                            <MessageSquare size={12} />
                            {compactNumber(Math.max(0, t.posts_count - 1))}
                          </span>
                        )}
                        {!!t.like_count && (
                          <span className={styles.subStat}>
                            <Heart size={12} />
                            {compactNumber(t.like_count)}
                          </span>
                        )}
                        {t.created_at && (
                          <span className={styles.topicTime}>{relativeTime(t.created_at)}</span>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {replies.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>最近回复</h3>
              <div className={styles.topics}>
                {replies.map((r) => {
                  const topic = topicById.get(r.topic_id)
                  return (
                    <button
                      key={`${r.topic_id}-${r.post_number ?? 0}`}
                      className={styles.topicRow}
                      onClick={() => navigate(`/t/${r.topic_id}`)}
                      aria-label={topic?.title ?? `话题 ${r.topic_id}`}
                    >
                      <span className={styles.topicMain}>
                        <span className={styles.topicTitle}>
                          <Reply size={13} className={styles.replyIcon} />
                          {topic?.title ?? `话题 #${r.topic_id}`}
                        </span>
                        <span className={styles.topicSub}>
                          {r.post_number != null && (
                            <span className={styles.subStat}>#{r.post_number} 楼</span>
                          )}
                          {!!r.like_count && (
                            <span className={styles.subStat}>
                              <Heart size={12} />
                              {compactNumber(r.like_count)}
                            </span>
                          )}
                          {r.created_at && (
                            <span className={styles.topicTime}>{relativeTime(r.created_at)}</span>
                          )}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </PageScaffold>
  )
}

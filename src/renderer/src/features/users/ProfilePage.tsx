import { useNavigate, useParams } from 'react-router-dom'
import { Award, ExternalLink, MapPin, MessageSquare, User } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Avatar } from '../../components/ui/Avatar'
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

  const displayName = user?.name || user?.username || username

  const toolbar = (
    <Toolbar
      title={displayName || '用户'}
      subtitle={username ? `@${username}` : undefined}
    />
  )

  const stats = [
    { label: '收到的赞', value: summary?.likes_received },
    { label: '送出的赞', value: summary?.likes_given },
    { label: '话题', value: summary?.topic_count },
    { label: '帖子', value: summary?.post_count },
    { label: '访问天数', value: summary?.days_visited },
    { label: '已读帖', value: summary?.posts_read_count }
  ].filter((s): s is { label: string; value: number } => s.value !== undefined)

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
          </header>

          {user.bio_cooked ? (
            <div className={styles.bio}>
              <CookedContent html={user.bio_cooked} />
            </div>
          ) : user.bio_excerpt ? (
            <p className={styles.bioExcerpt}>{user.bio_excerpt}</p>
          ) : null}

          {stats.length > 0 && (
            <div className={styles.statGrid}>
              {stats.map((s) => (
                <div key={s.label} className={styles.statTile}>
                  <span className={styles.statValue}>{compactNumber(s.value)}</span>
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

          {topics && topics.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>最近话题</h3>
              <div className={styles.topics}>
                {topics.slice(0, 8).map((t) => (
                  <button
                    key={t.id}
                    className={styles.topicRow}
                    onClick={() => navigate(`/t/${t.id}`)}
                    aria-label={t.title}
                  >
                    <span className={styles.topicTitle}>{t.title}</span>
                    <span className={styles.topicMeta}>
                      <span className={styles.topicTime}>
                        {relativeTime(t.bumped_at || t.created_at)}
                      </span>
                      <span className={styles.topicReplies}>
                        <MessageSquare size={12} />
                        {compactNumber(t.reply_count)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PageScaffold>
  )
}

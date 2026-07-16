import { useNavigate } from 'react-router-dom'
import { Pin } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { CategoryBadge } from '../../components/ui/CategoryBadge'
import { Tag } from '../../components/ui/Tag'
import { SpriteIcon } from '../../components/ui/SpriteIcon'
import { useTagIcons } from '../../lib/tagIcons'
import { relativeTime, compactNumber } from '../../lib/format'
import { tagKey, tagText, type DiscourseUser, type TopicListItem } from '../../lib/discourse/types'
import styles from './TopicRow.module.css'

interface Props {
  topic: TopicListItem
  users: Map<number, DiscourseUser>
}

/** Discourse-style heat coloring for reply/view counts. */
function heat(value: number, warm: number, hot: number): string {
  if (value >= hot) return styles.hot
  if (value >= warm) return styles.warm
  return ''
}

export function TopicRow({ topic, users }: Props): JSX.Element {
  const navigate = useNavigate()
  const tagNames = (topic.tags ?? []).map(tagText)
  const tagIcons = useTagIcons(tagNames)

  const unreadCount = topic.unread_posts ?? topic.new_posts ?? topic.unread ?? 0
  const isNew = !!topic.unseen
  const posters = (topic.posters ?? [])
    .slice(0, 5)
    .map((p) => users.get(p.user_id))
    .filter((u): u is DiscourseUser => !!u)

  // Resume at the first unread post when the server knows where we stopped.
  const lastRead = topic.last_read_post_number ?? 0
  const href =
    unreadCount > 0 && lastRead > 0 ? `/t/${topic.id}?post=${lastRead + 1}` : `/t/${topic.id}`

  return (
    <button
      className={styles.row}
      data-row
      data-row-id={topic.id}
      onClick={() => navigate(href)}
      aria-label={topic.title}
    >
      <div className={styles.main}>
        <div className={styles.titleLine}>
          {topic.pinned && <Pin size={13} className={styles.pin} aria-label="置顶" />}
          <span className={styles.title}>{topic.title}</span>
          {unreadCount > 0 ? (
            <span className={styles.unreadPill} title={`${unreadCount} 条未读`}>
              {compactNumber(unreadCount)}
            </span>
          ) : isNew ? (
            <span className={styles.newDot} title="新话题" aria-label="新话题" />
          ) : null}
        </div>
        <div className={styles.metaLine}>
          <CategoryBadge categoryId={topic.category_id} />
          {(topic.tags ?? []).slice(0, 4).map((tg) => {
            const t = tagText(tg)
            return (
              <Tag key={tagKey(tg)}>
                <SpriteIcon name={tagIcons[t]} size={11} />
                {t}
              </Tag>
            )
          })}
        </div>
      </div>

      <span className={styles.posters} aria-hidden>
        {posters.map((u) => (
          <Avatar
            key={u.username}
            template={u.avatar_template}
            username={u.username}
            name={u.name}
            size={24}
          />
        ))}
      </span>

      <span
        className={`${styles.stat} ${heat(topic.reply_count ?? 0, 50, 500)}`}
        title={`${topic.reply_count ?? 0} 回复`}
      >
        {compactNumber(topic.reply_count)}
      </span>
      <span
        className={`${styles.stat} ${styles.views} ${heat(topic.views ?? 0, 1000, 3500)}`}
        title={`${topic.views ?? 0} 浏览`}
      >
        {compactNumber(topic.views)}
      </span>
      <span className={styles.time}>{relativeTime(topic.bumped_at)}</span>
    </button>
  )
}

import { useNavigate } from 'react-router-dom'
import { Eye, MessageSquare, Pin } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { CategoryBadge } from '../../components/ui/CategoryBadge'
import { Tag } from '../../components/ui/Tag'
import { relativeTime, compactNumber } from '../../lib/format'
import { tagKey, tagText, type DiscourseUser, type TopicListItem } from '../../lib/discourse/types'
import styles from './TopicRow.module.css'

interface Props {
  topic: TopicListItem
  users: Map<number, DiscourseUser>
}

export function TopicRow({ topic, users }: Props): JSX.Element {
  const navigate = useNavigate()
  const op = topic.posters[0] ? users.get(topic.posters[0].user_id) : undefined
  const isUnread = !!topic.unseen || (topic.unread ?? 0) > 0 || (topic.new_posts ?? 0) > 0

  return (
    <button
      className={styles.row}
      onClick={() => navigate(`/t/${topic.id}`)}
      aria-label={topic.title}
    >
      <span className={styles.indicator} aria-hidden>
        {isUnread && <span className={styles.dot} />}
      </span>

      <Avatar template={op?.avatar_template} username={op?.username} name={op?.name} size={38} />

      <div className={styles.main}>
        <div className={styles.titleLine}>
          {topic.pinned && <Pin size={13} className={styles.pin} aria-label="置顶" />}
          <span className={styles.title}>{topic.title}</span>
        </div>
        <div className={styles.metaLine}>
          <CategoryBadge categoryId={topic.category_id} />
          {topic.tags?.slice(0, 3).map((tag) => (
            <Tag key={tagKey(tag)}>{tagText(tag)}</Tag>
          ))}
          <span className={styles.author}>{op?.name || op?.username}</span>
        </div>
      </div>

      <div className={styles.stats}>
        <span className={styles.stat} title="回复">
          <MessageSquare size={13} />
          {compactNumber(topic.reply_count)}
        </span>
        <span className={styles.stat} title="浏览">
          <Eye size={13} />
          {compactNumber(topic.views)}
        </span>
        <span className={styles.time}>{relativeTime(topic.bumped_at)}</span>
      </div>
    </button>
  )
}

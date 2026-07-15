import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, MessageSquare, Send } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { LoginGate } from '../../components/ui/LoginGate'
import { EmptyState, ErrorState, TopicListSkeleton } from '../../components/ui/states'
import { usePrivateMessages, mergeUsers } from '../../lib/discourse/queries'
import { useAuth } from '../../store/auth'
import { relativeTime, compactNumber } from '../../lib/format'
import type { DiscourseUser, TopicListItem } from '../../lib/discourse/types'
import { NewMessageModal } from './NewMessageModal'
import styles from './MessagesPage.module.css'

export function MessagesPage(): JSX.Element {
  const auth = useAuth()
  const navigate = useNavigate()
  const [composing, setComposing] = useState(false)

  const { data, isLoading, isError, error, refetch } = usePrivateMessages(
    auth.loggedIn ? auth.username : undefined
  )

  const users = useMemo(() => mergeUsers(data ? [data] : []), [data])
  const topics = data?.topic_list.topics ?? []

  if (!auth.loggedIn) {
    return (
      <PageScaffold toolbar={<Toolbar title="私信" />}>
        <LoginGate
          icon={<Mail size={26} strokeWidth={1.6} />}
          title="登录后查看私信"
          description="登录 linux.do 后即可查看和发送私信。"
        />
      </PageScaffold>
    )
  }

  const right = (
    <Button variant="primary" size="sm" icon={<Send size={15} />} onClick={() => setComposing(true)}>
      写私信
    </Button>
  )

  return (
    <PageScaffold toolbar={<Toolbar title="私信" right={right} />}>
      {isLoading ? (
        <TopicListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : topics.length === 0 ? (
        <EmptyState
          icon={<Mail size={26} strokeWidth={1.6} />}
          title="没有私信"
          description="你还没有收到任何私信。"
        />
      ) : (
        topics.map((t) => (
          <MessageRow key={t.id} topic={t} users={users} onOpen={() => navigate(`/t/${t.id}`)} />
        ))
      )}

      {composing && (
        <NewMessageModal
          open
          onClose={() => setComposing(false)}
          onCreated={() => void refetch()}
        />
      )}
    </PageScaffold>
  )
}

function MessageRow({
  topic,
  users,
  onOpen
}: {
  topic: TopicListItem
  users: Map<number, DiscourseUser>
  onOpen: () => void
}): JSX.Element {
  const op = topic.posters[0] ? users.get(topic.posters[0].user_id) : undefined
  const names = topic.posters
    .map((p) => users.get(p.user_id))
    .filter((u): u is DiscourseUser => !!u)
    .map((u) => u.name || u.username)
  const participants = names.length > 0 ? names.join('、') : (topic.last_poster_username ?? '')

  return (
    <button className={styles.row} onClick={onOpen} aria-label={topic.title}>
      <Avatar template={op?.avatar_template} username={op?.username} name={op?.name} size={38} />

      <div className={styles.main}>
        <span className={styles.title}>{topic.title}</span>
        {participants && <span className={styles.participants}>{participants}</span>}
      </div>

      <div className={styles.stats}>
        <span className={styles.stat} title="回复">
          <MessageSquare size={13} />
          {compactNumber(topic.reply_count)}
        </span>
        <span className={styles.time}>{relativeTime(topic.bumped_at)}</span>
      </div>
    </button>
  )
}

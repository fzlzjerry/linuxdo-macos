import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, MessageSquare, RefreshCw, Send } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { IconButton } from '../../components/ui/IconButton'
import { LoginGate } from '../../components/ui/LoginGate'
import { EmptyState, ErrorState, ListSkeleton } from '../../components/ui/states'
import { usePrivateMessages, mergeUsers } from '../../lib/discourse/queries'
import { useAuth } from '../../store/auth'
import { relativeTime, absoluteTime, compactNumber } from '../../lib/format'
import { useListNav } from '../../lib/useListNav'
import { useFocusMemory } from '../../lib/useFocusMemory'
import type { DiscourseUser, TopicListItem } from '../../lib/discourse/types'
import { NewMessageModal } from './NewMessageModal'
import styles from './MessagesPage.module.css'

export function MessagesPage(): JSX.Element {
  const auth = useAuth()
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [composing, setComposing] = useState(false)

  const { data, isLoading, isError, error, refetch, isRefetching } = usePrivateMessages(
    auth.loggedIn ? auth.username : undefined
  )

  useListNav(scrollRef)
  useFocusMemory(scrollRef, 'messages', !isLoading && !!data)

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
    <>
      <Button variant="primary" size="sm" icon={<Send size={15} />} onClick={() => setComposing(true)}>
        写私信
      </Button>
      <IconButton label="刷新" onClick={() => void refetch()} disabled={isRefetching}>
        <RefreshCw size={16} className={isRefetching ? 'spin' : undefined} />
      </IconButton>
    </>
  )

  return (
    <PageScaffold ref={scrollRef} toolbar={<Toolbar title="私信" right={right} />}>
      {isLoading ? (
        <ListSkeleton leading="avatar" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : topics.length === 0 ? (
        <EmptyState
          icon={<Mail size={26} strokeWidth={1.6} />}
          title="没有私信"
          description="私信是与其他成员一对一交流的地方。写一封私信，开始对话吧。"
          action={
            <Button variant="primary" size="sm" icon={<Send size={15} />} onClick={() => setComposing(true)}>
              写私信
            </Button>
          }
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
    <button
      className={styles.row}
      data-row
      data-row-id={topic.id}
      onClick={onOpen}
      aria-label={topic.title}
    >
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
        <span className={styles.time} title={absoluteTime(topic.bumped_at)}>
          {relativeTime(topic.bumped_at)}
        </span>
      </div>
    </button>
  )
}

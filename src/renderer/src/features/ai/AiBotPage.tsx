import { useNavigate } from 'react-router-dom'
import { Bot, ExternalLink, MessageSquare, Star } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Button } from '../../components/ui/Button'
import { LoginGate } from '../../components/ui/LoginGate'
import { EmptyState, ErrorState, TopicListSkeleton } from '../../components/ui/states'
import { useAiConversations } from '../../lib/discourse/queries'
import { useAuth } from '../../store/auth'
import { relativeTime, compactNumber } from '../../lib/format'
import { LINUXDO_ORIGIN } from '../../lib/discourse/urls'
import styles from './AiBotPage.module.css'

export function AiBotPage(): JSX.Element {
  const auth = useAuth()
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch } = useAiConversations(auth.loggedIn)
  const conversations = data?.conversations ?? []

  const startNew = (): void => {
    void window.api?.openExternal(`${LINUXDO_ORIGIN}/discourse-ai/ai-bot/conversations`)
  }

  const toolbar = (
    <Toolbar
      title="AI 机器人"
      right={
        <Button variant="primary" size="sm" icon={<ExternalLink size={14} />} onClick={startNew}>
          发起新对话
        </Button>
      }
    />
  )

  if (!auth.loggedIn) {
    return (
      <PageScaffold toolbar={toolbar}>
        <LoginGate
          icon={<Bot size={26} strokeWidth={1.6} />}
          title="登录后使用 AI 机器人"
          description="登录 linux.do 后即可查看与 AI 机器人的对话。"
        />
      </PageScaffold>
    )
  }

  return (
    <PageScaffold toolbar={toolbar}>
      {isLoading ? (
        <TopicListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={<Bot size={26} strokeWidth={1.6} />}
          title="还没有 AI 对话"
          description="点击右上角「发起新对话」在浏览器中开始。"
        />
      ) : (
        <div className={styles.list}>
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.row}
              onClick={() => navigate(`/t/${c.id}`)}
              aria-label={c.title}
            >
              <span className={styles.icon}>
                <Bot size={18} strokeWidth={1.7} />
              </span>
              <span className={styles.main}>
                <span className={styles.title}>
                  {c.ai_conversation_starred && (
                    <Star size={13} className={styles.star} fill="currentColor" />
                  )}
                  {c.title}
                </span>
                <span className={styles.meta}>
                  {c.posts_count != null && (
                    <span className={styles.stat}>
                      <MessageSquare size={12} />
                      {compactNumber(c.posts_count)}
                    </span>
                  )}
                  {(c.last_posted_at || c.bumped_at || c.created_at) && (
                    <span className={styles.time}>
                      {relativeTime(c.last_posted_at || c.bumped_at || c.created_at)}
                    </span>
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </PageScaffold>
  )
}

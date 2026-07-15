import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Hash, MessagesSquare, RefreshCw, Send } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { Avatar } from '../../components/ui/Avatar'
import { IconButton } from '../../components/ui/IconButton'
import { LoginGate } from '../../components/ui/LoginGate'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/states'
import { CookedContent } from '../topics/CookedContent'
import { useChatChannels, useChatMessages } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { errorMessage } from '../../lib/errors'
import { relativeTime } from '../../lib/format'
import type { ChatChannel } from '../../lib/discourse/types'
import styles from './ChatPage.module.css'

function channelName(c: ChatChannel): string {
  if (c.title) return c.title
  const users = c.chatable?.users ?? []
  if (users.length) return users.map((u) => u.name || u.username).join('、')
  return `频道 ${c.id}`
}

function isUnread(c: ChatChannel): boolean {
  const last = c.last_message?.id
  const read = c.current_user_membership?.last_read_message_id ?? 0
  return last != null && read != null && last > read
}

export function ChatPage(): JSX.Element {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [channelId, setChannelId] = useState(0)
  const channelsQ = useChatChannels(auth.loggedIn)

  const pub = channelsQ.data?.public_channels ?? []
  const dm = channelsQ.data?.direct_message_channels ?? []
  const all = useMemo(() => [...pub, ...dm], [pub, dm])
  const selected = all.find((c) => c.id === channelId)

  useEffect(() => {
    if (!channelId && all.length) setChannelId(all[0].id)
  }, [channelId, all])

  function refresh(): void {
    void channelsQ.refetch()
    if (channelId) void queryClient.invalidateQueries({ queryKey: ['chat-messages', channelId] })
  }

  if (!auth.loggedIn) {
    return (
      <div className={styles.page}>
        <Toolbar title="聊天" />
        <LoginGate
          icon={<MessagesSquare size={26} strokeWidth={1.6} />}
          title="登录后使用聊天"
          description="登录 linux.do 后即可查看聊天频道与私信。"
        />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <Toolbar
        title="聊天"
        right={
          <IconButton label="刷新" onClick={refresh} disabled={channelsQ.isRefetching}>
            <RefreshCw size={16} className={channelsQ.isRefetching ? 'spin' : undefined} />
          </IconButton>
        }
      />
      <div className={styles.layout}>
        <aside className={styles.channels}>
          {channelsQ.isLoading ? (
            <Spinner label="加载频道…" />
          ) : channelsQ.isError ? (
            <ErrorState error={channelsQ.error} onRetry={() => void channelsQ.refetch()} />
          ) : (
            <>
              <ChannelGroup
                title="频道"
                channels={pub}
                current={channelId}
                onPick={setChannelId}
                kind="public"
              />
              <ChannelGroup
                title="私信"
                channels={dm}
                current={channelId}
                onPick={setChannelId}
                kind="dm"
              />
            </>
          )}
        </aside>
        <section className={styles.thread}>
          {selected ? (
            <ChatThread channel={selected} />
          ) : (
            <EmptyState
              icon={<MessagesSquare size={26} strokeWidth={1.6} />}
              title="选择一个频道"
            />
          )}
        </section>
      </div>
    </div>
  )
}

function ChannelGroup({
  title,
  channels,
  current,
  onPick,
  kind
}: {
  title: string
  channels: ChatChannel[]
  current: number
  onPick: (id: number) => void
  kind: 'public' | 'dm'
}): JSX.Element | null {
  if (channels.length === 0) return null
  return (
    <div className={styles.group}>
      <div className={styles.groupTitle}>{title}</div>
      {channels.map((c) => {
        const dmUser = kind === 'dm' ? c.chatable?.users?.[0] : undefined
        return (
          <button
            key={c.id}
            type="button"
            className={`${styles.channel} ${c.id === current ? styles.channelActive : ''}`}
            onClick={() => onPick(c.id)}
          >
            <span className={styles.channelIcon}>
              {kind === 'dm' ? (
                <Avatar
                  template={dmUser?.avatar_template}
                  username={dmUser?.username}
                  name={dmUser?.name}
                  size={26}
                />
              ) : (
                <Hash size={16} />
              )}
            </span>
            <span className={styles.channelMeta}>
              <span className={styles.channelName}>{channelName(c)}</span>
              {c.last_message?.excerpt && (
                <span className={styles.channelExcerpt}>{c.last_message.excerpt}</span>
              )}
            </span>
            {isUnread(c) && <span className={styles.unreadDot} aria-label="未读" />}
          </button>
        )
      })}
    </div>
  )
}

function ChatThread({ channel }: { channel: ChatChannel }): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useChatMessages(channel.id)
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const lastChannelRef = useRef(channel.id)
  const messages = data?.messages ?? []
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  function onScroll(): void {
    const el = scrollRef.current
    if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  async function send(): Promise<void> {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const stagedId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
      await discourse.sendChatMessage(channel.id, body, stagedId)
      setText('')
      nearBottomRef.current = true
      await queryClient.invalidateQueries({ queryKey: ['chat-messages', channel.id] })
    } catch (e) {
      toast.error(errorMessage(e, '发送失败'))
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  // Auto-scroll to the newest message on channel switch, or when new messages
  // arrive only if the reader was already near the bottom — so polling doesn't
  // yank someone who scrolled up to read history.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const channelChanged = lastChannelRef.current !== channel.id
    lastChannelRef.current = channel.id
    if (channelChanged || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight
      nearBottomRef.current = true
    }
  }, [channel.id, messages.length])

  return (
    <>
      <header className={styles.threadHead}>
        <span className={styles.threadTitle}>{channelName(channel)}</span>
        {channel.description && <span className={styles.threadDesc}>{channel.description}</span>}
      </header>

      <div className={styles.messages} ref={scrollRef} onScroll={onScroll}>
        {isLoading ? (
          <Spinner label="加载消息…" />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : messages.length === 0 ? (
          <EmptyState icon={<MessagesSquare size={24} strokeWidth={1.6} />} title="还没有消息" />
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1]
            const grouped = prev && prev.user.id === m.user.id
            return (
              <div key={m.id} className={`${styles.msg} ${grouped ? styles.msgGrouped : ''}`}>
                <span className={styles.msgAvatar}>
                  {!grouped && (
                    <Avatar
                      template={m.user.avatar_template}
                      username={m.user.username}
                      name={m.user.name}
                      size={32}
                    />
                  )}
                </span>
                <div className={styles.msgBody}>
                  {!grouped && (
                    <div className={styles.msgHead}>
                      <span className={styles.msgUser}>{m.user.name || m.user.username}</span>
                      <time className={styles.msgTime}>{relativeTime(m.created_at)}</time>
                    </div>
                  )}
                  <div className={styles.msgText}>
                    <CookedContent html={m.cooked ?? m.message ?? ''} />
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <textarea
          className={styles.composerInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`发送到 ${channelName(channel)}…`}
          rows={1}
          disabled={sending}
          aria-label="聊天消息"
        />
        <IconButton label="发送" type="submit" disabled={sending || !text.trim()}>
          <Send size={16} />
        </IconButton>
      </form>
    </>
  )
}

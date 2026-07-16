import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Clock, Hash, Loader2, MessagesSquare, RefreshCw, Send, Smile } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { Avatar } from '../../components/ui/Avatar'
import { IconButton } from '../../components/ui/IconButton'
import { LoginGate } from '../../components/ui/LoginGate'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/states'
import { EmojiPicker } from '../../components/composer/EmojiPicker'
import {
  InlineAutocomplete,
  type InlineAutocompleteHandle
} from '../../components/composer/InlineAutocomplete'
import { CookedContent } from '../topics/CookedContent'
import { useChatChannels, useChatMessages } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { renderMarkdown } from '../../lib/markdown'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { errorMessage } from '../../lib/errors'
import { relativeTime } from '../../lib/format'
import type { ChatChannel, ChatChannelsResponse, ChatMessage } from '../../lib/discourse/types'
import styles from './ChatPage.module.css'

const PAGE_SIZE = 50

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

// ---- optimistic sends ----

interface StagedEntry {
  stagedId: string
  /** Trimmed message body as sent. */
  body: string
  createdAt: string
  sentAt: number
  /** Newest real message id at send time — server echoes must be newer. */
  afterId: number
  /** Message id from the send response, when the server returns one. */
  confirmedId?: number
  /** The send request resolved OK (used to expire stuck entries). */
  settled?: boolean
}

interface DisplayItem {
  key: string
  msg: ChatMessage
  pending: boolean
}

/** Best-effort message id out of the (unspecified) send response. */
function extractMessageId(res: unknown): number | undefined {
  if (!res || typeof res !== 'object') return undefined
  const r = res as { message_id?: unknown; id?: unknown; message?: { id?: unknown } | null }
  if (typeof r.message_id === 'number') return r.message_id
  const nested = r.message?.id
  if (typeof nested === 'number') return nested
  if (typeof r.id === 'number') return r.id
  return undefined
}

/** Does a server message correspond to a staged (optimistic) one?
    Prefer the confirmed id; otherwise fall back to same-user + same-text +
    close-in-time (staged_id is not echoed back by the messages endpoint). */
function matchesStaged(s: StagedEntry, m: ChatMessage, selfUsername?: string): boolean {
  if (s.confirmedId != null && m.id === s.confirmedId) return true
  if (m.id <= s.afterId) return false
  if (!selfUsername || m.user.username !== selfUsername) return false
  if ((m.message ?? '').trim() !== s.body) return false
  const t = new Date(m.created_at).getTime()
  return Number.isFinite(t) ? Math.abs(t - s.sentAt) < 5 * 60_000 : true
}

/** 发送失败文本暂存:发送在途切频道会卸载 ChatThread(按 channel.id key 隔离),
    届时 setText 是 no-op——失败文本按频道存到这里,回到频道时预填回输入框。 */
const failedSendStash = new Map<number, string>()

// ---- mark-read (speculative standard discourse-chat route; must fail silently) ----

interface MarkReadState {
  /** Highest id the server has acknowledged. */
  ackedId: number
  /** When the most recent request was sent (throttle-window base). */
  sentAt: number
  /** Highest id requested so far — the trailing-flush target. */
  wantId: number
  /** Consecutive failures; bounds the retry chain for a speculative route. */
  fails: number
  timer?: number
}

const markReadState = new Map<number, MarkReadState>()

function patchChannelRead(
  list: ChatChannel[],
  channelId: number,
  messageId: number
): ChatChannel[] {
  return list.map((c) =>
    c.id === channelId
      ? {
          ...c,
          current_user_membership: {
            ...c.current_user_membership,
            last_read_message_id: Math.max(
              c.current_user_membership?.last_read_message_id ?? 0,
              messageId
            )
          }
        }
      : c
  )
}

/** Send `wantId` when it advanced past `ackedId` and the 5s window allows;
    otherwise arm a trailing timer that flushes the newest id at window close.
    Failures keep `wantId` pending and retry through the same trailing path,
    bounded to 3 consecutive attempts (the route is speculative — no endless
    polling of a broken endpoint); after that the id stays retryable by any
    later call. */
function flushMarkRead(queryClient: QueryClient, channelId: number): void {
  const s = markReadState.get(channelId)
  if (!s || s.wantId <= s.ackedId) return
  const wait = s.sentAt + 5_000 - Date.now()
  if (wait > 0) {
    if (s.timer == null) {
      s.timer = window.setTimeout(() => {
        s.timer = undefined
        flushMarkRead(queryClient, channelId)
      }, wait)
    }
    return
  }
  const id = s.wantId
  s.sentAt = Date.now()
  discourse
    .chatMarkRead(channelId, id)
    .then(() => {
      s.ackedId = Math.max(s.ackedId, id)
      s.fails = 0
      queryClient.setQueryData<ChatChannelsResponse>(['chat-channels'], (old) =>
        old
          ? {
              ...old,
              public_channels: patchChannelRead(old.public_channels, channelId, id),
              direct_message_channels: patchChannelRead(old.direct_message_channels, channelId, id)
            }
          : old
      )
      flushMarkRead(queryClient, channelId) // wantId 可能在请求在途时又前进了
    })
    .catch((e) => {
      console.debug('[chat] mark-read failed (ignored):', e)
      s.fails += 1
      if (s.fails < 3) {
        flushMarkRead(queryClient, channelId) // 冷却窗结束后 trailing 重试
      } else {
        // 放弃本轮但不永久占坑:回滚 want,之后任何调用都能重新发起。
        s.wantId = s.ackedId
        s.fails = 0
      }
    })
}

/** Mark the channel read up to `messageId`. Throttled to one request per 5s
    per channel with a trailing flush (the newest unreported id is never
    dropped); on success the channel-list cache is patched so the unread dot
    clears immediately. Failures are silent. */
function markChannelRead(queryClient: QueryClient, channelId: number, messageId: number): void {
  if (messageId <= 0) return
  let s = markReadState.get(channelId)
  if (!s) {
    s = { ackedId: 0, sentAt: 0, wantId: 0, fails: 0 }
    markReadState.set(channelId, s)
  }
  if (messageId <= s.ackedId) return
  if (messageId > s.wantId) s.wantId = messageId
  flushMarkRead(queryClient, channelId)
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
            // key: 每个频道独立的本地状态(历史页、staged 消息、输入草稿、滚动锚点)
            <ChatThread key={selected.id} channel={selected} />
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
  const auth = useAuth()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiBtnRef = useRef<HTMLSpanElement>(null)
  const acRef = useRef<InlineAutocompleteHandle>(null)
  const mountedRef = useRef(true)
  const [text, setText] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiAnchor, setEmojiAnchor] = useState({ left: 0, top: 0 })

  // Older history pages (prepended) + optimistic sends (appended).
  const [older, setOlder] = useState<ChatMessage[]>([])
  const [staged, setStaged] = useState<StagedEntry[]>([])
  // 安全阀信号:settled 但一直没匹配上回显的 staged,到期由定时器驱动清理
  // (安静频道 real/staged 长期不变,不能只靠数据变化触发 reconcile)。
  const [expireTick, setExpireTick] = useState(0)
  const [olderLoading, setOlderLoading] = useState(false)
  const [noMorePast, setNoMorePast] = useState(false)
  // 失败冷却后的重试信号:驱动填屏 effect 重跑——消息不足一屏时没有滚动条,
  // scroll 事件永不触发,这是这类频道唯一的重试入口。
  const [olderRetryTick, setOlderRetryTick] = useState(0)
  const olderBusyRef = useRef(false)
  const olderRetryAtRef = useRef(0)
  const olderAutoRetriesRef = useRef(0)
  // WKWebView has no scroll anchoring: anchor the oldest visible message
  // element right before a prepend; a layout effect re-pins it afterwards.
  const prependAnchorRef = useRef<{ id: number; top: number } | null>(null)

  const live = data?.messages
  // Server messages: accumulated older pages merged with the polled latest
  // page, deduped by id, ascending (same shape as TopicPage's posts merge).
  const real = useMemo(() => {
    const map = new Map<number, ChatMessage>()
    for (const m of older) map.set(m.id, m)
    for (const m of live ?? []) map.set(m.id, m)
    return [...map.values()].sort((a, b) => a.id - b.id)
  }, [older, live])
  const newestRealId = real.length ? real[real.length - 1].id : 0

  // Converge: drop staged entries once the server echo shows up in the list.
  // Each server message can claim at most one staged entry (double-send of
  // identical text stays visible until both echoes arrive).
  useEffect(() => {
    if (staged.length === 0) return
    const claimed = new Set<number>()
    const now = Date.now()
    const remaining = staged.filter((s) => {
      const hit = real.find((m) => !claimed.has(m.id) && matchesStaged(s, m, auth.username))
      if (hit) {
        claimed.add(hit.id)
        return false
      }
      // Safety valve: a settled send whose echo never matched (e.g. server
      // rewrote the text) would otherwise stay "pending" forever.
      return !(s.settled && now - s.sentAt > 90_000)
    })
    if (remaining.length !== staged.length) setStaged(remaining)
  }, [real, staged, auth.username, expireTick])

  // 到期驱动:最早一条 settled staged 的 90s 期限一到,踢一次上面的 reconcile。
  useEffect(() => {
    const settled = staged.filter((s) => s.settled)
    if (settled.length === 0) return
    const earliest = Math.min(...settled.map((s) => s.sentAt + 90_000))
    const t = window.setTimeout(
      () => setExpireTick((n) => n + 1),
      Math.max(0, earliest - Date.now()) + 50
    )
    return () => window.clearTimeout(t)
  }, [staged, expireTick])

  // Own user id (for message grouping of staged rows) — the auth store only
  // has the username, so recover the id from any own message already loaded.
  const selfId = useMemo(
    () => real.find((m) => m.user.username === auth.username)?.user.id ?? -1,
    [real, auth.username]
  )

  const display = useMemo(() => {
    const items: DisplayItem[] = real.map((m) => ({ key: `m-${m.id}`, msg: m, pending: false }))
    staged.forEach((s, i) => {
      items.push({
        key: s.stagedId,
        pending: true,
        msg: {
          id: -(i + 1),
          message: s.body,
          cooked: renderMarkdown(s.body),
          created_at: s.createdAt,
          user: {
            id: selfId,
            username: auth.username ?? '',
            name: auth.name,
            avatar_template: auth.avatarUrl
          }
        }
      })
    })
    return items
  }, [real, staged, selfId, auth.username, auth.name, auth.avatarUrl])

  // 查看即已读:消息加载完(以及此后每条新消息)节流上报最新 id。
  useEffect(() => {
    if (newestRealId > 0) markChannelRead(queryClient, channel.id, newestRealId)
  }, [queryClient, channel.id, newestRealId])

  // StrictMode 下 effect 会 setup→cleanup→setup,所以 true 要在 setup 里重置。
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 挂载时取回上次发送失败暂存的文本(发送在途切频道、组件已卸载的兜底)。
  useEffect(() => {
    const stash = failedSendStash.get(channel.id)
    if (stash == null) return
    failedSendStash.delete(channel.id)
    setText((t) => (t ? `${stash}\n${t}` : stash))
  }, [channel.id])

  async function loadOlder(): Promise<void> {
    if (olderBusyRef.current || olderLoading || noMorePast) return
    if (Date.now() < olderRetryAtRef.current) return
    const oldest = real[0]
    if (!oldest) return
    // The very first (latest) page already told us there is no past.
    if (older.length === 0 && data?.meta?.can_load_more_past === false) {
      setNoMorePast(true)
      return
    }
    olderBusyRef.current = true
    setOlderLoading(true)
    try {
      const r = await discourse.chatMessages(channel.id, PAGE_SIZE, oldest.id)
      const page = (r.messages ?? []).filter((m) => m.id < oldest.id)
      const more = r.meta?.can_load_more_past ?? page.length >= PAGE_SIZE
      if (!more || page.length === 0) setNoMorePast(true)
      if (page.length) {
        // 元素锚定(而非 scrollHeight 差):同一 commit 里若轮询也在底部 append
        // 了新消息,高度差会把底部增量误算进补偿量。锚住当前最旧消息元素,
        // prepend 后按它的位移校正,与底部无关。
        const node = scrollRef.current?.querySelector(`[data-mid="${oldest.id}"]`)
        prependAnchorRef.current = node
          ? { id: oldest.id, top: node.getBoundingClientRect().top }
          : null
        setOlder((prev) => {
          const map = new Map<number, ChatMessage>()
          for (const m of page) map.set(m.id, m)
          for (const m of prev) map.set(m.id, m)
          return [...map.values()].sort((a, b) => a.id - b.id)
        })
      }
      olderAutoRetriesRef.current = 0
    } catch (e) {
      olderRetryAtRef.current = Date.now() + 4_000 // don't re-fire on every scroll event
      // 冷却结束后主动驱动一次填屏检查(有限次,避免对持续失败的接口形成轮询);
      // 有滚动条的频道该检查会自然 no-op,重试仍由用户滚动驱动。
      if (olderAutoRetriesRef.current < 3) {
        olderAutoRetriesRef.current += 1
        window.setTimeout(() => setOlderRetryTick((t) => t + 1), 4_100)
      }
      toast.error(errorMessage(e, '加载历史消息失败'))
    } finally {
      olderBusyRef.current = false
      setOlderLoading(false)
    }
  }

  // Re-pin the anchored message after a prepend: correct scrollTop by exactly
  // how far that element moved, so the viewport doesn't jump.
  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current
    if (!anchor) return
    prependAnchorRef.current = null
    const el = scrollRef.current
    if (!el) return
    const node = el.querySelector(`[data-mid="${anchor.id}"]`)
    if (!node) return
    el.scrollTop += node.getBoundingClientRect().top - anchor.top
  }, [older])

  // If the first page doesn't fill the viewport there are no scroll events —
  // keep pulling history until it does (or there is none left). olderRetryTick
  // re-drives this check after a failed fetch's cooldown.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || noMorePast || real.length === 0) return
    if (el.scrollHeight <= el.clientHeight) void loadOlder()
  }, [real.length, noMorePast, olderRetryTick])

  function onScroll(): void {
    const el = scrollRef.current
    if (!el) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (el.scrollTop < 80) void loadOlder()
  }

  function toggleEmoji(): void {
    if (emojiOpen) {
      setEmojiOpen(false)
      return
    }
    const r = emojiBtnRef.current?.getBoundingClientRect()
    if (!r) return
    const W = 312
    const H = 332
    setEmojiAnchor({
      left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)),
      top: Math.max(8, r.top - H) // open above — the composer is at the bottom
    })
    setEmojiOpen(true)
  }

  function insertEmoji(char: string): void {
    setEmojiOpen(false)
    const el = textareaRef.current
    if (!el) {
      setText((t) => t + char)
      return
    }
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? text.length
    setText(text.slice(0, start) + char + text.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + char.length
      el.setSelectionRange(pos, pos)
    })
  }

  /** InlineAutocomplete replaces [start, end) with the picked completion. */
  function replaceRange(start: number, end: number, insert: string): void {
    const el = textareaRef.current
    if (!el) return
    const value = el.value
    setText(value.slice(0, start) + insert + value.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const c = start + insert.length
      el.setSelectionRange(c, c)
    })
  }

  // Optimistic send: stage the message locally, clear the input and scroll to
  // the bottom right away; the poll (plus an immediate refetch) reconciles the
  // staged row against the server echo. On failure: remove the staged row,
  // toast, and restore the text into the input (preserving anything typed
  // since — the failed body is prepended).
  async function send(): Promise<void> {
    const body = text.trim()
    if (!body) return
    const stagedId = `staged-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const entry: StagedEntry = {
      stagedId,
      body,
      createdAt: new Date().toISOString(),
      sentAt: Date.now(),
      afterId: newestRealId
    }
    setStaged((prev) => [...prev, entry])
    setText('')
    nearBottomRef.current = true
    try {
      const res = await discourse.sendChatMessage(channel.id, body, stagedId)
      const confirmedId = extractMessageId(res)
      setStaged((prev) =>
        prev.map((s) => (s.stagedId === stagedId ? { ...s, confirmedId, settled: true } : s))
      )
      void refetch() // converge the staged row ASAP instead of waiting for the poll
      if (confirmedId != null) markChannelRead(queryClient, channel.id, confirmedId)
    } catch (e) {
      setStaged((prev) => prev.filter((s) => s.stagedId !== stagedId))
      // 先无条件写入模块级暂存:发送在途切频道会卸载本组件,setState 是 no-op,
      // 文本会随卸载丢失。仍挂载时立即取回并同步进输入框(保留期间新输入)。
      const prevStash = failedSendStash.get(channel.id)
      failedSendStash.set(channel.id, prevStash ? `${prevStash}\n${body}` : body)
      if (mountedRef.current) {
        const stash = failedSendStash.get(channel.id) ?? body
        failedSendStash.delete(channel.id)
        setText((t) => (t ? `${stash}\n${t}` : stash))
      }
      toast.error(errorMessage(e, '发送失败'))
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    // IME 组合中(拼音候选等)的 Enter/方向键属于输入法:既不能喂给补全菜单
    // (会替换掉组合中的文本),也不能触发发送。
    if (e.nativeEvent.isComposing) return
    if (acRef.current?.onKeyDown(e)) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  // 输入框自适应高度：1 行起步，上限 140px（与 CSS max-height 一致），超出内部滚动；
  // 发送成功后 setText('') 触发本 effect，高度随之复位。
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const border = el.offsetHeight - el.clientHeight
    el.style.height = `${Math.min(el.scrollHeight + border, 140)}px`
  }, [text])

  // Pin the viewport to the newest message on first load / own sends, and when
  // polled messages arrive only if the reader was already near the bottom — so
  // polling doesn't yank someone reading history. Keyed on the newest id (not
  // list length) so history prepends never trigger it.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (nearBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [newestRealId, staged.length])

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
        ) : display.length === 0 ? (
          <EmptyState icon={<MessagesSquare size={24} strokeWidth={1.6} />} title="还没有消息" />
        ) : (
          <>
            {olderLoading && (
              <div className={styles.historyRow} role="status">
                <Loader2 size={14} className="spin" />
                <span>加载更早的消息…</span>
              </div>
            )}
            {display.map((item, i) => {
              const m = item.msg
              const prev = display[i - 1]?.msg
              const grouped = !!prev && prev.user.id === m.user.id
              return (
                <div
                  key={item.key}
                  data-mid={item.pending ? undefined : m.id}
                  className={`${styles.msg} ${grouped ? styles.msgGrouped : ''} ${
                    item.pending ? styles.msgPending : ''
                  }`}
                >
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
                        {item.pending ? (
                          <span className={`${styles.msgTime} ${styles.msgTimePending}`}>
                            <Clock size={11} strokeWidth={2} aria-hidden />
                            发送中
                          </span>
                        ) : (
                          <time className={styles.msgTime}>{relativeTime(m.created_at)}</time>
                        )}
                      </div>
                    )}
                    <div className={styles.msgText}>
                      <CookedContent html={m.cooked ?? m.message ?? ''} />
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <span ref={emojiBtnRef} className={styles.emojiWrap}>
          <IconButton label="表情" type="button" active={emojiOpen} onClick={toggleEmoji}>
            <Smile size={18} />
          </IconButton>
        </span>
        <textarea
          ref={textareaRef}
          className={styles.composerInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`发送到 ${channelName(channel)}…`}
          rows={1}
          aria-label="聊天消息"
        />
        <IconButton label="发送" type="submit" disabled={!text.trim()}>
          <Send size={16} />
        </IconButton>
      </form>

      <span className={styles.acFlip}>
        <InlineAutocomplete
          ref={acRef}
          textareaRef={textareaRef}
          value={text}
          onReplace={replaceRange}
        />
      </span>

      {emojiOpen && (
        <EmojiPicker
          anchor={emojiAnchor}
          triggerRef={emojiBtnRef}
          onClose={() => setEmojiOpen(false)}
          onPick={insertEmoji}
        />
      )}
    </>
  )
}

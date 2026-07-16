import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Eye, Loader2, MessageSquare, Reply, RefreshCw } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { IconButton } from '../../components/ui/IconButton'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Composer } from '../../components/composer/Composer'
import { DiscardBar, useDiscardGuard } from '../../components/composer/useDiscardGuard'
import { CategoryBadge } from '../../components/ui/CategoryBadge'
import { Tag } from '../../components/ui/Tag'
import { SpriteIcon } from '../../components/ui/SpriteIcon'
import { useTagIcons } from '../../lib/tagIcons'
import { InfiniteSentinel } from '../../components/ui/InfiniteSentinel'
import { ErrorState, Spinner } from '../../components/ui/states'
import { ErrorBoundary } from '../../components/ui/ErrorBoundary'
import { useTopic } from '../../lib/discourse/queries'
import { useBackNav } from '../../lib/useBackNav'
import { useListNav } from '../../lib/useListNav'
import { useDraftAutosave } from '../../lib/useDraftAutosave'
import { parseDraftContent } from '../../lib/discourse/draftContent'
import { errorMessage } from '../../lib/errors'
import { renderMarkdown } from '../../lib/markdown'
import { discourse } from '../../lib/discourse/client'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { compactNumber, relativeTime } from '../../lib/format'
import { LINUXDO_ORIGIN } from '../../lib/discourse/urls'
import { tagKey, tagText, type Post } from '../../lib/discourse/types'
import { applyLocalReadState } from '../../lib/discourse/readSync'
import { useRecents } from '../../store/recents'
import { useReadTracker } from './useReadTracker'
import { PostView } from './PostView'
import { TopicProgress } from './TopicProgress'
import { TopicNotificationMenu } from './TopicNotificationMenu'
import { TopicDetailSkeleton } from './TopicDetailSkeleton'
import styles from './TopicPage.module.css'

type ComposerMode =
  | { mode: 'reply'; post?: Post; draft?: string }
  | { mode: 'edit'; post: Post; raw: string }

export function TopicPage(): JSX.Element {
  const { id: idParam } = useParams()
  const id = Number(idParam)
  const [searchParams] = useSearchParams()
  // ?post=N anchors the loaded window there (resume-at-first-unread).
  const anchor = Math.max(0, Number(searchParams.get('post')) || 0)
  const goBack = useBackNav()
  const auth = useAuth()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: topic, isLoading, isError, error, refetch, isRefetching } = useTopic(id, anchor)

  // j/k walks the posts (they carry data-row + tabIndex=-1).
  useListNav(scrollRef)

  const [extraPosts, setExtraPosts] = useState<Post[]>([])
  const [patches, setPatches] = useState<Map<number, Post>>(new Map())
  const [deleted, setDeleted] = useState<Set<number>>(new Set())
  const [loadingMore, setLoadingMore] = useState(false)
  const [composer, setComposer] = useState<ComposerMode | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [gapLoading, setGapLoading] = useState<number | null>(null)
  const [tailLoading, setTailLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 1, show: false })
  const [unreadBusy, setUnreadBusy] = useState(false)
  // last_read_post_number frozen at entry: timings flushes advance the cached
  // value while reading, and the divider must not drift along with it.
  const [initialLastRead, setInitialLastRead] = useState<number | null>(null)

  // Server-side draft autosave for replies (Discourse key topic_{id}).
  // Deletion is gated on hasSaved(): only a draft this session actually wrote
  // may be removed — merely opening and closing the composer must never wipe
  // a draft the user saved from the website.
  const composerBoxRef = useRef<HTMLDivElement>(null)
  const replyDraftKey = `topic_${id}`
  const autosave = useDraftAutosave(
    composer?.mode === 'reply' ? replyDraftKey : null,
    topic?.draft_sequence ?? undefined
  )
  const pushReplyDraft = (): void => {
    if (composer?.mode !== 'reply') return
    const raw = composerBoxRef.current?.querySelector('textarea')?.value.trim() ?? ''
    autosave.update(raw ? { reply: raw, action: 'reply', archetypeId: 'regular' } : null)
  }

  const guard = useDiscardGuard(composer != null, () => {
    // Dirty replies only leave through the DiscardBar (确认丢弃) — drop the
    // server draft with them; clean closes leave any existing draft alone.
    if (composer?.mode === 'reply' && autosave.hasSaved()) {
      void autosave.discard(replyDraftKey)
    }
    setComposer(null)
  })

  // The reset effect must not re-run when only ?post= changes, so it reads
  // the anchor through a ref.
  const anchorRef = useRef(anchor)
  anchorRef.current = anchor
  const anchoredRef = useRef(false)

  useEffect(() => {
    setExtraPosts([])
    setPatches(new Map())
    setDeleted(new Set())
    setProgress({ current: 1, show: false })
    setInitialLastRead(null)
    anchoredRef.current = false
    if (!anchorRef.current) scrollRef.current?.scrollTo({ top: 0 })
  }, [id])

  // Position the entry once the anchored window arrives.
  useEffect(() => {
    if (!topic || anchoredRef.current) return
    anchoredRef.current = true
    // First arrival of this topic's data — record it for the ⌘K「最近」group
    // (getState: no subscription, so this page never re-renders for recents).
    if (topic.title) useRecents.getState().pushRecent(id, topic.title)
    // Unconditional: when switching to a cached topic, the reset effect's
    // setInitialLastRead(null) is still queued in this same commit, so the
    // closure value is stale — checking it here would skip the freeze and
    // kill the unread divider for the whole visit.
    setInitialLastRead(topic.last_read_post_number ?? 0)
    if (!anchor) return
    setProgress((p) => ({ ...p, current: anchor }))
    const win = topic.post_stream.posts
    requestAnimationFrame(() => {
      const fallback = win.find((p) => p.post_number >= anchor)?.post_number
      const el =
        document.getElementById(`post-${anchor}`) ??
        (fallback ? document.getElementById(`post-${fallback}`) : null)
      el?.scrollIntoView({ block: 'start' })
    })
  }, [topic, anchor, id])

  // Reading-position tracking: the last post whose top edge passed the fold.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let raf = 0
    const measure = (): void => {
      raf = 0
      const show = el.scrollTop > el.clientHeight
      const fold = el.getBoundingClientRect().top + 80
      let cur = 1
      for (const n of el.querySelectorAll<HTMLElement>('article[id^="post-"]')) {
        if (n.getBoundingClientRect().top <= fold) {
          const num = Number(n.id.slice(5))
          if (!Number.isNaN(num) && num > 0) cur = num
        } else break
      }
      setProgress((p) => (p.current === cur && p.show === show ? p : { current: cur, show }))
    }
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [id])

  const posts = useMemo(() => {
    const map = new Map<number, Post>()
    for (const p of topic?.post_stream.posts ?? []) map.set(p.id, p)
    for (const p of extraPosts) map.set(p.id, p)
    for (const p of patches.values()) map.set(p.id, p)
    return [...map.values()]
      .filter((p) => !deleted.has(p.id))
      .sort((a, b) => a.post_number - b.post_number)
  }, [topic, extraPosts, patches, deleted])

  const stream = topic?.post_stream.stream ?? []

  // Unloaded stream ids sitting immediately BEFORE each rendered post: the
  // head gap left by an anchored entry, and mid-stream holes left by
  // jump-to-bottom. `headGapPostId` marks which button is the head gap.
  const { gapsBefore, headGapPostId } = useMemo(() => {
    const map = new Map<number, number[]>()
    let headId: number | null = null
    if (stream.length === 0) return { gapsBefore: map, headGapPostId: headId }
    const loaded = new Set(posts.map((p) => p.id))
    const indexOf = new Map<number, number>()
    stream.forEach((sid, i) => indexOf.set(sid, i))
    let prevIdx = -1
    let first = true
    for (const p of posts) {
      const idx = indexOf.get(p.id)
      if (idx === undefined) continue // optimistic posts aren't in the stream
      const missing: number[] = []
      for (let i = prevIdx + 1; i < idx; i++) {
        const sid = stream[i]
        if (!loaded.has(sid) && !deleted.has(sid)) missing.push(sid)
      }
      if (missing.length > 0) {
        map.set(p.id, missing)
        if (first) headId = p.id
      }
      first = false
      prevIdx = idx
    }
    return { gapsBefore: map, headGapPostId: headId }
  }, [posts, stream, deleted])

  // Only mid-stream holes block the tail sentinel; an anchored entry's head
  // gap must not stop the reader from scrolling onward.
  const hasMidGap = useMemo(
    () => [...gapsBefore.keys()].some((pid) => pid !== headGapPostId),
    [gapsBefore, headGapPostId]
  )

  // Stream ids strictly after the last loaded post — the forward direction.
  const tailRemaining = useMemo(() => {
    const indexOf = new Map<number, number>()
    stream.forEach((sid, i) => indexOf.set(sid, i))
    let last = -1
    for (const p of posts) {
      const idx = indexOf.get(p.id)
      if (idx !== undefined && idx > last) last = idx
    }
    return stream.slice(last + 1).filter((sid) => !deleted.has(sid))
  }, [posts, stream, deleted])

  async function loadMore(): Promise<void> {
    // While a mid-stream gap exists the sentinel is disabled — loading the
    // tail would insert content above the viewport and jump the page.
    if (loadingMore || hasMidGap || tailRemaining.length === 0) return
    setLoadingMore(true)
    try {
      const batch = await discourse.postsBatch(id, tailRemaining.slice(0, 20))
      setExtraPosts((prev) => [...prev, ...batch])
    } catch {
      /* retried on next scroll */
    } finally {
      setLoadingMore(false)
    }
  }

  async function loadGap(beforePostId: number): Promise<void> {
    const ids = gapsBefore.get(beforePostId)
    if (!ids || gapLoading != null) return
    setGapLoading(beforePostId)
    try {
      // Head gap grows upward (nearest block first) so new posts land below
      // the button and nothing above the viewport moves; mid gaps keep the
      // original top-down fill.
      const slice = beforePostId === headGapPostId ? ids.slice(-20) : ids.slice(0, 20)
      const batch = await discourse.postsBatch(id, slice)
      setExtraPosts((prev) => [...prev, ...batch])
    } catch (e) {
      toast.error(errorMessage(e, '加载失败'))
    } finally {
      setGapLoading(null)
    }
  }

  function jumpToTop(): void {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function jumpToBottom(): Promise<void> {
    const el = scrollRef.current
    if (!el) return
    if (tailRemaining.length === 0) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      return
    }
    if (tailLoading) return
    setTailLoading(true)
    try {
      const loaded = new Set(posts.map((p) => p.id))
      const tailIds = stream.slice(-20).filter((sid) => !loaded.has(sid) && !deleted.has(sid))
      if (tailIds.length > 0) {
        const batch = await discourse.postsBatch(id, tailIds)
        setExtraPosts((prev) => [...prev, ...batch])
      }
      requestAnimationFrame(() => {
        const sc = scrollRef.current
        sc?.scrollTo({ top: sc.scrollHeight })
      })
    } catch (e) {
      toast.error(errorMessage(e, '加载失败'))
    } finally {
      setTailLoading(false)
    }
  }

  // First rendered post past the frozen read boundary — where the divider
  // sits. Only drawn when the boundary is provably contiguous in the loaded
  // window (a misplaced line is worse than none).
  const unreadBoundaryId = useMemo(() => {
    const lastRead = initialLastRead ?? 0
    if (lastRead <= 0) return null
    const real = posts.filter((p) => !p.pending)
    for (let i = 0; i < real.length; i++) {
      const p = real[i]
      // Own posts are read by definition — a reply sent this session must not
      // grow an "unread" divider above itself.
      if (p.post_number <= lastRead || p.yours) continue
      const prev = real[i - 1]
      const prevRead = prev
        ? prev.post_number <= lastRead || !!prev.yours
        : p.post_number === lastRead + 1
      return prevRead ? p.id : null
    }
    return null
  }, [posts, initialLastRead])

  // "Jump to unread" target: only offered while there genuinely are unread
  // posts beyond the frozen entry boundary.
  const highest = topic?.highest_post_number ?? topic?.posts_count ?? 0
  const unreadStart =
    initialLastRead != null && initialLastRead > 0 && initialLastRead < highest
      ? initialLastRead + 1
      : null

  /** Scroll a floor into view (fetching its window first when unloaded) and
   *  flash it. Serves reply-to chips and same-topic quote headers. */
  const flashPost = (n: number): boolean => {
    const el = document.getElementById(`post-${n}`)
    if (!el) return false
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    if (!reduce) {
      el.animate(
        [{ backgroundColor: 'var(--accent-soft)' }, { backgroundColor: 'transparent' }],
        { duration: 1200, easing: 'ease-out' }
      )
    }
    return true
  }

  async function jumpToPost(target: number): Promise<void> {
    if (flashPost(target)) return
    try {
      const win = await discourse.topic(id, target)
      setExtraPosts((prev) => [...prev, ...win.post_stream.posts])
      const n = win.post_stream.posts.find((p) => p.post_number >= target)?.post_number ?? target
      requestAnimationFrame(() => flashPost(n))
    } catch (e) {
      toast.error(errorMessage(e, '加载失败'))
    }
  }

  async function jumpToUnread(): Promise<void> {
    if (unreadStart == null || unreadBusy) return
    const boundary = posts.find((p) => p.id === unreadBoundaryId)
    if (boundary) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      document
        .getElementById(`post-${boundary.post_number}`)
        ?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      return
    }
    setUnreadBusy(true)
    try {
      const win = await discourse.topic(id, unreadStart)
      const winPosts = win.post_stream.posts
      setExtraPosts((prev) => [...prev, ...winPosts])
      const target =
        winPosts.find((p) => p.post_number >= unreadStart)?.post_number ?? unreadStart
      requestAnimationFrame(() => {
        document.getElementById(`post-${target}`)?.scrollIntoView({ block: 'start' })
      })
    } catch (e) {
      toast.error(errorMessage(e, '加载失败'))
    } finally {
      setUnreadBusy(false)
    }
  }

  // Report reading time → server marks posts read (the sync contract with
  // the website); fold each successful report back into local caches.
  const realPostNumbers = useMemo(
    () => new Set(posts.filter((p) => !p.pending).map((p) => p.post_number)),
    [posts]
  )
  useReadTracker({
    topicId: id,
    scrollRef,
    enabled: auth.loggedIn && !!topic,
    postNumbers: realPostNumbers,
    onFlushed: (tid, maxRead) => applyLocalReadState(queryClient, tid, maxRead)
  })

  function requireAuth(): boolean {
    if (!auth.loggedIn) {
      toast.info('请先登录 linux.do')
      void auth.showLogin()
      return false
    }
    return true
  }

  function openReply(post?: Post): void {
    if (!requireAuth()) return
    // Resume this topic's server-side draft (website parity) — also the
    // reason autosave must not blind-overwrite: the draft is shown first.
    const draft = parseDraftContent(topic?.draft ?? undefined).reply
    setComposer({ mode: 'reply', post, draft })
  }

  function openQuote(post: Post, quote: string): void {
    if (!requireAuth()) return
    setComposer({ mode: 'reply', post, draft: quote })
  }

  async function openEdit(post: Post): Promise<void> {
    if (!requireAuth()) return
    try {
      const raw = post.raw ?? (await discourse.postRaw(post.id))
      setComposer({ mode: 'edit', post, raw })
    } catch {
      toast.error('无法加载原文')
    }
  }

  async function submitComposer(raw: string): Promise<void> {
    if (!composer) return

    if (composer.mode === 'edit') {
      // Edits stay non-optimistic: server cooking (mentions/oneboxes) matters.
      setSubmitting(true)
      try {
        const updated = await discourse.editPost(composer.post.id, raw)
        setPatches((p) => new Map(p).set(updated.id, updated))
        toast.success('已保存')
        setComposer(null)
      } catch (e) {
        toast.error(errorMessage(e, '发布失败'))
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Replies are optimistic: show a pending post immediately, reconcile with
    // the server response, restore the draft into the composer on failure.
    const replyTo = composer.post
    const tempId = -Date.now()
    const temp = {
      id: tempId,
      // highest_post_number beats the last loaded post: with an anchored
      // window the tail may not be loaded at all.
      post_number: Math.max(topic?.highest_post_number ?? 0, posts.at(-1)?.post_number ?? 0) + 1,
      topic_id: id,
      user_id: -1,
      cooked: renderMarkdown(raw),
      username: auth.username ?? '',
      name: auth.name,
      avatar_template: auth.avatarUrl,
      created_at: new Date().toISOString(),
      reply_to_post_number: replyTo?.post_number,
      yours: true,
      pending: true
    } as Post
    setComposer(null)
    setExtraPosts((prev) => [...prev, temp])
    requestAnimationFrame(() => {
      document.getElementById(`post-${temp.post_number}`)?.scrollIntoView({ block: 'end' })
    })
    try {
      const created = await discourse.reply({
        topicId: id,
        raw,
        replyToPostNumber: replyTo?.post_number
      })
      setExtraPosts((prev) => prev.filter((p) => p.id !== tempId))
      setPatches((p) => new Map(p).set(created.id, created))
      toast.success('回复已发布')
      // Published — the topic draft is spent (website behavior). The key is
      // passed explicitly: the composer already closed, so the hook's own key
      // has been nulled by the time this network call resolves.
      void autosave.discard(replyDraftKey)
      // The server-assigned floor may differ from the optimistic guess —
      // settle the viewport on the real post and flash it once.
      requestAnimationFrame(() => {
        const el = document.getElementById(`post-${created.post_number}`)
        el?.scrollIntoView({ block: 'nearest' })
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          el?.animate(
            [{ backgroundColor: 'var(--accent-soft)' }, { backgroundColor: 'transparent' }],
            { duration: 1600, easing: 'ease-out' }
          )
        }
      })
    } catch (e) {
      setExtraPosts((prev) => prev.filter((p) => p.id !== tempId))
      toast.error(errorMessage(e, '发布失败'), {
        duration: 8000,
        action: {
          label: '恢复编辑',
          onClick: () => setComposer({ mode: 'reply', post: replyTo, draft: raw })
        }
      })
    }
  }

  const canPost = topic?.details?.can_create_post !== false && !topic?.closed

  const tagNames = (topic?.tags ?? []).map(tagText)
  const tagIcons = useTagIcons(tagNames)

  const toolbar = (
    <Toolbar
      left={
        <IconButton label="返回" onClick={goBack}>
          <ArrowLeft size={18} />
        </IconButton>
      }
      title={topic?.title ?? '话题'}
      right={
        <>
          {topic && canPost && (
            <Button variant="primary" size="sm" icon={<Reply size={14} />} onClick={() => openReply()}>
              回复
            </Button>
          )}
          {topic && (
            <TopicNotificationMenu
              key={id}
              topicId={id}
              initial={topic.details?.notification_level}
            />
          )}
          <IconButton label="刷新" onClick={() => void refetch()} disabled={isRefetching}>
            <RefreshCw size={16} className={isRefetching ? 'spin' : undefined} />
          </IconButton>
          <IconButton
            label="在浏览器中打开"
            onClick={() => void window.api?.openExternal(`${LINUXDO_ORIGIN}/t/${id}`)}
          >
            <ExternalLink size={16} />
          </IconButton>
        </>
      }
    />
  )

  return (
    <PageScaffold ref={scrollRef} toolbar={toolbar}>
      {isLoading ? (
        <TopicDetailSkeleton />
      ) : isError || !topic ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : (
        <div className={styles.reader}>
          <header className={styles.head}>
            <h1 className={styles.title}>{topic.title}</h1>
            <div className={styles.meta}>
              <CategoryBadge categoryId={topic.category_id} size="md" />
              {topic.tags?.map((t) => (
                <Tag key={tagKey(t)}>
                  <SpriteIcon name={tagIcons[tagText(t)]} size={12} />
                  {tagText(t)}
                </Tag>
              ))}
              <span className={styles.metaStat}>
                <MessageSquare size={13} /> {compactNumber(topic.reply_count ?? topic.posts_count)}
              </span>
              <span className={styles.metaStat}>
                <Eye size={13} /> {compactNumber(topic.views)}
              </span>
              <span className={styles.metaTime}>{relativeTime(topic.created_at)}</span>
            </div>
          </header>

          <div className={styles.posts}>
            {posts.map((p) => (
              <Fragment key={p.id}>
                {gapsBefore.has(p.id) && (
                  <button
                    type="button"
                    className={styles.gap}
                    onClick={() => void loadGap(p.id)}
                    disabled={gapLoading != null}
                  >
                    {gapLoading === p.id && <Loader2 size={14} className="spin" />}
                    {p.id === headGapPostId
                      ? `查看之前的 ${gapsBefore.get(p.id)?.length} 条回复`
                      : `还有 ${gapsBefore.get(p.id)?.length} 条回复 · 点击加载`}
                  </button>
                )}
                {p.id === unreadBoundaryId && (
                  <div className={styles.unreadDivider} role="separator" aria-label="以下是未读回复">
                    <span className={styles.unreadLabel}>未读</span>
                  </div>
                )}
                <ErrorBoundary label={`#${p.post_number} 楼`}>
                  <PostView
                    post={p}
                    onReply={canPost ? openReply : undefined}
                    onQuote={canPost ? openQuote : undefined}
                    onEdit={(post) => void openEdit(post)}
                    onDeleted={() => setDeleted((s) => new Set(s).add(p.id))}
                    onJumpToPost={(n) => void jumpToPost(n)}
                  />
                </ErrorBoundary>
              </Fragment>
            ))}
          </div>

          <InfiniteSentinel
            onReach={() => void loadMore()}
            disabled={tailRemaining.length === 0 || hasMidGap}
            root={scrollRef}
          />
          {loadingMore && <Spinner label={`加载中… 剩余 ${tailRemaining.length} 帖`} />}
          {tailRemaining.length === 0 && posts.length > 3 && (
            <div className={styles.end}>— 已到底部 —</div>
          )}
        </div>
      )}

      {topic && (
        <TopicProgress
          current={Math.min(progress.current, topic.highest_post_number ?? topic.posts_count)}
          total={topic.highest_post_number ?? topic.posts_count}
          visible={progress.show}
          onTop={jumpToTop}
          onBottom={() => void jumpToBottom()}
          bottomBusy={tailLoading}
          unreadStart={unreadStart}
          onUnread={() => void jumpToUnread()}
          unreadBusy={unreadBusy}
        />
      )}

      {composer && (
        <Modal
          open
          onClose={guard.requestClose}
          attention={guard.attention}
          title={
            composer.mode === 'edit'
              ? '编辑'
              : composer.post
                ? `回复 #${composer.post.post_number}`
                : '回复话题'
          }
          width={720}
        >
          <div ref={composerBoxRef} onInput={pushReplyDraft}>
            <Composer
              key={
                composer.mode === 'edit'
                  ? `edit-${composer.post.id}`
                  : `reply-${composer.post?.id ?? 'topic'}`
              }
              initialValue={composer.mode === 'edit' ? composer.raw : (composer.draft ?? '')}
              submitting={submitting}
              submitLabel={composer.mode === 'edit' ? '保存' : '回复'}
              autoFocus
              minHeight={200}
              onCancel={guard.requestClose}
              onDirtyChange={guard.setDirty}
              onSubmit={(raw) => void submitComposer(raw)}
            />
          </div>
          {guard.confirming && (
            <DiscardBar onKeep={guard.keepEditing} onDiscard={guard.confirmDiscard} />
          )}
        </Modal>
      )}
    </PageScaffold>
  )
}

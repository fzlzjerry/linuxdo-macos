import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
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
import { InfiniteSentinel } from '../../components/ui/InfiniteSentinel'
import { ErrorState, Spinner } from '../../components/ui/states'
import { useTopic } from '../../lib/discourse/queries'
import { useBackNav } from '../../lib/useBackNav'
import { errorMessage } from '../../lib/errors'
import { renderMarkdown } from '../../lib/markdown'
import { discourse } from '../../lib/discourse/client'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { compactNumber, relativeTime } from '../../lib/format'
import { LINUXDO_ORIGIN } from '../../lib/discourse/urls'
import { tagKey, tagText, type Post } from '../../lib/discourse/types'
import { PostView } from './PostView'
import { TopicProgress } from './TopicProgress'
import { TopicDetailSkeleton } from './TopicDetailSkeleton'
import styles from './TopicPage.module.css'

type ComposerMode =
  | { mode: 'reply'; post?: Post; draft?: string }
  | { mode: 'edit'; post: Post; raw: string }

export function TopicPage(): JSX.Element {
  const { id: idParam } = useParams()
  const id = Number(idParam)
  const goBack = useBackNav()
  const auth = useAuth()
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: topic, isLoading, isError, error, refetch, isRefetching } = useTopic(id)

  const [extraPosts, setExtraPosts] = useState<Post[]>([])
  const [patches, setPatches] = useState<Map<number, Post>>(new Map())
  const [deleted, setDeleted] = useState<Set<number>>(new Set())
  const [loadingMore, setLoadingMore] = useState(false)
  const [composer, setComposer] = useState<ComposerMode | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [gapLoading, setGapLoading] = useState<number | null>(null)
  const [tailLoading, setTailLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 1, show: false })
  const guard = useDiscardGuard(composer != null, () => setComposer(null))

  useEffect(() => {
    setExtraPosts([])
    setPatches(new Map())
    setDeleted(new Set())
    setProgress({ current: 1, show: false })
    scrollRef.current?.scrollTo({ top: 0 })
  }, [id])

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
  const remaining = useMemo(() => {
    const loaded = new Set(posts.map((p) => p.id))
    return stream.filter((sid) => !loaded.has(sid) && !deleted.has(sid))
  }, [posts, stream, deleted])

  // Unloaded stream ids sitting immediately BEFORE each rendered post — the
  // holes left by jump-to-bottom. Filled strictly top-down (content is only
  // ever inserted below the marker; WKWebView has no scroll anchoring).
  const gapsBefore = useMemo(() => {
    const map = new Map<number, number[]>()
    if (stream.length === 0) return map
    const loaded = new Set(posts.map((p) => p.id))
    const indexOf = new Map<number, number>()
    stream.forEach((sid, i) => indexOf.set(sid, i))
    let prevIdx = -1
    for (const p of posts) {
      const idx = indexOf.get(p.id)
      if (idx === undefined) continue // optimistic posts aren't in the stream
      const missing: number[] = []
      for (let i = prevIdx + 1; i < idx; i++) {
        const sid = stream[i]
        if (!loaded.has(sid) && !deleted.has(sid)) missing.push(sid)
      }
      if (missing.length > 0) map.set(p.id, missing)
      prevIdx = idx
    }
    return map
  }, [posts, stream, deleted])

  const hasGap = gapsBefore.size > 0

  async function loadMore(): Promise<void> {
    // While a mid-stream gap exists the sentinel is disabled — loading
    // "remaining" would insert content above the viewport and jump the page.
    if (loadingMore || hasGap || remaining.length === 0) return
    setLoadingMore(true)
    try {
      const batch = await discourse.postsBatch(id, remaining.slice(0, 20))
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
      const batch = await discourse.postsBatch(id, ids.slice(0, 20))
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
    if (remaining.length === 0) {
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
    setComposer({ mode: 'reply', post })
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
      post_number: (posts.at(-1)?.post_number ?? 0) + 1,
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
                <Tag key={tagKey(t)}>{tagText(t)}</Tag>
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
                    还有 {gapsBefore.get(p.id)?.length} 条回复 · 点击加载
                  </button>
                )}
                <PostView
                  post={p}
                  onReply={canPost ? openReply : undefined}
                  onEdit={(post) => void openEdit(post)}
                  onDeleted={() => setDeleted((s) => new Set(s).add(p.id))}
                />
              </Fragment>
            ))}
          </div>

          <InfiniteSentinel
            onReach={() => void loadMore()}
            disabled={remaining.length === 0 || hasGap}
            root={scrollRef}
          />
          {loadingMore && <Spinner label={`加载中… 剩余 ${remaining.length} 帖`} />}
          {remaining.length === 0 && posts.length > 3 && (
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
          {guard.confirming && (
            <DiscardBar onKeep={guard.keepEditing} onDiscard={guard.confirmDiscard} />
          )}
        </Modal>
      )}
    </PageScaffold>
  )
}

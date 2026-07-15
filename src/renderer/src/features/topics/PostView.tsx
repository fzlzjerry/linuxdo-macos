import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Bookmark,
  CheckCircle2,
  Flag,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Quote,
  Reply,
  Trash2
} from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Menu, type MenuItem } from '../../components/ui/Menu'
import { relativeTime } from '../../lib/format'
import { discourse } from '../../lib/discourse/client'
import type { Post, UserStatus } from '../../lib/discourse/types'
import { reactionEmoji } from '../../lib/discourse/reactions'
import { absolutize, LINUXDO_ORIGIN } from '../../lib/discourse/urls'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { errorMessage } from '../../lib/errors'
import { CookedContent } from './CookedContent'
import { BoostSection } from './BoostSection'
import { ReactionBar } from './ReactionBar'
import { FlagModal } from './FlagModal'
import styles from './PostView.module.css'

/** Discourse trust levels 0–4 → a subtle pill accent. */
function trustClass(level: number): string {
  if (level >= 4) return styles.trust4
  if (level === 3) return styles.trust3
  if (level >= 1) return styles.trust12
  return styles.trust0
}

/** A flair_url that points at an image rather than an emoji shortcode. */
function isImageUrl(u: string): boolean {
  return /^(https?:)?\/\//i.test(u) || u.startsWith('/') || /\.(png|jpe?g|gif|svg|webp)(\?|$)/i.test(u)
}

function StatusEmoji({ status }: { status: UserStatus }): JSX.Element | null {
  if (!status.emoji) return null
  const e = reactionEmoji(status.emoji)
  return (
    <span className={styles.status} title={status.description}>
      {e.img ? (
        <img className={styles.statusImg} src={e.img} alt={status.description ?? status.emoji} />
      ) : (
        e.char
      )}
    </span>
  )
}

interface Props {
  post: Post
  onReply?: (post: Post) => void
  onQuote?: (post: Post, quote: string) => void
  onEdit?: (post: Post) => void
  onDeleted?: () => void
}

export function PostView({ post, onReply, onQuote, onEdit, onDeleted }: Props): JSX.Element {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const articleRef = useRef<HTMLElement>(null)
  const canVisitProfile = !!post.username && !post.pending
  const visitProfile = (): void => {
    if (canVisitProfile) navigate(`/u/${post.username}`)
  }
  const [bookmarked, setBookmarked] = useState(!!post.bookmarked)
  const [bookmarkId, setBookmarkId] = useState<number | null>(post.bookmark_id ?? null)
  const [bookmarkBusy, setBookmarkBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [accepted, setAccepted] = useState(!!post.accepted_answer)
  const [solveBusy, setSolveBusy] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)

  const edited = post.updated_at && post.created_at && post.updated_at !== post.created_at
  const groupTitle = post.user_title || post.primary_group_name
  const flairName = post.primary_group_name || post.flair_name
  const showFlair = !!post.flair_name && (!!post.flair_bg_color || !!post.flair_url)
  const flairImg = post.flair_url && isImageUrl(post.flair_url) ? absolutize(post.flair_url) : null

  function guard(): boolean {
    if (!auth.loggedIn) {
      toast.info('请先登录 linux.do')
      void auth.showLogin()
      return false
    }
    return true
  }

  async function toggleBookmark(): Promise<void> {
    if (!guard() || bookmarkBusy) return
    const willAdd = !bookmarked
    if (!willAdd && bookmarkId == null) {
      // Bookmarked on the server but the id never reached us — don't fake it.
      toast.warning('请在书签页移除该书签')
      return
    }
    setBookmarkBusy(true)
    setBookmarked(willAdd)
    try {
      if (willAdd) {
        const r = await discourse.bookmark(post.id, 'Post')
        setBookmarkId(r.id)
        toast.success('已加入书签')
      } else {
        const removedId = bookmarkId as number
        await discourse.unbookmark(removedId)
        setBookmarkId(null)
        toast.info('已移除书签', {
          action: {
            label: '撤销',
            onClick: () => {
              void discourse
                .bookmark(post.id, 'Post')
                .then((r) => {
                  setBookmarked(true)
                  setBookmarkId(r.id)
                })
                .catch((e) => toast.error(errorMessage(e)))
            }
          }
        })
      }
    } catch (e) {
      setBookmarked(!willAdd)
      toast.error(errorMessage(e))
    } finally {
      setBookmarkBusy(false)
    }
  }

  async function del(): Promise<void> {
    if (!guard()) return
    if (!confirmDel) {
      setConfirmDel(true)
      setTimeout(() => setConfirmDel(false), 3000)
      return
    }
    setBusy(true)
    try {
      await discourse.deletePost(post.id)
      toast.success('已删除')
      onDeleted?.()
    } catch (e) {
      toast.error(errorMessage(e, '删除失败'))
    } finally {
      setBusy(false)
      setConfirmDel(false)
    }
  }

  function copyLink(): void {
    void navigator.clipboard.writeText(`${LINUXDO_ORIGIN}/t/${post.topic_id}/${post.post_number}`)
    toast.success('链接已复制')
  }

  function quote(): void {
    const sel = window.getSelection()
    const selected =
      sel && !sel.isCollapsed && articleRef.current?.contains(sel.anchorNode)
        ? sel.toString().trim()
        : ''
    const block = `[quote="${post.username}, post:${post.post_number}, topic:${post.topic_id}"]\n${selected}\n[/quote]\n\n`
    onQuote?.(post, block)
  }

  async function toggleSolution(): Promise<void> {
    if (!guard() || solveBusy) return
    const next = !accepted
    setAccepted(next)
    setSolveBusy(true)
    try {
      if (next) await discourse.acceptSolution(post.id)
      else await discourse.unacceptSolution(post.id)
      toast.success(next ? '已采纳为答案' : '已取消采纳')
      // Re-sync the whole topic: accepting shifts the flag off any prior answer.
      void queryClient.invalidateQueries({ queryKey: ['topic', post.topic_id] })
    } catch (e) {
      setAccepted(!next)
      toast.error(errorMessage(e, '操作失败'))
    } finally {
      setSolveBusy(false)
    }
  }

  const moreItems: MenuItem[] = [
    ...(onQuote
      ? [{ key: 'quote', label: '引用回复', icon: <Quote size={15} />, onSelect: quote }]
      : []),
    { key: 'copy', label: '复制链接', icon: <Link2 size={15} />, onSelect: copyLink },
    {
      key: 'flag',
      label: '举报',
      icon: <Flag size={15} />,
      danger: true,
      onSelect: () => {
        if (guard()) setFlagOpen(true)
      }
    }
  ]

  return (
    <article
      ref={articleRef}
      className={`${styles.post} ${post.pending ? styles.pending : ''} ${accepted ? styles.accepted : ''}`}
      id={`post-${post.post_number}`}
    >
      <header className={styles.header}>
        {canVisitProfile ? (
          <button
            type="button"
            className={styles.userBtn}
            onClick={visitProfile}
            aria-label={`查看 @${post.username} 的主页`}
          >
            <Avatar template={post.avatar_template} username={post.username} name={post.name} size={40} />
          </button>
        ) : (
          <Avatar template={post.avatar_template} username={post.username} name={post.name} size={40} />
        )}
        <div className={styles.identity}>
          <div className={styles.nameLine}>
            {canVisitProfile ? (
              <button type="button" className={styles.nameBtn} onClick={visitProfile}>
                <span className={styles.name}>{post.name || post.username}</span>
              </button>
            ) : (
              <span className={styles.name}>{post.name || post.username}</span>
            )}
            {post.user_status && <StatusEmoji status={post.user_status} />}
            {post.username && post.name && <span className={styles.handle}>@{post.username}</span>}
            {post.trust_level != null && (
              <span
                className={`${styles.trust} ${trustClass(post.trust_level)}`}
                title={`信任等级 ${post.trust_level}`}
                aria-label={`信任等级 ${post.trust_level}`}
              >
                Lv{post.trust_level}
              </span>
            )}
            {(post.admin || post.moderator) && (
              <span className={styles.staff}>{post.admin ? '管理员' : '版主'}</span>
            )}
            {showFlair && (
              <span className={styles.flair} title={flairName ?? undefined}>
                {flairImg ? (
                  <img className={styles.flairImg} src={flairImg} alt="" />
                ) : post.flair_bg_color ? (
                  <span
                    className={styles.flairDot}
                    style={{ background: `#${post.flair_bg_color}` }}
                  />
                ) : null}
                {flairName && <span className={styles.flairName}>{flairName}</span>}
              </span>
            )}
            {groupTitle && !(showFlair && groupTitle === flairName) && (
              <span className={styles.groupTitle}>{groupTitle}</span>
            )}
          </div>
          <div className={styles.metaLine}>
            <time title={post.created_at}>{relativeTime(post.created_at)}</time>
            {edited && (
              <span className={styles.edited} title={`编辑于 ${relativeTime(post.updated_at)}`}>
                <Pencil size={11} /> 已编辑
              </span>
            )}
            {post.pending ? (
              <span className={styles.pendingChip}>
                <Loader2 size={11} className="spin" /> 发送中…
              </span>
            ) : (
              <span className={styles.postNo}>#{post.post_number}</span>
            )}
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <CookedContent html={post.cooked} />
        <BoostSection post={post} />
      </div>

      {post.pending ? null : (
      <footer className={styles.footer}>
        <ReactionBar post={post} />

        {onReply && (
          <button
            className={styles.action}
            onClick={() => onReply(post)}
            title="回复"
            aria-label="回复"
          >
            <Reply size={15} />
            {!!post.reply_count && post.reply_count > 0 && <span>{post.reply_count}</span>}
          </button>
        )}

        <button
          className={`${styles.action} ${bookmarked ? styles.bookmarked : ''}`}
          onClick={() => void toggleBookmark()}
          disabled={bookmarkBusy}
          aria-busy={bookmarkBusy}
          title={bookmarked ? '移除书签' : '加入书签'}
          aria-label={bookmarked ? '移除书签' : '加入书签'}
          aria-pressed={bookmarked}
        >
          <Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} />
        </button>

        {accepted ? (
          <button
            className={`${styles.action} ${styles.solved}`}
            onClick={() => void toggleSolution()}
            disabled={solveBusy || !post.can_unaccept_answer}
            title={post.can_unaccept_answer ? '取消采纳' : '已采纳为答案'}
            aria-label="已采纳为答案"
          >
            <CheckCircle2 size={15} fill="currentColor" stroke="var(--surface)" />
            <span>已采纳</span>
          </button>
        ) : (
          post.can_accept_answer && (
            <button
              className={styles.action}
              onClick={() => void toggleSolution()}
              disabled={solveBusy}
              title="采纳为答案"
              aria-label="采纳为答案"
            >
              <CheckCircle2 size={15} />
              <span>采纳</span>
            </button>
          )
        )}

        <span className={styles.spacer} />

        {(post.yours || post.can_edit) && onEdit && (
          <button
            className={styles.action}
            onClick={() => onEdit(post)}
            title="编辑"
            aria-label="编辑"
          >
            <Pencil size={15} />
          </button>
        )}
        {(post.yours || post.can_delete) && (
          <button
            className={`${styles.action} ${confirmDel ? styles.danger : ''}`}
            onClick={() => void del()}
            disabled={busy}
            title="删除"
            aria-label={confirmDel ? '确认删除' : '删除'}
          >
            <Trash2 size={15} />
            {confirmDel && <span>确定？</span>}
          </button>
        )}

        <Menu
          label="更多操作"
          triggerClassName={styles.action}
          trigger={<MoreHorizontal size={15} />}
          align="end"
          width={180}
          items={moreItems}
        />
      </footer>
      )}

      <FlagModal open={flagOpen} postId={post.id} onClose={() => setFlagOpen(false)} />
    </article>
  )
}

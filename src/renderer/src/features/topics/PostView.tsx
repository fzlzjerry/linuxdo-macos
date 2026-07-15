import { useState } from 'react'
import { Bookmark, Link2, Pencil, Reply, Trash2 } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { relativeTime } from '../../lib/format'
import { discourse } from '../../lib/discourse/client'
import type { Post, UserStatus } from '../../lib/discourse/types'
import { reactionEmoji } from '../../lib/discourse/reactions'
import { absolutize, LINUXDO_ORIGIN } from '../../lib/discourse/urls'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { CookedContent } from './CookedContent'
import { ReactionBar } from './ReactionBar'
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
  onEdit?: (post: Post) => void
  onDeleted?: () => void
}

export function PostView({ post, onReply, onEdit, onDeleted }: Props): JSX.Element {
  const auth = useAuth()
  const [bookmarked, setBookmarked] = useState(!!post.bookmarked)
  const [bookmarkId, setBookmarkId] = useState<number | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)

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
    if (!guard()) return
    const willAdd = !bookmarked
    setBookmarked(willAdd)
    try {
      if (willAdd) {
        const r = await discourse.bookmark(post.id, 'Post')
        setBookmarkId(r.id)
        toast.success('已加入书签')
      } else if (bookmarkId != null) {
        await discourse.unbookmark(bookmarkId)
        toast.info('已移除书签')
      }
    } catch {
      setBookmarked(!willAdd)
      toast.error('操作失败')
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
    } catch {
      toast.error('删除失败')
    } finally {
      setBusy(false)
      setConfirmDel(false)
    }
  }

  function copyLink(): void {
    void navigator.clipboard.writeText(`${LINUXDO_ORIGIN}/t/${post.topic_id}/${post.post_number}`)
    toast.success('链接已复制')
  }

  return (
    <article className={styles.post} id={`post-${post.post_number}`}>
      <header className={styles.header}>
        <Avatar template={post.avatar_template} username={post.username} name={post.name} size={40} />
        <div className={styles.identity}>
          <div className={styles.nameLine}>
            <span className={styles.name}>{post.name || post.username}</span>
            {post.user_status && <StatusEmoji status={post.user_status} />}
            {post.username && post.name && <span className={styles.handle}>@{post.username}</span>}
            {post.trust_level != null && (
              <span className={`${styles.trust} ${trustClass(post.trust_level)}`}>
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
            <span className={styles.postNo}>#{post.post_number}</span>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <CookedContent html={post.cooked} />
      </div>

      <footer className={styles.footer}>
        <ReactionBar post={post} />

        {onReply && (
          <button className={styles.action} onClick={() => onReply(post)} title="回复">
            <Reply size={15} />
            {!!post.reply_count && post.reply_count > 0 && <span>{post.reply_count}</span>}
          </button>
        )}

        <button
          className={`${styles.action} ${bookmarked ? styles.bookmarked : ''}`}
          onClick={() => void toggleBookmark()}
          title={bookmarked ? '移除书签' : '书签'}
        >
          <Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} />
        </button>

        <button className={styles.action} onClick={copyLink} title="复制链接">
          <Link2 size={15} />
        </button>

        <span className={styles.spacer} />

        {(post.yours || post.can_edit) && onEdit && (
          <button className={styles.action} onClick={() => onEdit(post)} title="编辑">
            <Pencil size={15} />
          </button>
        )}
        {(post.yours || post.can_delete) && (
          <button
            className={`${styles.action} ${confirmDel ? styles.danger : ''}`}
            onClick={() => void del()}
            disabled={busy}
            title="删除"
          >
            <Trash2 size={15} />
            {confirmDel && <span>确定？</span>}
          </button>
        )}
      </footer>
    </article>
  )
}

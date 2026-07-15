import { useState } from 'react'
import { Bookmark, Heart, Link2, Pencil, Reply, Trash2 } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { relativeTime } from '../../lib/format'
import { discourse } from '../../lib/discourse/client'
import { LIKE_ACTION_ID, type Post } from '../../lib/discourse/types'
import { LINUXDO_ORIGIN } from '../../lib/discourse/urls'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { CookedContent } from './CookedContent'
import styles from './PostView.module.css'

interface Props {
  post: Post
  onReply?: (post: Post) => void
  onEdit?: (post: Post) => void
  onDeleted?: () => void
}

export function PostView({ post, onReply, onEdit, onDeleted }: Props): JSX.Element {
  const auth = useAuth()
  const likeSummary = post.actions_summary?.find((a) => a.id === LIKE_ACTION_ID)

  const [liked, setLiked] = useState(!!likeSummary?.acted)
  const [likes, setLikes] = useState(likeSummary?.count ?? 0)
  const [bookmarked, setBookmarked] = useState(!!post.bookmarked)
  const [bookmarkId, setBookmarkId] = useState<number | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)

  const edited = post.updated_at && post.created_at && post.updated_at !== post.created_at
  const groupTitle = post.user_title || post.primary_group_name

  function guard(): boolean {
    if (!auth.loggedIn) {
      toast.info('请先登录 linux.do')
      void auth.showLogin()
      return false
    }
    return true
  }

  async function toggleLike(): Promise<void> {
    if (!guard()) return
    const willLike = !liked
    setLiked(willLike)
    setLikes((n) => n + (willLike ? 1 : -1))
    try {
      if (willLike) await discourse.like(post.id)
      else await discourse.unlike(post.id)
    } catch {
      setLiked(!willLike)
      setLikes((n) => n + (willLike ? -1 : 1))
      toast.error('操作失败')
    }
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
            {post.username && post.name && <span className={styles.handle}>@{post.username}</span>}
            {(post.admin || post.moderator) && (
              <span className={styles.staff}>{post.admin ? '管理员' : '版主'}</span>
            )}
            {groupTitle && <span className={styles.groupTitle}>{groupTitle}</span>}
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
        <button
          className={`${styles.action} ${liked ? styles.liked : ''}`}
          onClick={() => void toggleLike()}
          title={liked ? '取消赞' : '赞'}
        >
          <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
          {likes > 0 && <span>{likes}</span>}
        </button>

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

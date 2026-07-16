import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Bookmark, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Button } from '../../components/ui/Button'
import { IconButton } from '../../components/ui/IconButton'
import { CategoryBadge } from '../../components/ui/CategoryBadge'
import { Tag } from '../../components/ui/Tag'
import { LoginGate } from '../../components/ui/LoginGate'
import { EmptyState, ErrorState, ListSkeleton } from '../../components/ui/states'
import { useBookmarks } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { errorMessage } from '../../lib/errors'
import { useListNav } from '../../lib/useListNav'
import { useFocusMemory } from '../../lib/useFocusMemory'
import { absoluteTime, relativeTime } from '../../lib/format'
import {
  tagKey,
  tagText,
  type BookmarkItem,
  type BookmarksResponse
} from '../../lib/discourse/types'
import styles from './BookmarksPage.module.css'

/** Strip HTML tags and decode entities to a single line of plain text. */
function toPlainText(html: string | undefined): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Immutable add/remove on a numeric id set. */
function toggled(set: ReadonlySet<number>, id: number, on: boolean): ReadonlySet<number> {
  const next = new Set(set)
  if (on) next.add(id)
  else next.delete(id)
  return next
}

export function BookmarksPage(): JSX.Element {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, isError, error, refetch, isRefetching } = useBookmarks(
    auth.loggedIn ? auth.username : undefined
  )

  // Rows optimistically removed, and rows whose undo re-creation is in flight.
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set())
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set())

  useListNav(scrollRef)
  useFocusMemory(scrollRef, 'bookmarks', !isLoading && !!data)

  /** Optimistic removal: hide the row at once; the toast offers an undo. */
  async function removeBookmark(bookmark: BookmarkItem): Promise<void> {
    const id = bookmark.id
    setHidden((s) => toggled(s, id, true))
    try {
      await discourse.unbookmark(id)
    } catch (e) {
      setHidden((s) => toggled(s, id, false))
      toast.error(errorMessage(e, '移除失败，请重试'))
      return
    }
    toast.info('已移除书签', {
      action: { label: '撤销', onClick: () => void restoreBookmark(bookmark) }
    })
  }

  /** Undo: bring the row back right away, then re-create the bookmark. */
  async function restoreBookmark(bookmark: BookmarkItem): Promise<void> {
    const id = bookmark.id
    setHidden((s) => toggled(s, id, false))
    setBusy((s) => toggled(s, id, true))
    try {
      // Pass the type through verbatim — the list also carries ChatMessage
      // bookmarks; coercing those to 'Post' would rebuild onto a wrong object.
      const r = await discourse.bookmark(bookmark.bookmarkable_id, bookmark.bookmarkable_type)
      // The server issued a fresh id — patch the cache so removing this row
      // again targets the new bookmark rather than the deleted one. If a
      // refetch replaced the cache meanwhile (the row is gone), re-append it.
      queryClient.setQueryData<BookmarksResponse>(['bookmarks', auth.username], (old) => {
        if (!old?.user_bookmark_list) return old
        const rows = old.user_bookmark_list.bookmarks
        const next = rows.some((b) => b.id === id)
          ? rows.map((b) => (b.id === id ? { ...b, id: r.id } : b))
          : [{ ...bookmark, id: r.id }, ...rows]
        return {
          ...old,
          user_bookmark_list: { ...old.user_bookmark_list, bookmarks: next }
        }
      })
    } catch (e) {
      setHidden((s) => toggled(s, id, true))
      toast.error(errorMessage(e, '恢复书签失败'))
    } finally {
      setBusy((s) => toggled(s, id, false))
    }
  }

  const bookmarks = (data?.user_bookmark_list?.bookmarks ?? []).filter((b) => !hidden.has(b.id))

  if (!auth.loggedIn) {
    return (
      <PageScaffold toolbar={<Toolbar title="书签" />}>
        <LoginGate
          icon={<Bookmark size={26} strokeWidth={1.6} />}
          title="登录后查看书签"
          description="登录后可在这里查看你收藏的帖子。"
        />
      </PageScaffold>
    )
  }

  return (
    <PageScaffold
      ref={scrollRef}
      toolbar={
        <Toolbar
          title="书签"
          right={
            <IconButton label="刷新" onClick={() => void refetch()} disabled={isRefetching}>
              <RefreshCw size={16} className={isRefetching ? 'spin' : undefined} />
            </IconButton>
          }
        />
      }
    >
      {isLoading ? (
        <ListSkeleton leading="avatar" />
      ) : isError ? (
        <ErrorState
          error={error}
          onRetry={() => void refetch()}
          onLogin={() => void auth.showLogin()}
        />
      ) : bookmarks.length === 0 ? (
        <EmptyState
          icon={<Bookmark size={26} strokeWidth={1.6} />}
          title="还没有书签"
          description="在帖子上点击书签图标即可收藏"
          action={
            <Button variant="primary" onClick={() => navigate('/latest')}>
              去逛最新
            </Button>
          }
        />
      ) : (
        bookmarks.map((bookmark) => (
          <BookmarkRow
            key={bookmark.id}
            bookmark={bookmark}
            removing={busy.has(bookmark.id)}
            onOpen={() => bookmark.topic_id && navigate(`/t/${bookmark.topic_id}`)}
            onRemove={() => void removeBookmark(bookmark)}
          />
        ))
      )}
    </PageScaffold>
  )
}

function BookmarkRow({
  bookmark,
  removing,
  onOpen,
  onRemove
}: {
  bookmark: BookmarkItem
  removing: boolean
  onOpen: () => void
  onRemove: () => void
}): JSX.Element {
  const title = toPlainText(bookmark.fancy_title || bookmark.title) || bookmark.name || '（无标题）'
  const excerpt = toPlainText(bookmark.excerpt)

  return (
    <div className={styles.row}>
      {/* Primary action: a real button under the content (a button can't
          contain the trailing IconButton, so the row itself is a div). */}
      <button
        type="button"
        className={styles.overlay}
        data-row
        data-row-id={bookmark.id}
        aria-label={title}
        onClick={onOpen}
      />

      <div className={styles.main}>
        <div className={styles.titleLine}>
          <span className={styles.title}>{title}</span>
        </div>

        <div className={styles.metaLine}>
          {bookmark.category_id != null && <CategoryBadge categoryId={bookmark.category_id} />}
          {bookmark.tags?.slice(0, 3).map((tag) => (
            <Tag key={tagKey(tag)}>{tagText(tag)}</Tag>
          ))}
          <span className={styles.time} title={absoluteTime(bookmark.created_at)}>
            {relativeTime(bookmark.created_at)}
          </span>
        </div>

        {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
      </div>

      <span className={styles.actions}>
        <IconButton label="移除书签" className={styles.remove} disabled={removing} onClick={onRemove}>
          {removing ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
        </IconButton>
      </span>
    </div>
  )
}

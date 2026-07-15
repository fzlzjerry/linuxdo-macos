import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bookmark, Trash2 } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Button } from '../../components/ui/Button'
import { IconButton } from '../../components/ui/IconButton'
import { CategoryBadge } from '../../components/ui/CategoryBadge'
import { EmptyState, ErrorState, TopicListSkeleton } from '../../components/ui/states'
import { useBookmarks } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { relativeTime } from '../../lib/format'
import { tagKey, tagText, type BookmarkItem } from '../../lib/discourse/types'
import styles from './BookmarksPage.module.css'

/** Strip HTML tags and decode entities to a single line of plain text. */
function toPlainText(html: string | undefined): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function BookmarksPage(): JSX.Element {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useBookmarks(
    auth.loggedIn ? auth.username : undefined
  )

  const remove = useMutation({
    mutationFn: (bookmarkId: number) => discourse.unbookmark(bookmarkId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      toast.info('已移除书签')
    },
    onError: () => toast.error('移除失败，请重试')
  })
  const removingId = remove.isPending ? remove.variables : undefined

  const bookmarks = data?.user_bookmark_list?.bookmarks ?? []

  if (!auth.loggedIn) {
    return (
      <PageScaffold toolbar={<Toolbar title="书签" />}>
        <EmptyState
          icon={<Bookmark size={26} strokeWidth={1.6} />}
          title="登录后查看书签"
          action={
            <Button variant="primary" onClick={() => void auth.showLogin()}>
              登录 linux.do
            </Button>
          }
        />
      </PageScaffold>
    )
  }

  return (
    <PageScaffold toolbar={<Toolbar title="书签" />}>
      {isLoading ? (
        <TopicListSkeleton />
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
        />
      ) : (
        bookmarks.map((bookmark) => (
          <BookmarkRow
            key={bookmark.id}
            bookmark={bookmark}
            removing={removingId === bookmark.id}
            onOpen={() => bookmark.topic_id && navigate(`/t/${bookmark.topic_id}`)}
            onRemove={() => remove.mutate(bookmark.id)}
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
    <div
      className={styles.row}
      role="button"
      tabIndex={0}
      aria-label={title}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <div className={styles.main}>
        <div className={styles.titleLine}>
          <span className={styles.title}>{title}</span>
        </div>

        <div className={styles.metaLine}>
          {bookmark.category_id != null && <CategoryBadge categoryId={bookmark.category_id} />}
          {bookmark.tags?.slice(0, 3).map((tag) => (
            <span key={tagKey(tag)} className={styles.tag}>
              {tagText(tag)}
            </span>
          ))}
          <span className={styles.time}>{relativeTime(bookmark.created_at)}</span>
        </div>

        {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
      </div>

      <IconButton
        label="移除"
        className={styles.remove}
        disabled={removing}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        <Trash2 size={16} />
      </IconButton>
    </div>
  )
}

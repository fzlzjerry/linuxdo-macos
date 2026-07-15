import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, Trash2 } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Button } from '../../components/ui/Button'
import { IconButton } from '../../components/ui/IconButton'
import { EmptyState, ErrorState, TopicListSkeleton } from '../../components/ui/states'
import { useDrafts } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { relativeTime } from '../../lib/format'
import type { DraftItem } from '../../lib/discourse/types'
import styles from './DraftsPage.module.css'

/** Human label for a draft, derived from its Discourse draft_key. */
function draftLabel(key: string): string {
  if (key === 'new_topic') return '新话题草稿'
  if (key === 'new_private_message') return '新私信草稿'
  if (key.startsWith('topic_')) return '话题回复草稿'
  return key
}

/** Strip HTML tags from an excerpt and collapse whitespace to plain text. */
function htmlToText(html: string | undefined): string {
  if (!html) return ''
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function DraftsPage(): JSX.Element {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState<Set<string>>(new Set())

  const { data, isLoading, isError, error, refetch } = useDrafts(auth.loggedIn)

  const handleDelete = useCallback(
    async (draft: DraftItem): Promise<void> => {
      setDeleting((s) => new Set(s).add(draft.draft_key))
      try {
        await discourse.deleteDraft(draft.draft_key, draft.sequence)
        await queryClient.invalidateQueries({ queryKey: ['drafts'] })
        toast.info('草稿已删除')
      } catch {
        toast.error('删除失败，请重试')
      } finally {
        setDeleting((s) => {
          const next = new Set(s)
          next.delete(draft.draft_key)
          return next
        })
      }
    },
    [queryClient]
  )

  if (!auth.loggedIn) {
    return (
      <PageScaffold toolbar={<Toolbar title="草稿" />}>
        <EmptyState
          icon={<FileText size={26} strokeWidth={1.6} />}
          title="登录后查看草稿"
          description="草稿会同步到你的 linux.do 账号。"
          action={
            <Button variant="primary" onClick={() => void auth.showLogin()}>
              登录 linux.do
            </Button>
          }
        />
      </PageScaffold>
    )
  }

  const drafts = data?.drafts ?? []

  return (
    <PageScaffold toolbar={<Toolbar title="草稿" />}>
      {isLoading ? (
        <TopicListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : drafts.length === 0 ? (
        <EmptyState
          icon={<FileText size={26} strokeWidth={1.6} />}
          title="没有草稿"
          description="你还没有未完成的草稿。"
        />
      ) : (
        <div className={styles.list}>
          {drafts.map((d) => (
            <DraftRow
              key={d.draft_key}
              draft={d}
              deleting={deleting.has(d.draft_key)}
              onOpen={() => d.topic_id != null && navigate(`/t/${d.topic_id}`)}
              onDelete={() => void handleDelete(d)}
            />
          ))}
        </div>
      )}
    </PageScaffold>
  )
}

function DraftRow({
  draft,
  deleting,
  onOpen,
  onDelete
}: {
  draft: DraftItem
  deleting: boolean
  onOpen: () => void
  onDelete: () => void
}): JSX.Element {
  const clickable = draft.topic_id != null
  const label = draftLabel(draft.draft_key)
  const title = draft.title?.trim()
  const excerpt = htmlToText(draft.excerpt)
  const time = relativeTime(draft.created_at || draft.updated_at)

  return (
    <div
      className={`${styles.row} ${clickable ? styles.clickable : ''}`}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen()
              }
            }
          : undefined
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? title || label : undefined}
    >
      <span className={styles.icon} aria-hidden>
        <FileText size={18} strokeWidth={1.7} />
      </span>

      <div className={styles.main}>
        <div className={styles.titleLine}>
          <span className={styles.badge}>{label}</span>
          {title && <span className={styles.title}>{title}</span>}
        </div>
        {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
        {time && <span className={styles.time}>{time}</span>}
      </div>

      <IconButton
        label="删除"
        className={styles.delete}
        disabled={deleting}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        {deleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
      </IconButton>
    </div>
  )
}

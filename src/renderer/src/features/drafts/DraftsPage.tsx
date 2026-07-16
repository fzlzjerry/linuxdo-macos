import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Button } from '../../components/ui/Button'
import { IconButton } from '../../components/ui/IconButton'
import { Tag } from '../../components/ui/Tag'
import { LoginGate } from '../../components/ui/LoginGate'
import { EmptyState, ErrorState, ListSkeleton } from '../../components/ui/states'
import { useDrafts } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { NewTopicModal } from '../../components/composer/NewTopicModal'
import { NewMessageModal } from '../messages/NewMessageModal'
import { parseDraftContent } from '../../lib/discourse/draftContent'
import { useAuth } from '../../store/auth'
import { useComposerStore } from '../../store/composer'
import { toast } from '../../store/toast'
import { useListNav } from '../../lib/useListNav'
import { useFocusMemory } from '../../lib/useFocusMemory'
import { absoluteTime, relativeTime } from '../../lib/format'
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const [resume, setResume] = useState<{ kind: 'topic' | 'pm'; draft: DraftItem } | null>(null)

  const { data, isLoading, isError, error, refetch, isRefetching } = useDrafts(auth.loggedIn)

  useListNav(scrollRef)
  useFocusMemory(scrollRef, 'drafts', !isLoading && !!data)

  /** Silently drop a draft once its resumed content is posted. */
  const dropDraft = useCallback(
    async (draft: DraftItem): Promise<void> => {
      try {
        await discourse.deleteDraft(draft.draft_key, draft.sequence)
        await queryClient.invalidateQueries({ queryKey: ['drafts'] })
      } catch {
        /* the fresh post already exists; a stale draft is harmless */
      }
    },
    [queryClient]
  )

  function openDraft(draft: DraftItem): void {
    if (draft.draft_key === 'new_topic') setResume({ kind: 'topic', draft })
    else if (draft.draft_key === 'new_private_message') setResume({ kind: 'pm', draft })
    else if (draft.topic_id != null) navigate(`/t/${draft.topic_id}`)
  }

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
        <LoginGate
          icon={<FileText size={26} strokeWidth={1.6} />}
          title="登录后查看草稿"
          description="草稿会同步到你的 linux.do 账号。"
        />
      </PageScaffold>
    )
  }

  const drafts = data?.drafts ?? []

  return (
    <PageScaffold
      ref={scrollRef}
      toolbar={
        <Toolbar
          title="草稿"
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
        <ErrorState error={error} onRetry={() => void refetch()} onLogin={() => void auth.showLogin()} />
      ) : drafts.length === 0 ? (
        <EmptyState
          icon={<FileText size={26} strokeWidth={1.6} />}
          title="没有草稿"
          description="你还没有未完成的草稿。"
          action={
            <Button variant="primary" onClick={() => useComposerStore.getState().openNewTopic()}>
              发新帖
            </Button>
          }
        />
      ) : (
        <div className={styles.list}>
          {drafts.map((d) => (
            <DraftRow
              key={d.draft_key}
              draft={d}
              deleting={deleting.has(d.draft_key)}
              onOpen={() => openDraft(d)}
              onDelete={() => void handleDelete(d)}
            />
          ))}
        </div>
      )}

      {resume?.kind === 'topic' && (
        <NewTopicModal
          open
          initialDraft={parseDraftContent(resume.draft.draft)}
          onCreated={() => void dropDraft(resume.draft)}
          onClose={() => setResume(null)}
        />
      )}
      {resume?.kind === 'pm' && (
        <NewMessageModal
          open
          initialDraft={parseDraftContent(resume.draft.draft)}
          onCreated={() => {
            void dropDraft(resume.draft)
            setResume(null)
          }}
          onClose={() => setResume(null)}
        />
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
  const clickable =
    draft.topic_id != null ||
    draft.draft_key === 'new_topic' ||
    draft.draft_key === 'new_private_message'
  const label = draftLabel(draft.draft_key)
  const title = draft.title?.trim()
  const excerpt = htmlToText(draft.excerpt)
  const timeIso = draft.created_at || draft.updated_at
  const time = relativeTime(timeIso)

  return (
    <div className={clickable ? styles.row : styles.rowStatic}>
      {clickable && (
        <button
          type="button"
          className={styles.overlay}
          data-row
          data-row-id={draft.draft_key}
          aria-label={title || label}
          onClick={onOpen}
        />
      )}

      <span className={styles.icon} aria-hidden>
        <FileText size={18} strokeWidth={1.7} />
      </span>

      <div className={styles.main}>
        <div className={styles.titleLine}>
          <Tag>{label}</Tag>
          {title && <span className={styles.title}>{title}</span>}
        </div>
        {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
        {time && (
          <span className={styles.time} title={absoluteTime(timeIso)}>
            {time}
          </span>
        )}
      </div>

      <span className={styles.actions}>
        <IconButton label="删除草稿" className={styles.delete} disabled={deleting} onClick={onDelete}>
          {deleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
        </IconButton>
      </span>
    </div>
  )
}

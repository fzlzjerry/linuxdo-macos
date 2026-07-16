import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { Composer } from './Composer'
import { TagsInput } from './TagsInput'
import { DiscardBar, useDiscardGuard } from './useDiscardGuard'
import { fetchDrafts, useCategories } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import {
  draftSavedHintStyle,
  useDraftAutosave,
  useDraftSavedFlash
} from '../../lib/useDraftAutosave'
import { parseDraftContent, type DraftContent } from '../../lib/discourse/draftContent'
import styles from './NewTopicModal.module.css'

const DRAFT_KEY = 'new_topic' // Discourse's composer key for a fresh topic

/** Result of the on-open probe for an existing server draft under DRAFT_KEY. */
interface DraftProbe {
  done: boolean
  sequence?: number
  /** set when the probed draft was actually seeded into the form */
  seeded?: DraftContent
}

interface Props {
  open: boolean
  onClose: () => void
  /** Prefill the form when resuming a saved draft. */
  initialDraft?: DraftContent
  /** Fired after the topic is successfully created (before navigation). */
  onCreated?: () => void
}

export function NewTopicModal({ open, onClose, initialDraft, onCreated }: Props): JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data } = useCategories()
  const categories = (data?.category_list.categories ?? []).filter((c) => !c.parent_category_id)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<number | ''>('')
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ title?: string; category?: string }>({})
  const [bodyDirty, setBodyDirty] = useState(false)
  const [session, setSession] = useState(0)

  // ---- Server draft autosave (draft_key 'new_topic', Discourse convention).
  // The composer body isn't lifted into state, so it's read from the DOM; the
  // last seen value is kept for the moments the textarea is unmounted (preview
  // tab). All draft I/O is silent — it's a background safety net.
  const formRef = useRef<HTMLDivElement>(null)
  const lastBodyRef = useRef(initialDraft?.reply ?? '')
  const { savedVisible, flashSaved } = useDraftSavedFlash()
  const confirmingRef = useRef(false)

  // On open without a resume payload, probe /drafts for an existing draft
  // under this key: saveDraft always force-saves, so writing blind would
  // silently overwrite a draft written on the web. A hit is seeded into the
  // form like a resume and its sequence continues the same server draft.
  const [probe, setProbe] = useState<DraftProbe>({ done: false })
  const resumedDraft = initialDraft ?? probe.seeded

  // Autosave arms only after the probe settles, so the first save carries the
  // right sequence. Resume via DraftsPage has no sequence — discard() then
  // resolves it from /drafts before deleting.
  const autosave = useDraftAutosave(
    open && probe.done ? DRAFT_KEY : null,
    initialDraft ? undefined : probe.sequence,
    flashSaved
  )

  // Render-scope mirror so the async probe can tell whether the user already
  // started typing (in which case seeding would clobber their input).
  const formDirtyRef = useRef(false)
  formDirtyRef.current = bodyDirty || title.trim().length > 0 || tags.trim().length > 0

  function captureBody(): string {
    const ta = formRef.current?.querySelector('textarea')
    if (ta) lastBodyRef.current = ta.value
    return lastBodyRef.current
  }

  // Field names mirror what draftContent.ts parses back (reply/title/
  // categoryId/tags), plus the action/archetype markers Discourse itself uses.
  function buildDraftData(): Record<string, unknown> | null {
    const reply = captureBody()
    const tagList = tags
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (!title.trim() && !reply.trim() && tagList.length === 0) return null
    const data: Record<string, unknown> = {
      reply,
      title,
      tags: tagList,
      action: 'createTopic',
      archetypeId: 'regular'
    }
    if (category !== '') data.categoryId = Number(category)
    return data
  }

  function scheduleDraftSave(): void {
    if (!open || submitting) return
    autosave.update(buildDraftData())
  }

  // Guarded close. Confirmed「丢弃」deletes the server draft only when that is
  // informed — this session actually saved, or the user saw resumed/seeded
  // content; otherwise skip the network delete so "open, type one char,
  // discard" can't kill a draft written on the web (closing disarms the hook,
  // which is all the local stop needed). A plain close keeps the draft
  // (snapshot + flush) — unless the content was emptied out after a save this
  // session, where keeping it would resurrect stale content.
  function handleDraftClose(): void {
    if (confirmingRef.current) {
      if (autosave.hasSaved() || resumedDraft) void autosave.discard(DRAFT_KEY)
    } else {
      const data = buildDraftData()
      if (data === null && autosave.hasSaved()) {
        void autosave.discard(DRAFT_KEY)
      } else {
        autosave.update(data)
        void autosave.flush()
      }
    }
    onClose()
  }

  const guard = useDiscardGuard(open, handleDraftClose)
  confirmingRef.current = guard.confirming

  // Fresh form every open — discarded/submitted content doesn't linger.
  // When resuming a draft, seed the fields from it instead of clearing.
  useEffect(() => {
    if (!open) return
    setSession((s) => s + 1)
    setTitle(initialDraft?.title ?? '')
    setCategory(initialDraft?.categoryId ?? '')
    setTags(initialDraft?.tags?.join(', ') ?? '')
    setErrors({})
    setBodyDirty(false)
    lastBodyRef.current = initialDraft?.reply ?? ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Probe for an existing server draft (see DraftProbe above). Failures are
  // silent — the composer just behaves like a fresh form.
  useEffect(() => {
    if (!open) {
      setProbe((p) => (p.done ? { done: false } : p))
      return
    }
    if (initialDraft || !useAuth.getState().loggedIn) {
      setProbe({ done: true })
      return
    }
    let cancelled = false
    fetchDrafts(queryClient)
      .then((res) => {
        if (cancelled) return
        const item = res.drafts.find((d) => d.draft_key === DRAFT_KEY)
        if (!item) {
          setProbe({ done: true })
        } else if (formDirtyRef.current) {
          // The user beat the probe to it — keep their input, but continue
          // the existing draft's sequence instead of forking/overwriting it.
          setProbe({ done: true, sequence: item.sequence })
        } else {
          const content = parseDraftContent(item.draft)
          setTitle(content.title ?? '')
          setCategory(content.categoryId ?? '')
          setTags(content.tags?.join(', ') ?? '')
          setBodyDirty(false)
          lastBodyRef.current = content.reply ?? ''
          setSession((s) => s + 1) // remount the Composer with the drafted body
          setProbe({ done: true, sequence: item.sequence, seeded: content })
        }
      })
      .catch(() => {
        if (!cancelled) setProbe({ done: true })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // The guard protects the whole form, not just the composer body.
  const { setDirty } = guard
  useEffect(() => {
    setDirty(bodyDirty || title.trim().length > 0 || tags.trim().length > 0)
  }, [bodyDirty, title, tags, setDirty])

  // Autosave on state-driven edits (title/category/tags, body dirty
  // transitions); per-keystroke body edits come in via the form's onInput.
  // probe.done also triggers so content typed before the probe settled (while
  // the hook was still disarmed) gets scheduled once it arms.
  useEffect(() => {
    if (!open || submitting) return
    autosave.update(buildDraftData())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, category, tags, bodyDirty, probe.done])

  async function submit(raw: string): Promise<void> {
    const next: typeof errors = {}
    if (title.trim().length < 3) next.title = '标题至少需要 3 个字'
    if (category === '') next.category = '请选择一个分类'
    setErrors(next)
    if (next.title || next.category) return
    setSubmitting(true)
    try {
      const post = await discourse.createTopic({
        title: title.trim(),
        raw,
        category: Number(category),
        tags: tags
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
      })
      void autosave.discard(DRAFT_KEY) // published — the server draft is obsolete
      toast.success('话题已发布')
      onCreated?.()
      onClose()
      setTitle('')
      setTags('')
      setCategory('')
      if (post.topic_id) navigate('/t/' + post.topic_id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发布失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={guard.requestClose}
      attention={guard.attention}
      title={
        <>
          发布新话题
          <span aria-hidden="true" style={draftSavedHintStyle(savedVisible)}>
            已存草稿
          </span>
        </>
      }
      width={760}
    >
      <div className={styles.form} ref={formRef} onInput={scheduleDraftSave}>
        <Field label="标题" hideLabel error={errors.title} required>
          <input
            className={styles.title}
            placeholder="标题"
            value={title}
            autoFocus
            disabled={submitting}
            onChange={(e) => {
              setTitle(e.target.value)
              if (errors.title) setErrors((p) => ({ ...p, title: undefined }))
            }}
          />
        </Field>
        <div className={styles.row}>
          <Field label="分类" hideLabel error={errors.category} required className={styles.selectField}>
            <select
              value={category}
              disabled={submitting}
              onChange={(e) => {
                setCategory(e.target.value === '' ? '' : Number(e.target.value))
                if (errors.category) setErrors((p) => ({ ...p, category: undefined }))
              }}
            >
              <option value="">选择分类…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <TagsInput
            className={styles.tagsField}
            value={tags}
            onChange={setTags}
            disabled={submitting}
            placeholder="标签（输入匹配已有标签，可选）"
            aria-label="标签"
          />
        </div>
        <Composer
          key={session}
          initialValue={resumedDraft?.reply ?? ''}
          submitting={submitting}
          submitLabel="发布"
          minHeight={220}
          placeholder="正文…（支持 Markdown）"
          onCancel={guard.requestClose}
          onDirtyChange={setBodyDirty}
          onSubmit={(raw) => void submit(raw)}
        />
        {guard.confirming && (
          <DiscardBar onKeep={guard.keepEditing} onDiscard={guard.confirmDiscard} />
        )}
      </div>
    </Modal>
  )
}

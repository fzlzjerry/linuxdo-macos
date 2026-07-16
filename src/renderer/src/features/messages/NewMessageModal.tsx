import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../components/ui/Modal'
import { Field } from '../../components/ui/Field'
import { Composer } from '../../components/composer/Composer'
import { DiscardBar, useDiscardGuard } from '../../components/composer/useDiscardGuard'
import { RecipientsInput } from './RecipientsInput'
import { discourse } from '../../lib/discourse/client'
import { fetchDrafts } from '../../lib/discourse/queries'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import {
  draftSavedHintStyle,
  useDraftAutosave,
  useDraftSavedFlash
} from '../../lib/useDraftAutosave'
import { parseDraftContent, type DraftContent } from '../../lib/discourse/draftContent'
import styles from './MessagesPage.module.css'

const DRAFT_KEY = 'new_private_message' // Discourse's composer key for a fresh PM

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
  onCreated?: (topicId: number) => void
  /** Prefill recipients/title/body when resuming a saved draft. */
  initialDraft?: DraftContent
}

export function NewMessageModal({ open, onClose, onCreated, initialDraft }: Props): JSX.Element {
  const queryClient = useQueryClient()
  const [recipients, setRecipients] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ recipients?: string; title?: string }>({})
  const [bodyDirty, setBodyDirty] = useState(false)
  // Bumped to remount the Composer when a probed draft seeds the body.
  const [session, setSession] = useState(0)

  // ---- Server draft autosave (draft_key 'new_private_message', Discourse
  // convention). Body text lives inside Composer, so it's read from the DOM;
  // the last seen value covers the preview tab (textarea unmounted). All
  // draft I/O is silent — it's a background safety net.
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
  formDirtyRef.current = bodyDirty || recipients.trim().length > 0 || title.trim().length > 0

  function captureBody(): string {
    const ta = formRef.current?.querySelector('textarea')
    if (ta) lastBodyRef.current = ta.value
    return lastBodyRef.current
  }

  // Field names mirror what draftContent.ts parses back (reply/title/
  // recipients), plus the action/archetype markers Discourse itself uses.
  function buildDraftData(): Record<string, unknown> | null {
    const reply = captureBody()
    if (!recipients.trim() && !title.trim() && !reply.trim()) return null
    return {
      reply,
      title,
      recipients: recipients.trim(),
      action: 'privateMessage',
      archetypeId: 'private_message'
    }
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

  // Seed fields when opened to resume a draft (normal opens keep prior behavior).
  useEffect(() => {
    if (!open || !initialDraft) return
    setRecipients(initialDraft.recipients ?? '')
    setTitle(initialDraft.title ?? '')
    setBodyDirty(false)
    lastBodyRef.current = initialDraft.reply ?? ''
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
          setRecipients(content.recipients ?? '')
          setTitle(content.title ?? '')
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

  const { setDirty } = guard
  useEffect(() => {
    setDirty(bodyDirty || recipients.trim().length > 0 || title.trim().length > 0)
  }, [bodyDirty, recipients, title, setDirty])

  // Autosave on state-driven edits (recipients/title, body dirty
  // transitions); per-keystroke body edits come in via the form's onInput.
  // probe.done also triggers so content typed before the probe settled (while
  // the hook was still disarmed) gets scheduled once it arms.
  useEffect(() => {
    if (!open || submitting) return
    autosave.update(buildDraftData())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipients, title, bodyDirty, probe.done])

  async function submit(raw: string): Promise<void> {
    const next: typeof errors = {}
    if (!recipients.trim()) next.recipients = '请填写收件人'
    if (!title.trim()) next.title = '请填写标题'
    setErrors(next)
    if (next.recipients || next.title) return
    setSubmitting(true)
    try {
      const result = await discourse.createMessage({
        title: title.trim(),
        raw,
        recipients: recipients.trim()
      })
      void autosave.discard(DRAFT_KEY) // sent — the server draft is obsolete
      toast.success('私信已发送')
      setRecipients('')
      setTitle('')
      onCreated?.(result.topic_id)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发送失败')
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
          写私信
          <span aria-hidden="true" style={draftSavedHintStyle(savedVisible)}>
            已存草稿
          </span>
        </>
      }
      width={720}
    >
      <div ref={formRef} onInput={scheduleDraftSave}>
        <div className={styles.fields}>
          <Field label="收件人" error={errors.recipients} required>
            <RecipientsInput
              value={recipients}
              autoFocus
              disabled={submitting}
              onChange={(v) => {
                setRecipients(v)
                if (errors.recipients) setErrors((p) => ({ ...p, recipients: undefined }))
              }}
            />
          </Field>
          <Field label="标题" error={errors.title} required>
            <input
              type="text"
              value={title}
              placeholder="私信标题"
              disabled={submitting}
              onChange={(e) => {
                setTitle(e.target.value)
                if (errors.title) setErrors((p) => ({ ...p, title: undefined }))
              }}
            />
          </Field>
        </div>

        <Composer
          key={session}
          initialValue={resumedDraft?.reply ?? ''}
          submitting={submitting}
          submitLabel="发送"
          placeholder="写点什么…（支持 Markdown）"
          minHeight={200}
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

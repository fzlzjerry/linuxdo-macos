import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { Composer } from './Composer'
import { DiscardBar, useDiscardGuard } from './useDiscardGuard'
import { useCategories } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { toast } from '../../store/toast'
import styles from './NewTopicModal.module.css'

interface Props {
  open: boolean
  onClose: () => void
}

export function NewTopicModal({ open, onClose }: Props): JSX.Element {
  const navigate = useNavigate()
  const { data } = useCategories()
  const categories = (data?.category_list.categories ?? []).filter((c) => !c.parent_category_id)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<number | ''>('')
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ title?: string; category?: string }>({})
  const [bodyDirty, setBodyDirty] = useState(false)
  const [session, setSession] = useState(0)
  const guard = useDiscardGuard(open, onClose)

  // Fresh form every open — discarded/submitted content doesn't linger.
  useEffect(() => {
    if (!open) return
    setSession((s) => s + 1)
    setTitle('')
    setCategory('')
    setTags('')
    setErrors({})
    setBodyDirty(false)
  }, [open])

  // The guard protects the whole form, not just the composer body.
  const { setDirty } = guard
  useEffect(() => {
    setDirty(bodyDirty || title.trim().length > 0 || tags.trim().length > 0)
  }, [bodyDirty, title, tags, setDirty])

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
      toast.success('话题已发布')
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
      title="发布新话题"
      width={760}
    >
      <div className={styles.form}>
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
          <Field label="标签" hideLabel className={styles.tagsField}>
            <input
              placeholder="标签（用逗号分隔，可选）"
              value={tags}
              disabled={submitting}
              onChange={(e) => setTags(e.target.value)}
            />
          </Field>
        </div>
        <Composer
          key={session}
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

import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Field } from '../../components/ui/Field'
import { Composer } from '../../components/composer/Composer'
import { discourse } from '../../lib/discourse/client'
import { toast } from '../../store/toast'
import styles from './MessagesPage.module.css'

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (topicId: number) => void
}

export function NewMessageModal({ open, onClose, onCreated }: Props): JSX.Element {
  const [recipients, setRecipients] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ recipients?: string; title?: string }>({})

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
    <Modal open={open} onClose={onClose} title="写私信" width={720}>
      <div className={styles.fields}>
        <Field label="收件人" error={errors.recipients} required>
          <input
            type="text"
            value={recipients}
            placeholder="用户名，用逗号分隔"
            autoFocus
            disabled={submitting}
            onChange={(e) => {
              setRecipients(e.target.value)
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
        submitting={submitting}
        submitLabel="发送"
        placeholder="写点什么…（支持 Markdown）"
        minHeight={200}
        onCancel={onClose}
        onSubmit={(raw) => void submit(raw)}
      />
    </Modal>
  )
}

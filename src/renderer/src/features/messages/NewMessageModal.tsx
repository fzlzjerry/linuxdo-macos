import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
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

  async function submit(raw: string): Promise<void> {
    if (!recipients.trim()) {
      toast.error('请填写收件人')
      return
    }
    if (!title.trim()) {
      toast.error('请填写标题')
      return
    }
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
        <label className={styles.field}>
          <span className={styles.label}>收件人</span>
          <input
            className={styles.input}
            type="text"
            value={recipients}
            placeholder="用户名，用逗号分隔"
            autoFocus
            disabled={submitting}
            onChange={(e) => setRecipients(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>标题</span>
          <input
            className={styles.input}
            type="text"
            value={title}
            placeholder="私信标题"
            disabled={submitting}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
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

import { useEffect, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/states'
import { useFlagTypes } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { toast } from '../../store/toast'
import { errorMessage } from '../../lib/errors'
import styles from './FlagModal.module.css'

/** Strip HTML tags from a Discourse flag description → plain text. */
function plain(html: string | undefined): string {
  if (!html) return ''
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

const MIN_MESSAGE = 10

export function FlagModal({
  open,
  postId,
  onClose
}: {
  open: boolean
  postId: number
  onClose: () => void
}): JSX.Element {
  // Flag types come from /site.json so linux.do's custom flags (凑字数 / AIGC未截图
  // / 违规推广) and their require_message rules always match the live site.
  const { data: types, isLoading } = useFlagTypes(open)
  const [reason, setReason] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setReason(null)
    setMessage('')
  }, [open])

  // Default to the first reason once the list arrives.
  useEffect(() => {
    if (reason == null && types && types.length > 0) setReason(types[0].id)
  }, [types, reason])

  const active = types?.find((t) => t.id === reason)
  const messageRequired = !!active?.require_message
  const canSubmit =
    !submitting && reason != null && (!messageRequired || message.trim().length >= MIN_MESSAGE)

  async function submit(): Promise<void> {
    if (!canSubmit || reason == null) return
    setSubmitting(true)
    try {
      await discourse.flagPost(postId, reason, messageRequired ? message.trim() : undefined)
      toast.success('举报已提交，感谢反馈')
      onClose()
    } catch (e) {
      toast.error(errorMessage(e, '举报失败'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="举报此帖" width={460}>
      {isLoading || !types ? (
        <Spinner label="加载举报选项…" />
      ) : (
        <>
          <div className={styles.list} role="radiogroup" aria-label="举报原因">
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={t.id === reason}
                className={`${styles.reason} ${t.id === reason ? styles.reasonActive : ''}`}
                onClick={() => setReason(t.id)}
              >
                <span className={styles.dot} aria-hidden />
                <span className={styles.reasonText}>
                  <span className={styles.reasonLabel}>{t.name}</span>
                  {plain(t.description) && (
                    <span className={styles.reasonDesc}>{plain(t.description)}</span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {messageRequired && (
            <textarea
              className={styles.message}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`请描述具体问题（至少 ${MIN_MESSAGE} 个字）…`}
              rows={3}
              aria-label="举报说明"
            />
          )}

          <div className={styles.actions}>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={!canSubmit}>
              提交举报
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

import { CheckCircle2, AlertCircle, Info, TriangleAlert } from 'lucide-react'
import { useToasts } from '../../store/toast'
import styles from './Toaster.module.css'

const ICONS = {
  success: <CheckCircle2 size={16} />,
  error: <AlertCircle size={16} />,
  warning: <TriangleAlert size={16} />,
  info: <Info size={16} />
}

export function Toaster(): JSX.Element {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  const pause = useToasts((s) => s.pause)
  const resume = useToasts((s) => s.resume)

  return (
    <div className={styles.wrap} aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' || t.kind === 'warning' ? 'alert' : 'status'}
          className={`${styles.toast} ${styles[t.kind]} ${t.leaving ? styles.leaving : ''}`}
          onMouseEnter={() => pause(t.id)}
          onMouseLeave={() => resume(t.id)}
        >
          <span className={styles.icon} aria-hidden>
            {ICONS[t.kind]}
          </span>
          <button
            type="button"
            className={styles.body}
            onClick={() => dismiss(t.id)}
            aria-label={`${t.message}（点击关闭）`}
          >
            <span className={styles.msg}>{t.message}</span>
          </button>
          {t.action && (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => {
                t.action?.onClick()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

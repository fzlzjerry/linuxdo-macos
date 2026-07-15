import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { useToasts } from '../../store/toast'
import styles from './Toaster.module.css'

const ICONS = {
  success: <CheckCircle2 size={16} />,
  error: <AlertCircle size={16} />,
  info: <Info size={16} />
}

export function Toaster(): JSX.Element {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={`${styles.toast} ${styles[t.kind]}`} onClick={() => dismiss(t.id)}>
          <span className={styles.icon}>{ICONS[t.kind]}</span>
          <span className={styles.msg}>{t.message}</span>
        </button>
      ))}
    </div>
  )
}

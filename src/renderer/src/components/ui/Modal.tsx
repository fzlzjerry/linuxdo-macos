import { useEffect, useId, useRef, type ReactNode, type MouseEvent } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'
import styles from './Modal.module.css'

interface Props {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}

/** Modal built on the native <dialog> element — renders in the top layer, so it
 *  is never clipped by an ancestor's overflow/stacking context. */
export function Modal({ open, onClose, title, children, footer, width = 620 }: Props): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])

  const onBackdrop = (e: MouseEvent<HTMLDialogElement>): void => {
    if (e.target === ref.current) onClose()
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={title ? titleId : undefined}
      onCancel={onClose}
      onClick={onBackdrop}
    >
      <div className={styles.inner} style={{ maxWidth: width }}>
        {title && (
          <header className={styles.header}>
            <h2 className={styles.title} id={titleId}>
              {title}
            </h2>
            <IconButton label="关闭" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </header>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  )
}

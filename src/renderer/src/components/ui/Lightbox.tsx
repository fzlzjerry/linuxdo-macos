import { useEffect, useRef, useState } from 'react'
import { Copy, ExternalLink, Loader2, X } from 'lucide-react'
import { useLightbox } from '../../store/lightbox'
import { toast } from '../../store/toast'
import styles from './Lightbox.module.css'

/** App-wide image viewer on a native <dialog>: zoom-to-fit ↔ 1:1 toggle,
    Esc / backdrop / × to close, copy-link and open-in-browser escape hatches. */
export function LightboxHost(): JSX.Element {
  const image = useLightbox((s) => s.image)
  const close = useLightbox((s) => s.close)
  const ref = useRef<HTMLDialogElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (image && !d.open) d.showModal()
    else if (!image && d.open) d.close()
    setLoaded(false)
    setZoomed(false)
  }, [image])

  function copyLink(): void {
    if (!image) return
    void navigator.clipboard.writeText(image.src)
    toast.success('图片链接已复制')
  }

  function openExternal(): void {
    if (!image) return
    void window.api?.openExternal(image.src)
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={image?.filename || image?.alt || '图片'}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close()
      }}
    >
      {image && (
        <div className={styles.stage}>
          {!loaded && <Loader2 size={28} className={`spin ${styles.loading}`} />}
          <div className={zoomed ? styles.scrollerZoomed : styles.scroller}>
            <img
              className={zoomed ? styles.imgZoomed : styles.img}
              src={image.src}
              alt={image.alt ?? ''}
              onLoad={() => setLoaded(true)}
              onClick={(e) => {
                e.stopPropagation()
                setZoomed((z) => !z)
              }}
            />
          </div>

          <div className={styles.bar}>
            <span className={styles.name}>{image.filename || image.alt || ''}</span>
            <div className={styles.barActions}>
              <button type="button" className={styles.barBtn} onClick={copyLink}>
                <Copy size={14} /> 复制链接
              </button>
              <button type="button" className={styles.barBtn} onClick={openExternal}>
                <ExternalLink size={14} /> 在浏览器中打开
              </button>
              <button
                type="button"
                className={styles.barBtn}
                onClick={close}
                aria-label="关闭"
              >
                <X size={14} /> 关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}

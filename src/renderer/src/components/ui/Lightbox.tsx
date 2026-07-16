import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, ExternalLink, Loader2, X } from 'lucide-react'
import { useLightbox } from '../../store/lightbox'
import { toast } from '../../store/toast'
import styles from './Lightbox.module.css'

/** App-wide image viewer on a native <dialog>: zoom-to-fit ↔ 1:1 toggle,
    gallery prev/next (floating buttons + ←/→, no wrap-around), Esc / backdrop
    / × to close, copy-link and open-in-browser escape hatches. */
export function LightboxHost(): JSX.Element {
  const images = useLightbox((s) => s.images)
  const index = useLightbox((s) => s.index)
  const setIndex = useLightbox((s) => s.setIndex)
  const close = useLightbox((s) => s.close)
  const ref = useRef<HTMLDialogElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  const image = images[index] ?? null
  const hasPrev = index > 0
  const hasNext = index < images.length - 1

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (image && !d.open) d.showModal()
    else if (!image && d.open) d.close()
    // Reset fit state on open and on every gallery switch.
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
      onKeyDown={(e) => {
        if (images.length < 2) return
        if (e.key === 'ArrowLeft' && hasPrev) {
          e.preventDefault()
          setIndex(index - 1)
        } else if (e.key === 'ArrowRight' && hasNext) {
          e.preventDefault()
          setIndex(index + 1)
        }
      }}
    >
      {image && (
        <div className={styles.stage}>
          {!loaded && <Loader2 size={28} className={`spin ${styles.loading}`} />}
          <div className={zoomed ? styles.scrollerZoomed : styles.scroller}>
            <img
              className={`${zoomed ? styles.imgZoomed : styles.img} ${
                loaded ? '' : styles.pending
              }`}
              src={image.src}
              alt={image.alt ?? ''}
              onLoad={() => setLoaded(true)}
              onClick={(e) => {
                e.stopPropagation()
                setZoomed((z) => !z)
              }}
            />
          </div>

          {images.length > 1 && (
            <>
              {/* aria-disabled, not disabled: a truly disabled endpoint drops
                  focus to body and the arrow keys die with it. */}
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navPrev} ${hasPrev ? '' : styles.navBtnOff}`}
                aria-label="上一张"
                title="上一张"
                aria-disabled={!hasPrev}
                onClick={() => hasPrev && setIndex(index - 1)}
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navNext} ${hasNext ? '' : styles.navBtnOff}`}
                aria-label="下一张"
                title="下一张"
                aria-disabled={!hasNext}
                onClick={() => hasNext && setIndex(index + 1)}
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}

          <div className={styles.bar}>
            {images.length > 1 && (
              <span className={styles.count} aria-live="polite">
                {index + 1} / {images.length}
              </span>
            )}
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

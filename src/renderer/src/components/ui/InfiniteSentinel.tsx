import { useEffect, useRef } from 'react'

interface Props {
  onReach: () => void
  disabled?: boolean
  /** Root scroll container ref for the IntersectionObserver. */
  root?: React.RefObject<HTMLElement>
}

/** Invisible marker that fires `onReach` when scrolled near, for infinite lists. */
export function InfiniteSentinel({ onReach, disabled, root }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const cb = useRef(onReach)
  cb.current = onReach

  useEffect(() => {
    if (disabled) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cb.current()
      },
      { root: root?.current ?? null, rootMargin: '600px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [disabled, root])

  return <div ref={ref} style={{ height: 1 }} aria-hidden />
}

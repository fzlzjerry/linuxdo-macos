import { forwardRef, type ReactNode } from 'react'
import styles from './PageScaffold.module.css'

interface Props {
  toolbar: ReactNode
  children: ReactNode
}

/** Content column: fixed toolbar on top, a single scroll region below.
 *  The forwarded ref points at the scroll container (for infinite-scroll roots). */
export const PageScaffold = forwardRef<HTMLDivElement, Props>(function PageScaffold(
  { toolbar, children },
  ref
) {
  return (
    <div className={styles.page}>
      {toolbar}
      <div className={styles.scroll} ref={ref} data-scroll-root>
        {children}
      </div>
    </div>
  )
})

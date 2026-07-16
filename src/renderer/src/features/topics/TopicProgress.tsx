import { ChevronDown, ChevronUp, CircleDot, Loader2 } from 'lucide-react'
import styles from './TopicProgress.module.css'

interface Props {
  current: number
  total: number
  visible: boolean
  onTop: () => void
  onBottom: () => void
  bottomBusy?: boolean
  /** First unread post number; null hides the jump-to-unread button. */
  unreadStart?: number | null
  onUnread?: () => void
  unreadBusy?: boolean
}

/** Floating reading-position pill: 当前楼层 / 总楼层 + jump to top / bottom.
    Fades in after the reader scrolls past roughly one viewport. */
export function TopicProgress({
  current,
  total,
  visible,
  onTop,
  onBottom,
  bottomBusy = false,
  unreadStart = null,
  onUnread,
  unreadBusy = false
}: Props): JSX.Element {
  // Hidden once the reader has scrolled past the boundary — stays compact.
  const showUnread = unreadStart != null && onUnread != null && current < unreadStart
  return (
    <div className={`${styles.pill} ${visible ? styles.show : ''}`} aria-hidden={!visible}>
      <button
        type="button"
        className={styles.jump}
        onClick={onTop}
        title="回到顶部"
        aria-label="回到顶部"
        tabIndex={visible ? 0 : -1}
      >
        <ChevronUp size={15} />
      </button>
      <span className={styles.count} aria-label={`第 ${current} 楼，共 ${total} 楼`}>
        {current} / {total}
      </span>
      {showUnread && (
        <button
          type="button"
          className={`${styles.jump} ${styles.jumpUnread}`}
          onClick={onUnread}
          disabled={unreadBusy}
          title={`跳到未读 (#${unreadStart})`}
          aria-label={`跳到未读，第 ${unreadStart} 楼`}
          tabIndex={visible ? 0 : -1}
        >
          {unreadBusy ? <Loader2 size={15} className="spin" /> : <CircleDot size={15} />}
        </button>
      )}
      <button
        type="button"
        className={styles.jump}
        onClick={onBottom}
        disabled={bottomBusy}
        title="跳到底部"
        aria-label="跳到底部"
        tabIndex={visible ? 0 : -1}
      >
        {bottomBusy ? <Loader2 size={15} className="spin" /> : <ChevronDown size={15} />}
      </button>
    </div>
  )
}

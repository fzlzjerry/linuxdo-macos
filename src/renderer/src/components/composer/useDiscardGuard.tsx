import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import styles from './DiscardBar.module.css'

export interface DiscardGuard {
  /** Pass to Composer's onDirtyChange. */
  setDirty: (dirty: boolean) => void
  /** Whether the "确定丢弃?" bar is showing. */
  confirming: boolean
  /** Bumped on every blocked close attempt — feed to Modal's attention prop. */
  attention: number
  /** Use as the ONLY close path (Esc / backdrop / 取消). */
  requestClose: () => void
  confirmDiscard: () => void
  keepEditing: () => void
}

/** Guards a composer modal against silently discarding unsent content.
    First close attempt with dirty content shows the confirm bar (auto-hides
    after 4s); a second attempt while it shows means "discard". */
export function useDiscardGuard(open: boolean, onClose: () => void): DiscardGuard {
  const [dirty, setDirtyState] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [attention, setAttention] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback((): void => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  useEffect(() => {
    if (open) {
      setDirtyState(false)
      setConfirming(false)
    }
    return clearTimer
  }, [open, clearTimer])

  const keepEditing = useCallback((): void => {
    clearTimer()
    setConfirming(false)
  }, [clearTimer])

  const confirmDiscard = useCallback((): void => {
    clearTimer()
    setConfirming(false)
    setDirtyState(false)
    onClose()
  }, [clearTimer, onClose])

  const requestClose = useCallback((): void => {
    if (!dirty) {
      onClose()
      return
    }
    if (confirming) {
      confirmDiscard()
      return
    }
    setConfirming(true)
    setAttention((n) => n + 1)
    clearTimer()
    timer.current = setTimeout(() => setConfirming(false), 4000)
  }, [dirty, confirming, onClose, confirmDiscard, clearTimer])

  return { setDirty: setDirtyState, confirming, attention, requestClose, confirmDiscard, keepEditing }
}

export function DiscardBar({
  onKeep,
  onDiscard
}: {
  onKeep: () => void
  onDiscard: () => void
}): JSX.Element {
  return (
    <div className={styles.bar} role="alert">
      <span className={styles.text}>内容尚未发布，确定丢弃？</span>
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={onKeep}>
          继续编辑
        </Button>
        <Button variant="danger" size="sm" onClick={onDiscard}>
          丢弃
        </Button>
      </div>
    </div>
  )
}

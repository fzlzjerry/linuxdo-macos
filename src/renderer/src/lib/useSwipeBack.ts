import { useEffect, useRef } from 'react'

/** Accumulated |deltaX| a gesture must reach before goBack() fires. */
const THRESHOLD = 100
/** Wheel events closer together than this belong to the same gesture;
    a longer gap resets the accumulator. */
const GAP_MS = 150
/** After firing, ignore all wheel input for this long so the trackpad's
    inertia tail can't pop a second history entry. */
const COOLDOWN_MS = 400
/** Expected sign of deltaX for a "back" swipe. Under macOS natural scrolling a
    two-finger swipe to the right reports negative deltaX. If real-device
    testing shows the direction is flipped, change this to +1. */
const DIRECTION = -1

/** True when some ancestor of `target` (walking up to, but excluding, body)
    can scroll horizontally. Such elements — code blocks, wide tables in topic
    bodies — own horizontal wheel input, so swipe-back must yield to them
    (conservatively: mere presence yields, regardless of scrollLeft). */
function inHorizontalScroller(target: EventTarget | null): boolean {
  let el: Element | null = target instanceof Element ? target : null
  while (el && el !== document.body) {
    if (el.scrollWidth > el.clientWidth + 1) return true
    el = el.parentElement
  }
  return false
}

/** Two-finger trackpad swipe-right navigates back. WKWebView exposes no native
    swipe gesture to the page, so this reconstructs one from wheel events:
    horizontal-dominant deltas in the back direction are aggregated into a
    gesture, goBack() fires once past the threshold, then a cooldown swallows
    the inertia tail. No visual indicator in this first iteration. */
export function useSwipeBack(goBack: () => void): void {
  const goBackRef = useRef(goBack)
  useEffect(() => {
    goBackRef.current = goBack
  }, [goBack])

  useEffect(() => {
    let accumulated = 0
    let lastEventAt = 0
    let cooldownUntil = 0
    // After firing, the gesture must actually END (a >GAP_MS quiet spell)
    // before a new one can arm — a fixed cooldown alone lets a slow sustained
    // swipe or a long inertia tail re-accumulate and pop a second entry.
    let armed = true

    const onWheel = (e: WheelEvent): void => {
      const now = performance.now()
      const gapped = now - lastEventAt > GAP_MS
      lastEventAt = now
      if (gapped) {
        accumulated = 0
        armed = true
      }
      if (!armed || now < cooldownUntil) return

      // Must be horizontal-dominant and in the back direction; anything else
      // breaks the gesture.
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5
      if (!horizontal || e.deltaX * DIRECTION <= 0) {
        accumulated = 0
        return
      }

      // A modal is open — swiping must not navigate underneath it.
      if (document.querySelector('dialog[open]')) {
        accumulated = 0
        return
      }

      // Yield to horizontally scrollable content under the pointer.
      if (inHorizontalScroller(e.target)) {
        accumulated = 0
        return
      }

      accumulated += Math.abs(e.deltaX)

      if (accumulated > THRESHOLD) {
        accumulated = 0
        armed = false
        cooldownUntil = now + COOLDOWN_MS
        goBackRef.current()
      }
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])
}

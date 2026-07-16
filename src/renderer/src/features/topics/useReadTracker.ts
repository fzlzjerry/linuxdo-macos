import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { discourse, DiscourseApiError } from '../../lib/discourse/client'

interface Options {
  topicId: number
  scrollRef: RefObject<HTMLElement>
  /** auth.loggedIn && topic loaded — nothing is collected or sent otherwise. */
  enabled: boolean
  /** Real (non-pending) post numbers currently rendered; drives re-observe. */
  postNumbers: ReadonlySet<number>
  /** Fires after a successful flush; topicId is the topic that was reported
   *  (a leave-flush can land after the reader moved to another topic). */
  onFlushed?: (topicId: number, maxReadPostNumber: number) => void
}

const TICK_MS = 1000
const IDLE_MS = 60_000 // stop counting after a minute without interaction
const PER_POST_CAP_MS = 60_000
const MIN_FLUSH_GAP_MS = 20_000
const FLUSH_AFTER_MS = 60_000
const FLUSH_AFTER_POSTS = 15
const CIRCUIT_PAUSE_MS = 5 * 60_000

/** Watches which posts are actually on screen and reports reading time to
 *  Discourse (POST /topics/timings) — the contract that clears unread state
 *  server-side. Throttled hard: linux.do rate-limits aggressively. */
export function useReadTracker({
  topicId,
  scrollRef,
  enabled,
  postNumbers,
  onFlushed
}: Options): void {
  const onFlushedRef = useRef(onFlushed)
  onFlushedRef.current = onFlushed

  // Mutable session state in a ref so ticks/flushes never re-render the
  // reader. `session` tags the current topic; async flush results from a
  // previous topic must not write back into the new session.
  const state = useRef({
    session: 0,
    visible: new Set<number>(),
    pending: new Map<number, number>(), // post number -> unsent ms
    topicTime: 0, // unsent active ms
    lastInteraction: 0,
    lastFlushDone: 0,
    lastFlushTry: 0,
    failures: 0,
    pausedUntil: 0,
    inFlight: false,
    maxFlushed: 0
  })

  // Declared before the observer effect: on a topic switch the cleanup here
  // flushes the old topic first, then setup resets state, then the observer
  // effect re-observes the new topic's posts.
  useEffect(() => {
    if (!enabled) return
    const s = state.current
    const now = Date.now()
    s.session = topicId
    s.visible = new Set()
    s.pending = new Map()
    s.topicTime = 0
    // Seeded with entry time, not 0 — otherwise the very first tick trips the
    // "60s since last flush" check against the epoch and fires ~1s after
    // entry, defeating the throttle on every topic visit.
    s.lastFlushDone = now
    s.lastFlushTry = now
    s.failures = 0
    s.pausedUntil = 0
    s.maxFlushed = 0

    const touch = (): void => {
      s.lastInteraction = Date.now()
    }
    touch()

    const flush = (background: boolean): void => {
      const now = Date.now()
      if (s.inFlight || s.pending.size === 0 || now < s.pausedUntil) return
      if (!background && now - s.lastFlushTry < MIN_FLUSH_GAP_MS) return
      const batch = s.pending
      const time = s.topicTime
      const sessionMax = s.maxFlushed
      s.pending = new Map()
      s.topicTime = 0
      s.lastFlushTry = now
      s.inFlight = true
      discourse
        .topicTimings(topicId, time, batch, background)
        .then(() => {
          const maxRead = Math.max(sessionMax, ...batch.keys())
          if (s.session === topicId) {
            s.lastFlushDone = Date.now()
            s.failures = 0
            s.maxFlushed = maxRead
          }
          onFlushedRef.current?.(topicId, maxRead)
        })
        .catch((e: unknown) => {
          if (s.session !== topicId) return // stale leave-flush: drop quietly
          const status = e instanceof DiscourseApiError ? e.status : 0
          s.failures += 1
          if (s.failures >= 2 || status === 429 || status === 403) {
            // Circuit breaker: stop bothering a rate-limited server.
            s.pausedUntil = Date.now() + CIRCUIT_PAUSE_MS
            s.failures = 0
          } else {
            // Merge the batch back; it rides along with the next flush.
            for (const [n, ms] of batch) {
              s.pending.set(n, Math.min((s.pending.get(n) ?? 0) + ms, PER_POST_CAP_MS))
            }
            s.topicTime += time
          }
        })
        .finally(() => {
          s.inFlight = false
        })
    }

    const tick = (): void => {
      const now = Date.now()
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return
      if (now - s.lastInteraction > IDLE_MS) return
      if (s.visible.size > 0) {
        for (const n of s.visible) {
          s.pending.set(n, Math.min((s.pending.get(n) ?? 0) + TICK_MS, PER_POST_CAP_MS))
        }
        s.topicTime += TICK_MS
      }
      if (
        s.pending.size >= FLUSH_AFTER_POSTS ||
        (s.pending.size > 0 && now - Math.max(s.lastFlushDone, s.lastFlushTry) >= FLUSH_AFTER_MS)
      ) {
        flush(false)
      }
    }

    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') flush(true)
    }
    const onBlur = (): void => flush(true)

    const interval = window.setInterval(tick, TICK_MS)
    const root = scrollRef.current
    root?.addEventListener('scroll', touch, { passive: true })
    window.addEventListener('pointermove', touch, { passive: true })
    window.addEventListener('keydown', touch)
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('blur', onBlur)
    return () => {
      window.clearInterval(interval)
      root?.removeEventListener('scroll', touch)
      window.removeEventListener('pointermove', touch)
      window.removeEventListener('keydown', touch)
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('blur', onBlur)
      flush(true) // final flush when leaving the topic
    }
  }, [enabled, topicId, scrollRef])

  // Observe rendered posts; re-runs whenever the loaded window changes.
  useEffect(() => {
    if (!enabled) return
    const root = scrollRef.current
    if (!root) return
    const s = state.current
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const num = Number(e.target.id.slice(5))
          if (!Number.isFinite(num) || num <= 0) continue
          if (e.isIntersecting) s.visible.add(num)
          else s.visible.delete(num)
        }
      },
      { root, threshold: 0 }
    )
    for (const el of root.querySelectorAll<HTMLElement>('article[id^="post-"]')) {
      const num = Number(el.id.slice(5))
      if (postNumbers.has(num)) io.observe(el)
    }
    return () => {
      io.disconnect()
      s.visible.clear()
    }
  }, [enabled, topicId, postNumbers, scrollRef])
}

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { discourse, DiscourseApiError } from './discourse/client'
import { useAuth } from '../store/auth'

/** Background server-draft autosave for a composer surface.
 *
 *  Silent by design: drafts are a safety net, so saves/deletes never toast.
 *  Everything no-ops while logged out, while `key` is null (composer closed),
 *  or after a sequence conflict (another client took over the draft). */
export interface DraftAutosave {
  /** call whenever content changes (debounced ~2.5s internally); null = 内容为空,不保存 */
  update(data: Record<string, unknown> | null): void
  /** successful submit / explicit discard — delete the server draft, stop saving.
   *  keyOverride: 调用时 key 可能已被置 null(composer 先关闭后网络返回),
   *  显式传 key 保证删除仍然执行 */
  discard(keyOverride?: string): Promise<void>
  /** flush pending save immediately (modal 关闭但保留草稿时调用) */
  flush(): Promise<void>
  /** 本会话(key 从 null→非 null 起)是否真的向服务器保存过 */
  hasSaved(): boolean
}

// Short debounce: unload-time flushes are best-effort only (Tauri invokes are
// not guaranteed to complete at quit), so a small window bounds what can be lost.
const SAVE_DELAY_MS = 2500

interface AutosaveState {
  key: string | null
  sequence: number
  /** true once the sequence came from the caller or a server response —
   *  a delete with a stale sequence is a silent server-side no-op. */
  sequenceKnown: boolean
  /** true once this session actually wrote a draft to the server */
  everSaved: boolean
  pending: Record<string, unknown> | null
  timer: ReturnType<typeof setTimeout> | null
  inFlight: boolean
  /** conflict (409) or discarded — no more saves until the key re-arms */
  stopped: boolean
  /** serialization of the last successful save, to skip identical writes */
  lastSavedJson: string | null
  onSaved?: () => void
}

export function useDraftAutosave(
  key: string | null,
  initialSequence?: number,
  /** optional: fired after each successful background save (e.g.「已存草稿」hint) */
  onSaved?: () => void
): DraftAutosave {
  const queryClient = useQueryClient()
  const stateRef = useRef<AutosaveState>({
    key,
    sequence: initialSequence ?? 0,
    sequenceKnown: initialSequence !== undefined,
    everSaved: false,
    pending: null,
    timer: null,
    inFlight: false,
    stopped: false,
    lastSavedJson: null
  })
  stateRef.current.onSaved = onSaved
  const initSeqRef = useRef(initialSequence)
  initSeqRef.current = initialSequence
  const lastKeyRef = useRef(key)

  // Session gating: a null key disables saving (composer closed); a non-null
  // key (re)arms a fresh session. The caller's initialSequence (when it
  // resolved one, e.g. by probing /drafts on open) wins; otherwise reopening
  // the SAME key keeps the learned sequence and a different key starts over.
  useEffect(() => {
    const s = stateRef.current
    if (s.timer) {
      clearTimeout(s.timer)
      s.timer = null
    }
    s.pending = null
    s.key = key
    if (key) {
      const keyChanged = key !== lastKeyRef.current
      lastKeyRef.current = key
      if (initSeqRef.current !== undefined) {
        s.sequence = initSeqRef.current
        s.sequenceKnown = true
      } else if (keyChanged) {
        s.sequence = 0
        s.sequenceKnown = false
      }
      s.stopped = false
      s.everSaved = false
      s.lastSavedJson = null
    }
  }, [key])

  // Unmount: fire-and-forget any unsaved content.
  useEffect(() => {
    const s = stateRef.current
    return () => {
      if (s.timer) {
        clearTimeout(s.timer)
        s.timer = null
      }
      const data = s.pending
      s.pending = null
      if (!data || !s.key || s.stopped || !useAuth.getState().loggedIn) return
      if (JSON.stringify(data) === s.lastSavedJson) return
      void discourse.saveDraft(s.key, s.sequence, data).catch((e) => {
        console.debug('[draft-autosave] final save failed', e)
      })
    }
  }, [])

  const api = useMemo<DraftAutosave>(() => {
    const s = stateRef.current

    const clearTimer = (): void => {
      if (s.timer) {
        clearTimeout(s.timer)
        s.timer = null
      }
    }

    const canSave = (): boolean => !!s.key && !s.stopped && useAuth.getState().loggedIn

    /** Mark the shared drafts list stale (no active refetch) so the next
     *  composer-open probe and the drafts page see fresh data. */
    const markDraftsStale = (): void => {
      void queryClient.invalidateQueries({ queryKey: ['drafts'], refetchType: 'none' })
    }

    /** Serialized save loop: never two concurrent requests; a save that
     *  finishes with fresher `pending` content immediately sends it too. */
    const runSave = async (): Promise<void> => {
      if (s.inFlight) return
      s.inFlight = true
      try {
        while (s.pending && canSave()) {
          const draftKey = s.key as string
          const data = s.pending
          s.pending = null
          const json = JSON.stringify(data)
          if (json === s.lastSavedJson) continue
          try {
            const res = await discourse.saveDraft(draftKey, s.sequence, data)
            s.lastSavedJson = json
            s.everSaved = true
            if (typeof res.draft_sequence === 'number') {
              s.sequence = res.draft_sequence
              s.sequenceKnown = true
            }
            markDraftsStale()
            s.onSaved?.()
          } catch (e) {
            if (e instanceof DiscourseApiError && e.status === 409) {
              // Another client advanced the draft; back off for this session.
              s.stopped = true
              console.debug('[draft-autosave] sequence conflict on', draftKey, '— paused')
            } else {
              // Transient failure — keep the content pending so the next
              // update()/flush() retries, but don't loop hot on errors.
              if (!s.pending) s.pending = data
              console.debug('[draft-autosave] save failed', e)
            }
            break
          }
        }
      } finally {
        s.inFlight = false
      }
    }

    return {
      update(data): void {
        if (!canSave()) return
        if (data === null) {
          s.pending = null
          clearTimer()
          return
        }
        s.pending = data
        // One trailing timer (not reset per call): content lands on the server
        // at most ~2.5s after it changed, and the save always sends the latest
        // pending snapshot, so mid-typing calls just refresh the payload.
        if (!s.timer) {
          s.timer = setTimeout(() => {
            s.timer = null
            void runSave()
          }, SAVE_DELAY_MS)
        }
      },

      async discard(keyOverride?: string): Promise<void> {
        clearTimer()
        s.pending = null
        // The composer may already be closed (key nulled) by the time an async
        // submit resolves — an explicit override still targets the right draft.
        const draftKey = s.key ?? keyOverride ?? null
        s.stopped = true // re-armed when the key cycles null → key again
        s.lastSavedJson = null
        if (!draftKey || !useAuth.getState().loggedIn) return
        // Let an in-flight save settle first (bounded) so the delete lands
        // after it and with the freshest sequence.
        for (let i = 0; i < 40 && s.inFlight; i++) {
          await new Promise((r) => setTimeout(r, 50))
        }
        try {
          if (!s.sequenceKnown) {
            // Deleting with a stale sequence is silently ignored server-side;
            // resolve the real one first.
            const res = await discourse.drafts()
            const item = res.drafts.find((d) => d.draft_key === draftKey)
            if (!item) return // nothing on the server to delete
            s.sequence = item.sequence
            s.sequenceKnown = true
          }
          await discourse.deleteDraft(draftKey, s.sequence)
          markDraftsStale()
        } catch (e) {
          console.debug('[draft-autosave] delete failed', e)
        }
      },

      async flush(): Promise<void> {
        clearTimer()
        if (!s.pending || !canSave()) return
        await runSave()
      },

      hasSaved(): boolean {
        return s.everSaved
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // React unmount cleanup never runs on ⌘Q / window close, so also flush when
  // the page hides. Best effort: requests through the Tauri bridge are not
  // guaranteed to complete at quit (hence the short debounce above).
  useEffect(() => {
    const onHide = (): void => {
      if (stateRef.current.pending) void api.flush()
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') onHide()
    }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [api])

  return api
}

/** Transient「已存草稿」indicator state: trigger() shows it for 2s. */
export function useDraftSavedFlash(): { savedVisible: boolean; flashSaved: () => void } {
  const [savedVisible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  const flashSaved = useCallback((): void => {
    setVisible(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(false), 2000)
  }, [])
  return { savedVisible, flashSaved }
}

/** Inline style for the「已存草稿」hint next to a modal title — quiet meta
 *  text that fades (or, under reduced motion, snaps) in and out. */
export function draftSavedHintStyle(visible: boolean): CSSProperties {
  const reduced =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return {
    marginLeft: 8,
    fontSize: 'var(--fs-xs)',
    fontWeight: 400,
    color: 'var(--ink-3)',
    opacity: visible ? 1 : 0,
    transition: reduced ? 'none' : 'opacity 0.35s ease'
  }
}

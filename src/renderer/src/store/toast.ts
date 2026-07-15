import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error' | 'warning'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
  action?: ToastAction
  leaving?: boolean
}

export interface PushOpts {
  duration?: number
  action?: ToastAction
}

const EXIT_MS = 160
const MAX_VISIBLE = 3
const DEFAULT_MS: Record<ToastKind, number> = {
  info: 3200,
  success: 3200,
  warning: 4000,
  error: 5000
}

interface ToastState {
  toasts: ToastItem[]
  push: (message: string, kind?: ToastKind, opts?: PushOpts) => void
  dismiss: (id: number) => void
  pause: (id: number) => void
  resume: (id: number) => void
}

let seq = 0
// Timers live outside the store — they're imperative bookkeeping, not state.
const timers = new Map<number, ReturnType<typeof setTimeout>>()
const pausedRemaining = new Map<number, number>()
const deadlines = new Map<number, number>()

export const useToasts = create<ToastState>((set, get) => {
  const remove = (id: number): void => {
    const t = timers.get(id)
    if (t) clearTimeout(t)
    timers.delete(id)
    pausedRemaining.delete(id)
    deadlines.delete(id)
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
  }

  const startExit = (id: number): void => {
    const t = timers.get(id)
    if (t) clearTimeout(t)
    deadlines.delete(id)
    set((s) => ({ toasts: s.toasts.map((x) => (x.id === id ? { ...x, leaving: true } : x)) }))
    timers.set(id, setTimeout(() => remove(id), EXIT_MS))
  }

  const arm = (id: number, ms: number): void => {
    deadlines.set(id, Date.now() + ms)
    timers.set(id, setTimeout(() => startExit(id), ms))
  }

  return {
    toasts: [],
    push: (message, kind = 'info', opts) => {
      const id = ++seq
      set((s) => ({ toasts: [...s.toasts, { id, message, kind, action: opts?.action }] }))
      const visible = get().toasts.filter((x) => !x.leaving)
      if (visible.length > MAX_VISIBLE) startExit(visible[0].id)
      arm(id, opts?.duration ?? DEFAULT_MS[kind])
    },
    dismiss: startExit,
    pause: (id) => {
      const t = timers.get(id)
      const deadline = deadlines.get(id)
      if (!t || deadline == null) return
      clearTimeout(t)
      timers.delete(id)
      deadlines.delete(id)
      pausedRemaining.set(id, Math.max(800, deadline - Date.now()))
    },
    resume: (id) => {
      const ms = pausedRemaining.get(id)
      if (ms == null || timers.has(id)) return
      pausedRemaining.delete(id)
      arm(id, ms)
    }
  }
})

export const toast = {
  info: (m: string, opts?: PushOpts) => useToasts.getState().push(m, 'info', opts),
  success: (m: string, opts?: PushOpts) => useToasts.getState().push(m, 'success', opts),
  warning: (m: string, opts?: PushOpts) => useToasts.getState().push(m, 'warning', opts),
  error: (m: string, opts?: PushOpts) => useToasts.getState().push(m, 'error', opts)
}

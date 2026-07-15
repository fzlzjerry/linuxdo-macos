import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'
export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

interface ToastState {
  toasts: ToastItem[]
  push: (message: string, kind?: ToastKind) => void
  dismiss: (id: number) => void
}

let seq = 0

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export const toast = {
  info: (m: string) => useToasts.getState().push(m, 'info'),
  success: (m: string) => useToasts.getState().push(m, 'success'),
  error: (m: string) => useToasts.getState().push(m, 'error')
}

import { create } from 'zustand'
import type { AuthState } from '../../../shared/api'

interface AuthStore extends AuthState {
  ready: boolean
  setState: (s: AuthState) => void
  showLogin: () => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export const useAuth = create<AuthStore>((set) => ({
  loggedIn: false,
  ready: false,
  setState: (s) => set({ ...s, ready: true }),
  showLogin: async () => {
    if (window.api) await window.api.auth.showLogin()
  },
  logout: async () => {
    if (!window.api) return
    const s = await window.api.auth.logout()
    set({ ...s, ready: true })
  },
  refresh: async () => {
    if (!window.api) return set({ ready: true })
    const s = await window.api.auth.getState()
    set({ ...s, ready: true })
  }
}))

/** Subscribe to main-process auth pushes. Call once at app start. */
export function initAuthBridge(): () => void {
  if (!window.api) {
    useAuth.getState().setState({ loggedIn: false })
    return () => {}
  }
  const unsub = window.api.auth.onChanged((s) => useAuth.getState().setState(s))
  void useAuth.getState().refresh()
  return unsub
}

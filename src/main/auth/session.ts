import { BrowserWindow, session } from 'electron'
import { engine } from '../network/engine'
import { MessageBus } from '../network/messagebus'
import { LoginWindow } from './loginWindow'
import type { AuthState } from '../../shared/api'

const ORIGIN = 'https://linux.do'
const PARTITION = 'persist:linuxdo'

interface CurrentUserPayload {
  current_user?: {
    id: number
    username: string
    name?: string
    avatar_template?: string
    unread_notifications?: number
    unread_high_priority_notifications?: number
    unread_private_messages?: number
    unread_personal_messages?: number
  }
}

function expandAvatar(template: string | undefined, size = 120): string | undefined {
  if (!template) return undefined
  const path = template.replace('{size}', String(size))
  return path.startsWith('http') ? path : ORIGIN + path
}

/** Tracks whether the user is authenticated on linux.do and drives the login window. */
export class AuthManager {
  private state: AuthState = { loggedIn: false }
  private notify: ((s: AuthState) => void) | null = null
  private polling = false
  private userId: number | null = null
  private bus: MessageBus | null = null
  private readonly loginWindow = new LoginWindow()
  private getParent: (() => BrowserWindow | null) | null = null

  onChanged(cb: (s: AuthState) => void): void {
    this.notify = cb
  }

  setParentProvider(fn: () => BrowserWindow | null): void {
    this.getParent = fn
  }

  getCached(): AuthState {
    return this.state
  }

  async refresh(): Promise<AuthState> {
    const res = await engine.request<CurrentUserPayload>({ path: '/session/current.json' })
    const cu = res.json?.current_user
    const next: AuthState = cu
      ? {
          loggedIn: true,
          username: cu.username,
          name: cu.name,
          avatarUrl: expandAvatar(cu.avatar_template),
          unreadNotifications:
            (cu.unread_notifications ?? 0) + (cu.unread_high_priority_notifications ?? 0),
          unreadPersonalMessages: cu.unread_private_messages ?? cu.unread_personal_messages ?? 0
        }
      : { loggedIn: false }

    this.userId = cu?.id ?? null
    this.syncLiveUpdates()

    const changed = JSON.stringify(next) !== JSON.stringify(this.state)
    this.state = next
    if (changed) this.notify?.(next)
    return next
  }

  /** Start/stop the MessageBus notification subscription with the login state. */
  private syncLiveUpdates(): void {
    if (this.userId != null) {
      if (!this.bus) {
        this.bus = new MessageBus(
          (req) => engine.request(req),
          () => void this.refresh()
        )
      }
      this.bus.setChannels([
        `/notification/${this.userId}`,
        `/notification-alert/${this.userId}`
      ])
      this.bus.start()
    } else if (this.bus) {
      this.bus.stop()
    }
  }

  /** Open a focused login sheet and poll until the session becomes authenticated. */
  async showLogin(): Promise<AuthState> {
    this.loginWindow.open(this.getParent?.() ?? null)
    if (!this.polling) void this.pollUntilLoggedIn()
    return this.state
  }

  private async pollUntilLoggedIn(): Promise<void> {
    this.polling = true
    const started = Date.now()
    try {
      while (Date.now() - started < 5 * 60 * 1000) {
        // Stop if the user dismissed the login sheet without signing in.
        if (!this.loginWindow.isOpen()) return
        const s = await this.refresh()
        if (s.loggedIn) {
          this.loginWindow.close()
          // Reload the engine on the freshly authenticated (and CF-cleared) session.
          void engine.resetToOrigin()
          return
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
    } finally {
      this.polling = false
    }
  }

  async logout(): Promise<AuthState> {
    await session.fromPartition(PARTITION).clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage']
    })
    await engine.resetToOrigin()
    return this.refresh()
  }
}

export const auth = new AuthManager()

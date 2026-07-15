// Transport contract shared between the Electron main process and the renderer.
// Domain (Discourse) types live in the renderer; main only relays requests.

export const IPC = {
  discourseRequest: 'discourse:request',
  authGetState: 'auth:getState',
  authShowLogin: 'auth:showLogin',
  authLogout: 'auth:logout',
  authChanged: 'auth:changed', // main -> renderer push
  openExternal: 'app:openExternal',
  windowControls: 'app:windowControls'
} as const

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface DiscourseRequest {
  /** Path relative to https://linux.do, e.g. "/latest.json". */
  path: string
  method?: HttpMethod
  /** Extra headers. CSRF + X-Requested-With are added automatically for writes. */
  headers?: Record<string, string>
  /**
   * Request body. When `form` is true, an object is url-encoded
   * (Discourse writes expect application/x-www-form-urlencoded).
   */
  body?: Record<string, unknown> | string
  form?: boolean
  /** Multipart file upload (POST /uploads.json). Binary is passed as base64. */
  upload?: {
    base64: string
    filename: string
    mime: string
    type?: string
  }
}

export interface DiscourseResponse<T = unknown> {
  ok: boolean
  status: number
  json?: T
  text?: string
  /** Set when the transport itself failed (offline, CF challenge, engine error). */
  error?: string
  /** True when the response looked like a Cloudflare interstitial / login wall. */
  needsAuth?: boolean
}

export interface AuthState {
  loggedIn: boolean
  username?: string
  name?: string
  avatarUrl?: string
  /** Unread counts surfaced by /session/current.json when available. */
  unreadNotifications?: number
  unreadPersonalMessages?: number
}

export type WindowControlAction = 'minimize' | 'maximize' | 'close'

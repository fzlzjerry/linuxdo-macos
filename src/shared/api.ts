// Transport contract shared between the Rust bridge and the renderer.
// Domain (Discourse) types live in the renderer; the bridge only relays requests.

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
  /** Non-JSON responses are capped at 4000 chars (challenge sniffing only);
   *  set for endpoints whose text body is real content (e.g. /onebox). */
  fullText?: boolean
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

/** User-visible auth-flow message pushed from the backend (toasted by the renderer). */
export interface AuthNotice {
  level: 'info' | 'warning' | 'error'
  message: string
}

export type WindowControlAction = 'minimize' | 'maximize' | 'close'

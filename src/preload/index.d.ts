import type {
  AuthState,
  DiscourseRequest,
  DiscourseResponse,
  WindowControlAction
} from '../shared/api'

export interface LinuxDoApi {
  discourse: {
    request<T = unknown>(req: DiscourseRequest): Promise<DiscourseResponse<T>>
  }
  auth: {
    getState(): Promise<AuthState>
    showLogin(): Promise<AuthState>
    logout(): Promise<AuthState>
    onChanged(cb: (s: AuthState) => void): () => void
  }
  openExternal(url: string): Promise<void>
  window: {
    control(action: WindowControlAction): void
  }
}

declare global {
  interface Window {
    api: LinuxDoApi
  }
}

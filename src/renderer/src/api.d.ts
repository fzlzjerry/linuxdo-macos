import type {
  AuthNotice,
  AuthState,
  DiscourseRequest,
  DiscourseResponse,
  WindowControlAction
} from '../../shared/api'

export interface LinuxDoApi {
  discourse: {
    request<T = unknown>(req: DiscourseRequest): Promise<DiscourseResponse<T>>
  }
  auth: {
    getState(): Promise<AuthState>
    showLogin(): Promise<AuthState>
    logout(): Promise<AuthState>
    onChanged(cb: (s: AuthState) => void): () => void
    onNotice(cb: (n: AuthNotice) => void): () => void
  }
  openExternal(url: string): Promise<void>
  /** Load a linux.do asset (e.g. emoji image) through the engine as a data URL. */
  fetchImage(url: string): Promise<string>
  /** The site's svg icon sprite markup, extracted from the engine webview. */
  svgSprite(): Promise<string>
  /** One Discourse site setting, read from the engine page's preloaded data. */
  siteSetting(name: string): Promise<string>
  window: {
    control(action: WindowControlAction): void
  }
}

declare global {
  interface Window {
    api: LinuxDoApi
  }
}

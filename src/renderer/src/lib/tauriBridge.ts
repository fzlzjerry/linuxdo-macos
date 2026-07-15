import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type {
  AuthNotice,
  AuthState,
  DiscourseRequest,
  DiscourseResponse,
  WindowControlAction
} from '../../../shared/api'

/**
 * Tauri implementation of the `window.api` bridge (the same shape the Electron
 * preload exposed), so the entire renderer runs unchanged. All Discourse traffic
 * goes through Rust → the hidden WKWebView on linux.do → back over invoke().
 */
const api = {
  discourse: {
    request<T = unknown>(req: DiscourseRequest): Promise<DiscourseResponse<T>> {
      return invoke<DiscourseResponse<T>>('discourse_request', { req })
    }
  },
  auth: {
    getState(): Promise<AuthState> {
      return invoke<AuthState>('auth_get_state')
    },
    showLogin(): Promise<AuthState> {
      return invoke<AuthState>('auth_show_login')
    },
    logout(): Promise<AuthState> {
      return invoke<AuthState>('auth_logout')
    },
    onChanged(cb: (s: AuthState) => void): () => void {
      let dispose = (): void => {}
      void listen<AuthState>('auth:changed', (e) => cb(e.payload)).then((un) => {
        dispose = un
      })
      return () => dispose()
    },
    onNotice(cb: (n: AuthNotice) => void): () => void {
      let dispose = (): void => {}
      void listen<AuthNotice>('auth:notice', (e) => cb(e.payload)).then((un) => {
        dispose = un
      })
      return () => dispose()
    }
  },
  openExternal(url: string): Promise<void> {
    return invoke<void>('open_external', { url })
  },
  svgSprite(): Promise<string> {
    return invoke<string>('svg_sprite')
  },
  window: {
    control(action: WindowControlAction): void {
      const w = getCurrentWindow()
      if (action === 'minimize') void w.minimize()
      else if (action === 'maximize') void w.toggleMaximize()
      else void w.close()
    }
  }
}

window.api = api

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/api'
import type {
  AuthState,
  DiscourseRequest,
  DiscourseResponse,
  WindowControlAction
} from '../shared/api'

const api = {
  discourse: {
    request<T = unknown>(req: DiscourseRequest): Promise<DiscourseResponse<T>> {
      return ipcRenderer.invoke(IPC.discourseRequest, req)
    }
  },
  auth: {
    getState(): Promise<AuthState> {
      return ipcRenderer.invoke(IPC.authGetState)
    },
    showLogin(): Promise<AuthState> {
      return ipcRenderer.invoke(IPC.authShowLogin)
    },
    logout(): Promise<AuthState> {
      return ipcRenderer.invoke(IPC.authLogout)
    },
    onChanged(cb: (s: AuthState) => void): () => void {
      const listener = (_e: Electron.IpcRendererEvent, s: AuthState): void => cb(s)
      ipcRenderer.on(IPC.authChanged, listener)
      return () => ipcRenderer.removeListener(IPC.authChanged, listener)
    }
  },
  openExternal(url: string): Promise<void> {
    return ipcRenderer.invoke(IPC.openExternal, url)
  },
  window: {
    control(action: WindowControlAction): void {
      ipcRenderer.send(IPC.windowControls, action)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

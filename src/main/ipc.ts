import { BrowserWindow, ipcMain, shell } from 'electron'
import { IPC } from '../shared/api'
import type { DiscourseRequest, WindowControlAction } from '../shared/api'
import { engine } from './network/engine'
import { auth } from './auth/session'

const ORIGIN = 'https://linux.do'

export function registerIpc(getMainWindow: () => BrowserWindow | null): void {
  // The login sheet parents itself to the main window.
  auth.setParentProvider(getMainWindow)

  // Push auth changes to the renderer.
  auth.onChanged((state) => {
    getMainWindow()?.webContents.send(IPC.authChanged, state)
  })

  ipcMain.handle(IPC.discourseRequest, async (_e, req: DiscourseRequest) => {
    const res = await engine.request(req)
    if (process.env['ELECTRON_RENDERER_URL']) {
      console.log(
        `[discourse] ${req.method ?? 'GET'} ${req.path} -> ${res.status} ok=${res.ok} needsAuth=${res.needsAuth ?? false} err=${res.error ?? ''}`
      )
    }
    // A challenge/anonymous response is a good moment to re-check auth so the UI
    // can prompt for login.
    if (res.needsAuth) void auth.refresh()
    return res
  })

  ipcMain.handle(IPC.authGetState, async () => auth.refresh())

  ipcMain.handle(IPC.authShowLogin, async () => auth.showLogin())

  ipcMain.handle(IPC.authLogout, async () => auth.logout())

  ipcMain.handle(IPC.openExternal, async (_e, url: string) => {
    // Only allow http(s) links to be opened externally.
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  })

  ipcMain.on(IPC.windowControls, (e, action: WindowControlAction) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    else if (action === 'close') win.close()
  })
}

export { ORIGIN }

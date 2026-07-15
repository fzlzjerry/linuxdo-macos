import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { IPC } from '../shared/api'
import { engine } from './network/engine'
import { auth } from './auth/session'

// Reaching linux.do commonly runs through a TLS-intercepting proxy that drops
// Chromium's ECH / HTTPS-DNS-record / QUIC handshakes (→ ERR_CONNECTION_CLOSED),
// while plain TLS (what curl uses) passes. Force plain TLS so the network engine
// can connect reliably behind such proxies.
app.commandLine.appendSwitch('disable-quic')
app.commandLine.appendSwitch(
  'disable-features',
  'EncryptedClientHello,UseDnsHttpsSvcb,UseDnsHttpsSvcbAlpn'
)

// Dev-only: expose CDP so the app can be driven for automated verification.
if (process.env['ELECTRON_RENDERER_URL']) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

let mainWindow: BrowserWindow | null = null

function themedBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#1b1c20' : '#fdfdff'
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: themedBackground(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Diagnostics (dev): forward renderer console + load failures into the terminal.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.webContents.on('console-message', (_e, level, message) => {
      console.log(`[renderer:${level}] ${message}`)
    })
    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.log(`[renderer] did-fail-load ${code} ${desc} ${url}`)
    })
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      console.log(`[renderer] process gone: ${details.reason}`)
    })
    if (process.env['OPEN_DEVTOOLS']) mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  // Push the current auth snapshot once the renderer is live.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send(IPC.authChanged, auth.getCached())
    void auth.refresh()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  app.setName('LinuxDO')
  nativeTheme.themeSource = 'system'

  registerIpc(() => mainWindow)
  void engine.init()

  createMainWindow()

  // Keep the native window chrome in step with the system light/dark switch.
  nativeTheme.on('updated', () => {
    mainWindow?.setBackgroundColor(themedBackground())
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

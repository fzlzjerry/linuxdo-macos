import { BrowserWindow } from 'electron'

const ORIGIN = 'https://linux.do'
const PARTITION = 'persist:linuxdo'

// Light, defensive declutter. A narrow window already triggers Discourse's
// responsive (mobile) layout, which collapses the sidebar; this just removes
// cookie/consent banners and floating promos that don't belong on a login sheet.
// The real linux.do login form and header are kept intact (trust matters here).
const DECLUTTER_CSS = `
  .cookie-consent, .cookie-banner, .house-creative, .below-site-header-outlet,
  .above-footer, .footer-message, #footer, .powered-by-discourse,
  .banner, .global-notice, .alert-info.alert-banner { display: none !important; }
  html, body { overflow-x: hidden !important; }
`

/**
 * A focused, native-feeling login sheet. Loads linux.do's real login page in a
 * narrow window (so its responsive layout stays clean) and closes itself once
 * the AuthManager sees the session become authenticated.
 */
export class LoginWindow {
  private win: BrowserWindow | null = null

  isOpen(): boolean {
    return !!this.win && !this.win.isDestroyed()
  }

  open(parent: BrowserWindow | null): void {
    if (this.isOpen()) {
      this.win!.show()
      this.win!.focus()
      return
    }

    this.win = new BrowserWindow({
      width: 480,
      height: 720,
      minWidth: 380,
      minHeight: 560,
      title: '登录 linux.do',
      parent: parent ?? undefined,
      center: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 16 },
      backgroundColor: '#1b1c20',
      show: false,
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    const wc = this.win.webContents
    const declutter = (): void => {
      wc.insertCSS(DECLUTTER_CSS).catch(() => {})
    }

    // Keep our own window title rather than inheriting linux.do's page <title>.
    wc.on('page-title-updated', (e) => {
      e.preventDefault()
      this.win?.setTitle('登录 linux.do')
    })

    wc.on('dom-ready', declutter)
    wc.once('did-finish-load', () => {
      declutter()
      this.win?.show()
      this.win?.focus()
    })
    wc.on('did-navigate', declutter)
    wc.on('did-navigate-in-page', declutter)
    this.win.on('closed', () => {
      this.win = null
    })

    void wc.loadURL(`${ORIGIN}/login`)

    // Fallback: reveal the window even if the load stalls behind a challenge.
    setTimeout(() => {
      if (this.win && !this.win.isDestroyed() && !this.win.isVisible()) {
        this.win.show()
        this.win.focus()
      }
    }, 2500)
  }

  close(): void {
    if (this.isOpen()) this.win!.close()
  }
}

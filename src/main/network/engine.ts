import { BrowserWindow, session } from 'electron'
import { RequestScheduler, sleep } from './scheduler'
import type { DiscourseRequest, DiscourseResponse } from '../../shared/api'

const ORIGIN = 'https://linux.do'
const PARTITION = 'persist:linuxdo'

interface RawResult {
  ok: boolean
  status: number
  isJson?: boolean
  json?: unknown
  text?: string
  error?: string
  needsAuth?: boolean
  retryAfter?: number
}

/**
 * The network engine hosts a hidden BrowserWindow parked on linux.do and runs
 * credentialed same-origin `fetch()` calls *inside that already-Cloudflare-cleared
 * page*. This is what lets a desktop app reach linux.do without the TLS-fingerprint
 * 403s and anti-bot subsystem a native HTTP client would need.
 */
export class DiscourseEngine {
  private win: BrowserWindow | null = null
  private ready: Promise<void> | null = null
  private coldRetryDone = false
  private readonly scheduler = new RequestScheduler(4)

  /** Create (once) the hidden linux.do window and wait for first load. */
  init(): Promise<void> {
    if (this.ready) return this.ready
    const ses = session.fromPartition(PARTITION)
    // Present a modern desktop-browser UA so Cloudflare treats us like a browser.
    ses.setUserAgent(
      ses.getUserAgent().replace(/Electron\/[\d.]+ /, '') // drop the Electron token
    )

    this.win = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      title: 'linux.do',
      webPreferences: {
        partition: PARTITION,
        // This window renders untrusted remote content; keep it locked down.
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false
      }
    })

    // If the linux.do webview crashes or is closed, drop our cached handle so the
    // next request transparently recreates it (long-running resilience).
    this.win.webContents.on('render-process-gone', () => this.invalidate())
    this.win.on('closed', () => this.invalidate())

    this.ready = new Promise<void>((resolve) => {
      const done = (): void => resolve()
      this.win!.webContents.once('did-finish-load', done)
      this.win!.webContents.once('did-fail-load', done) // resolve anyway; requests report needsAuth
    })

    void this.win.loadURL(ORIGIN + '/')
    return this.ready
  }

  private invalidate(): void {
    this.ready = null
    this.win = null
    this.coldRetryDone = false
  }

  /** Ensure a live engine window exists, recreating it if it died. */
  private ensureReady(): Promise<void> {
    if (!this.win || this.win.isDestroyed() || this.win.webContents.isDestroyed()) {
      if (this.win && !this.win.isDestroyed()) {
        try {
          this.win.destroy()
        } catch {
          /* already gone */
        }
      }
      this.ready = null
      this.win = null
    }
    return this.init()
  }

  private get webContents(): Electron.WebContents {
    if (!this.win || this.win.isDestroyed() || this.win.webContents.isDestroyed()) {
      throw new Error('Discourse engine window is not available')
    }
    return this.win.webContents
  }

  /** Bring the linux.do window forward so the user can log in / solve a challenge. */
  async showForLogin(): Promise<void> {
    await this.ensureReady()
    const wc = this.webContents
    const url = wc.getURL()
    if (!url.startsWith(ORIGIN)) await wc.loadURL(ORIGIN + '/login')
    this.win!.setTitle('登录 linux.do')
    this.win!.show()
    this.win!.focus()
  }

  hideLogin(): void {
    if (this.win && !this.win.isDestroyed()) this.win.hide()
  }

  /** Return the linux.do window to the origin root (used after logout etc.). */
  async resetToOrigin(): Promise<void> {
    await this.ensureReady()
    await this.webContents.loadURL(ORIGIN + '/')
  }

  onLoginWindowClosed(cb: () => void): void {
    this.win?.on('hide', cb)
  }

  /** Perform one Discourse request, with cold-start recovery + 429 back-off. */
  async request<T = unknown>(req: DiscourseRequest): Promise<DiscourseResponse<T>> {
    await this.ensureReady()
    return this.scheduler.run(async () => {
      let raw = await this.execute(req)

      // Cold start: the parked page may not have finished clearing Cloudflare
      // (no cf_clearance yet) on the very first requests. Reload once and retry.
      if (raw.needsAuth && !this.coldRetryDone) {
        this.coldRetryDone = true
        await this.reload()
        raw = await this.execute(req)
      }

      // Rate-limit back-off (up to 2 extra tries).
      for (let attempt = 1; raw.status === 429 && attempt <= 2; attempt++) {
        await sleep(Math.min(2000 * attempt, 6000) + (raw.retryAfter ?? 0) * 1000)
        raw = await this.execute(req)
      }

      return {
        ok: raw.ok,
        status: raw.status,
        json: raw.json as T | undefined,
        text: raw.text,
        error: raw.error,
        needsAuth: raw.needsAuth
      }
    })
  }

  private async reload(): Promise<void> {
    const wc = this.webContents
    await new Promise<void>((resolve) => {
      wc.once('did-finish-load', () => resolve())
      wc.once('did-fail-load', () => resolve())
      void wc.loadURL(ORIGIN + '/')
    })
  }

  /** Run the fetch inside the linux.do page context via executeJavaScript. */
  private async execute(req: DiscourseRequest): Promise<RawResult> {
    // Safely embed the request as a JS string literal of its JSON form.
    const literal = JSON.stringify(JSON.stringify(req))
    const code = `(async (reqJson) => {
      const req = JSON.parse(reqJson);
      const method = (req.method || 'GET').toUpperCase();
      const headers = Object.assign({}, req.headers || {});
      let body = undefined;
      if (method !== 'GET' && method !== 'HEAD') {
        headers['X-Requested-With'] = 'XMLHttpRequest';
        let csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        if (!csrf) {
          try {
            const c = await fetch('/session/csrf.json', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
            if (c.ok) csrf = (await c.json()).csrf;
          } catch (e) {}
        }
        if (csrf) headers['X-CSRF-Token'] = csrf;
        if (req.body != null) {
          if (req.form && typeof req.body === 'object') {
            const p = new URLSearchParams();
            for (const [k, v] of Object.entries(req.body)) {
              if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
              else if (v != null) p.append(k, String(v));
            }
            body = p.toString();
            headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
          } else if (typeof req.body === 'string') {
            body = req.body;
          } else {
            body = JSON.stringify(req.body);
            headers['Content-Type'] = 'application/json';
          }
        }
      }
      try {
        const r = await fetch(req.path, { method, headers, body, credentials: 'include' });
        const ct = r.headers.get('content-type') || '';
        const isJson = ct.includes('json');
        let json = undefined, text = undefined;
        if (isJson) { json = await r.json(); } else { text = (await r.text()).slice(0, 4000); }
        const challenge = !isJson && /just a moment|checking your browser|attention required|cf-browser-verification|请稍候/i.test(text || '');
        const needsAuth = r.status === 401 || r.status === 403 || challenge;
        const ra = parseInt(r.headers.get('retry-after') || '0', 10) || 0;
        return { ok: r.ok, status: r.status, isJson, json, text, needsAuth, retryAfter: ra };
      } catch (e) {
        return { ok: false, status: 0, error: String((e && e.message) || e) };
      }
    })(${literal})`

    try {
      return (await this.webContents.executeJavaScript(code, true)) as RawResult
    } catch (e) {
      return { ok: false, status: 0, error: String((e as Error)?.message ?? e) }
    }
  }
}

export const engine = new DiscourseEngine()

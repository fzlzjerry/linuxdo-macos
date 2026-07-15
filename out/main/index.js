import { session, BrowserWindow, ipcMain, shell, app, nativeTheme } from "electron";
import { join } from "path";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const IPC = {
  discourseRequest: "discourse:request",
  authGetState: "auth:getState",
  authShowLogin: "auth:showLogin",
  authLogout: "auth:logout",
  authChanged: "auth:changed",
  // main -> renderer push
  openExternal: "app:openExternal",
  windowControls: "app:windowControls"
};
class RequestScheduler {
  constructor(concurrency = 4) {
    this.concurrency = concurrency;
  }
  queue = [];
  active = 0;
  run(task) {
    return new Promise((resolve, reject) => {
      const exec = () => {
        this.active++;
        task().then(resolve, reject).finally(() => {
          this.active--;
          const next = this.queue.shift();
          if (next) next();
        });
      };
      if (this.active < this.concurrency) exec();
      else this.queue.push(exec);
    });
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORIGIN$2 = "https://linux.do";
const PARTITION$2 = "persist:linuxdo";
class DiscourseEngine {
  win = null;
  ready = null;
  coldRetryDone = false;
  scheduler = new RequestScheduler(4);
  /** Create (once) the hidden linux.do window and wait for first load. */
  init() {
    if (this.ready) return this.ready;
    const ses = session.fromPartition(PARTITION$2);
    ses.setUserAgent(
      ses.getUserAgent().replace(/Electron\/[\d.]+ /, "")
      // drop the Electron token
    );
    this.win = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      title: "linux.do",
      webPreferences: {
        partition: PARTITION$2,
        // This window renders untrusted remote content; keep it locked down.
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false
      }
    });
    this.win.webContents.on("render-process-gone", () => this.invalidate());
    this.win.on("closed", () => this.invalidate());
    this.ready = new Promise((resolve) => {
      const done = () => resolve();
      this.win.webContents.once("did-finish-load", done);
      this.win.webContents.once("did-fail-load", done);
    });
    void this.win.loadURL(ORIGIN$2 + "/");
    return this.ready;
  }
  invalidate() {
    this.ready = null;
    this.win = null;
    this.coldRetryDone = false;
  }
  /** Ensure a live engine window exists, recreating it if it died. */
  ensureReady() {
    if (!this.win || this.win.isDestroyed() || this.win.webContents.isDestroyed()) {
      if (this.win && !this.win.isDestroyed()) {
        try {
          this.win.destroy();
        } catch {
        }
      }
      this.ready = null;
      this.win = null;
    }
    return this.init();
  }
  get webContents() {
    if (!this.win || this.win.isDestroyed() || this.win.webContents.isDestroyed()) {
      throw new Error("Discourse engine window is not available");
    }
    return this.win.webContents;
  }
  /** Return the linux.do window to the origin root (used after logout etc.). */
  async resetToOrigin() {
    await this.ensureReady();
    await this.webContents.loadURL(ORIGIN$2 + "/");
  }
  /** Perform one Discourse request, with cold-start recovery + 429 back-off. */
  async request(req) {
    await this.ensureReady();
    return this.scheduler.run(async () => {
      let raw = await this.execute(req);
      if (raw.needsAuth && !this.coldRetryDone) {
        this.coldRetryDone = true;
        await this.reload();
        raw = await this.execute(req);
      }
      for (let attempt = 1; raw.status === 429 && attempt <= 2; attempt++) {
        await sleep(Math.min(2e3 * attempt, 6e3) + (raw.retryAfter ?? 0) * 1e3);
        raw = await this.execute(req);
      }
      return {
        ok: raw.ok,
        status: raw.status,
        json: raw.json,
        text: raw.text,
        error: raw.error,
        needsAuth: raw.needsAuth
      };
    });
  }
  async reload() {
    const wc = this.webContents;
    await new Promise((resolve) => {
      wc.once("did-finish-load", () => resolve());
      wc.once("did-fail-load", () => resolve());
      void wc.loadURL(ORIGIN$2 + "/");
    });
  }
  /** Run the fetch inside the linux.do page context via executeJavaScript. */
  async execute(req) {
    const literal = JSON.stringify(JSON.stringify(req));
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
    })(${literal})`;
    try {
      return await this.webContents.executeJavaScript(code, true);
    } catch (e) {
      return { ok: false, status: 0, error: String(e?.message ?? e) };
    }
  }
}
const engine = new DiscourseEngine();
class MessageBus {
  constructor(request, onMessages, intervalMs = 2e4) {
    this.request = request;
    this.onMessages = onMessages;
    this.intervalMs = intervalMs;
  }
  clientId = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  positions = /* @__PURE__ */ new Map();
  channels = [];
  seq = 0;
  timer = null;
  running = false;
  setChannels(channels) {
    for (const c of channels) if (!this.positions.has(c)) this.positions.set(c, -1);
    this.channels = channels;
  }
  start() {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }
  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  async loop() {
    if (!this.running) return;
    if (this.channels.length > 0) {
      const body = { __seq: this.seq++ };
      for (const c of this.channels) body[c] = this.positions.get(c) ?? -1;
      try {
        const res = await this.request({
          path: `/message-bus/${this.clientId}/poll?dlp=t`,
          method: "POST",
          form: true,
          body
        });
        const msgs = Array.isArray(res.json) ? res.json : [];
        for (const m of msgs) {
          if (typeof m.message_id === "number") this.positions.set(m.channel, m.message_id);
        }
        if (msgs.length) this.onMessages(msgs);
      } catch {
      }
    }
    if (this.running) this.timer = setTimeout(() => void this.loop(), this.intervalMs);
  }
}
const ORIGIN$1 = "https://linux.do";
const PARTITION$1 = "persist:linuxdo";
const DECLUTTER_CSS = `
  .cookie-consent, .cookie-banner, .house-creative, .below-site-header-outlet,
  .above-footer, .footer-message, #footer, .powered-by-discourse,
  .banner, .global-notice, .alert-info.alert-banner { display: none !important; }
  html, body { overflow-x: hidden !important; }
`;
class LoginWindow {
  win = null;
  isOpen() {
    return !!this.win && !this.win.isDestroyed();
  }
  open(parent) {
    if (this.isOpen()) {
      this.win.show();
      this.win.focus();
      return;
    }
    this.win = new BrowserWindow({
      width: 480,
      height: 720,
      minWidth: 380,
      minHeight: 560,
      title: "登录 linux.do",
      parent: parent ?? void 0,
      center: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 14, y: 16 },
      backgroundColor: "#1b1c20",
      show: false,
      webPreferences: {
        partition: PARTITION$1,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    const wc = this.win.webContents;
    const declutter = () => {
      wc.insertCSS(DECLUTTER_CSS).catch(() => {
      });
    };
    wc.on("page-title-updated", (e) => {
      e.preventDefault();
      this.win?.setTitle("登录 linux.do");
    });
    wc.on("dom-ready", declutter);
    wc.once("did-finish-load", () => {
      declutter();
      this.win?.show();
      this.win?.focus();
    });
    wc.on("did-navigate", declutter);
    wc.on("did-navigate-in-page", declutter);
    this.win.on("closed", () => {
      this.win = null;
    });
    void wc.loadURL(`${ORIGIN$1}/login`);
    setTimeout(() => {
      if (this.win && !this.win.isDestroyed() && !this.win.isVisible()) {
        this.win.show();
        this.win.focus();
      }
    }, 2500);
  }
  close() {
    if (this.isOpen()) this.win.close();
  }
}
const ORIGIN = "https://linux.do";
const PARTITION = "persist:linuxdo";
function expandAvatar(template, size = 120) {
  if (!template) return void 0;
  const path = template.replace("{size}", String(size));
  return path.startsWith("http") ? path : ORIGIN + path;
}
class AuthManager {
  state = { loggedIn: false };
  notify = null;
  polling = false;
  userId = null;
  bus = null;
  loginWindow = new LoginWindow();
  getParent = null;
  onChanged(cb) {
    this.notify = cb;
  }
  setParentProvider(fn) {
    this.getParent = fn;
  }
  getCached() {
    return this.state;
  }
  async refresh() {
    const res = await engine.request({ path: "/session/current.json" });
    const cu = res.json?.current_user;
    const next = cu ? {
      loggedIn: true,
      username: cu.username,
      name: cu.name,
      avatarUrl: expandAvatar(cu.avatar_template),
      unreadNotifications: (cu.unread_notifications ?? 0) + (cu.unread_high_priority_notifications ?? 0),
      unreadPersonalMessages: cu.unread_private_messages ?? cu.unread_personal_messages ?? 0
    } : { loggedIn: false };
    this.userId = cu?.id ?? null;
    this.syncLiveUpdates();
    const changed = JSON.stringify(next) !== JSON.stringify(this.state);
    this.state = next;
    if (changed) this.notify?.(next);
    return next;
  }
  /** Start/stop the MessageBus notification subscription with the login state. */
  syncLiveUpdates() {
    if (this.userId != null) {
      if (!this.bus) {
        this.bus = new MessageBus(
          (req) => engine.request(req),
          () => void this.refresh()
        );
      }
      this.bus.setChannels([
        `/notification/${this.userId}`,
        `/notification-alert/${this.userId}`
      ]);
      this.bus.start();
    } else if (this.bus) {
      this.bus.stop();
    }
  }
  /** Open a focused login sheet and poll until the session becomes authenticated. */
  async showLogin() {
    this.loginWindow.open(this.getParent?.() ?? null);
    if (!this.polling) void this.pollUntilLoggedIn();
    return this.state;
  }
  async pollUntilLoggedIn() {
    this.polling = true;
    const started = Date.now();
    try {
      while (Date.now() - started < 5 * 60 * 1e3) {
        if (!this.loginWindow.isOpen()) return;
        const s = await this.refresh();
        if (s.loggedIn) {
          this.loginWindow.close();
          void engine.resetToOrigin();
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      this.polling = false;
    }
  }
  async logout() {
    await session.fromPartition(PARTITION).clearStorageData({
      storages: ["cookies", "localstorage", "indexdb", "serviceworkers", "cachestorage"]
    });
    await engine.resetToOrigin();
    return this.refresh();
  }
}
const auth = new AuthManager();
function registerIpc(getMainWindow) {
  auth.setParentProvider(getMainWindow);
  auth.onChanged((state) => {
    getMainWindow()?.webContents.send(IPC.authChanged, state);
  });
  ipcMain.handle(IPC.discourseRequest, async (_e, req) => {
    const res = await engine.request(req);
    if (process.env["ELECTRON_RENDERER_URL"]) {
      console.log(
        `[discourse] ${req.method ?? "GET"} ${req.path} -> ${res.status} ok=${res.ok} needsAuth=${res.needsAuth ?? false} err=${res.error ?? ""}`
      );
    }
    if (res.needsAuth) void auth.refresh();
    return res;
  });
  ipcMain.handle(IPC.authGetState, async () => auth.refresh());
  ipcMain.handle(IPC.authShowLogin, async () => auth.showLogin());
  ipcMain.handle(IPC.authLogout, async () => auth.logout());
  ipcMain.handle(IPC.openExternal, async (_e, url) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url);
  });
  ipcMain.on(IPC.windowControls, (e, action) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (action === "minimize") win.minimize();
    else if (action === "maximize") win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === "close") win.close();
  });
}
app.commandLine.appendSwitch("disable-quic");
app.commandLine.appendSwitch(
  "disable-features",
  "EncryptedClientHello,UseDnsHttpsSvcb,UseDnsHttpsSvcbAlpn"
);
if (process.env["ELECTRON_RENDERER_URL"] && process.env["LINUXDO_CDP"]) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
}
let mainWindow = null;
function themedBackground() {
  return nativeTheme.shouldUseDarkColors ? "#1b1c20" : "#fdfdff";
}
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: themedBackground(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.webContents.on("console-message", (_e, level, message) => {
      console.log(`[renderer:${level}] ${message}`);
    });
    mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
      console.log(`[renderer] did-fail-load ${code} ${desc} ${url}`);
    });
    mainWindow.webContents.on("render-process-gone", (_e, details) => {
      console.log(`[renderer] process gone: ${details.reason}`);
    });
    if (process.env["OPEN_DEVTOOLS"]) mainWindow.webContents.openDevTools({ mode: "detach" });
  }
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow?.webContents.send(IPC.authChanged, auth.getCached());
    void auth.refresh();
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    void mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
app.whenReady().then(() => {
  app.setName("LinuxDO");
  nativeTheme.themeSource = "system";
  registerIpc(() => mainWindow);
  void engine.init();
  createMainWindow();
  nativeTheme.on("updated", () => {
    mainWindow?.setBackgroundColor(themedBackground());
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

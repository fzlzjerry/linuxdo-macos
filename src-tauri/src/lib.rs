use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use base64::Engine as _;
use rand::RngCore;
use rsa::pkcs8::{EncodePublicKey, LineEnding};
use rsa::{Pkcs1v15Encrypt, RsaPrivateKey, RsaPublicKey};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;
use url::Url;

const ORIGIN: &str = "https://linux.do";

/// A browser-authorize attempt in flight (Discourse User-API-Key OTP flow).
struct PendingLogin {
    private_key: RsaPrivateKey,
    nonce: String,
}

/// Shared state: pending bridge requests, an id counter, the cached auth state,
/// and any in-flight browser login.
struct AppState {
    pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    next_id: AtomicU64,
    auth: Mutex<Value>,
    login_polling: AtomicBool,
    pending_login: Mutex<Option<PendingLogin>>,
    started: std::time::Instant,
    cold_reload_done: AtomicBool,
}

impl AppState {
    fn new() -> Self {
        AppState {
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            auth: Mutex::new(json!({ "loggedIn": false })),
            login_polling: AtomicBool::new(false),
            pending_login: Mutex::new(None),
            started: std::time::Instant::now(),
            cold_reload_done: AtomicBool::new(false),
        }
    }
}

fn random_hex(n: usize) -> String {
    let mut b = vec![0u8; n];
    rand::thread_rng().fill_bytes(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Strip whitespace (Ruby Base64.encode64 inserts newlines), base64-decode,
/// then RSA PKCS1v15-decrypt with our private key.
fn rsa_decrypt(key: &RsaPrivateKey, b64: &str) -> Result<Vec<u8>, String> {
    let cleaned: String = b64.chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(cleaned)
        .map_err(|e| e.to_string())?;
    key.decrypt(Pkcs1v15Encrypt, &bytes).map_err(|e| e.to_string())
}

/// JS injected into the linux.do WKWebView. Runs a credentialed same-origin fetch
/// (so Cloudflare sees Safari/WebKit) and emits the result back to Rust by id.
const FETCH_JS: &str = r#"
async function __linuxdoFetch(id, reqJson) {
  const req = JSON.parse(reqJson);
  const method = (req.method || 'GET').toUpperCase();
  const headers = Object.assign({}, req.headers || {});
  let body = undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    headers['X-Requested-With'] = 'XMLHttpRequest';
    let csrf = document.querySelector('meta[name="csrf-token"]');
    csrf = csrf && csrf.getAttribute('content');
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
        for (const k in req.body) {
          const v = req.body[k];
          if (Array.isArray(v)) v.forEach(function (x) { p.append(k, String(x)); });
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
  let payload;
  try {
    const r = await fetch(req.path, { method: method, headers: headers, body: body, credentials: 'include' });
    const ct = r.headers.get('content-type') || '';
    const isJson = ct.indexOf('json') !== -1;
    let json = undefined, text = undefined;
    if (isJson) { json = await r.json(); } else { text = (await r.text()).slice(0, 4000); }
    const challenge = !isJson && /just a moment|checking your browser|attention required|cf-browser-verification|请稍候|verify you are human/i.test(text || '');
    const needsAuth = r.status === 401 || r.status === 403 || challenge;
    payload = { id: id, ok: r.ok, status: r.status, isJson: isJson, json: json, text: text, needsAuth: needsAuth };
  } catch (e) {
    payload = { id: id, ok: false, status: 0, error: String((e && e.message) || e) };
  }
  try { window.__TAURI__.event.emit('bridge:result', payload); } catch (e) {}
}
"#;

fn create_engine(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(
        app,
        "engine",
        WebviewUrl::External(Url::parse(&format!("{ORIGIN}/")).unwrap()),
    )
    .visible(false)
    .title("engine")
    .build()?;
    Ok(())
}

/// Ensure the hidden engine webview exists, recreating it (on the main thread) if it died.
fn ensure_engine(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window("engine").is_some() {
        return Ok(());
    }
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        let _ = create_engine(&app2);
    })
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Run one fetch inside the engine webview and await the bridged result.
async fn eval_fetch(app: &AppHandle, req: &Value) -> Result<Value, String> {
    let webview = app
        .get_webview_window("engine")
        .ok_or_else(|| "engine webview not available".to_string())?;
    let state = app.state::<AppState>();
    let id = state.next_id.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = oneshot::channel::<Value>();
    state.pending.lock().unwrap().insert(id, tx);

    let req_str = serde_json::to_string(req).map_err(|e| e.to_string())?;
    let req_lit = serde_json::to_string(&req_str).map_err(|e| e.to_string())?;
    let script = format!("{FETCH_JS}\n__linuxdoFetch({id}, {req_lit});");
    webview.eval(&script).map_err(|e| e.to_string())?;

    match tokio::time::timeout(Duration::from_secs(30), rx).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(_)) => {
            state.pending.lock().unwrap().remove(&id);
            Ok(json!({ "ok": false, "status": 0, "error": "bridge channel closed" }))
        }
        Err(_) => {
            state.pending.lock().unwrap().remove(&id);
            Ok(json!({ "ok": false, "status": 0, "error": "timeout" }))
        }
    }
}

/// Perform a request with cold-start / transient retries and 429 back-off.
async fn do_request(app: &AppHandle, req: Value) -> Result<Value, String> {
    ensure_engine(app)?;
    let mut attempt: u32 = 0;
    loop {
        let raw = eval_fetch(app, &req).await?;
        let status = raw.get("status").and_then(|v| v.as_u64()).unwrap_or(0);
        let has_err = raw.get("error").is_some();
        let needs_auth = raw.get("needsAuth").and_then(|v| v.as_bool()).unwrap_or(false);
        if (has_err || status == 0) && attempt < 3 {
            attempt += 1;
            let _ = ensure_engine(app);
            tokio::time::sleep(Duration::from_millis(1200)).await;
            continue;
        }
        // Cold start: on the first ~15s the engine may not have cleared Cloudflare
        // yet. Reload the origin once and retry so first launch doesn't flash a
        // spurious "need login" state.
        {
            let st = app.state::<AppState>();
            if needs_auth && attempt < 1 && st.started.elapsed() < Duration::from_secs(15) {
                attempt += 1;
                if !st.cold_reload_done.swap(true, Ordering::SeqCst) {
                    if let Some(e) = app.get_webview_window("engine") {
                        let _ = e.eval(&format!("location.replace('{ORIGIN}/')"));
                    }
                }
                tokio::time::sleep(Duration::from_millis(1800)).await;
                continue;
            }
        }
        if status == 429 && attempt < 2 {
            attempt += 1;
            tokio::time::sleep(Duration::from_millis(1500 * attempt as u64)).await;
            continue;
        }
        return Ok(raw);
    }
}

fn build_response(raw: &Value) -> Value {
    let mut m = serde_json::Map::new();
    m.insert(
        "ok".into(),
        json!(raw.get("ok").and_then(|v| v.as_bool()).unwrap_or(false)),
    );
    m.insert(
        "status".into(),
        json!(raw.get("status").and_then(|v| v.as_u64()).unwrap_or(0)),
    );
    if let Some(j) = raw.get("json") {
        if !j.is_null() {
            m.insert("json".into(), j.clone());
        }
    }
    if let Some(t) = raw.get("text") {
        if !t.is_null() {
            m.insert("text".into(), t.clone());
        }
    }
    if let Some(e) = raw.get("error") {
        if !e.is_null() {
            m.insert("error".into(), e.clone());
        }
    }
    m.insert(
        "needsAuth".into(),
        json!(raw.get("needsAuth").and_then(|v| v.as_bool()).unwrap_or(false)),
    );
    Value::Object(m)
}

fn expand_avatar(template: Option<&str>) -> Option<String> {
    template.map(|t| {
        let p = t.replace("{size}", "120");
        if p.starts_with("http") {
            p
        } else {
            format!("{ORIGIN}{p}")
        }
    })
}

/// Read /session/current.json, update + emit the cached auth state, return it.
async fn refresh_auth(app: &AppHandle) -> Value {
    let raw = do_request(app, json!({ "path": "/session/current.json" }))
        .await
        .unwrap_or_else(|_| json!({}));
    let cu = raw.get("json").and_then(|j| j.get("current_user"));
    let next = match cu {
        Some(cu) if cu.is_object() => {
            let unread = cu.get("unread_notifications").and_then(|v| v.as_u64()).unwrap_or(0)
                + cu.get("unread_high_priority_notifications").and_then(|v| v.as_u64()).unwrap_or(0);
            let pms = cu
                .get("unread_private_messages")
                .and_then(|v| v.as_u64())
                .or_else(|| cu.get("unread_personal_messages").and_then(|v| v.as_u64()))
                .unwrap_or(0);
            json!({
                "loggedIn": true,
                "username": cu.get("username").and_then(|v| v.as_str()),
                "name": cu.get("name").and_then(|v| v.as_str()),
                "avatarUrl": expand_avatar(cu.get("avatar_template").and_then(|v| v.as_str())),
                "unreadNotifications": unread,
                "unreadPersonalMessages": pms
            })
        }
        _ => json!({ "loggedIn": false }),
    };

    let state = app.state::<AppState>();
    let changed = {
        let mut cur = state.auth.lock().unwrap();
        if *cur != next {
            *cur = next.clone();
            true
        } else {
            false
        }
    };
    if changed {
        let _ = app.emit("auth:changed", next.clone());
    }
    next
}

fn open_login_window(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("login") {
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(
        app,
        "login",
        WebviewUrl::External(Url::parse(&format!("{ORIGIN}/login")).unwrap()),
    )
    .title("登录 linux.do")
    .inner_size(480.0, 720.0)
    .min_inner_size(380.0, 560.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------- Commands ----------------

#[tauri::command]
async fn discourse_request(app: AppHandle, req: Value) -> Result<Value, String> {
    let raw = do_request(&app, req).await?;
    Ok(build_response(&raw))
}

#[tauri::command]
async fn auth_get_state(app: AppHandle) -> Result<Value, String> {
    Ok(refresh_auth(&app).await)
}

#[tauri::command]
async fn auth_show_login(app: AppHandle) -> Result<Value, String> {
    // Discourse User-API-Key (OTP) flow: the user authorizes in their own browser
    // (already logged in — one click, no password) and the app receives an encrypted
    // token back via the discourse:// deep link.
    let priv_key = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).map_err(|e| e.to_string())?;
    let pub_pem = RsaPublicKey::from(&priv_key)
        .to_public_key_pem(LineEnding::LF)
        .map_err(|e| e.to_string())?;
    let nonce = random_hex(16);
    let client_id = random_hex(16);

    {
        use tauri_plugin_deep_link::DeepLinkExt;
        let _ = app.deep_link().register("discourse");
    }

    *app.state::<AppState>().pending_login.lock().unwrap() = Some(PendingLogin {
        private_key: priv_key,
        nonce: nonce.clone(),
    });

    let mut url = Url::parse(&format!("{ORIGIN}/user-api-key/new")).unwrap();
    url.query_pairs_mut()
        .append_pair("application_name", "LinuxDO")
        .append_pair("client_id", &client_id)
        .append_pair("scopes", "one_time_password")
        .append_pair("public_key", &pub_pem)
        .append_pair("nonce", &nonce)
        .append_pair("auth_redirect", "discourse://auth_redirect");

    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_url(url.to_string(), None::<&str>)
            .map_err(|e| e.to_string())?;
    }

    Ok(app.state::<AppState>().auth.lock().unwrap().clone())
}

/// Fallback: the in-app WKWebView login sheet (kept if the browser flow is unavailable).
#[tauri::command]
async fn auth_show_login_webview(app: AppHandle) -> Result<Value, String> {
    open_login_window(&app)?;
    let state = app.state::<AppState>();
    if !state.login_polling.swap(true, Ordering::SeqCst) {
        let app2 = app.clone();
        tauri::async_runtime::spawn(async move {
            let start = std::time::Instant::now();
            loop {
                if app2.get_webview_window("login").is_none() {
                    break;
                }
                let s = refresh_auth(&app2).await;
                if s.get("loggedIn").and_then(|v| v.as_bool()).unwrap_or(false) {
                    if let Some(w) = app2.get_webview_window("login") {
                        let _ = w.close();
                    }
                    // Reload the engine on the freshly authenticated session.
                    if let Some(e) = app2.get_webview_window("engine") {
                        let _ = e.eval(&format!("location.replace('{ORIGIN}/')"));
                    }
                    break;
                }
                if start.elapsed() > Duration::from_secs(300) {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(1500)).await;
            }
            app2.state::<AppState>()
                .login_polling
                .store(false, Ordering::SeqCst);
        });
    }
    Ok(app.state::<AppState>().auth.lock().unwrap().clone())
}

#[tauri::command]
async fn auth_logout(app: AppHandle) -> Result<Value, String> {
    if let Some(engine) = app.get_webview_window("engine") {
        let _ = engine.clear_all_browsing_data();
        let _ = engine.eval(&format!("location.replace('{ORIGIN}/')"));
    }
    tokio::time::sleep(Duration::from_millis(600)).await;
    Ok(refresh_auth(&app).await)
}

#[tauri::command]
async fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if url.starts_with("http://") || url.starts_with("https://") {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Handle a `discourse://auth_redirect?payload=…&oneTimePassword=…` callback:
/// decrypt with our private key, verify the nonce, then redeem the OTP for a session.
fn handle_deep_link(app: &AppHandle, url: &str) {
    let parsed = match Url::parse(url) {
        Ok(u) => u,
        Err(_) => return,
    };
    if parsed.scheme() != "discourse" {
        return;
    }
    let mut payload_b64: Option<String> = None;
    let mut otp_b64: Option<String> = None;
    for (k, v) in parsed.query_pairs() {
        match k.as_ref() {
            "payload" => payload_b64 = Some(v.into_owned()),
            "oneTimePassword" | "one_time_password" => otp_b64 = Some(v.into_owned()),
            _ => {}
        }
    }
    let pending = match app.state::<AppState>().pending_login.lock().unwrap().take() {
        Some(p) => p,
        None => return,
    };
    let payload_b64 = match payload_b64 {
        Some(p) => p,
        None => return,
    };
    let payload_bytes = match rsa_decrypt(&pending.private_key, &payload_b64) {
        Ok(b) => b,
        Err(_) => return,
    };
    let payload: Value = match serde_json::from_slice(&payload_bytes) {
        Ok(v) => v,
        Err(_) => return,
    };
    if payload.get("nonce").and_then(|v| v.as_str()) != Some(pending.nonce.as_str()) {
        return;
    }
    let otp = match otp_b64.and_then(|o| rsa_decrypt(&pending.private_key, &o).ok()) {
        Some(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        None => return,
    };
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        redeem_otp(&app2, &otp).await;
    });
}

/// Redeem the one-time password for a `_t` session cookie in the engine webview.
async fn redeem_otp(app: &AppHandle, otp: &str) {
    let csrf_res = do_request(app, json!({ "path": "/session/csrf.json" }))
        .await
        .unwrap_or_else(|_| json!({}));
    let csrf = csrf_res
        .get("json")
        .and_then(|j| j.get("csrf"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let _ = do_request(
        app,
        json!({
            "path": format!("/session/otp/{otp}"),
            "method": "POST",
            "headers": { "X-CSRF-Token": csrf, "X-Requested-With": "XMLHttpRequest" }
        }),
    )
    .await;

    if let Some(e) = app.get_webview_window("engine") {
        let _ = e.eval(&format!("location.replace('{ORIGIN}/')"));
    }
    tokio::time::sleep(Duration::from_millis(700)).await;
    let _ = refresh_auth(app).await;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            for arg in args {
                if arg.starts_with("discourse://") {
                    handle_deep_link(app, &arg);
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .setup(|app| {
            let handle = app.handle().clone();
            let _ = create_engine(&handle);

            let bus = handle.clone();
            app.listen("bridge:result", move |event| {
                if let Ok(v) = serde_json::from_str::<Value>(event.payload()) {
                    if let Some(id) = v.get("id").and_then(|x| x.as_u64()) {
                        let st = bus.state::<AppState>();
                        let sender = st.pending.lock().unwrap().remove(&id);
                        if let Some(tx) = sender {
                            let _ = tx.send(v);
                        }
                    }
                }
            });

            // discourse:// auth-redirect callbacks (browser login).
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let dl = handle.clone();
                app.deep_link().on_open_url(move |event| {
                    for u in event.urls() {
                        handle_deep_link(&dl, u.as_str());
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            discourse_request,
            auth_get_state,
            auth_show_login,
            auth_show_login_webview,
            auth_logout,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

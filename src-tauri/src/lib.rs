use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;
use url::Url;

const ORIGIN: &str = "https://linux.do";

/// Shared state: pending bridge requests, an id counter, and the cached auth state.
struct AppState {
    pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    next_id: AtomicU64,
    auth: Mutex<Value>,
    login_polling: AtomicBool,
}

impl AppState {
    fn new() -> Self {
        AppState {
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            auth: Mutex::new(json!({ "loggedIn": false })),
            login_polling: AtomicBool::new(false),
        }
    }
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
        if (has_err || status == 0) && attempt < 3 {
            attempt += 1;
            let _ = ensure_engine(app);
            tokio::time::sleep(Duration::from_millis(1200)).await;
            continue;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            discourse_request,
            auth_get_state,
            auth_show_login,
            auth_logout,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

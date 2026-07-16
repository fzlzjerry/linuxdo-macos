//! Native macOS menu bar.
//!
//! Every custom item forwards its id to the renderer via a single
//! `menu:action` event on the main window — no business logic lives here.
//! Only the two Help links are handled natively (opened in the browser).

use tauri::menu::{
    AboutMetadataBuilder, IsMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu,
};
use tauri::{AppHandle, Emitter, Wry};

const SITE_URL: &str = "https://linux.do";
const REPO_URL: &str = "https://github.com/fzlzjerry/linuxdo-macos";

/// Quick-nav labels, in the exact order of `QUICK_NAV` in
/// `src/renderer/src/lib/nav.tsx` — keep the two lists in sync.
const QUICK_NAV_LABELS: [&str; 9] = [
    "最新", "新话题", "未读", "热门", "排行", "分类", "聊天", "通知", "私信",
];

pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let pkg = app.package_info();
    let app_name = pkg.name.clone();
    let about_text = format!("关于 {app_name}");
    let about = AboutMetadataBuilder::new()
        .name(Some(app_name.clone()))
        .version(Some(pkg.version.to_string()))
        .build();

    // App menu (macOS always titles the first submenu with the product name).
    let app_menu = Submenu::with_items(
        app,
        &app_name,
        true,
        &[
            &PredefinedMenuItem::about(app, Some(&about_text), Some(about))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "app.settings", "设置…", true, Some("Cmd+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some("服务"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some(&format!("隐藏 {app_name}")))?,
            &PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?,
            &PredefinedMenuItem::show_all(app, Some("全部显示"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some(&format!("退出 {app_name}")))?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "文件",
        true,
        &[
            &MenuItem::with_id(app, "file.new-topic", "发帖…", true, Some("Cmd+N"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some("关闭窗口"))?,
        ],
    )?;

    // Keep the full predefined edit group: it is what makes ⌘C/⌘V/⌘X/⌘A/⌘Z
    // reach the WKWebView responder chain. Dropping any of these breaks the
    // clipboard shortcuts (Tauri's implicit default menu ships the same set).
    let edit_menu = Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("撤销"))?,
            &PredefinedMenuItem::redo(app, Some("重做"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("剪切"))?,
            &PredefinedMenuItem::copy(app, Some("拷贝"))?,
            &PredefinedMenuItem::paste(app, Some("粘贴"))?,
            &PredefinedMenuItem::select_all(app, Some("全选"))?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "显示",
        true,
        &[
            &MenuItem::with_id(app, "view.reload", "刷新", true, Some("CmdOrCtrl+R"))?,
            &MenuItem::with_id(app, "view.toggle-sidebar", "切换侧栏", true, Some("Alt+Cmd+S"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "view.font-up", "放大字体", true, Some("Cmd+="))?,
            &MenuItem::with_id(app, "view.font-down", "缩小字体", true, Some("Cmd+-"))?,
            &MenuItem::with_id(app, "view.font-reset", "实际大小", true, Some("Cmd+0"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, Some("切换全屏"))?,
        ],
    )?;

    // Go menu: back/forward + the nine quick-nav destinations (⌘1–⌘9).
    let back = MenuItem::with_id(app, "go.back", "后退", true, Some("Cmd+["))?;
    let forward = MenuItem::with_id(app, "go.forward", "前进", true, Some("Cmd+]"))?;
    let go_sep = PredefinedMenuItem::separator(app)?;
    let quick_items = QUICK_NAV_LABELS
        .iter()
        .enumerate()
        .map(|(i, label)| {
            let n = i + 1;
            MenuItem::with_id(app, format!("go.quick.{n}"), *label, true, Some(format!("Cmd+{n}")))
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let mut go_items: Vec<&dyn IsMenuItem<Wry>> = vec![&back, &forward, &go_sep];
    go_items.extend(quick_items.iter().map(|i| i as &dyn IsMenuItem<Wry>));
    let go_menu = Submenu::with_items(app, "前往", true, &go_items)?;

    let window_menu = Submenu::with_items(
        app,
        "窗口",
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some("最小化"))?,
            &PredefinedMenuItem::maximize(app, Some("缩放"))?,
        ],
    )?;
    #[cfg(target_os = "macos")]
    window_menu.set_as_windows_menu_for_nsapp()?;

    let help_menu = Submenu::with_items(
        app,
        "帮助",
        true,
        &[
            &MenuItem::with_id(app, "help.site", "linux.do 官网", true, None::<&str>)?,
            &MenuItem::with_id(app, "help.repo", "GitHub 仓库", true, None::<&str>)?,
        ],
    )?;
    #[cfg(target_os = "macos")]
    help_menu.set_as_help_menu_for_nsapp()?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &go_menu,
            &window_menu,
            &help_menu,
        ],
    )
}

pub fn handle_event(app: &AppHandle, event: MenuEvent) {
    match event.id().0.as_str() {
        "help.site" => open_url(app, SITE_URL),
        "help.repo" => open_url(app, REPO_URL),
        // Everything else is a renderer concern — forward the id verbatim.
        _ => {
            let _ = app.emit_to("main", "menu:action", event.id().0.clone());
        }
    }
}

fn open_url(app: &AppHandle, url: &str) {
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_url(url, None::<&str>);
}

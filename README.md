# Oh My LinuxDo

linux.do 的 macOS 客户端,Tauri 2 + React 写的。

## 安装

去 [Releases](https://github.com/fzlzjerry/linuxdo-macos/releases) 下载 dmg,Intel 和 Apple Silicon 都能用。没有开发者签名,第一次要右键 →「打开」。装好后有新版本会自动更新。

## 功能

- 阅读进度和网页端互相同步,有未读分隔线,能接着上次的位置读
- 回帖、发帖、私信、聊天,草稿和网页端互通
- 表情回应(和网页端同一套,含自定义表情)、点赞、书签、通知铃铛 + Dock 角标
- ⌘K 命令面板(支持拼音搜索)、原生菜单栏快捷键、j/k 键盘导航、明暗主题
- 帖子里的代码高亮、投票、链接卡片、图片灯箱都能正常显示

## 原理

应用里藏着一个停在 linux.do 上的 WKWebView,所有请求由它在页面里代发,所以能正常过 Cloudflare,不需要 API key,登录 cookie 只存在本地。登录就是打开真实的 linux.do 登录页自己登。

## 开发

需要 Node 20+、Rust、Xcode Command Line Tools,只支持 macOS。

```bash
npm install
npm run dev
```

改了 `src-tauri/icons/` 之后 cargo 不会自动重编,`touch src-tauri/src/lib.rs` 一下再跑。

发版:往 main 推一个首行带 `[RELEASE] vX.Y.Z` 的提交,CI 会构建 universal dmg 并发布。

设计文档在 [PRODUCT.md](PRODUCT.md) 和 [DESIGN.md](DESIGN.md)。非官方客户端,和 linux.do 官方无关。MIT License。

## 友链

- [linux.do](https://linux.do) —— Where possible begins

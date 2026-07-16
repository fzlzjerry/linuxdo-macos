# Design

macOS 原生感 product UI。单一无衬线系统字体栈,OKLCH 双主题 token,克制配色(Restrained:中性面 + 单一 accent ≤10%)。本文件描述 `src/renderer/src/styles/tokens.css` 的既定视觉系统;改样式先改 token,再谈局部覆盖。

## Color

- **Accent**:linux.do 蓝 `oklch(0.63 0.132 233)`(光标态 `--accent-hover`,12% 软底 `--accent-soft`)。仅用于主操作、当前选中、状态指示。
- **中性面**:`--bg`(浅色 L 0.982——刻意低于纯白,让 `--surface` 白面能"浮"起来)→ `--surface`(内容面)→ `--surface-2`(输入底/chip)→ `--surface-hover/active`;侧边栏用独立第二中性层 `--sidebar-bg`;暗色 chrome 更深(sidebar 0.168 < bg 0.196 < surface 0.24),层级靠明度差不靠发灰。
- **文字三档**:`--ink`(主文)、`--ink-2`(次级但有意义)、`--ink-3`(装饰性冗余 meta,浅色 L=0.53 保 AA——含 --sidebar-bg/--surface-2 上)。**规则:小字号有意义文本用 --ink-2,--ink-3 只给时间戳/计数等有冗余表达的装饰;染色底(分类 tint、通知 chip)上一律 --ink-2 起。**
- **语义色**:`--success / --danger / --warning / --like`,软底一律 `color-mix(in oklch, var(--X) 12%, transparent)`(如 `--danger-soft`);背板 `--scrim`。
- **内容带色(chrome 不带)**:分类色经 inline `--cat` 变量进 `color-mix`(话题页头部 6%/暗 10% 染底,无分类 fallback `transparent` = 无染);通知图标按类型着色(`notificationMeta.colorFor`:like/accent/success/warning),chip 底 14% mix,浅色主题字形向 --ink 拉 72% 保 3:1。分类色/类型色只做 ≤14% 染底与图形,绝不做文字色。
- 主题由 JS 驱动:`data-theme="dark|light"` 挂在 `<html>`,单一 dark 块,`color-scheme` 同步(原生滚动条/控件自动适配)。

## Typography

- 单一家族:`-apple-system 'SF Pro Text' 'PingFang SC'` 栈;等宽 `SF Mono`。
- 固定 rem 阶梯 `--fs-xs 12 / sm 13 / base 15 / md 16 / lg 18 / xl 22 / 2xl 28`,禁止 px 字号(会脱离用户字号设置——root font-size 由设置项缩放)。
- 长文(cooked)16px/1.7,阅读列 `max-width: 760px`。

## Spacing / Radius / Z / Motion

- 空间:`--sp-1..10`(4 的倍数);行内边距用 `--list-pad-y`(密度设置驱动:舒适 12px / 紧凑 8px,`data-density` 挂 `<html>`)。
- 圆角:`--r-sm 6 / md 8 / lg 12 / full`。卡片 ≤12px,药丸 full。
- Z 语义阶梯:base 1 / sticky 200 / dropdown 300 / modal-backdrop 400 / modal 500 / toast 600 / tooltip 700。禁止裸数字。
- 动效:`--dur-fast 120 / --dur 180 / --dur-slow 240` + `--ease-out`(expo 类)。动效只表达状态变化;浮层入场统一 opacity+scale(0.98)+translateY(-2px) `--dur-fast`,`@media (prefers-reduced-motion: no-preference)` 包裹;全局 reduced-motion kill-switch 在 global.css。

## Elevation(深度表——按层级归位,禁止混层)

| 层级 | 元素 | 配方 |
|---|---|---|
| 0 in-flow | 列表行、post、设置区块 | 无阴影;`--separator` 内缩分隔(listRow `::after`,inset 可用 `--row-sep-inset` 覆盖)或留白 |
| 0.5 控件 | primary/secondary 按钮、Segmented 活动块 | `--shadow-xs`;primary 另有顶部 sheen 渐变+inset 亮线,按下全部撤掉 |
| 1 sticky | 工具栏、进度药丸 | blur 材质 + hairline + `--shadow-sm` |
| 2 浮层 | Menu/popover/autocomplete/UserCard/Bell | `1px --border` + `var(--edge-highlight), var(--shadow-md)` |
| 3 模态 | Modal/CommandPalette/Lightbox | `var(--edge-highlight), var(--shadow-pop)` + `--scrim` |

in-flow 卡片二选一:hairline **或** `--shadow-sm`,不叠加;浮层的 border+shadow 是 macOS 材质,属功能不属装饰。`--edge-highlight` 暗色下是面板顶缘亮线,浅色下近不可见。

## Focus

全局 `:focus-visible { outline: var(--ring-w) solid var(--ring-color); outline-offset: var(--ring-offset) }`(outline 跟随元素圆角、forced-colors 可见)。通栏列表行用 inset 变体(offset -2px,不被 overflow 裁剪)。输入框:边框变 accent + 3px `--accent-soft` ring + 透明 outline。

## Components(components/ui/ 为唯一来源)

Button(primary/secondary/ghost/danger,全状态含 :active)、IconButton、Field(label+hint+error+aria 接线,规范 .input 类)、Tag、Segmented(radiogroup 语义,roving tabindex)、Modal(原生 dialog,受控关闭,aria-labelledby)、Toaster(info/success/error/warning,hover 暂停,≤3 条,可带 action)、Avatar(双主题兜底色)、CategoryBadge、states(Skeleton/CardGridSkeleton/Spinner/EmptyState/ErrorState)、LoginGate、Lightbox;共享 `listRow.module.css`(.row/.rowGroup+.overlay+.actions)与 `card.module.css` 供 composes。

## Patterns

- 列表行:composes listRow;含尾部动作的行用 overlay 模式(外层 div + 绝对定位主按钮 + 动作提 z-index)。
- 加载:skeleton 匹配内容形状(列表用行状,网格用卡状),不用居中大 spinner。
- 空态教学化,错误态区分 网络/登录/限流,危险操作行内二次确认。
- 窗口:Overlay 标题栏,拖拽用 `data-tauri-drag-region` 覆盖层(WKWebView 不支持 -webkit-app-region)。

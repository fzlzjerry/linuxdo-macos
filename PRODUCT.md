# Product

## Register

product

## Users

linux.do(Discourse 论坛)的重度读者与活跃发帖者,以开发者为主,macOS 桌面环境。典型场景:工作间隙长时间挂后台,随手查看新帖/通知,深度阅读长帖,偶尔回帖、发帖、私信。用户对 macOS 原生应用(Mail、Things、NetNewsWire)的交互习惯有肌肉记忆。

## Product Purpose

把 linux.do 从「浏览器里的一个标签页」变成一等公民的 macOS 原生客户端:更快的阅读流、系统级的窗口/通知/快捷键整合、离开时状态不丢。成功的标准是用户不再打开网页版。

## Brand Personality

原生、克制、高效。界面应当消失在任务之后——阅读时只有内容,操作时反馈即时且安静。唯一的品牌色是 linux.do 自己的蓝(#099dd7 → oklch accent),用于主操作、当前选中和状态指示,不做装饰。

## Anti-references

- Electron 网页壳感:网页字体、自定义滚动条、到处都是的卡片和阴影、加载转圈占满屏幕。
- Discourse 网页版复刻:不追求视觉像素级还原论坛网页,追求内容一致、交互原生。
- SaaS 仪表盘风:大数字卡片、渐变按钮、装饰性图表。

## Design Principles

1. **工具隐形**:阅读界面里内容优先级最高,chrome 只在需要时出现(sticky 进度药丸、hover 显现的动作)。
2. **状态永远完整**:每个交互组件必须有 default/hover/focus-visible/active/disabled/loading/error;每个页面必须有 skeleton/empty/error。
3. **反馈即时且可撤销**:乐观更新 + 失败回滚 + toast 撤销;危险操作二次确认而非阻断弹窗。
4. **键盘是一等输入**:所有操作可键盘完成,焦点永远可见,快捷键遵循 macOS 惯例(⌘K 搜索、⌘[ 返回,Esc 只做取消)。
5. **同一词汇表**:同一操作在所有页面长得一样;共享原语(Button/Field/Tag/ListRow/Card)是唯一来源。

## Accessibility & Inclusion

WCAG AA:正文与有意义的小字对比度 ≥4.5:1;完整键盘可达 + 可见焦点(含 forced-colors);prefers-reduced-motion 全局尊重;VoiceOver 语义正确(radiogroup、aria-pressed、aria-labelledby、role=alert)。

import type { NavigateFunction } from 'react-router-dom'
import type { QueryClient } from '@tanstack/react-query'
import { NAV_SECTIONS, QUICK_NAV } from './nav'
import { useSettings } from '../store/settings'
import { useComposerStore } from '../store/composer'
import { useUpdater } from '../store/updater'

export interface CommandCtx {
  navigate: NavigateFunction
  queryClient: QueryClient
  goBack: () => void
}

export interface AppCommand {
  id: string
  title: string
  keywords: string[]
  section: '导航' | '动作'
  /** Shortcut shown as a hint in the palette (display only). */
  hint?: string
  /** Runs even while a native <dialog> is open (default: blocked). */
  allowInDialog?: boolean
  run: (ctx: CommandCtx) => void
}

/** Font-size steps mirror the settings page's Segmented options. */
export const FONT_STEPS = [0.9, 1, 1.15, 1.3]

function stepFont(dir: 1 | -1): void {
  const s = useSettings.getState()
  const idx = FONT_STEPS.indexOf(s.fontScale)
  const next = FONT_STEPS[(idx === -1 ? 1 : idx) + dir]
  if (next != null) s.setFontScale(next)
}

const QUICK_HINTS = new Map(QUICK_NAV.map((item, i) => [item.to, `⌘${i + 1}`]))

const navCommands: AppCommand[] = NAV_SECTIONS.flatMap((s) => s.items).map((item) => ({
  id: `nav${item.to.replace(/\//g, '.')}`,
  title: item.label,
  keywords: item.keywords,
  section: '导航',
  hint: QUICK_HINTS.get(item.to),
  run: ({ navigate }) => navigate(item.to)
}))

const actionCommands: AppCommand[] = [
  {
    id: 'file.new-topic',
    title: '发帖…',
    keywords: ['fatie', 'ft', 'new topic', 'compose'],
    section: '动作',
    hint: '⌘N',
    run: () => useComposerStore.getState().openNewTopic()
  },
  {
    id: 'view.reload',
    title: '刷新',
    keywords: ['shuaxin', 'sx', 'reload', 'refresh'],
    section: '动作',
    hint: '⌘R',
    allowInDialog: true,
    run: ({ queryClient }) => void queryClient.refetchQueries({ type: 'active' })
  },
  {
    id: 'app.settings',
    title: '设置…',
    keywords: ['shezhi', 'sz', 'settings', 'preferences'],
    section: '动作',
    hint: '⌘,',
    run: ({ navigate }) => navigate('/settings')
  },
  {
    id: 'view.toggle-sidebar',
    title: '切换侧栏',
    keywords: ['cebiaolan', 'cbl', 'sidebar', 'toggle'],
    section: '动作',
    hint: '⌥⌘S',
    run: () => useSettings.getState().setSidebarCollapsed(!useSettings.getState().sidebarCollapsed)
  },
  {
    id: 'view.font-up',
    title: '放大字体',
    keywords: ['fangda', 'fd', 'zoom in', 'font'],
    section: '动作',
    hint: '⌘=',
    run: () => stepFont(1)
  },
  {
    id: 'view.font-down',
    title: '缩小字体',
    keywords: ['suoxiao', 'sx', 'zoom out', 'font'],
    section: '动作',
    hint: '⌘-',
    run: () => stepFont(-1)
  },
  {
    id: 'view.font-reset',
    title: '实际大小',
    keywords: ['shiji', 'sj', 'reset', 'font'],
    section: '动作',
    hint: '⌘0',
    run: () => useSettings.getState().setFontScale(1)
  },
  {
    id: 'theme.light',
    title: '浅色主题',
    keywords: ['qianse', 'qs', 'light', 'theme'],
    section: '动作',
    run: () => useSettings.getState().setTheme('light')
  },
  {
    id: 'theme.dark',
    title: '深色主题',
    keywords: ['shense', 'ss', 'dark', 'theme'],
    section: '动作',
    run: () => useSettings.getState().setTheme('dark')
  },
  {
    id: 'theme.system',
    title: '跟随系统主题',
    keywords: ['xitong', 'xt', 'system', 'theme'],
    section: '动作',
    run: () => useSettings.getState().setTheme('system')
  },
  {
    id: 'app.check-updates',
    title: '检查更新…',
    keywords: ['gengxin', 'gx', 'update', 'upgrade'],
    section: '动作',
    run: () => void useUpdater.getState().check()
  },
  {
    id: 'go.back',
    title: '后退',
    keywords: ['houtui', 'ht', 'back'],
    section: '动作',
    hint: '⌘[',
    run: ({ goBack }) => goBack()
  },
  {
    id: 'go.forward',
    title: '前进',
    keywords: ['qianjin', 'qj', 'forward'],
    section: '动作',
    hint: '⌘]',
    run: ({ navigate }) => navigate(1)
  },
  ...QUICK_NAV.map<AppCommand>((item, i) => ({
    id: `go.quick.${i + 1}`,
    title: item.label,
    keywords: item.keywords,
    section: '导航',
    hint: `⌘${i + 1}`,
    run: ({ navigate }) => navigate(item.to)
  }))
]

/** Palette data source: nav destinations + actions (quick-nav duplicates of
 *  nav destinations are excluded — same title, same target). */
export const PALETTE_COMMANDS: AppCommand[] = [
  ...navCommands,
  ...actionCommands.filter((c) => !c.id.startsWith('go.quick.'))
]

const byId = new Map([...navCommands, ...actionCommands].map((c) => [c.id, c]))

/** Single dispatch point for menu events, palette Enter and shortcuts.
 *  Menu ids from src-tauri/src/menu.rs are these same strings. */
export function runCommand(id: string, ctx: CommandCtx): void {
  const cmd = byId.get(id)
  if (!cmd) return
  // Same guard the keyboard dispatcher applies: while a modal is up, only
  // dialog-safe commands run (menu clicks / accelerator bounces included).
  if (!cmd.allowInDialog && document.querySelector('dialog[open]')) return
  cmd.run(ctx)
}

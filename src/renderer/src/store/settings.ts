import { create } from 'zustand'

export type ThemeMode = 'system' | 'light' | 'dark'

interface Persisted {
  theme: ThemeMode
  fontScale: number
  compactList: boolean
  autoCheckUpdates: boolean
  sidebarCollapsed: boolean
  sidebarWidth: number
}

interface SettingsState extends Persisted {
  setTheme: (t: ThemeMode) => void
  setFontScale: (n: number) => void
  setCompactList: (b: boolean) => void
  setAutoCheckUpdates: (b: boolean) => void
  setSidebarCollapsed: (b: boolean) => void
  setSidebarWidth: (n: number) => void
}

export const SIDEBAR_DEFAULT_WIDTH = 248
export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 320
export const SIDEBAR_COLLAPSED_WIDTH = 56

export function clampSidebarWidth(n: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(n)))
}

const KEY = 'linuxdo-settings'

function load(): Persisted {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      theme: (s.theme as ThemeMode) ?? 'system',
      fontScale: typeof s.fontScale === 'number' ? s.fontScale : 1,
      compactList: !!s.compactList,
      autoCheckUpdates: typeof s.autoCheckUpdates === 'boolean' ? s.autoCheckUpdates : true,
      sidebarCollapsed: !!s.sidebarCollapsed,
      sidebarWidth:
        typeof s.sidebarWidth === 'number'
          ? clampSidebarWidth(s.sidebarWidth)
          : SIDEBAR_DEFAULT_WIDTH
    }
  } catch {
    return {
      theme: 'system',
      fontScale: 1,
      compactList: false,
      autoCheckUpdates: true,
      sidebarCollapsed: false,
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH
    }
  }
}

function save(s: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage may be unavailable */
  }
}

export function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = resolveTheme(theme)
}

function applyFont(scale: number): void {
  document.documentElement.style.fontSize = `${16 * scale}px`
}

function applyDensity(compact: boolean): void {
  document.documentElement.dataset.density = compact ? 'compact' : 'comfortable'
}

/** The app grid reads --sidebar-col; collapse wins over the stored width. */
function applySidebar(collapsed: boolean, width: number): void {
  document.documentElement.style.setProperty(
    '--sidebar-col',
    `${collapsed ? SIDEBAR_COLLAPSED_WIDTH : clampSidebarWidth(width)}px`
  )
}

const initial = load()

export const useSettings = create<SettingsState>((set, get) => {
  const persistPatch = (patch: Partial<Persisted>): void => {
    const cur = get()
    save({
      theme: cur.theme,
      fontScale: cur.fontScale,
      compactList: cur.compactList,
      autoCheckUpdates: cur.autoCheckUpdates,
      sidebarCollapsed: cur.sidebarCollapsed,
      sidebarWidth: cur.sidebarWidth,
      ...patch
    })
  }
  return {
    ...initial,
    setTheme: (theme) => {
      applyTheme(theme)
      persistPatch({ theme })
      set({ theme })
    },
    setFontScale: (fontScale) => {
      applyFont(fontScale)
      persistPatch({ fontScale })
      set({ fontScale })
    },
    setCompactList: (compactList) => {
      applyDensity(compactList)
      persistPatch({ compactList })
      set({ compactList })
    },
    setAutoCheckUpdates: (autoCheckUpdates) => {
      persistPatch({ autoCheckUpdates })
      set({ autoCheckUpdates })
    },
    setSidebarCollapsed: (sidebarCollapsed) => {
      applySidebar(sidebarCollapsed, get().sidebarWidth)
      persistPatch({ sidebarCollapsed })
      set({ sidebarCollapsed })
    },
    setSidebarWidth: (width) => {
      const sidebarWidth = clampSidebarWidth(width)
      applySidebar(get().sidebarCollapsed, sidebarWidth)
      persistPatch({ sidebarWidth })
      set({ sidebarWidth })
    }
  }
})

/** Apply persisted settings and keep 'system' theme in sync with the OS. Call once. */
export function initSettings(): void {
  applyTheme(initial.theme)
  applyFont(initial.fontScale)
  applyDensity(initial.compactList)
  applySidebar(initial.sidebarCollapsed, initial.sidebarWidth)
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (useSettings.getState().theme === 'system') applyTheme('system')
    })
}

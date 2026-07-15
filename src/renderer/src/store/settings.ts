import { create } from 'zustand'

export type ThemeMode = 'system' | 'light' | 'dark'

interface Persisted {
  theme: ThemeMode
  fontScale: number
  compactList: boolean
}

interface SettingsState extends Persisted {
  setTheme: (t: ThemeMode) => void
  setFontScale: (n: number) => void
  setCompactList: (b: boolean) => void
}

const KEY = 'linuxdo-settings'

function load(): Persisted {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      theme: (s.theme as ThemeMode) ?? 'system',
      fontScale: typeof s.fontScale === 'number' ? s.fontScale : 1,
      compactList: !!s.compactList
    }
  } catch {
    return { theme: 'system', fontScale: 1, compactList: false }
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

const initial = load()

export const useSettings = create<SettingsState>((set, get) => {
  const persistPatch = (patch: Partial<Persisted>): void => {
    const cur = get()
    save({ theme: cur.theme, fontScale: cur.fontScale, compactList: cur.compactList, ...patch })
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
      persistPatch({ compactList })
      set({ compactList })
    }
  }
})

/** Apply persisted settings and keep 'system' theme in sync with the OS. Call once. */
export function initSettings(): void {
  applyTheme(initial.theme)
  applyFont(initial.fontScale)
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (useSettings.getState().theme === 'system') applyTheme('system')
    })
}

import { create } from 'zustand'

/** Recently visited topics, surfaced in the ⌘K palette's「最近」group. */
export interface RecentTopic {
  id: number
  title: string
  ts: number
}

interface RecentsState {
  recents: RecentTopic[]
  pushRecent: (id: number, title: string) => void
}

const KEY = 'linuxdo-recents'
const MAX = 15

function load(): RecentTopic[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((r) => r && typeof r.id === 'number' && typeof r.title === 'string')
      .slice(0, MAX)
      .map((r) => ({ id: r.id, title: r.title, ts: typeof r.ts === 'number' ? r.ts : 0 }))
  } catch {
    return []
  }
}

function save(list: RecentTopic[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage may be unavailable */
  }
}

export const useRecents = create<RecentsState>((set, get) => ({
  recents: load(),
  pushRecent: (id, title) => {
    // Re-visits move the topic to the front instead of duplicating it.
    const next = [
      { id, title, ts: Date.now() },
      ...get().recents.filter((r) => r.id !== id)
    ].slice(0, MAX)
    save(next)
    set({ recents: next })
  }
}))

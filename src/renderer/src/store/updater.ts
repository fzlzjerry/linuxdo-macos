import { create } from 'zustand'
import { check as checkUpdate, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { toast } from './toast'

export type UpdaterStatus =
  | 'idle' // no update known
  | 'checking' // querying the release endpoint
  | 'available' // a newer version exists, not yet downloading
  | 'downloading' // fetching + installing the update
  | 'ready' // installed, waiting for a relaunch
  | 'error' // last manual check failed

interface UpdaterState {
  status: UpdaterStatus
  /** The newer version (when status is available/downloading/ready), else null. */
  version: string | null
  /** Download progress, 0..1 (only meaningful while downloading). */
  progress: number
  /** Query GitHub for a newer release. `silent` startup checks never toast on no-op/failure. */
  check: (opts?: { silent?: boolean }) => Promise<void>
  /** Download + install the pending update, then surface a "restart" prompt. */
  download: () => Promise<void>
  /** Relaunch into the freshly installed version. */
  restart: () => Promise<void>
}

// `setTimeout` coerces its delay to a 32-bit int, so Infinity/oversized values
// fire immediately. Use the real max so an update toast effectively never
// auto-dismisses (~24.8 days) — the user acts on it or dismisses it by hand.
const STICKY = 2_147_483_647

// The live Update handle isn't serializable and shouldn't trigger re-renders,
// so it lives outside the store (mirrors how toast.ts keeps its timers out of state).
let handle: Update | null = null

export const useUpdater = create<UpdaterState>((set, get) => ({
  status: 'idle',
  version: null,
  progress: 0,

  check: async ({ silent = false } = {}) => {
    const status = get().status
    if (status === 'checking' || status === 'downloading') return
    set({ status: 'checking' })
    try {
      const update = await checkUpdate()
      if (!update) {
        handle = null
        set({ status: 'idle', version: null })
        if (!silent) toast.info('已是最新版本')
        return
      }
      handle = update
      set({ status: 'available', version: update.version })
      toast.info(`发现新版本 ${update.version}`, {
        duration: STICKY,
        action: { label: '立即更新', onClick: () => void get().download() }
      })
    } catch {
      // Silent startup checks stay quiet (offline, transient endpoint errors);
      // only a user-initiated check surfaces the failure.
      set({ status: silent ? 'idle' : 'error', version: null })
      if (!silent) toast.error('检查更新失败，请稍后再试')
    }
  },

  download: async () => {
    if (!handle || get().status === 'downloading') return
    set({ status: 'downloading', progress: 0 })
    try {
      let total = 0
      let received = 0
      await handle.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? 0
            set({ progress: 0 })
            break
          case 'Progress':
            received += event.data.chunkLength
            set({ progress: total > 0 ? Math.min(received / total, 1) : 0 })
            break
          case 'Finished':
            set({ progress: 1 })
            break
        }
      })
      set({ status: 'ready' })
      // Don't yank the app out from under the user — let them restart when ready.
      toast.success('更新已就绪，重启后生效', {
        duration: STICKY,
        action: { label: '立即重启', onClick: () => void get().restart() }
      })
    } catch {
      // Keep the update "available" so the user can retry the download directly.
      set({ status: handle ? 'available' : 'error', progress: 0 })
      toast.error('更新下载失败，请稍后再试')
    }
  },

  restart: async () => {
    await relaunch()
  }
}))

/** Fire a silent update check on launch when the user hasn't opted out. */
export function autoCheckUpdatesOnStartup(enabled: boolean): void {
  if (enabled) void useUpdater.getState().check({ silent: true })
}

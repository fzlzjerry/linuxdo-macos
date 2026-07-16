import { create } from 'zustand'

/** ⌘K command palette visibility, app-wide: the keyboard dispatcher, the
 *  native menu and the palette itself all drive the same flag. */
interface PaletteState {
  open: boolean
  toggle: () => void
  close: () => void
  openPalette: () => void
}

export const usePalette = create<PaletteState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
  openPalette: () => set({ open: true })
}))

import { create } from 'zustand'

export interface LightboxImage {
  src: string
  alt?: string
  filename?: string
}

interface LightboxState {
  images: LightboxImage[]
  index: number
  /** Open a gallery of images at the given position. */
  open: (images: LightboxImage[], index: number) => void
  /** Convenience for the common single-image case. */
  openSingle: (src: string, alt?: string) => void
  setIndex: (index: number) => void
  close: () => void
}

/** Module-level so CookedContent (deep in the tree, many instances) can open
    the app-wide lightbox without prop drilling. */
export const useLightbox = create<LightboxState>((set) => ({
  images: [],
  index: 0,
  open: (images, index) =>
    set({ images, index: Math.min(Math.max(index, 0), Math.max(images.length - 1, 0)) }),
  openSingle: (src, alt) => set({ images: [{ src, alt }], index: 0 }),
  setIndex: (index) =>
    set((s) => ({ index: Math.min(Math.max(index, 0), Math.max(s.images.length - 1, 0)) })),
  close: () => set({ images: [], index: 0 })
}))

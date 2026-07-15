import { create } from 'zustand'

export interface LightboxImage {
  src: string
  alt?: string
  filename?: string
}

interface LightboxState {
  image: LightboxImage | null
  open: (image: LightboxImage) => void
  close: () => void
}

/** Module-level so CookedContent (deep in the tree, many instances) can open
    the app-wide lightbox without prop drilling. */
export const useLightbox = create<LightboxState>((set) => ({
  image: null,
  open: (image) => set({ image }),
  close: () => set({ image: null })
}))

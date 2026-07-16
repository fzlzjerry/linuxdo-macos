import { create } from 'zustand'
import { useAuth } from './auth'

/** New-topic composer visibility, app-wide: the sidebar button, ⌘N, the File
 *  menu and the command palette all open the same modal. */
interface ComposerState {
  newTopicOpen: boolean
  openNewTopic: () => void
  closeNewTopic: () => void
}

export const useComposerStore = create<ComposerState>((set) => ({
  newTopicOpen: false,
  openNewTopic: () => {
    if (!useAuth.getState().loggedIn) {
      void useAuth.getState().showLogin()
      return
    }
    set({ newTopicOpen: true })
  },
  closeNewTopic: () => set({ newTopicOpen: false })
}))

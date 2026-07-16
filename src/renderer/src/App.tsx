import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType
} from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { listen } from '@tauri-apps/api/event'
import { Sidebar } from './components/window/Sidebar'
import { CommandPalette } from './components/palette/CommandPalette'
import { TopicListPage } from './features/topics/TopicListPage'
import { TopicPage } from './features/topics/TopicPage'
import { CategoriesPage } from './features/categories/CategoriesPage'
import { CategoryTopicsPage } from './features/categories/CategoryTopicsPage'
import { LeaderboardPage } from './features/leaderboard/LeaderboardPage'
import { EventsPage } from './features/events/EventsPage'
import { BadgesPage } from './features/badges/BadgesPage'
import { GroupsPage } from './features/groups/GroupsPage'
import { ChatPage } from './features/chat/ChatPage'
import { AiBotPage } from './features/ai/AiBotPage'
import { NotificationsPage } from './features/notifications/NotificationsPage'
import { SearchPage } from './features/search/SearchPage'
import { ProfilePage } from './features/users/ProfilePage'
import { MessagesPage } from './features/messages/MessagesPage'
import { BookmarksPage } from './features/bookmarks/BookmarksPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { DraftsPage } from './features/drafts/DraftsPage'
import { Toaster } from './components/ui/Toaster'
import { LightboxHost } from './components/ui/Lightbox'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { initAuthBridge, useAuth } from './store/auth'
import { initSettings, useSettings } from './store/settings'
import { autoCheckUpdatesOnStartup } from './store/updater'
import { ensureSvgSprite } from './lib/svgSprite'
import { useGlobalShortcuts } from './lib/shortcuts'
import { useBackNav } from './lib/useBackNav'
import { useSwipeBack } from './lib/useSwipeBack'
import { runCommand, type CommandCtx } from './lib/commands'
import { QUICK_NAV } from './lib/nav'
import { usePalette } from './store/palette'
import styles from './App.module.css'

function useCommandCtx(): CommandCtx {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const goBack = useBackNav()
  return useMemo(() => ({ navigate, queryClient, goBack }), [navigate, queryClient, goBack])
}

/** App-wide keyboard shortcuts (macOS conventions; Esc stays "cancel"-only).
 *  This dispatcher is the single owner of every combo — it preventDefaults,
 *  so the matching native-menu accelerators never double-fire; the menu is
 *  discoverability plus a bounce path that lands in the same runCommand. */
function AppShortcuts({ ctx }: { ctx: CommandCtx }): null {
  const location = useLocation()
  const { navigate, goBack } = ctx

  const gotoSearch = (e: KeyboardEvent): void => {
    e.preventDefault()
    if (location.pathname === '/search') {
      document.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
    } else {
      navigate('/search')
    }
  }

  const command = (id: string) => (e: KeyboardEvent) => {
    e.preventDefault()
    runCommand(id, ctx)
  }

  useGlobalShortcuts([
    {
      key: 'k',
      meta: true,
      allowInDialog: true,
      run: (e) => {
        const palette = usePalette.getState()
        if (palette.open) {
          e.preventDefault()
          palette.close()
          return
        }
        // Don't stack the palette over another modal (composer, lightbox…).
        if (document.querySelector('dialog[open]')) return
        e.preventDefault()
        palette.openPalette()
      }
    },
    { key: '/', run: gotoSearch },
    { key: 'r', meta: true, allowInDialog: true, run: command('view.reload') },
    { key: ',', meta: true, run: command('app.settings') },
    { key: 'n', meta: true, run: command('file.new-topic') },
    { key: 's', meta: true, alt: true, run: command('view.toggle-sidebar') },
    { key: '=', meta: true, run: command('view.font-up') },
    { key: '-', meta: true, run: command('view.font-down') },
    { key: '0', meta: true, run: command('view.font-reset') },
    {
      key: '[',
      meta: true,
      run: (e) => {
        e.preventDefault()
        goBack()
      }
    },
    {
      key: ']',
      meta: true,
      run: (e) => {
        e.preventDefault()
        navigate(1)
      }
    },
    {
      key: 'u',
      run: (e) => {
        e.preventDefault()
        goBack()
      }
    },
    ...QUICK_NAV.map((item, i) => ({
      key: String(i + 1),
      meta: true,
      run: (e: KeyboardEvent) => {
        e.preventDefault()
        navigate(item.to)
      }
    }))
  ])
  return null
}

/** Native menu events (src-tauri/src/menu.rs) land here as command ids. */
function MenuBridge({ ctx }: { ctx: CommandCtx }): null {
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  useEffect(() => {
    let disposed = false
    let dispose: (() => void) | undefined
    void listen<string>('menu:action', (e) => runCommand(e.payload, ctxRef.current)).then((un) => {
      if (disposed) un()
      else dispose = un
    })
    return () => {
      disposed = true
      dispose?.()
    }
  }, [])
  return null
}

/** Push/replace navigations park focus on the content container so keyboard
 *  users start from the new page's top. POP (back/forward) is left alone —
 *  useFocusMemory restores the previously focused list row instead. */
function RouteFocus({ target }: { target: RefObject<HTMLElement> }): null {
  const location = useLocation()
  const navType = useNavigationType()
  const prev = useRef(location.pathname)
  useEffect(() => {
    if (location.pathname === prev.current) return
    prev.current = location.pathname
    if (navType === 'POP') return
    target.current?.focus({ preventScroll: true })
  }, [location.pathname, navType, target])
  return null
}

function SwipeBack(): null {
  useSwipeBack(useBackNav())
  return null
}

export function App(): JSX.Element {
  const ctx = useCommandCtx()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    initSettings()
    void ensureSvgSprite()
    autoCheckUpdatesOnStartup(useSettings.getState().autoCheckUpdates)
    return initAuthBridge()
  }, [])

  // Live-ish sidebar badges: refresh unread notification/PM counts periodically
  // (no MessageBus yet — a lightweight /session/current.json poll).
  useEffect(() => {
    const id = setInterval(() => {
      if (useAuth.getState().loggedIn) void useAuth.getState().refresh()
    }, 45_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={styles.shell}>
      <AppShortcuts ctx={ctx} />
      <MenuBridge ctx={ctx} />
      <SwipeBack />
      <RouteFocus target={mainRef} />
      <Sidebar />
      <main className={styles.content} ref={mainRef} tabIndex={-1}>
        <ErrorBoundary label="页面">
        <Routes>
          <Route path="/" element={<Navigate to="/latest" replace />} />
          <Route path="/latest" element={<TopicListPage filter="latest" />} />
          <Route path="/new" element={<TopicListPage filter="new" />} />
          <Route path="/unread" element={<TopicListPage filter="unread" />} />
          <Route path="/hot" element={<TopicListPage filter="hot" />} />
          <Route path="/top" element={<TopicListPage filter="top" />} />
          <Route path="/posted" element={<TopicListPage filter="posted" />} />
          <Route path="/read" element={<TopicListPage filter="read" />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/c/:slug/:id" element={<CategoryTopicsPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/badges" element={<BadgesPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/ai" element={<AiBotPage />} />
          <Route path="/t/:id" element={<TopicPage />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/latest" replace />} />
        </Routes>
        </ErrorBoundary>
      </main>
      <Toaster />
      <LightboxHost />
      <CommandPalette ctx={ctx} />
    </div>
  )
}

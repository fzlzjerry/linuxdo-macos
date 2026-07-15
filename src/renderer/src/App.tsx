import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Sidebar } from './components/window/Sidebar'
import { TopicListPage } from './features/topics/TopicListPage'
import { TopicPage } from './features/topics/TopicPage'
import { CategoriesPage } from './features/categories/CategoriesPage'
import { CategoryTopicsPage } from './features/categories/CategoryTopicsPage'
import { LeaderboardPage } from './features/leaderboard/LeaderboardPage'
import { EventsPage } from './features/events/EventsPage'
import { BadgesPage } from './features/badges/BadgesPage'
import { GroupsPage } from './features/groups/GroupsPage'
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
import { initAuthBridge } from './store/auth'
import { initSettings } from './store/settings'
import { ensureSvgSprite } from './lib/svgSprite'
import { useGlobalShortcuts } from './lib/shortcuts'
import { useBackNav } from './lib/useBackNav'
import styles from './App.module.css'

/** App-wide keyboard shortcuts (macOS conventions; Esc stays "cancel"-only). */
function AppShortcuts(): null {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const goBack = useBackNav()

  const gotoSearch = (e: KeyboardEvent): void => {
    e.preventDefault()
    if (location.pathname === '/search') {
      document.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
    } else {
      navigate('/search')
    }
  }

  useGlobalShortcuts([
    { key: 'k', meta: true, run: gotoSearch },
    { key: '/', run: gotoSearch },
    {
      key: 'r',
      meta: true,
      allowInDialog: true,
      run: (e) => {
        e.preventDefault()
        void queryClient.refetchQueries({ type: 'active' })
      }
    },
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
    }
  ])
  return null
}

export function App(): JSX.Element {
  useEffect(() => {
    initSettings()
    void ensureSvgSprite()
    return initAuthBridge()
  }, [])

  return (
    <div className={styles.shell}>
      <AppShortcuts />
      <Sidebar />
      <main className={styles.content}>
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
    </div>
  )
}

import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/window/Sidebar'
import { TopicListPage } from './features/topics/TopicListPage'
import { TopicPage } from './features/topics/TopicPage'
import { CategoriesPage } from './features/categories/CategoriesPage'
import { CategoryTopicsPage } from './features/categories/CategoryTopicsPage'
import { NotificationsPage } from './features/notifications/NotificationsPage'
import { SearchPage } from './features/search/SearchPage'
import { ProfilePage } from './features/users/ProfilePage'
import { MessagesPage } from './features/messages/MessagesPage'
import { BookmarksPage } from './features/bookmarks/BookmarksPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { DraftsPage } from './features/drafts/DraftsPage'
import { Toaster } from './components/ui/Toaster'
import { initAuthBridge } from './store/auth'
import { initSettings } from './store/settings'
import styles from './App.module.css'

export function App(): JSX.Element {
  useEffect(() => {
    initSettings()
    return initAuthBridge()
  }, [])

  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.content}>
        <Routes>
          <Route path="/" element={<Navigate to="/latest" replace />} />
          <Route path="/latest" element={<TopicListPage filter="latest" />} />
          <Route path="/new" element={<TopicListPage filter="new" />} />
          <Route path="/unread" element={<TopicListPage filter="unread" />} />
          <Route path="/hot" element={<TopicListPage filter="hot" />} />
          <Route path="/top" element={<TopicListPage filter="top" />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/c/:slug/:id" element={<CategoryTopicsPage />} />
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
      </main>
      <Toaster />
    </div>
  )
}

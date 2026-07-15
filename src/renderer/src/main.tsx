import './lib/tauriBridge'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { CategoriesProvider } from './lib/discourse/CategoriesContext'
import { DiscourseApiError } from './lib/discourse/client'
import './styles/global.css'
import './styles/cooked.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry when we're being auth-gated / Cloudflare-challenged / rate-limited:
      // retrying just pokes the shield again and worsens the bot score.
      retry: (failureCount, error) => {
        if (
          error instanceof DiscourseApiError &&
          (error.needsAuth || error.status === 403 || error.status === 429)
        ) {
          return false
        }
        return failureCount < 1
      },
      refetchOnWindowFocus: false,
      staleTime: 60_000
    }
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <CategoriesProvider>
          <App />
        </CategoriesProvider>
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>
)

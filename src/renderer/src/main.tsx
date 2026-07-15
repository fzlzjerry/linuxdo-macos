import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { CategoriesProvider } from './lib/discourse/CategoriesContext'
import './styles/global.css'
import './styles/cooked.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000
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

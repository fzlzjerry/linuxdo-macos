import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url))

// Tauri on macOS renders in WKWebView (Safari engine), so target Safari.
export default defineConfig({
  root: r('./src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': r('./src/renderer/src'),
      '@shared': r('./src/shared')
    }
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  build: {
    outDir: r('./dist'),
    emptyOutDir: true,
    target: 'safari16',
    cssTarget: 'safari16'
  }
})

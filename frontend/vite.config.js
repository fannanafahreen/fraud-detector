import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/predict':              { target: 'http://localhost:8000', changeOrigin: true },
      '/dashboard':            { target: 'http://localhost:8000', changeOrigin: true },
      '/transactions':         { target: 'http://localhost:8000', changeOrigin: true },
      '/alerts':               { target: 'http://localhost:8000', changeOrigin: true },
      '/fraud-by-hour':        { target: 'http://localhost:8000', changeOrigin: true },
      '/model':                { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})

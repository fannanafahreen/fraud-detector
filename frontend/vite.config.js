import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    // Proxy /predict (and any future /api/* routes) to the FastAPI backend
    // during local development, avoiding CORS issues.
    proxy: {
      '/predict': {
        target:      'http://localhost:8000',
        changeOrigin: true,
        // Rewrite is not needed here — the path stays as /predict
      },
    },
  },
})

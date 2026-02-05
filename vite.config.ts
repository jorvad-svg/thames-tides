import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/thames-tides/',
  server: {
    proxy: {
      '/api/admiralty': {
        target: 'https://admiraltyapi.azure-api.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/admiralty/, ''),
      },
    },
  },
})

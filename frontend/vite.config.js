import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/cycle-2026': { target: 'http://localhost:5000', changeOrigin: true, rewrite: path => path.replace('/api/cycle-2026', '/api/v1') },
      '/api/cycle-2027': { target: 'http://localhost:5001', changeOrigin: true, rewrite: path => path.replace('/api/cycle-2027', '/api/v1') },
    },
  },
})

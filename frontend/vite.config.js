import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { createFrontendRuntime } from './src/features/placement-cycle/runtime-config.js'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  createFrontendRuntime({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }, command === 'build')
  return {
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/cycle-2026': { target: 'http://localhost:5000', changeOrigin: true, rewrite: path => path.replace('/api/cycle-2026', '/api/v1') },
      '/api/cycle-2027': { target: 'http://localhost:5001', changeOrigin: true, rewrite: path => path.replace('/api/cycle-2027', '/api/v1') },
    },
  },
  }
})

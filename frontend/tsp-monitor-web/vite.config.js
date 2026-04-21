import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/monitor': { target: 'http://172.25.100.136:8085', changeOrigin: true },
    },
  },
})

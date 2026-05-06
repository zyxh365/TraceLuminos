import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/biz':     { target: 'http://172.25.100.136:8000', changeOrigin: true },
      '/core':    { target: 'http://172.25.100.136:8000', changeOrigin: true },
      '/monitor': { target: 'http://172.25.100.136:8000', changeOrigin: true },
    },
  },
})

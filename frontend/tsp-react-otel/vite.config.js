import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/biz':        { target: 'http://172.25.100.136:8000', changeOrigin: true },
      '/core':       { target: 'http://172.25.100.136:8000', changeOrigin: true },
      '/monitor':    { target: 'http://172.25.100.136:8000', changeOrigin: true },// ★ tsp-monitor-gateway API 代理
      '/v1/traces':  { target: 'http://172.25.100.135:4318', changeOrigin: true },
      // '/biz':        { target: 'http://localhost:8091', changeOrigin: true },
      // '/core':       { target: 'http://localhost:8092', changeOrigin: true },
      // '/v1/traces':  { target: 'http://localhost:4318', changeOrigin: true },
      // ★ Jaeger API 代理
      '/jaeger/api': {
        // target: 'http://localhost:16686',
        target: 'http://106.14.92.45:16686/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jaeger/, ''),
      },
      // ★ 华为云APM API 代理
      // 前端请求 /apm/get-trace-events -> 代理到 http://106.14.92.45:30088/api/v1/tracing/get-trace-events
      '/apm': {
        target: 'http://106.14.92.45:30088/api/v1/tracing',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/apm/, ''),
      }
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/capacity_mgt_platform',
  },
  base: '/capacity_mgt_platform/',
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3011',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://127.0.0.1:8764',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})

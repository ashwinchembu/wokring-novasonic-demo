import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Use '/' for root on Render static site, '/app/' for embedded mode in local dev
  base: process.env.RENDER ? '/' : '/app/',
  server: {
    port: 3000,
    proxy: {
      '/session': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/audio': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/events': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/hcp': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/db': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  build: {
    // Output to 'dist' for Render static site, '../public/vue-app' for embedded mode
    outDir: process.env.RENDER ? 'dist' : '../public/vue-app',
    emptyOutDir: true,
  },
})


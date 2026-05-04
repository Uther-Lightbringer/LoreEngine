import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:29999',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:29999',
        changeOrigin: true
      },
      '/cache-images': {
        target: 'http://localhost:29999',
        changeOrigin: true,
        rewrite: (path) => path
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})

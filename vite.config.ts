import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: '/',
  build: {
    // Raise the inline warning threshold — we have intentional dynamic imports
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split vendor libraries into separate cacheable chunks.
        // These change rarely so browsers serve them from cache on code updates.
        manualChunks(id) {
          if (id.includes('node_modules/@vladmandic/human')) return 'face-engine'
          if (id.includes('node_modules/@supabase')) return 'supabase'
          if (id.includes('node_modules/@tanstack')) return 'query'
          // Keep React ecosystem together in one chunk to avoid circular deps
          // (react-dom/scheduler cross-references within the same group).
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/scheduler/')
          ) return 'react-vendor'
          if (id.includes('node_modules/')) return 'vendor'
        },
      },
    },
  },
})

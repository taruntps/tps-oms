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
    rollupOptions: {
      output: {
        // PR2: split stable vendor libraries into their own cacheable chunks so
        // an app-code change no longer busts the entire vendor payload, and cold
        // loads download vendors in parallel. Grouped by update cadence.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('@tanstack')) return 'vendor-query'
          if (/@radix-ui|react-hook-form|@hookform|zod|tailwind-merge|clsx/.test(id)) return 'vendor-ui'
          // xlsx is dynamically imported (SoiTab export) — leave it as its own async chunk.
          if (id.includes('xlsx') || id.includes('codepage')) return
          return 'vendor'
        },
      },
    },
  },
})

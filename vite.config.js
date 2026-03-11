import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Proxy /api/* to Express dev server in local development.
  // In production (Vercel), /api/* is handled by api/[[...path]].js directly.
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    // Raise chunk warning threshold (recharts is large)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor libs into separate cacheable chunks
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
        },
      },
    },
  },

  // Resolve aliases for cleaner imports
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})

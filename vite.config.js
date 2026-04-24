import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: 'frontend',

  // Proxy /api/* to Express dev server in local development.
  // In production (Vercel), /api/* is handled by api/[[...path]].js directly.
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
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
          // recharts (large — keep isolated for long-term caching)
          charts: ['recharts'],
          // D3 + topojson (USPoliticalMap SVG fallback — only loaded on demand)
          d3geo: ['d3', 'topojson-client'],
          // MapLibre GL basemap renderer (~1 MB minified — isolated chunk)
          maplibre: ['maplibre-gl'],
          // deck.gl WebGL layers — split for parallel loading + long-term caching
          'deck-core':   ['@deck.gl/core'],
          'deck-layers': ['@deck.gl/layers', '@deck.gl/mapbox'],
          // PMTiles protocol handler (small, but isolated for cache efficiency)
          pmtiles: ['pmtiles'],
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

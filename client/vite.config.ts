import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Applies a new service worker (and the fresh build behind it) as
      // soon as one's available, no "update ready, click to refresh"
      // prompt -- right for a self-hosted dashboard someone glances at on
      // a wall, not an app where losing in-progress state would matter.
      registerType: 'autoUpdate',
      manifest: {
        id: '/',
        name: 'Cuesheet',
        short_name: 'Cuesheet',
        description: 'A calm media dashboard for Plex, Jellyfin, Radarr, Sonarr and Seerr.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#090b12',
        theme_color: '#0a0c10',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Only the build's own static assets get precached -- /api/* is
        // never in this glob (it doesn't exist on disk), so live data is
        // never served stale from a cache. No runtimeCaching entry is
        // added for it either, so every API request just goes straight
        // to the network, same as with no service worker at all.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

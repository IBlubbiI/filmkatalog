import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Für GitHub Pages Projekt-Seiten liegt die App unter /<repo>/. Die Deploy-Action
  // setzt VITE_BASE automatisch auf "/<repo>/". Lokal & bei Root-Hosting bleibt "/".
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'favicon.ico'],
      manifest: {
        name: 'Filmkatalog',
        short_name: 'Filmkatalog',
        description: 'Persönlicher Katalog der Film- & Seriensammlung',
        lang: 'de',
        theme_color: '#0b0b0f',
        background_color: '#0b0b0f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.', // relativ -> funktioniert bei Root- UND Unterpfad-Hosting (GitHub Pages)
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // movies.json + Poster werden mit precached -> nach dem ersten Laden voll offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json,jpg,jpeg,webp}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});

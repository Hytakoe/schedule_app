import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const repo = 'schedule_app';

export default defineConfig({
  base: `/${repo}/`,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Мои смены 🐾',
        short_name: 'Смены',
        description: 'Календарь рабочих смен с котиками',
        lang: 'ru',
        start_url: `/${repo}/`,
        scope: `/${repo}/`,
        display: 'standalone',
        background_color: '#fff6f8',
        theme_color: '#fff6f8',
        icons: [
          { src: `/${repo}/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
          { src: `/${repo}/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
          { src: `/${repo}/pwa-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      },
    }),
  ],
});
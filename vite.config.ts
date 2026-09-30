import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['data/meta.json', 'kakitori-icon*.png'],
    manifest: { name: 'かきとり', short_name: 'かきとり', lang: 'ja', display: 'standalone', theme_color: '#176b5b', background_color: '#f7f4eb', icons: [{ src: 'kakitori-icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'kakitori-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] },
    workbox: { globPatterns: ['**/*.{js,css,html,json,svg}'], maximumFileSizeToCacheInBytes: 6_000_000 }
  })]
});

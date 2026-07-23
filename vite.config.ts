import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // o site é publicado em https://yuribr182.github.io/Game/
  base: '/Game/',
  plugins: [
    VitePWA({
      // o main.js legado já registra 'sw.js'; o plugin só gera o worker
      injectRegister: null,
      filename: 'sw.js',
      registerType: 'autoUpdate',
      // manifest.json estático continua em public/ (referenciado no index.html)
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json,webmanifest}'],
        // assume o lugar do service worker manual antigo imediatamente
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});

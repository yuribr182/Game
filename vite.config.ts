import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// Base profissional: /agencia/ (local e padrão). O deploy no GitHub Pages
// injeta BASE_URL=/Game/ enquanto o repositório se chamar "Game" — ao
// renomear o repo para "agencia", remova o env do workflow e tudo casa.
// (acesso a process sem @types/node: o tsconfig do front não inclui Node)
const BASE =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.BASE_URL ||
  '/agencia/';

export default defineConfig({
  base: BASE,
  server: {
    // Modo Empresa Real (dev): o front fala com a ponte local em /api
    proxy: { '/api': 'http://127.0.0.1:3777' },
  },
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
        // apaga os caches 'agency-tycoon-*' do SW manual antigo
        importScripts: ['sw-limpeza.js'],
      },
    }),
  ],
  test: {
    environment: 'node',
    // server/ é um projeto npm próprio com check próprio (npm --prefix server run check)
    exclude: ['server/**', 'node_modules/**'],
  },
});

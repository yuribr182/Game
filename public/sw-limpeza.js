/* Importado pelo sw.js gerado (vite.config.ts -> workbox.importScripts).
   Remove os caches do service worker manual antigo ('agency-tycoon-*'),
   que o Workbox não conhece e nunca limparia sozinho. */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('agency-tycoon-')).map((k) => caches.delete(k)))
      )
  );
});

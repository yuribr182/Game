/* Service worker: cache-first para jogar offline quando servido por HTTP(S) */
const CACHE = 'agency-tycoon-v5';
const FILES = [
  '.', 'index.html', 'manifest.json', 'assets/icon.svg',
  'css/styles.css',
  'js/data.js', 'js/game.js', 'js/audio.js', 'js/props.js', 'js/iso.js', 'js/ui.js', 'js/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});

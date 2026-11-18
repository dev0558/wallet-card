// Service worker: cache-first app shell, network-only for /api/*.
// Bump VERSION whenever a shell file changes so clients pick up the update.
const VERSION = 'v1.3.0';
const CACHE = `wallet-card-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'vcard.js',
  'qr.js',
  'fields.js',
  'colors.js',
  'vendor/qrcode.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'fonts/fredoka-latin-wght-normal.woff2',
  'fonts/fredoka-latin-ext-wght-normal.woff2',
  'fonts/nunito-latin-wght-normal.woff2',
  'fonts/nunito-latin-ext-wght-normal.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wallet-card-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST /api/enhance etc. go straight to the network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: network only. Never cache card data or Claude responses.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req));
    return;
  }

  // Navigations: serve the cached shell so the app opens offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then((cached) => cached || fetch(req)),
    );
    return;
  }

  // Static files: cache first, then network (and remember the result).
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }),
  );
});

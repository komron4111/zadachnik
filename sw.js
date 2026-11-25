// Сначала сеть, чтобы получать свежую версию. Если сети нет или она
// отвечает дольше 3 секунд, приложение открывается из кэша на телефоне.
const CACHE = 'zadachnik-v2';
const NETWORK_TIMEOUT = 3000;
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true })
    .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  const network = fetch(req).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  });
  e.waitUntil(network.catch(() => {}));

  const slow = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT))
    .then(() => fromCache(req))
    .then(cached => cached || network);

  e.respondWith(
    Promise.race([network, slow])
      .catch(() => fromCache(req).then(cached => cached || Response.error()))
  );
});

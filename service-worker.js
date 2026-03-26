const CACHE_NAME = 'quote-web-v2';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './lucide.min.js',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/screenshots/desktop.png',
    './assets/screenshots/mobile.png',
    './assets/fonts/fraunces/fraunces-v38-latin-300.woff2',
    './assets/fonts/fraunces/fraunces-v38-latin-500.woff2',
    './assets/fonts/fraunces/fraunces-v38-latin-600.woff2',
    './assets/fonts/manrope/manrope-v20-latin-500.woff2',
    './assets/fonts/manrope/manrope-v20-latin-600.woff2',
    './assets/fonts/manrope/manrope-v20-latin-700.woff2'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('fetch', (e) => {
    // API Strategy: Network Only (Let app.js handle failures with offline quotes)
    if (e.request.url.includes('quotes-api-ruddy.vercel.app')) {
        e.respondWith(fetch(e.request));
        return;
    }

    // Static Assets Strategy: Cache First, Fallback to Network
    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            })).then(() => self.clients.claim());
        })
    );
});

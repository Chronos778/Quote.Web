const CACHE_NAME = 'quote-web-v3';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './lucide.min.js',
    './assets/data/offline-quotes.json',
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
        e.respondWith(
            fetch(e.request).catch(() => new Response(null, { status: 503, statusText: 'Offline' }))
        );
        return;
    }

    if (e.request.method !== 'GET') {
        return;
    }

    // Static Assets Strategy: Stale-While-Revalidate
    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            const networkFetch = fetch(e.request)
                .then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200) {
                        return networkResponse;
                    }

                    const cloned = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, cloned);
                    });

                    return networkResponse;
                })
                .catch(() => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    if (e.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }

                    return new Response('Offline', { status: 503, statusText: 'Offline' });
                });

            return cachedResponse || networkFetch;
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

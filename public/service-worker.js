const CACHE_NAME = 'quote-web-v7';
const API_CACHE_NAME = 'quote-web-api-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
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
  './assets/fonts/manrope/manrope-v20-latin-700.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await Promise.allSettled(
        ASSETS.map(async (asset) => {
          try {
            await cache.add(asset);
          } catch (error) {
            console.warn('Skipping cache asset during install:', asset, error);
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  // API Strategy: Network Only (Let app.js handle failures with offline quotes)
  const isApiRequest =
    e.request.url.includes('quotes-api-ruddy.vercel.app') ||
    e.request.url.includes('/quotes/') ||
    e.request.url.includes('/push/');
  if (isApiRequest) {
    if (e.request.method === 'GET') {
      // Network-First: always try the network for fresh data,
      // fall back to cache only when offline.
      e.respondWith(
        caches.open(API_CACHE_NAME).then((cache) => {
          return fetch(e.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(e.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => {
              return cache.match(e.request).then((cachedResponse) => {
                return (
                  cachedResponse ||
                  new Response(JSON.stringify({ success: false, error: 'Offline' }), {
                    status: 503,
                    statusText: 'Offline',
                    headers: { 'Content-Type': 'application/json' },
                  })
                );
              });
            });
        })
      );
    } else {
      e.respondWith(
        fetch(e.request).catch(
          () =>
            new Response(JSON.stringify({ success: false, error: 'Offline' }), {
              status: 503,
              statusText: 'Offline',
              headers: { 'Content-Type': 'application/json' },
            })
        )
      );
    }
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
      const keepCaches = new Set([CACHE_NAME, API_CACHE_NAME]);
      return Promise.all(
        keyList.map((key) => {
          if (!keepCaches.has(key)) {
            return caches.delete(key);
          }
        })
      ).then(() => self.clients.claim());
    })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'Quote.Web', {
        body: `"${data.body}" — ${data.author}`,
        icon: data.icon || '/assets/icons/icon-192.png',
        badge: data.badge || '/assets/icons/icon-192.png',
        tag: data.tag || 'quote-web-notification',
        data: { url: data.url || '/' },
      })
    );
  } catch (err) {
    console.warn('Failed to parse push payload', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      .then((windowClients) => {
        let matchingClient = null;
        for (let i = 0; i < windowClients.length; i++) {
          const windowClient = windowClients[i];
          if (windowClient.url === urlToOpen) {
            matchingClient = windowClient;
            break;
          }
        }

        if (matchingClient) {
          return matchingClient.focus();
        } else {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

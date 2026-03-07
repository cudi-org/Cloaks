const CACHE_NAME = 'cudi-sync-v4';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/styles.css',
    './css/styles-append.css',
    './js/config.js',
    './js/main.js',
    './js/state.js',
    './js/utils.js',
    './js/ui.js',
    './js/signaling.js',
    './js/webrtc.js',
    './js/file-transfer.js',
    './js/commands.js',
    './js/community.js',
    './js/cptp.js',
    './js/dictionary.js',
    './js/identity.js',
    './js/opfs.js',
    './js/presence.js',
    './manifest.json',
    './icons/logo_matrix_v2.png',
    './icons/official_info.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {

            });

            return cachedResponse || fetchPromise;
        })
    );
});

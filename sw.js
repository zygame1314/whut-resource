const CACHE_NAME = 'whut-resource-v2';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'manifest.json',
    'favicon.png',
    'logo.webp',
    'css/base.css',
    'css/animations.css',
    'css/layout.css',
    'css/components.css',
    'css/pages.css',
    'css/dynamic.css',
    'css/graph.css',
    'script.js',
    'config.js',
    'tutorial.js',
    'announcements.js',
    'guestbook.js',
    'graph.js',
    'auth.js',
    'guestbook_rules.html',
    'how_to_upload.html',
    'sharing_rules.html',
    'upload.html',
    'upload.js'
];
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

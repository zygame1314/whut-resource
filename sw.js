const CACHE_NAME = 'whut-resource-shell-v4';
const ASSETS_TO_CACHE = [
    'manifest.json',
    'favicon.webp',
    'logo.webp'
];
const SHELL_PAGE_EXTENSIONS = /\.(html|htm|webmanifest)$/i;
const SHELL_STATIC_EXTENSIONS = /\.(css|js|webp|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i;
const HASHED_ASSET_PATTERN = /\.[0-9a-f]{8}\.(js|css)$/i;
const IMMUTABLE_MEDIA_PATTERN = /\.(webp|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i;

function isShellRequest(url) {
    if (url.pathname === '/' || url.pathname.endsWith('/')) {
        if (!url.pathname.match(/\.[a-z0-9]+$/i)) {
            return true;
        }
    }
    if (SHELL_PAGE_EXTENSIONS.test(url.pathname) || SHELL_STATIC_EXTENSIONS.test(url.pathname)) {
        return true;
    }
    return false;
}

function isCacheFirstAsset(url) {
    if (url.pathname.startsWith('/lib/')) return true;
    if (HASHED_ASSET_PATTERN.test(url.pathname)) return true;
    if (IMMUTABLE_MEDIA_PATTERN.test(url.pathname)) return true;
    return false;
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
                    console.warn('预缓存部分静态资源失败:', err);
                });
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
    const url = new URL(event.request.url);
    if (!url.protocol.startsWith('http')) {
        return;
    }
    if (url.origin !== self.location.origin) {
        return;
    }
    if (!isShellRequest(url)) {
        return;
    }
    if (isCacheFirstAsset(url)) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cached) => {
                    if (cached) {
                        return cached;
                    }
                    return fetch(event.request).then((response) => {
                        if (response && response.status === 200 && response.type === 'basic') {
                            cache.put(event.request, response.clone()).catch((err) => {
                                console.warn('Cache.put 失败:', event.request.url, err);
                            });
                        }
                        return response;
                    });
                });
            })
        );
        return;
    }
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache).catch((err) => {
                            console.warn('Cache.put 失败:', event.request.url, err);
                        });
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then(response => {
                    if (response) {
                        return response;
                    }
                    return new Response('离线且未缓存', { status: 404, statusText: 'Offline' });
                });
            })
    );
});
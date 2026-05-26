/**
 * FinanzApp - Service Worker
 * Permite funcionamiento offline y cacheo de recursos
 */

const CACHE_NAME = 'finanzapp-v1';
const STATIC_CACHE = 'finanzapp-static-v1';
const DYNAMIC_CACHE = 'finanzapp-dynamic-v1';

// Archivos a cachear inmediatamente
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './css/components.css',
    './css/transactions.css',
    './css/ui.css',
    './css/animations.css',
    './js/utils.js',
    './js/data.js',
    './js/charts.js',
    './js/app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// CDN resources
const CDN_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                return caches.open(DYNAMIC_CACHE);
            })
            .then((cache) => {
                console.log('[SW] Caching CDN assets');
                // CDN assets se cachean de forma opcional
                return Promise.allSettled(
                    CDN_ASSETS.map(url =>
                        fetch(url)
                            .then(response => cache.put(url, response))
                            .catch(() => console.log('[SW] Could not cache:', url))
                    )
                );
            })
            .then(() => self.skipWaiting())
    );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');

    event.waitUntil(
        caches.keys()
            .then((keys) => {
                return Promise.all(
                    keys
                        .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
                        .map((key) => {
                            console.log('[SW] Removing old cache:', key);
                            return caches.delete(key);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Interceptar peticiones
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorar peticiones que no sean GET
    if (request.method !== 'GET') return;

    // Estrategia: Cache First para assets estáticos
    if (isStaticAsset(url)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Estrategia: Network First para CDN
    if (isCDNAsset(url)) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Estrategia: Stale While Revalidate para todo lo demás
    event.respondWith(staleWhileRevalidate(request));
});

// Verificar si es asset estático
function isStaticAsset(url) {
    return url.origin === location.origin &&
        (url.pathname.endsWith('.css') ||
            url.pathname.endsWith('.js') ||
            url.pathname.endsWith('.html') ||
            url.pathname.endsWith('.png') ||
            url.pathname.endsWith('.jpg') ||
            url.pathname.endsWith('.svg'));
}

// Verificar si es CDN
function isCDNAsset(url) {
    return url.origin.includes('googleapis.com') ||
        url.origin.includes('cloudflare.com') ||
        url.origin.includes('jsdelivr.net');
}

// Estrategia: Cache First
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        return new Response('Offline', { status: 503 });
    }
}

// Estrategia: Network First
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(DYNAMIC_CACHE);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        return new Response('Offline', { status: 503 });
    }
}

// Estrategia: Stale While Revalidate
async function staleWhileRevalidate(request) {
    const cachedResponse = await caches.match(request);

    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            caches.open(DYNAMIC_CACHE)
                .then((cache) => cache.put(request, networkResponse.clone()));
            return networkResponse;
        })
        .catch(() => cachedResponse);

    return cachedResponse || fetchPromise;
}

// Escuchar mensajes del cliente
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Push notifications (para futuro)
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};

    const options = {
        body: data.body || 'Nueva notificación de FinanzApp',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'FinanzApp', options)
    );
});

// Click en notificación
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});

console.log('[SW] Service Worker loaded');

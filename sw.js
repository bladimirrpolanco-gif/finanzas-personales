/**
 * FinanzApp - Service Worker
 * Permite funcionamiento offline y cacheo de recursos
 */

const CACHE_NAME = 'finanzapp-v9';
const STATIC_CACHE = 'finanzapp-static-v9';
const DYNAMIC_CACHE = 'finanzapp-dynamic-v9';

// Dominio de la API (Supabase): nunca se debe cachear, contiene datos
// por-usuario (auth, cuentas, transacciones) identificados solo por el
// header Authorization, que el Service Worker no distingue en la cache key.
const API_HOST = 'uwkmrkllvplmjkiiozso.supabase.co';

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

    // API de Supabase (auth + datos por-usuario): nunca interceptar.
    // Dejar que el navegador la maneje directamente, siempre contra la red,
    // para evitar servir la sesión/datos de un usuario anterior desde caché.
    if (url.hostname === API_HOST) return;

    // HTML y navegación: siempre intentar red primero para evitar servir una app vieja
    if (isNavigationRequest(request)) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Estrategia: Stale While Revalidate para assets estáticos versionables
    if (isStaticAsset(url)) {
        event.respondWith(staleWhileRevalidate(request));
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

function isNavigationRequest(request) {
    return request.mode === 'navigate' ||
        (request.destination === 'document') ||
        (request.headers.get('accept') || '').includes('text/html');
}

// Verificar si es CDN
function isCDNAsset(url) {
    return url.origin.includes('googleapis.com') ||
        url.origin.includes('cloudflare.com') ||
        url.origin.includes('jsdelivr.net');
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

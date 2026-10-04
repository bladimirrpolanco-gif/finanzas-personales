/**
 * Finia - Service Worker SOLO para notificaciones push.
 *
 * A proposito NO tiene handler de "fetch" ni usa caches: no intercepta ninguna
 * peticion (ni de la app ni de Supabase), asi que no puede servir contenido
 * viejo ni datos de otra sesion. Es lo contrario del sw.js antiguo, que
 * cacheaba y causaba el bug de "cierro sesion y vuelve la anterior".
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { body: event.data ? event.data.text() : '' };
    }

    event.waitUntil(
        self.registration.showNotification(data.title || 'Finia', {
            body: data.body || '',
            icon: 'icons/icon-192.png',
            badge: 'icons/icon-192.png',
            tag: data.tag || undefined,
            data: { url: data.url || './' }
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
            for (const client of windows) {
                if ('focus' in client) return client.focus();
            }
            return self.clients.openWindow(target);
        })
    );
});

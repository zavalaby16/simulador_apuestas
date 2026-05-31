const CACHE_NAME = 'apuestas-mundial-v2'; // Subimos a v2 para forzar la actualización
const ASSETS = [
  '/',
  '/static/css/styles.css',
  '/static/js/app.js',
  '/static/manifest.json'
];

// 1. Instalar el Service Worker
self.addEventListener('install', (e) => {
  // Fuerza al Service Worker nuevo a activarse de inmediato sin esperar a que cierres la pestaña
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 2. Activar y limpiar cachés viejos de la versión v1
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🧹 Eliminando caché antiguo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim()) // Toma el control de la página inmediatamente
  );
});

// 3. Interceptar peticiones con estrategia inteligente
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Rutas que NUNCA deben venir de la caché, siempre del servidor Python
    const dynamicRoutes = ['/', '/place-bet', '/deposit', '/simular-jornada', '/reiniciar-jornada'];

    if (dynamicRoutes.includes(url.pathname)) {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request)) 
        );
        return;
    }

    // Para todo lo demás (CSS, JS, imágenes), usa caché primero
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
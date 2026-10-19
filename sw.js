// Service worker da Rumo à Carta.
// Guarda os ficheiros da app para abrir mais depressa e mostrar o ecrã
// inicial mesmo sem ligação. Tenta sempre a rede primeiro, por isso as
// atualizações aparecem logo que fizeres upload de ficheiros novos.
// Também mostra as notificações (Web Push) e abre a app quando tocas nelas.

const VERSION = 'rumo-v4';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'avatars.js',
  'config.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Só mexemos nos ficheiros da própria app. Supabase e imagens passam direto.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match('index.html');
          return Response.error();
        })
      )
  );
});

/* ------------------------------------------------ notificações */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  // No iPhone todos os avisos recebidos têm de ser mostrados, por isso mostramos sempre.
  event.waitUntil(
    self.registration.showNotification(data.title || 'rumo à carta', {
      body: data.body || 'está na hora de um teste de código! 🚗',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: data.url || './?novo=1' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './?novo=1', self.registration.scope);
  const wantsNew = target.searchParams.has('novo');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          if (wantsNew) client.postMessage({ type: 'novo' });
          return client.focus();
        }
      }
      return self.clients.openWindow(target.href);
    })
  );
});

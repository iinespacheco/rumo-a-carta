// Service worker da Rumo à Carta.
// Guarda os ficheiros da app para abrir mais depressa e mostrar o ecrã
// inicial mesmo sem ligação. Tenta sempre a rede primeiro, por isso as
// atualizações aparecem logo que fizeres upload de ficheiros novos.
// (As notificações da Fase 2 vão ser acrescentadas aqui.)

const VERSION = 'rumo-v2';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
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

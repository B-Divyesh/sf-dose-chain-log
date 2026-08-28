const VERSION = 'dose-chain-v3'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`
const PRECACHE = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/icon.svg', '/assets/dose-sequencer-720.webp', '/assets/dose-sequencer-1080.webp']
const BUILD_ASSETS = [/* INJECT_BUILD_ASSETS */]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll([...PRECACHE, ...BUILD_ASSETS])))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => ![SHELL, ASSETS].includes(key)).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone()
      caches.open(SHELL).then(cache => cache.put(request, copy))
      return response
    }).catch(async () => (await caches.match(request, { ignoreVary: true })) || (await caches.match('/', { ignoreVary: true })) || caches.match('/offline.html', { ignoreVary: true })))
    return
  }
  event.respondWith(caches.match(request, { ignoreVary: true }).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(ASSETS).then(cache => cache.put(request, response.clone()))
    return response
  })))
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => clients[0]?.focus() || self.clients.openWindow('/')))
})

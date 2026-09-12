/**
 * HouseControl service worker.
 *
 * Read-only offline, deliberately. Pages already visited stay readable with no
 * connection; nothing can be written. Queuing writes would mean two moderators
 * confirming the same payment on two phones and both succeeding — two receipts,
 * two sequence numbers, one payment. That is not a bug you fix afterwards.
 *
 * So: navigations are network-first with a cached fallback, static assets are
 * cache-first, and anything that changes data is never touched.
 */

const VERSION = 'hc-v1'
const SHELL = `${VERSION}-shell`
const PAGES = `${VERSION}-pages`

/** Opened on first run so there is something to show before anything is cached. */
const PRECACHE = ['/offline', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      // A missing file must not wedge the install; the worker is still useful.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

/**
 * Requests that must never be served from a cache.
 *
 * Anything under /api, anything that is not a GET, and the auth routes. A stale
 * session check or a cached payment response is worse than an error page: it
 * tells somebody their money moved when it did not.
 */
function bypass(request) {
  const url = new URL(request.url)

  if (request.method !== 'GET') return true
  if (url.origin !== self.location.origin) return true
  if (url.pathname.startsWith('/api/')) return true
  if (url.pathname.startsWith('/auth/')) return true
  if (url.searchParams.has('_rsc')) return true

  return false
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (bypass(request)) return

  // Pages: try the network, fall back to the last copy we saw.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(PAGES).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          if (cached) return cached

          const offline = await caches.match('/offline')
          return (
            offline ??
            new Response('You are offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          )
        }),
    )
    return
  }

  // Build output is content-hashed, so a cached copy is never the wrong one.
  const url = new URL(request.url)
  const isAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/assets/')

  if (!isAsset) return

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          const copy = response.clone()
          caches.open(SHELL).then((cache) => cache.put(request, copy))
          return response
        }),
    ),
  )
})

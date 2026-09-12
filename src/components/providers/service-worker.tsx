'use client'

import * as React from 'react'

/**
 * Registers the service worker, and only in production.
 *
 * In development it would serve yesterday's bundle from cache and make every
 * change look like it did not happen — an hour lost to debugging something that
 * was never broken.
 *
 * Registration waits for `load` so it never competes with the first paint. The
 * worker's whole job is to help the second visit; making the first one slower
 * to arrange that would be a poor trade.
 */
export function ServiceWorker() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        // Not fatal: the app works perfectly well without it.
        console.warn('[sw] registration failed', error)
      })
    }

    if (document.readyState === 'complete') {
      register()
      return
    }

    window.addEventListener('load', register)
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}

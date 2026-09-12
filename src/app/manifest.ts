import type { MetadataRoute } from 'next'

import { site } from '@/lib/site'

/**
 * What the browser needs before it will offer to install the app.
 *
 * A name, a start URL, a display mode and icons at 192 and 512 — leave any of
 * them out and the install prompt simply never appears, with no error to
 * explain why.
 *
 * `display: 'standalone'` is what removes the address bar, which is most of
 * what makes an installed web app feel like an app rather than a bookmark.
 *
 * Served from a route rather than a static file so the name and colours come
 * from the same place the rest of the app reads them, and cannot drift.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} — building management`,
    short_name: site.name,
    description: site.description,

    /**
     * Straight to the dashboard, not the marketing page.
     *
     * Somebody who has installed the app has already decided to use it; landing
     * them on a page that explains what it is would be odd. Signed-out visitors
     * are redirected to sign-in from there anyway.
     */
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',

    background_color: '#070e1f',
    theme_color: '#1456d6',
    lang: 'en',
    dir: 'ltr',
    categories: ['business', 'finance', 'productivity'],

    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        /**
         * A second 512 with padding, marked maskable.
         *
         * Platforms crop installed icons into their own shape — a circle on
         * Android, a squircle elsewhere — and an unpadded icon loses its
         * corners to that crop. The plain one above is kept for platforms that
         * do no cropping, since padding would make it look small there.
         */
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],

    shortcuts: [
      {
        name: 'Control',
        short_name: 'Control',
        description: 'The building at a glance',
        url: '/control',
      },
      {
        name: 'Handovers',
        short_name: 'Handovers',
        description: 'Money coming in and going out',
        url: '/remittances',
      },
      {
        name: 'Dues',
        short_name: 'Dues',
        description: 'What is outstanding',
        url: '/dues',
      },
    ],
  }
}

import type { MetadataRoute } from 'next'
import { site } from '@/lib/site'

const routes = ['', '/about', '/contact', '/faq', '/privacy', '/terms', '/cookies']

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return routes.map((route) => ({
    url: new URL(route || '/', site.url).toString(),
    lastModified,
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.6,
  }))
}

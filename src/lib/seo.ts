import type { Metadata } from 'next'
import { site } from './site'

type PageMetaInput = {
  title: string
  description: string
  path: string
  noIndex?: boolean
}

/** Build per-page metadata: title, description, canonical URL and OG/Twitter tags. */
export function pageMetadata({
  title,
  description,
  path,
  noIndex,
}: PageMetaInput): Metadata {
  const url = new URL(path, site.url).toString()
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'website',
      url,
      siteName: site.name,
      title: `${title} · ${site.name}`,
      description,
      locale: site.locale,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} · ${site.name}`,
      description,
    },
  }
}

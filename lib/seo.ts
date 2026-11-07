import type { Metadata } from 'next'
import { eventPoster, publicPages, siteOrigin } from './site-seo.mjs'

export function publicMetadata(path: keyof typeof publicPages): Metadata {
  const page = publicPages[path]
  return { title: page.title, description: page.description, metadataBase: new URL(siteOrigin),
    alternates: { canonical: siteOrigin + path },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
    openGraph: { type: 'website', locale: 'es_AR', siteName: 'Vamos al Santísimo', url: siteOrigin + path,
      title: page.title, description: page.description, images: [{ url: siteOrigin + eventPoster, width: 1080, height: 1920, alt: 'Vamos al Santísimo con Pablo Martínez en Formosa · 19 de diciembre de 2026' }] },
    twitter: { card: 'summary_large_image', title: page.title, description: page.description, images: [siteOrigin + eventPoster] },
  }
}

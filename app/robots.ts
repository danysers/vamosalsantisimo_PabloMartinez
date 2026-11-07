import type { MetadataRoute } from 'next'
import { siteOrigin } from '../lib/site-seo.mjs'

export const dynamic = 'force-dynamic'
export default function robots(): MetadataRoute.Robots {
  if (process.env.APP_SURFACE === 'panel') return { rules: { userAgent: '*', disallow: '/' } }
  return { rules: { userAgent: '*', allow: ['/', '/api/sponsors', '/api/flyers', '/api/evento/sede'],
    disallow: ['/admin', '/api/', '/propuestas-inicio'] }, sitemap: `${siteOrigin}/sitemap.xml` }
}

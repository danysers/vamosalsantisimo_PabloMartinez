import type { MetadataRoute } from 'next'

// No verified production domain yet; do not advertise the archived 2025 URL.
export default function sitemap(): MetadataRoute.Sitemap {
  return []
}

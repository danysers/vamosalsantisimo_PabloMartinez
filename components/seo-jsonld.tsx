import { headers } from 'next/headers'
import { structuredDataFor } from '../lib/site-seo.mjs'

export default async function SeoJsonLd({ path }: { path: string }) {
  const value = structuredDataFor(path)
  if (!value) return null
  const nonce = (await headers()).get('x-nonce') || undefined
  return <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, '\\u003c') }} />
}

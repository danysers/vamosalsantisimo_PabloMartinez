import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { eventPoster, publicPages, siteOrigin, structuredDataFor } from '../lib/site-seo.mjs'

const escape = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const pages = [['/', 'pagina principal con efecto/index.html'], ...['', 'inscripcion', 'contacto', 'preguntas-frecuentes', 'pago', 'comprobante', 'acreditacion', 'recursos'].map(page => [page ? `/formacion/${page}` : '/formacion', page ? `formacion/${page}/index.html` : 'formacion/index.html'])]
for (const [path, relative] of pages) {
  const file = fileURLToPath(new URL('../public/' + relative, import.meta.url)), source = await readFile(file, 'utf8')
  const page = publicPages[path], indexable = Boolean(page)
  const next = source.replace(/<head>([\s\S]*?)<\/head>/i, (_all, contents) => {
    let head = contents.replace(/<meta\b[^>]*(?:name="(?:robots|description|twitter:[^"]+)"|property="og:[^"]+")[^>]*>\s*/gi, '')
      .replace(/<link\b[^>]*rel="canonical"[^>]*>\s*/gi, '')
      .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>\s*/gi, '')
    if (page) head = head.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escape(page.title)}</title>`)
    const tags = [`<meta name="robots" content="${indexable ? 'index, follow, max-image-preview:large' : 'noindex, nofollow'}">`, `<link rel="canonical" href="${siteOrigin + path}">`]
    if (page) {
      tags.push(`<meta name="description" content="${escape(page.description)}">`)
      for (const [property, value] of Object.entries({ 'og:title': page.title, 'og:description': page.description, 'og:type': 'website', 'og:locale': 'es_AR', 'og:site_name': 'Vamos al Santísimo', 'og:url': siteOrigin + path, 'og:image': siteOrigin + eventPoster, 'og:image:width': '1080', 'og:image:height': '1920', 'og:image:alt': 'Vamos al Santísimo con Pablo Martínez en Formosa · 19 de diciembre de 2026' })) tags.push(`<meta property="${property}" content="${escape(value)}">`)
      for (const [name, value] of Object.entries({ 'twitter:card': 'summary_large_image', 'twitter:title': page.title, 'twitter:description': page.description, 'twitter:image': siteOrigin + eventPoster })) tags.push(`<meta name="${name}" content="${escape(value)}">`)
      tags.push(`<script id="${path === '/' ? 'event-structured-data' : 'page-structured-data'}" type="application/ld+json">${JSON.stringify(structuredDataFor(path)).replace(/</g, '\\u003c')}</script>`)
    }
    return `<head>${head.trim()}\n${tags.join('\n')}\n</head>`
  })
  if (process.argv.includes('--check')) {
    if (source !== next) throw new Error(`SEO metadata out of sync: ${relative}; run node scripts/prepare-seo.mjs`)
  } else if (next !== source) await writeFile(file, next)
}

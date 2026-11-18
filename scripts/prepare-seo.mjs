import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { eventPoster, publicPages, siteOrigin, structuredDataFor } from '../lib/site-seo.mjs'
import { htmlAttribute, parseStaticHtml } from '../lib/static-html.mjs'

const escape = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const pages = [['/', 'pagina principal con efecto/index.html'], ...['', 'inscripcion', 'contacto', 'preguntas-frecuentes', 'pago', 'comprobante', 'acreditacion', 'recursos'].map(page => [page ? `/formacion/${page}` : '/formacion', page ? `formacion/${page}/index.html` : 'formacion/index.html'])]
function managedMetadata(node) {
  if (node.tagName === 'meta') {
    const name = htmlAttribute(node, 'name')?.toLowerCase()
    const property = htmlAttribute(node, 'property')?.toLowerCase()
    return name === 'robots' || name === 'description' || name?.startsWith('twitter:') || property?.startsWith('og:')
  }
  if (node.tagName === 'link') return htmlAttribute(node, 'rel')?.toLowerCase() === 'canonical'
  return node.tagName === 'script' && htmlAttribute(node, 'type')?.toLowerCase() === 'application/ld+json'
}

function updateHead(source, relative, page, tags) {
  const document = parseStaticHtml(source)
  const html = document.childNodes.find(node => node.tagName === 'html')
  const head = html?.childNodes.find(node => node.tagName === 'head')
  const location = head?.sourceCodeLocation
  if (!location?.startTag || !location.endTag) throw new Error(`Missing explicit HTML head: ${relative}`)

  const start = location.startTag.endOffset
  const end = location.endTag.startOffset
  let contents = source.slice(start, end)
  // Work backwards so edits do not shift offsets or reserialize scripts.
  for (const node of head.childNodes.toReversed()) {
    const offsets = node.sourceCodeLocation
    if (!offsets) continue
    const from = offsets.startOffset - start
    const to = offsets.endOffset - start
    if (managedMetadata(node)) {
      contents = contents.slice(0, from) + contents.slice(to).trimStart()
    } else if (page && node.tagName === 'title') {
      contents = contents.slice(0, from) + `<title>${escape(page.title)}</title>` + contents.slice(to)
    }
  }

  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  return source.slice(0, start) + contents.trim() + newline + tags.join(newline) + newline + source.slice(end)
}

for (const [path, relative] of pages) {
  const file = fileURLToPath(new URL('../public/' + relative, import.meta.url)), source = await readFile(file, 'utf8')
  const page = publicPages[path]
  const tags = seoTags(path, page)
  const next = updateHead(source, relative, page, tags)
  if (process.argv.includes('--check')) {
    if (source !== next) throw new Error(`SEO metadata out of sync: ${relative}; run node scripts/prepare-seo.mjs`)
  } else if (next !== source) await writeFile(file, next)
}

function seoTags(path, page) {
  const tags = [
    `<meta name="robots" content="${page ? 'index, follow, max-image-preview:large' : 'noindex, nofollow'}">`,
    `<link rel="canonical" href="${escape(siteOrigin + path)}">`,
  ]
  if (!page) return tags

  tags.push(`<meta name="description" content="${escape(page.description)}">`)
  for (const [property, value] of Object.entries({ 'og:title': page.title, 'og:description': page.description, 'og:type': 'website', 'og:locale': 'es_AR', 'og:site_name': 'Vamos al Santísimo', 'og:url': siteOrigin + path, 'og:image': siteOrigin + eventPoster, 'og:image:width': '1080', 'og:image:height': '1920', 'og:image:alt': 'Vamos al Santísimo con Pablo Martínez en Formosa · 19 de diciembre de 2026' })) tags.push(`<meta property="${property}" content="${escape(value)}">`)
  for (const [name, value] of Object.entries({ 'twitter:card': 'summary_large_image', 'twitter:title': page.title, 'twitter:description': page.description, 'twitter:image': siteOrigin + eventPoster })) tags.push(`<meta name="${name}" content="${escape(value)}">`)
  const jsonLd = JSON.stringify(structuredDataFor(path)).replaceAll('<', '\\u003c')
  tags.push(`<script id="${path === '/' ? 'event-structured-data' : 'page-structured-data'}" type="application/ld+json">${jsonLd}</script>`)
  return tags
}

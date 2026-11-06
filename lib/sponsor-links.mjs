export const sponsorLinksFilename = 'redes-sponsors.txt'
export const maxSponsorLinksBytes = 64 * 1024
export const maxSponsorLinks = 84

export function sponsorNameKey(name) {
  return String(name).replace(/\.(png|jpe?g|webp)$/i, '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function safeSponsorHref(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') ||
        /[\[\]:]/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) ||
        /\.(localhost|local|internal)$/i.test(url.hostname)) return null
    return url.href
  } catch { return null }
}

// Two CSV fields per line; quoted names may contain commas. Never execute TXT content.
export function parseSponsorLinks(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > maxSponsorLinksBytes) throw new Error('Sponsor links TXT exceeds limit')
  const links = [], names = new Set()
  for (const [index, raw] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:"((?:[^"\r\n]|"")*)"|([^",]*))\s*,\s*(?:"((?:[^"\r\n]|"")*)"|([^"\r\n]*))$/.exec(line)
    if (!match) throw new Error(`Invalid sponsor TXT row ${index + 1}: expected name, HTTPS URL`)
    const name = (match[1] ?? match[2]).replace(/""/g, '"').trim()
    const value = (match[3] ?? match[4]).replace(/""/g, '"').trim()
    const key = sponsorNameKey(name), href = value ? safeSponsorHref(value) : null
    if (!key || name.length > 90 || names.has(key) || (value && !href) || links.length >= maxSponsorLinks) {
      throw new Error(`Invalid or duplicate sponsor TXT row ${index + 1}`)
    }
    names.add(key); links.push({ name, href })
  }
  return links
}

export function validSponsorLinks(links) {
  if (!Array.isArray(links) || links.length > maxSponsorLinks) return false
  const names = new Set()
  return links.every(link => {
    if (!link || typeof link.name !== 'string' || link.name.length > 90 || !sponsorNameKey(link.name) ||
        (link.href !== null && safeSponsorHref(link.href) !== link.href)) return false
    const key = sponsorNameKey(link.name)
    if (names.has(key)) return false
    names.add(key); return true
  })
}

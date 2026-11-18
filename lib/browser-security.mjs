import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inlineScripts } from './static-html.mjs'

export function contentPolicy(scriptSources, analytics = false) {
  return ["default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
    "form-action 'self'", "script-src 'self' " + scriptSources + " https://www.youtube.com https://s.ytimg.com" + (analytics ? ' https://static.cloudflareinsights.com' : ''),
    "script-src-attr 'none'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https://i.ytimg.com",
    "font-src 'self' data:", "connect-src 'self'", "media-src 'self' blob:",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://www.google.com"].join('; ')
}

export function staticScriptHashes(root) {
  const hashes = new Set()
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) for (const hash of staticScriptHashes(path)) hashes.add(hash)
    else if (entry.name.endsWith('.html')) {
      for (const { body } of inlineScripts(readFileSync(path, 'utf8'))) {
        hashes.add("'sha256-" + createHash('sha256').update(body).digest('base64') + "'")
      }
    }
  }
  return [...hashes]
}

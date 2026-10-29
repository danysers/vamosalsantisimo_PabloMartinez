import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function contentPolicy(scriptSources) {
  return ["default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
    "form-action 'self'", "script-src 'self' " + scriptSources + " https://www.youtube.com https://s.ytimg.com",
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
      for (const match of readFileSync(path, 'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (!/\bsrc\s*=/i.test(match[1]) && match[2].trim()) hashes.add("'sha256-" + createHash('sha256').update(match[2].replace(/\r\n?/g, '\n')).digest('base64') + "'")
      }
    }
  }
  return [...hashes]
}

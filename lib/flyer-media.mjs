import { join } from 'node:path'
import { tmpdir } from 'node:os'

export const flyerCacheDir = process.env.FLYER_CACHE_DIR || join(tmpdir(), 'vas-event-flyers-2026')
export const flyerFolderId = '1QMFs67vBo8rY87oARIVSmxZDd1F-j6fJ'
export const maxFlyerBytes = 8 * 1024 * 1024
export const flyerFilenamePattern = /^flyer-evento-(historia|muro)-v([3-9]|[1-9]\d{1,4})(?:-p([1-6]))?-[a-f0-9]{32}\.png$/

export function validFlyerCommit(value) {
  if (!value || value.schema !== 1 || !Number.isInteger(value.version) || value.version < 3 || value.version > 99999 ||
      !/^[a-f0-9]{64}$/.test(value.job || '') || !Number.isSafeInteger(value.generatedAt) ||
      !Array.isArray(value.files) || value.files.length < 2 || value.files.length > 12) return false
  const keys = new Set()
  for (const file of value.files) {
    if (!file || !['historia', 'muro'].includes(file.format) || !/^[A-Za-z0-9_-]{10,100}$/.test(file.id || '') ||
        !Number.isInteger(file.pages) || file.pages < 1 || file.pages > 6 || !Number.isInteger(file.page) || file.page < 1 || file.page > file.pages ||
        file.name !== `flyer-evento-${file.format}-v${value.version}${file.pages > 1 ? `-p${file.page}` : ''}.png` ||
        !/^[a-f0-9]{32}$/.test(file.md5 || '') || !/^[a-f0-9]{64}$/.test(file.sha256 || '') ||
        !Number.isInteger(file.size) || file.size < 24 || file.size > maxFlyerBytes) return false
    const key = `${file.format}/${file.page}`
    if (keys.has(key)) return false
    keys.add(key)
  }
  const pages = value.files[0].pages
  return value.files.every(file => file.pages === pages) && value.files.length === pages * 2 &&
    ['historia', 'muro'].every(format => Array.from({ length: pages }, (_, i) => keys.has(`${format}/${i + 1}`)).every(Boolean))
}

export function flyerFilename(file) { return file.name.replace(/\.png$/, `-${file.md5}.png`) }

export function validFlyerManifest(value) {
  return validFlyerCommit(value) && value.files.every(file => file.filename === flyerFilename(file) && flyerFilenamePattern.test(file.filename))
}

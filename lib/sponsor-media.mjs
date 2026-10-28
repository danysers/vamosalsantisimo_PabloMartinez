import { join } from 'node:path'
import { tmpdir } from 'node:os'

export const sponsorCacheDir = process.env.SPONSOR_CACHE_DIR || join(tmpdir(), 'vas-sponsors-2026')
export const sponsorFolderId = process.env.SPONSOR_DRIVE_FOLDER_ID || '1-ab3D4gRzZ_DHzfvssBR-LnfLPOS6i68'
export const sponsorOwnerEmails = (process.env.SPONSOR_DRIVE_OWNER_EMAILS || 'vamosalsantisimof@gmail.com,danysers@gmail.com')
  .split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
export const maxSponsorBytes = 4 * 1024 * 1024
export const maxSponsors = 80

const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const driveIdPattern = /^[A-Za-z0-9_-]{10,100}$/
const checksumPattern = /^[a-f0-9]{32}$/i

export function sponsorFromDrive(file, ownerEmails = sponsorOwnerEmails) {
  if (!file || !driveIdPattern.test(file.id || '') || !extensions[file.mimeType] ||
      !checksumPattern.test(file.md5Checksum || '') || !Number.isSafeInteger(Number(file.size)) ||
      Number(file.size) < 1 || Number(file.size) > maxSponsorBytes ||
      !Array.isArray(file.owners) || !file.owners.some(owner => ownerEmails.includes(owner.emailAddress?.toLowerCase()))) return null
  const name = String(file.name || '').replace(/\.(png|jpe?g|webp)$/i, '').trim().slice(0, 90)
  if (!name) return null
  const checksum = file.md5Checksum.toLowerCase()
  return { id: file.id, name, filename: `${file.id}-${checksum}.${extensions[file.mimeType]}`,
    mimeType: file.mimeType, size: Number(file.size), modifiedTime: file.modifiedTime || '' }
}

export function validSponsorManifest(value) {
  return value && value.version === 1 && Array.isArray(value.files) && value.files.length <= maxSponsors &&
    value.files.every(file => file && driveIdPattern.test(file.id || '') &&
      new RegExp(`^${file.id}-[a-f0-9]{32}\\.(png|jpg|webp)$`).test(file.filename || '') &&
      typeof file.name === 'string' && file.name.length > 0 && file.name.length <= 90 &&
      Object.hasOwn(extensions, file.mimeType) && Number.isSafeInteger(file.size) && file.size > 0 && file.size <= maxSponsorBytes)
}

export function matchesImageSignature(data, mimeType) {
  if (!Buffer.isBuffer(data)) return false
  if (mimeType === 'image/png') return data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (mimeType === 'image/jpeg') return data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data.at(-2) === 0xff && data.at(-1) === 0xd9
  if (mimeType === 'image/webp') return data.length >= 16 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
  return false
}

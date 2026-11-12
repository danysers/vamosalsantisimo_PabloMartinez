import sharp from 'sharp'
import { maxSponsorBytes } from './sponsor-media.mjs'

const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const formats = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeSponsorFields(input) {
  const brandName = text(input.brandName)
  const ownerName = text(input.ownerName)
  const phone = text(input.phone)
  const email = text(input.email).toLowerCase()
  const announcement = text(input.announcement)

  if (!brandName || brandName.length > 90) return { error: 'El nombre de marca es obligatorio y admite hasta 90 caracteres.' }
  if (!ownerName || ownerName.length > 120) return { error: 'El nombre del titular es obligatorio y admite hasta 120 caracteres.' }
  if (phone.length > 50) return { error: 'El teléfono admite hasta 50 caracteres.' }
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { error: 'Ingresá un correo válido de hasta 254 caracteres.' }
  if (announcement.length > 2000) return { error: 'El texto para decir ese día admite hasta 2000 caracteres.' }

  return { value: { brandName, ownerName, phone: phone || null, email: email || null, announcement: announcement || null } }
}

export const maxSponsorInputBytes = 12 * 1024 * 1024
let processing = 0

// Only freshly decoded/re-encoded pixels cross the storage boundary.
export async function validateSponsorLogo(mimeType, bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxSponsorInputBytes) {
    return { error: 'La imagen debe pesar como máximo 12 MiB.' }
  }
  const detected = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : ''
  if (!detected || (mimeType && mimeType !== 'application/octet-stream' && mimeType !== detected)) {
    return { error: 'Usá PNG, JPG o WebP: el contenido no coincide con una imagen permitida. Para HEIC, exportá como JPG.' }
  }
  if (processing >= 2) return { error: 'Hay otras imágenes procesándose. Reintentá en unos segundos.' }
  processing++
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: true, failOn: 'warning' })
    const metadata = await image.metadata()
    if (metadata.format !== formats[detected] || !metadata.width || !metadata.height ||
        metadata.width * metadata.height > 40_000_000 || (metadata.pages || 1) > 1) {
      return { error: 'Usá una imagen estática válida de hasta 40 megapíxeles; no animaciones.' }
    }
    // No keepMetadata/withMetadata: EXIF (including GPS), XMP, ICC and trailers are discarded.
    const clean = await image.autoOrient().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 92, alphaQuality: 100, effort: 4 }).timeout({ seconds: 8 }).toBuffer()
    if (clean.length > maxSponsorBytes) return { error: 'La imagen procesada supera 4 MiB. Elegí una imagen más pequeña.' }
    return { mimeType: 'image/webp', extension: 'webp', sizeBytes: clean.length, bytes: clean }
  } catch {
    return { error: 'La imagen está dañada, incompleta o supera los límites permitidos.' }
  } finally { processing-- }
}

export function sponsorLogoFilename(brandName, mimeType) {
  const extension = extensions[mimeType]
  if (!extension) return null
  const safeName = text(brandName).normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 90)
  return safeName ? `${safeName}.${extension}` : null
}

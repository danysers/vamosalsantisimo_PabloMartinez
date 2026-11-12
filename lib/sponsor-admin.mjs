import sharp from 'sharp'
import { maxSponsorBytes, matchesImageSignature } from './sponsor-media.mjs'

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

export async function validateSponsorLogo(mimeType, bytes) {
  if (!Object.hasOwn(extensions, mimeType)) return { error: 'Usá una imagen PNG, JPG o WebP estática.' }
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > maxSponsorBytes) {
    return { error: 'El logo debe pesar como máximo 4 MiB.' }
  }
  if (!matchesImageSignature(bytes, mimeType)) return { error: 'El archivo no coincide con el formato de imagen declarado.' }
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000, animated: true })
    const metadata = await image.metadata()
    if (metadata.format !== formats[mimeType] || !metadata.width || !metadata.height ||
        metadata.width * metadata.height > 20_000_000 || (metadata.pages || 1) > 1) {
      return { error: 'El logo debe ser una imagen estática válida de hasta 20 megapíxeles.' }
    }
  } catch {
    return { error: 'El logo no es una imagen válida o supera el tamaño de imagen permitido.' }
  }
  return { mimeType, extension: extensions[mimeType], sizeBytes: bytes.length }
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

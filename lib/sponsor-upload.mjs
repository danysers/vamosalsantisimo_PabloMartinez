import { maxSponsorInputBytes } from './sponsor-admin.mjs'

export class SponsorUploadError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

// Bound actual bytes before multipart parsing; Content-Length is only a hint.
export async function readSponsorForm(request, maximum = maxSponsorInputBytes + 65536, timeoutMs = 60000) {
  const type = request.headers.get('content-type') || ''
  if (!/^multipart\/form-data\s*;/i.test(type)) throw new SponsorUploadError('Solicitud inválida.')
  if (Number(request.headers.get('content-length')) > maximum) throw new SponsorUploadError('La carga supera 12 MiB.', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new SponsorUploadError('La carga está vacía.')
  let timer
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
    reject(new SponsorUploadError('La carga tardó demasiado. Reintentá con mejor conexión.', 408))
    void reader.cancel().catch(() => {})
  }, timeoutMs) })
  const chunks = []
  let size = 0
  try {
    while (true) {
      const result = await Promise.race([reader.read(), deadline])
      if (result.done) break
      size += result.value.byteLength
      if (size > maximum) throw new SponsorUploadError('La carga supera 12 MiB.', 413)
      chunks.push(result.value)
    }
    const form = await new Response(Buffer.concat(chunks, size), { headers: { 'Content-Type': type } }).formData()
    const allowed = new Set(['brandName', 'ownerName', 'phone', 'email', 'announcement', 'logo'])
    const seen = new Set()
    for (const [key, value] of form) {
      if (!allowed.has(key) || seen.has(key) || (key !== 'logo' && (typeof value !== 'string' || value.length > 2000))) {
        throw new SponsorUploadError('Formulario inválido o campos duplicados.')
      }
      seen.add(key)
    }
    return form
  } catch (error) {
    void reader.cancel().catch(() => {})
    if (error instanceof SponsorUploadError) throw error
    throw new SponsorUploadError('No se pudo leer el archivo. Seleccionalo nuevamente.')
  } finally { clearTimeout(timer); reader.releaseLock() }
}

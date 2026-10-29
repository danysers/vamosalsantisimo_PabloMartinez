import { publicRequestOrigin } from '../../../../../lib/public-site-origin'
import { NextRequest } from 'next/server'
import { allowPublicOperation, tooManyRequests } from '../../../../../lib/request-rate-limit'
import { MAX_MULTIPART_BYTES, MAX_PROOF_BYTES, submitPaymentProof } from '../../../../../lib/payment-proof'

export const runtime = 'nodejs'
const reply = (body: object, status: number) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow',
} })

async function boundedFormData(request: NextRequest) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('empty_body')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_MULTIPART_BYTES) { await reader.cancel(); throw new Error('too_large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const body = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))
  return new Request('http://localhost/upload', { method: 'POST', headers: { 'content-type': request.headers.get('content-type') || '' }, body }).formData()
}

export async function POST(request: NextRequest) {
  if (!publicRequestOrigin(request)) return reply({ error: 'Solicitud inválida.' }, 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) return reply({ error: 'Solicitud inválida.' }, 400)
  try {
    if (!await allowPublicOperation('proof-upload')) return tooManyRequests()
    const declaredLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) return reply({ error: 'El archivo supera el límite de 5 MB.' }, 413)
    const data = await boundedFormData(request)
    const reference = data.get('reference'), accessToken = data.get('accessToken'), file = data.get('comprobante')
    if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{10,80}$/.test(reference) ||
      typeof accessToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(accessToken) ||
      !(file instanceof File) || file.size < 1 || file.size > MAX_PROOF_BYTES) {
      return reply({ error: 'Adjuntá una imagen JPG, PNG, WebP o un PDF de hasta 5 MB.' }, 400)
    }
    const result = await submitPaymentProof({ reference, accessToken, filename: file.name || 'comprobante', bytes: Buffer.from(await file.arrayBuffer()) })
    return reply(result.body, result.code)
  } catch (error) {
    if (error instanceof Error && error.message === 'too_large') return reply({ error: 'El archivo supera el límite de 5 MB.' }, 413)
    return reply({ error: 'No pudimos guardar el comprobante. Intentá nuevamente.' }, 503)
  }
}

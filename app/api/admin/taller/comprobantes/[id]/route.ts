import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { authorizeOperator, privateReply } from '../../../../../../lib/admin-api'
import { getDb } from '../../../../../../lib/db'

export const runtime = 'nodejs'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator'], false)
    if ('response' in operator) return operator.response
    const { id } = await context.params
    if (!/^[0-9a-f-]{36}$/.test(id)) return privateReply({ error: 'Comprobante no encontrado.' }, 404)
    const result = await getDb().execute(sql`
      SELECT proof.data,proof.content_type FROM payment_proofs proof
      JOIN registrations r ON r.id=proof.registration_id
      JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
      WHERE proof.id=${id} AND e.slug=${operator.eventSlug} LIMIT 1
    `)
    const proof = result.rows[0]
    if (!proof) return privateReply({ error: 'Comprobante no encontrado.' }, 404)
    const type = String(proof.content_type)
    if (!['image/png','image/jpeg','image/webp','application/pdf'].includes(type)) return privateReply({ error: 'Archivo no disponible.' }, 415)
    return new Response(new Uint8Array(proof.data as Buffer), { headers: {
      'Content-Type': type, 'Content-Disposition': 'inline; filename="comprobante"',
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:",
      'X-Robots-Tag': 'noindex, nofollow',
    } })
  } catch {
    const correlation = randomUUID()
    console.error(`proof_download_failed correlation=${correlation}`)
    return privateReply({ error: 'No pudimos abrir el comprobante.', correlation }, 503)
  }
}

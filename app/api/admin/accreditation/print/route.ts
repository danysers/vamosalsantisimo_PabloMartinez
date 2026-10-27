import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import QRCode from 'qrcode'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { decryptAccreditationQr, hashAccreditationQr } from '../../../../../lib/accreditation-token'
import { getDb } from '../../../../../lib/db'
import { accreditationDeliveries, auditLog } from '../../../../../lib/schema'

export const runtime = 'nodejs'

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

export async function GET(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator', 'admission_operator'], false)
    if ('response' in operator) return operator.response
    const reference = request.nextUrl.searchParams.get('reference') ?? ''
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(reference)) return privateReply({ error: 'Referencia inválida.' }, 400)
    const db = getDb()
    const found = await db.execute(sql`
      SELECT c.id,c.version,c.token_hash,c.token_ciphertext,c.token_iv,c.token_auth_tag,c.encryption_key_id,
        c.reason,r.id AS registration_id,r.reference,r.name,r.status,
        registration_has_approved_payment(r.id) AS paid,a.status AS assistance_status,
        (fw.registration_id IS NOT NULL) AS waived
      FROM accreditation_credentials c JOIN registrations r ON r.id=c.registration_id
      JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
      LEFT JOIN assistance_requests a ON a.registration_id=r.id
      LEFT JOIN fee_waivers fw ON fw.registration_id=r.id AND fw.revoked_at IS NULL
      WHERE r.reference=${reference} AND e.slug=${operator.eventSlug}
        AND c.revoked_at IS NULL AND c.expires_at>now()
      ORDER BY c.version DESC LIMIT 1
    `)
    const row = found.rows[0] as {
      id: string; version: number; token_hash: string; token_ciphertext: string; token_iv: string;
      token_auth_tag: string; encryption_key_id: string; reason: string; registration_id: string;
      reference: string; name: string; status: string; paid: boolean; assistance_status: string | null; waived: boolean
    } | undefined
    const eligible = row && row.status === 'confirmed' && (row.reason === 'paid' ? row.paid
      : row.reason === 'assistance_approved' ? row.assistance_status === 'approved' : row.waived)
    if (!row || !eligible) return privateReply({ error: 'No hay un volante vigente para esta referencia.' }, 404)
    if (!process.env.ACCREDITATION_TOKEN_KEY || row.encryption_key_id !== process.env.ACCREDITATION_TOKEN_KEY_ID) {
      return privateReply({ error: 'La clave de reimpresión no está disponible.' }, 503)
    }
    const qrValue = decryptAccreditationQr({ tokenCiphertext: row.token_ciphertext, tokenIv: row.token_iv,
      tokenAuthTag: row.token_auth_tag }, process.env.ACCREDITATION_TOKEN_KEY, row.registration_id, row.version)
    if (hashAccreditationQr(qrValue) !== row.token_hash) throw new Error('accreditation_hash_mismatch')
    const image = await QRCode.toDataURL(qrValue, { width: 480, margin: 2, errorCorrectionLevel: 'M' })
    await db.insert(accreditationDeliveries).values({ credentialId: row.id, channel: 'screen' })
    await db.insert(auditLog).values({ actorId: operator.operatorId, action: 'accreditation.print_viewed',
      subjectId: row.registration_id, changes: { credentialId: row.id } })
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Volante de acreditación</title><style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;background:#f3eee6;color:#231313;margin:0;padding:24px}.sheet{max-width:570px;margin:auto;background:white;padding:38px;border:2px solid #cba65b;text-align:center}.brand{background:#140b0d;color:#edca77;padding:24px;font-family:Georgia,serif;font-size:30px}.label{letter-spacing:3px;font-size:12px;color:#8d6b32;margin:26px 0 8px}h1{font:32px Georgia,serif;margin:8px 0}h2{font:25px Georgia,serif;margin:18px 0 4px}.qr{width:260px;max-width:100%;height:auto}.details{line-height:1.6}.reference{font-weight:bold;font-size:18px;letter-spacing:1px}.note{font-size:12px;color:#555}.actions{max-width:570px;margin:16px auto;text-align:center}@media print{body{background:white;padding:0}.sheet{border:2px solid #cba65b;min-height:100vh}.actions{display:none}}
      </style></head><body><main class="sheet"><div class="brand">Vamos al Santísimo</div><p class="label">ACREDITACIÓN PERSONAL · TALLER 2026</p><h1>Formación católica</h1><h2>${escapeHtml(row.name)}</h2><p class="reference">Referencia: ${escapeHtml(row.reference)}</p><img class="qr" src="${image}" alt="QR personal de ingreso"><p class="details">Sábado 19 de diciembre de 2026 · 15:00 h<br>Parroquia San Luis de Francia · Formosa</p><p class="note">Presentá este QR al ingresar. Es único y permite una sola acreditación. No lo compartas.</p></main><p class="actions">Para imprimir o guardar en PDF, usá la opción Imprimir del navegador.</p></body></html>`
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } })
  } catch {
    const correlation = randomUUID()
    console.error(`accreditation_print_failed correlation=${correlation}`)
    return privateReply({ error: 'No se pudo mostrar el volante.', correlation }, 503)
  }
}

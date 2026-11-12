import { readSponsorForm, SponsorUploadError } from '../../../../../lib/sponsor-upload.mjs'
import { allowPublicOperation, tooManyRequests } from '../../../../../lib/request-rate-limit'
import { createHash, randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { getDb } from '../../../../../lib/db'
import { normalizeSponsorFields, sponsorLogoFilename, validateSponsorLogo } from '../../../../../lib/sponsor-admin.mjs'
import { driveAccessToken, SponsorDriveError, trashSponsorLogo, uploadSponsorLogo } from '../../../../../lib/sponsor-drive-upload.mjs'
import { auditLog, events, workshopSponsors } from '../../../../../lib/schema'

export const runtime = 'nodejs'

async function readLogo(form: FormData) {
  const candidate = form.get('logo')
  if (candidate === null || (candidate instanceof File && candidate.size === 0 && !candidate.name)) return { empty: true as const }
  if (!(candidate instanceof File)) return { error: 'Adjuntá un archivo de imagen válido.' as const }
  const bytes = Buffer.from(await candidate.arrayBuffer())
  const checked = await validateSponsorLogo(candidate.type, bytes)
  if ('error' in checked) return { error: checked.error }
  return { empty: false as const, ...checked }
}

async function eventIdForSlug(eventSlug: string) {
  const [event] = await getDb().select({ id: events.id }).from(events).where(eq(events.slug, eventSlug)).limit(1)
  return event?.id
}

export async function POST(request: NextRequest) {
  const access = await authorizeOperator(request, ['sponsor'])
  if ('response' in access) return access.response
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) return privateReply({ error: 'Solicitud inválida.' }, 400)

  const correlation = randomUUID()
  let uploadedFileId: string | undefined
  let token: string | undefined
  try {
    if (!await allowPublicOperation('sponsor-upload')) return tooManyRequests()
    const form = await readSponsorForm(request)
    const parsed = normalizeSponsorFields({ brandName: form.get('brandName'), ownerName: form.get('ownerName'),
      phone: form.get('phone'), email: form.get('email'), announcement: form.get('announcement') })
    if ('error' in parsed) return privateReply({ error: parsed.error }, 400)
    const logo = await readLogo(form)
    if ('error' in logo) return privateReply({ error: logo.error }, 400)
    if (logo.empty) return privateReply({ error: 'El logo es obligatorio.' }, 400)

    const eventId = await eventIdForSlug(access.eventSlug)
    if (!eventId) return privateReply({ error: 'No se encontró el evento configurado.' }, 503)
    const db = getDb()
    const duplicate = await db.select({ id: workshopSponsors.id }).from(workshopSponsors).where(and(
      eq(workshopSponsors.eventId, eventId), sql`lower(trim(${workshopSponsors.brandName})) = lower(trim(${parsed.value.brandName}))`)).limit(1)
    if (duplicate.length) return privateReply({ error: 'Ya existe un sponsor con ese nombre de marca.' }, 409)

    const driveToken = await driveAccessToken()
    token = driveToken
    const filename = sponsorLogoFilename(parsed.value.brandName, logo.mimeType)
    if (!filename) return privateReply({ error: 'Revisá el nombre de marca y el formato del logo.' }, 400)
    const driveFile = await uploadSponsorLogo({ name: filename, mimeType: logo.mimeType, bytes: logo.bytes, token: driveToken })
    uploadedFileId = driveFile.id

    const sponsor = await db.transaction(async (tx) => {
      const [created] = await tx.insert(workshopSponsors).values({ eventId, ...parsed.value,
        logoDriveFileId: driveFile.id, logoFilename: driveFile.name, logoMimeType: driveFile.mimeType,
        logoSizeBytes: driveFile.sizeBytes, logoDataBase64: logo.bytes.toString('base64'),
        logoChecksum: createHash('md5').update(logo.bytes).digest('hex'),
        createdBy: access.operatorId, updatedBy: access.operatorId })
        .returning({ id: workshopSponsors.id, brandName: workshopSponsors.brandName })
      await tx.insert(auditLog).values({ actorId: access.operatorId, action: 'sponsor.created', subjectId: created.id,
        changes: { fields: ['brandName', 'ownerName', 'phone', 'email', 'announcement', 'logo'] } })
      return created
    })
    return privateReply({ sponsor }, 201)
  } catch (error) {
    if (error instanceof SponsorUploadError) return privateReply({ error: error.message }, error.status)
    const cleaned = uploadedFileId && token ? await trashSponsorLogo({ fileId: uploadedFileId, token }) : true
    console.error(`sponsor_create_failed correlation=${correlation} drive_cleanup=${cleaned ? 'ok' : 'pending'}`)
    if (error instanceof SponsorDriveError) return privateReply({ error: 'No se pudo guardar el logo en Drive. Verificá la conexión autorizada del panel.' }, 503)
    if ((error as { code?: string })?.code === '23505') return privateReply({ error: 'Ya existe un sponsor con ese nombre de marca.' }, 409)
    return privateReply({ error: 'No se pudo guardar el sponsor. Revisá los datos e intentá nuevamente.' }, 503)
  }
}

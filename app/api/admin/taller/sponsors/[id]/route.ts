import { readSponsorForm, SponsorUploadError } from '../../../../../../lib/sponsor-upload.mjs'
import { allowPublicOperation, tooManyRequests } from '../../../../../../lib/request-rate-limit'
import { createHash, randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { authorizeOperator, privateReply } from '../../../../../../lib/admin-api'
import { getDb } from '../../../../../../lib/db'
import { normalizeSponsorFields, sponsorLogoFilename, validateSponsorLogo } from '../../../../../../lib/sponsor-admin.mjs'
import { driveAccessToken, renameSponsorLogo, SponsorDriveError, uploadSponsorLogo } from '../../../../../../lib/sponsor-drive-upload.mjs'
import { auditLog, events, workshopSponsors } from '../../../../../../lib/schema'

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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorizeOperator(request, ['sponsor'])
  if ('response' in access) return access.response
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) return privateReply({ error: 'Solicitud inválida.' }, 400)

  const correlation = randomUUID()
  let driveUpdated = false
  try {
    const { id } = await params
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return privateReply({ error: 'Sponsor no encontrado.' }, 404)
    if (!await allowPublicOperation('sponsor-upload')) return tooManyRequests()
    const form = await readSponsorForm(request)
    const parsed = normalizeSponsorFields({ brandName: form.get('brandName'), ownerName: form.get('ownerName'),
      phone: form.get('phone'), email: form.get('email'), announcement: form.get('announcement') })
    if ('error' in parsed) return privateReply({ error: parsed.error }, 400)
    const logo = await readLogo(form)
    if ('error' in logo) return privateReply({ error: logo.error }, 400)

    const db = getDb()
    const [event] = await db.select({ id: events.id }).from(events).where(eq(events.slug, access.eventSlug)).limit(1)
    if (!event) return privateReply({ error: 'No se encontró el evento configurado.' }, 503)
    const [before] = await db.select().from(workshopSponsors).where(and(eq(workshopSponsors.id, id), eq(workshopSponsors.eventId, event.id))).limit(1)
    if (!before) return privateReply({ error: 'Sponsor no encontrado.' }, 404)
    const duplicate = await db.select({ id: workshopSponsors.id }).from(workshopSponsors).where(and(
      eq(workshopSponsors.eventId, event.id), sql`lower(trim(${workshopSponsors.brandName})) = lower(trim(${parsed.value.brandName}))`,
      sql`${workshopSponsors.id} <> ${id}`)).limit(1)
    if (duplicate.length) return privateReply({ error: 'Ya existe un sponsor con ese nombre de marca.' }, 409)

    let driveFile = { id: before.logoDriveFileId, name: before.logoFilename, mimeType: before.logoMimeType, sizeBytes: before.logoSizeBytes }
    const needsDriveUpdate = !logo.empty || parsed.value.brandName !== before.brandName
    if (needsDriveUpdate) {
      const token = await driveAccessToken()
      const filename = sponsorLogoFilename(parsed.value.brandName, logo.empty ? before.logoMimeType : logo.mimeType)
      if (!filename) return privateReply({ error: 'Revisá el nombre de marca y el formato del logo.' }, 400)
      driveFile = logo.empty
        ? await renameSponsorLogo({ fileId: before.logoDriveFileId, name: filename, token })
        : await uploadSponsorLogo({ fileId: before.logoDriveFileId, name: filename, mimeType: logo.mimeType, bytes: logo.bytes, token })
      driveUpdated = true
    }

    const sponsor = await db.transaction(async (tx) => {
      const [updated] = await tx.update(workshopSponsors).set({ ...parsed.value,
        logoFilename: driveFile.name, logoMimeType: driveFile.mimeType, logoSizeBytes: driveFile.sizeBytes,
        logoDataBase64: logo.empty ? before.logoDataBase64 : logo.bytes.toString('base64'),
        logoChecksum: logo.empty ? before.logoChecksum : createHash('md5').update(logo.bytes).digest('hex'),
        updatedBy: access.operatorId, updatedAt: new Date() })
        .where(and(eq(workshopSponsors.id, id), eq(workshopSponsors.eventId, event.id)))
        .returning({ id: workshopSponsors.id, brandName: workshopSponsors.brandName })
      if (!updated) throw new Error('Sponsor disappeared during update')
      await tx.insert(auditLog).values({ actorId: access.operatorId, action: 'sponsor.updated', subjectId: updated.id,
        changes: { fields: ['brandName', 'ownerName', 'phone', 'email', 'announcement', ...(logo.empty ? [] : ['logo'])] } })
      return updated
    })
    return privateReply({ sponsor, logoUpdated: !logo.empty }, 200)
  } catch (error) {
    if (error instanceof SponsorUploadError) return privateReply({ error: error.message }, error.status)
    console.error(`sponsor_update_failed correlation=${correlation} drive_updated=${driveUpdated ? 'yes' : 'no'}`)
    if (error instanceof SponsorDriveError) return privateReply({ error: 'No se pudo actualizar el logo en Drive. Verificá la conexión autorizada del panel.' }, 503)
    if ((error as { code?: string })?.code === '23505') return privateReply({ error: 'Ya existe un sponsor con ese nombre de marca.' }, 409)
    return privateReply({ error: 'No se pudo actualizar el sponsor. Revisá los datos e intentá nuevamente.' }, 503)
  }
}

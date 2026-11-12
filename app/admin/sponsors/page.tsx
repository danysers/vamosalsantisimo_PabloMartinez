import type { Metadata } from 'next'
import { asc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { NextRequest } from 'next/server'
import { authorizeOperator } from '../../../lib/admin-api'
import { getDb } from '../../../lib/db'
import { events, workshopSponsors } from '../../../lib/schema'
import AdminWorkspace from '../admin-workspace'
import SponsorsPanel, { type SponsorRecord } from './sponsors-panel'
import '../admin.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Sponsors del taller', robots: { index: false, follow: false } }

export default async function SponsorsPage() {
  if (process.env.APP_SURFACE !== 'panel') notFound()
  const access = await authorizeOperator(new NextRequest(new URL('/admin/sponsors', process.env.BETTER_AUTH_URL || 'http://localhost'),
    { headers: await headers() }), ['sponsor'], false)
  if ('response' in access) { if (access.response.status === 401) redirect('/admin'); notFound() }

  const db = getDb()
  const [event] = await db.select({ id: events.id }).from(events).where(eq(events.slug, access.eventSlug)).limit(1)
  if (!event) notFound()
  const sponsors = await db.select({ id: workshopSponsors.id, brandName: workshopSponsors.brandName,
    ownerName: workshopSponsors.ownerName, logoDriveFileId: workshopSponsors.logoDriveFileId,
    logoFilename: workshopSponsors.logoFilename, phone: workshopSponsors.phone, email: workshopSponsors.email,
    announcement: workshopSponsors.announcement, updatedAt: workshopSponsors.updatedAt })
    .from(workshopSponsors).where(eq(workshopSponsors.eventId, event.id))
    .orderBy(asc(workshopSponsors.brandName), asc(workshopSponsors.createdAt)).limit(100)
  const rows: SponsorRecord[] = sponsors.map(row => ({ ...row, updatedAt: row.updatedAt.toISOString() }))

  return <AdminWorkspace title="Sponsors" description="Cargá los datos privados de contacto y el logo de cada sponsor del taller."
    section="sponsors" role={access.role} canManageWorkshop={false} canAccessSponsors>
    <p className="admin-context-note">Al guardar, el logo se publica desde el panel en la web y también se archiva en Drive. El generador de flyers de Oracle detecta el cambio en su próxima revisión; los datos de contacto y el texto del día quedan privados.</p>
    <SponsorsPanel sponsors={rows} />
  </AdminWorkspace>
}

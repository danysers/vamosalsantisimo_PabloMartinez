import 'server-only'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getDb } from './db'
import { resolveAuthentikIdentity } from './authentik-identity'

// Called only by genericOAuth AFTER signature, issuer, audience and nonce verification.
// A pinned immutable sub, never a username/email claim, chooses the operational role.
export async function provisionAuthentikIdentity(profile: Record<string, unknown>) {
  const identity = resolveAuthentikIdentity(profile)
  await getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'oidc:' + identity.sub}))`)
    const linked = await tx.execute(sql`SELECT a.user_id AS id,u.banned FROM account a JOIN "user" u ON u.id=a.user_id
      WHERE a.provider_id='authentik' AND a.account_id=${identity.sub} FOR UPDATE OF u`)
    if (linked.rows.length > 1) throw new Error('Ambiguous identity')
    let userId = linked.rows[0]?.id as string | undefined
    if (linked.rows[0]?.banned) throw new Error('Identity disabled')
    if (!userId && identity.role === 'configuration') {
      const existing = await tx.execute(sql`SELECT u.id,u.banned,a.id AS operator_id,a.disabled,a.role FROM "user" u
        JOIN admin_users a ON a.auth_user_id=u.id WHERE u.username=${identity.username} FOR UPDATE OF u,a`)
      const row = existing.rows[0]
      if (existing.rows.length !== 1 || row.banned || row.disabled || row.role !== 'configuration') throw new Error('Existing administrator must be verified')
      userId = row.id as string
      const other = await tx.execute(sql`SELECT id FROM account WHERE user_id=${userId} AND provider_id='authentik'`)
      if (other.rows.length) throw new Error('Administrator already bound')
    }
    if (!userId) {
      userId = randomUUID()
      // Collisions fail closed; never take over a pre-existing local account by email.
      await tx.execute(sql`INSERT INTO "user" (id,name,email,email_verified,username,role)
        VALUES (${userId},${identity.name},${identity.email},false,${identity.username},'admin')`)
      await tx.execute(sql`INSERT INTO admin_users (auth_user_id,email,role,sponsor_access)
        VALUES (${userId},${identity.email},'sponsor',false)`)
    }
    const operator = await tx.execute(sql`SELECT role,disabled FROM admin_users WHERE auth_user_id=${userId} FOR UPDATE`)
    if (operator.rows.length !== 1 || operator.rows[0].disabled || operator.rows[0].role !== identity.role) throw new Error('Operational role mismatch')
    if (identity.role === 'configuration') await tx.execute(sql`UPDATE admin_users SET sponsor_access=true WHERE auth_user_id=${userId}`)
    if (!linked.rows.length) {
      await tx.execute(sql`INSERT INTO account (id,account_id,provider_id,user_id,updated_at)
        VALUES (${randomUUID()},${identity.sub},'authentik',${userId},now())`)
      // Revoke sessions issued before identity linkage; the callback creates a new one.
      await tx.execute(sql`DELETE FROM session WHERE user_id=${userId}`)
    }
  })
  return {}
}

import pg from 'pg'

const args = process.argv.slice(2)
const email = args[args.indexOf('--email') + 1]
const role = args[args.indexOf('--role') + 1]
const apply = args.includes('--apply')
if (!process.env.DATABASE_URL || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !['configuration', 'registration_operator', 'admission_operator'].includes(role)) {
  console.error('Usage: node scripts/link-admin-operator.mjs --email ADMIN_EMAIL --role registration_operator --apply')
  process.exit(2)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
try {
  const { rows } = await pool.query('SELECT id,email,role,banned FROM "user" WHERE lower(email)=lower($1)', [email])
  const user = rows[0]
  if (!user || user.role !== 'admin' || user.banned) throw new Error('The email does not belong to an enabled Better Auth admin')
  if (!apply) {
    console.log(`Preview: link ${user.email} as ${role}. Add --apply to save.`)
  } else {
    await pool.query(`INSERT INTO admin_users (auth_user_id,email,role)
      VALUES ($1,$2,$3)
      ON CONFLICT (auth_user_id) DO UPDATE SET role=excluded.role,disabled=false`, [user.id, user.email, role])
    console.log(`Admin operator linked as ${role}.`)
  }
} finally {
  await pool.end()
}

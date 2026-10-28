import { spawn, spawnSync } from 'node:child_process'

function prepare(script) {
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit', windowsHide: true })
  if (result.error || result.status !== 0) throw new Error(`Production preparation failed: ${script}`)
}

if (process.env.WORKSHOP_RUN_MIGRATIONS === '1') {
  if (!process.env.DATABASE_URL) throw new Error('Production database is required')
  prepare('scripts/migrate.mjs')
  prepare('scripts/seed-workshop.mjs')
  if (process.env.WORKSHOP_SANDBOX_REGISTRATIONS === '1') prepare('scripts/prepare-sandbox.mjs')
}

const children = new Set()
let stopping = false
function stop(code) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  const timer = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); process.exit(code) }, 15_000)
  timer.unref()
  Promise.all([...children].map(child => new Promise(resolve => child.once('exit', resolve)))).then(() => process.exit(code))
}
function launch(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true })
  children.add(child)
  child.on('error', () => stop(1))
  child.on('exit', code => { children.delete(child); if (!stopping) stop(code || 1) })
}
if (process.env.WORKSHOP_EMAIL_WORKER_ENABLED === '1') {
  launch(['--experimental-strip-types', 'scripts/email-worker.mjs'])
}
if (process.env.WORKSHOP_DRIVE_WORKER_ENABLED === '1') {
  launch(['scripts/drive-proof-worker.mjs'])
}
launch(['server.js'])
process.on('SIGTERM', () => stop(0))
process.on('SIGINT', () => stop(0))

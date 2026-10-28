import { readFile, writeFile, rename, mkdir, stat, rm, open } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'
import { buildSchedule, dueEvents, emptyState, validateState, reminderMessage, setupMessage, deliver } from './schedule.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(await readFile(resolve(directory, 'config.json'), 'utf8'))
const events = buildSchedule(config)
const stateDir = process.env.ALERT_STATE_DIR || '/var/lib/vas-alerts'
const statePath = resolve(stateDir, 'state.json')
const lockPath = resolve(stateDir, 'lock')
const heartbeatPath = resolve(stateDir, 'heartbeat.json')
const args = process.argv.slice(2)
const log = (value) => process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...value })}\n`)

if (args.includes('--preview')) {
  log({ planId: config.planId, timezone: config.timezone, count: events.length,
    events: events.map((event) => ({ id: event.id, at: new Date(event.at).toISOString() })) })
  process.exit(0)
}
if (args.includes('--health')) {
  try {
    const heartbeat = JSON.parse(await readFile(heartbeatPath, 'utf8'))
    if (Date.now() - heartbeat.at > 180_000 || !heartbeat.ok) process.exit(1)
    process.exit(0)
  } catch { process.exit(1) }
}

await mkdir(stateDir, { recursive: true, mode: 0o700 })
async function save(state) {
  const temporaryPath = `${statePath}.${process.pid}.tmp`
  const handle = await open(temporaryPath, 'w', 0o600)
  try { await handle.writeFile(JSON.stringify(state, null, 2)); await handle.sync() } finally { await handle.close() }
  await rename(temporaryPath, statePath)
}
async function withState(callback) {
  try { await mkdir(lockPath) } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const lock = await stat(lockPath)
    if (Date.now() - lock.mtimeMs < 180_000) return { status: 'locked' }
    await rm(lockPath, { recursive: true })
    await mkdir(lockPath)
  }
  try {
    let state
    try { state = validateState(config, JSON.parse(await readFile(statePath, 'utf8'))) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      state = emptyState(config)
      await save(state)
    }
    return await callback(state)
  } finally { await rm(lockPath, { recursive: true, force: true }) }
}
if (args[0] === '--ack-phase') {
  const phaseId = args[1]
  if (!config.phases.some((phase) => phase.id === phaseId)) throw new Error('Unknown phase')
  log(await withState(async (state) => {
    state.acknowledged[phaseId] = new Date().toISOString()
    await save(state)
    return { status: 'acknowledged', phaseId }
  }))
  process.exit(0)
}
if (args.includes('--status')) {
  log(await withState(async (state) => ({ planId: state.planId, planned: events.length,
    sent: Object.keys(state.sent).length, acknowledged: state.acknowledged,
    uncertain: Object.keys(state.uncertain), failed: state.attempts,
    next: events.find((event) => event.at > Date.now() && !state.acknowledged[event.phaseId])?.id ?? null })))
  process.exit(0)
}

const recipient = process.env.ALERT_TO
const from = process.env.SMTP_FROM
const mailbox = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i
if (!mailbox.test(recipient ?? '') || !mailbox.test(from ?? '')) throw new Error('Invalid email configuration')
if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_PORT !== '465') {
  throw new Error('Missing secure SMTP configuration')
}
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: 465, secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
  tls: { minVersion: 'TLSv1.2' }, logger: false, debug: false,
})
async function send(id, message) {
  const messageId = `<${id}@vamosalsantisimo.com>`
  const result = await transport.sendMail({
    from: { name: 'Vamos al Santísimo — Recordatorios', address: from },
    to: recipient, ...message, messageId, disableFileAccess: true, disableUrlAccess: true,
  })
  return { accepted: result.accepted?.some((value) => String(value).toLowerCase() === recipient.toLowerCase()), messageId }
}

let stopping = false
process.on('SIGTERM', () => { stopping = true })
process.on('SIGINT', () => { stopping = true })
await transport.verify()
log({ status: 'smtp-verified', planId: config.planId, planned: events.length, timezone: config.timezone })
do {
  try {
    const result = await withState(async (state) => {
      const now = Date.now()
      const setupId = `${config.planId}-configuracion`
      if (process.env.ALERT_SEND_SETUP === '1' && !state.sent[setupId] && !state.uncertain[setupId] &&
          (state.attempts[setupId]?.nextAt ?? 0) <= now && (state.attempts[setupId]?.count ?? 0) < 3) {
        log(await deliver(state, { id: setupId, message: setupMessage(config), now, save, send }))
      }
      for (const event of dueEvents(config, state, now)) {
        log(await deliver(state, { id: event.id, message: reminderMessage(config, event), now, save, send }))
      }
      return { ok: Object.keys(state.uncertain).length === 0 &&
        !Object.values(state.attempts).some((attempt) => attempt.count >= 3) }
    })
    if (result.status !== 'locked') await writeFile(heartbeatPath, JSON.stringify({ at: Date.now(), ok: result.ok }))
  } catch (error) {
    // Never log raw SMTP errors: providers can include credentials in details.
    log({ status: 'worker-error', code: String(error.code ?? 'STATE_ERROR').slice(0, 50) })
    await writeFile(heartbeatPath, JSON.stringify({ at: Date.now(), ok: false }))
  }
  if (args.includes('--once') || stopping) break
  for (let second = 0; second < 60 && !stopping; second += 1) {
    await new Promise((done) => setTimeout(done, 1000))
  }
} while (!stopping)
transport.close()

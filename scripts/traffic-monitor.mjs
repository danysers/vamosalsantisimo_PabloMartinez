import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { memoryThresholdPercent, readHostMemory } from '../lib/traffic-guard.mjs'

export const alertCooldownMs = 60 * 60_000
export const alertRetryMs = 5 * 60_000
const lockStaleMs = 2 * 60_000

export function memoryAlertMessage(memory, time) {
  const gib = value => (value / 1024 ** 3).toFixed(2)
  return {
    subject: 'Alerta de memoria alta · Vamos al Santísimo',
    text: [
      'El servidor Oracle alcanzó un uso alto de memoria.',
      `Fecha: ${new Date(time).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} (Argentina).`,
      `Memoria utilizada: ${memory.usedPercent.toFixed(1)}%. Umbral de aviso: ${memoryThresholdPercent}%.`,
      `Memoria total: ${gib(memory.totalBytes)} GiB. Disponible: ${gib(memory.availableBytes)} GiB.`,
      '',
      'Está habilitada la espera temporal para nuevos ingresos al sitio, con reintentos cada 30–35 segundos.',
      'Los pagos, sus notificaciones y las acreditaciones conservan sus rutas de acceso.',
      'Este aviso mide memoria del servidor; no confirma por sí solo que la causa sea el tráfico de la web.',
      'Revisá la carga y los servicios del servidor cuando puedas. La espera no reemplaza esa revisión.',
      'Mientras siga por encima del umbral, se enviará como máximo un aviso por hora.',
    ].join('\n'),
  }
}

// The volume carries the cooldown through container replacements. A short
// filesystem lock also covers the overlap of rolling deployments.
export async function checkMemoryAlert({ memory, root, send, now = Date.now(), logger = console }) {
  if (!memory || !Number.isFinite(memory.usedPercent) || memory.usedPercent < memoryThresholdPercent) return 'normal'
  await mkdir(root, { recursive: true, mode: 0o700 })
  const lockPath = join(root, 'alert.lock')
  let lock
  try { lock = await open(lockPath, 'wx', 0o600) }
  catch (error) {
    if (error.code !== 'EEXIST') throw error
    try { if (now - (await stat(lockPath)).mtimeMs > lockStaleMs) await unlink(lockPath) }
    catch { /* another monitor may already have released it */ }
    return 'locked'
  }
  const statePath = join(root, 'alert.json')
  async function save(state) {
    const temporary = join(root, `alert.${randomUUID()}.tmp`)
    try { await writeFile(temporary, JSON.stringify(state), { flag: 'wx', mode: 0o600 }); await rename(temporary, statePath) }
    finally { await unlink(temporary).catch(() => {}) }
  }
  try {
    let state = {}
    try {
      const source = await readFile(statePath, 'utf8')
      if (source.length > 4096) throw new Error('memory_alert_state_invalid')
      state = JSON.parse(source)
      if (!state || typeof state !== 'object' || Array.isArray(state) ||
          ['sentAt', 'nextAttemptAt'].some(key => state[key] !== undefined &&
            (!Number.isFinite(state[key]) || state[key] < 0))) throw new Error('memory_alert_state_invalid')
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    if ((state.sentAt !== undefined && now - state.sentAt < alertCooldownMs) || now < (state.nextAttemptAt || 0)) return 'cooldown'
    // Persist the delay before SMTP: a timeout or abrupt stop must not turn
    // into an uncontrolled email loop.
    await save({ ...state, nextAttemptAt: now + alertRetryMs })
    try {
      await send(memoryAlertMessage(memory, now))
      await save({ sentAt: now, nextAttemptAt: now + alertCooldownMs })
      logger.info(`Memory alert accepted by SMTP: ${memory.usedPercent.toFixed(1)}%`)
      return 'sent'
    } catch {
      logger.error('Memory alert delivery failed; next attempt in at least five minutes.')
      return 'failed'
    }
  } finally {
    await lock.close()
    await unlink(lockPath).catch(() => {})
  }
}

export function startTrafficMonitor() {
  if (process.env.TRAFFIC_GUARD_ENABLED !== '1' || process.env.APP_SURFACE === 'panel') return () => {}
  const root = resolve(process.env.TRAFFIC_GUARD_STATE_DIR || '.next/cache/traffic-guard')
  const recipient = process.env.TRAFFIC_ALERT_TO || 'danysers@gmail.com'
  const port = Number(process.env.SMTP_PORT)
  const configured = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].every(key => process.env[key]) &&
    process.env.SMTP_FROM === 'contactos@vamosalsantisimo.com' && [465, 587].includes(port) &&
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(recipient)
  if (!configured) {
    console.error('Memory alert SMTP is not configured; the admission guard remains enabled.')
    return () => {}
  }
  let transport
  let stopped = false
  let timer
  let nextErrorLogAt = 0
  async function send(message) {
    if (!transport) {
      const { default: nodemailer } = await import('nodemailer')
      transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465,
        requireTLS: port === 587, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 })
    }
    const result = await transport.sendMail({ ...message, from: process.env.SMTP_FROM, to: recipient })
    if (!result.accepted?.some(address => address.toLowerCase() === recipient.toLowerCase())) throw new Error('smtp_not_accepted')
  }
  async function tick() {
    try { await checkMemoryAlert({ memory: readHostMemory(), root, send }) }
    catch {
      if (Date.now() >= nextErrorLogAt) {
        console.error('Memory monitor could not read metrics or alert state; will retry without stopping the website.')
        nextErrorLogAt = Date.now() + alertRetryMs
      }
    }
    if (!stopped) { timer = setTimeout(tick, 10_000); timer.unref() }
  }
  console.info('Memory guard active: host threshold 90%, recovery 85%, alert interval at most once per hour.')
  void tick()
  return () => { stopped = true; clearTimeout(timer); transport?.close() }
}

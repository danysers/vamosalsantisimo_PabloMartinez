import { createHash } from 'node:crypto'
import { mkdir, open, readFile, rename, rmdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { deliver } from './schedule.mjs'

const advisory = 'GHSA-fc5q-39xc-vjpf'
const debianVersion = /^[0-9][0-9A-Za-z.:+~-]*$/
const npmVersion = /^\d+\.\d+\.\d+$/
const mailbox = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: {
    Accept: 'application/json', 'User-Agent': 'vamosalsantisimo-security-patches',
  } })
  if (!response.ok) throw new Error(`HTTP_${response.status}`)
  return response.json()
}

export function debianFixes(entry, pkg, id) {
  const target = entry.affected?.filter(({ package: p }) => p?.name === pkg && p.ecosystem === 'Debian:13')
  if (entry.id !== `DEBIAN-${id}` || !target?.length) throw new Error('DEBIAN_RECORD_MISSING')
  return [...new Set(target.flatMap(item => (item.ranges ?? []).flatMap(range =>
    (range.events ?? []).map(event => event.fixed).filter(version =>
      version && version !== '0' && debianVersion.test(version)))))]
}

export function picomatchFixes(entry) {
  if (entry.ghsa_id !== advisory || !Array.isArray(entry.vulnerabilities)) throw new Error('GITHUB_RECORD_MISSING')
  if (entry.withdrawn_at) return []
  return [...new Set(entry.vulnerabilities.flatMap(item => {
    const version = item.first_patched_version?.identifier ?? item.first_patched_version
    return item.package?.ecosystem === 'npm' && item.package?.name === 'picomatch' &&
      typeof version === 'string' && npmVersion.test(version) ? [version] : []
  }))]
}

async function collect(watch) {
  const checks = Object.entries(watch).flatMap(([pkg, ids]) => ids.map(id => async () => {
    const entry = await getJson(`https://api.osv.dev/v1/vulns/DEBIAN-${id}`)
    return debianFixes(entry, pkg, id).map(version => ({
      id, pkg, version, url: `https://security-tracker.debian.org/tracker/${id}`,
    }))
  }))
  checks.push(async () => {
    const entry = await getJson(`https://api.github.com/advisories/${advisory}`)
    const published = await Promise.all(picomatchFixes(entry).map(async version => {
      const registry = await getJson(`https://registry.npmjs.org/picomatch/${version}`)
      if (registry.name !== 'picomatch' || registry.version !== version) throw new Error('NPM_RELEASE_MISSING')
      return { id: advisory, pkg: 'picomatch', version, url: `https://github.com/advisories/${advisory}` }
    }))
    return published
  })
  const results = []
  for (let offset = 0; offset < checks.length; offset += 6) {
    results.push(...await Promise.allSettled(checks.slice(offset, offset + 6).map(check => check())))
  }
  return {
    checked: results.length,
    failed: results.filter(result => result.status === 'rejected').length,
    fixes: results.flatMap(result => result.status === 'fulfilled' ? result.value : []),
  }
}

function patchKey({ id, pkg, version }) {
  return `${id}:${pkg}:${version}`
}

async function main() {
  const [recipient, mode] = process.argv.slice(2)
  const watch = JSON.parse(await readFile(new URL('./security-watch.json', import.meta.url), 'utf8'))
  const expected = Object.values(watch).flat().length + 1
  const result = await collect(watch)
  console.log(JSON.stringify({ checked: result.checked, failed: result.failed, patches: result.fixes.length }))
  if (result.failed || result.checked !== expected) process.exitCode = 1
  if (mode === '--check') return
  if (!mailbox.test(recipient ?? '') || !mailbox.test(process.env.SMTP_FROM ?? '') ||
      !process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_PORT !== '465') {
    throw new Error('SMTP_CONFIGURATION')
  }
  if (mode === '--test-email' && process.exitCode) return
  if (!result.fixes.length && mode !== '--test-email') return

  const directory = join(process.env.ALERT_STATE_DIR || '/var/lib/vas-alerts', 'security-patches')
  const lock = join(directory, 'lock')
  const path = join(directory, 'state.json')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  try {
    await mkdir(lock)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    if (Date.now() - (await stat(lock)).mtimeMs < 180_000) return
    await rmdir(lock)
    await mkdir(lock)
  }

  try {
    const state = { sent: {}, attempts: {}, uncertain: {}, batches: {} }
    try { Object.assign(state, JSON.parse(await readFile(path, 'utf8'))) } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const save = async () => {
      const temp = `${path}.${process.pid}.tmp`
      const handle = await open(temp, 'w', 0o600)
      try { await handle.writeFile(JSON.stringify(state)); await handle.sync() } finally { await handle.close() }
      await rename(temp, path)
    }
    const covered = new Set(Object.values(state.batches).flat())
    const fresh = result.fixes.filter(fix => !covered.has(patchKey(fix)))
    const id = mode === '--test-email' ? 'security-notifications-setup' :
      `security-patches-${createHash('sha256').update(fresh.map(patchKey).sort().join('\n')).digest('hex').slice(0, 32)}`
    if (fresh.length && mode !== '--test-email') state.batches[id] = fresh.map(patchKey)
    const pending = Object.entries(state.batches).filter(([key]) => !state.sent[key] && !state.uncertain[key])
    if (mode === '--test-email' && !state.sent[id] && !state.uncertain[id]) pending.push([id, []])
    if (!pending.length) return

    const { default: nodemailer } = await import('nodemailer')
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: 465, secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { minVersion: 'TLSv1.2' },
      connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
    })
    try {
      for (const [deliveryId, keys] of pending) {
        const testing = deliveryId === 'security-notifications-setup'
        const patches = result.fixes.filter(fix => keys.includes(patchKey(fix)))
        if (!testing && patches.length !== keys.length) continue
        const message = testing ? {
          subject: 'Alerta de parches activada — Vamos al Santísimo',
          text: 'Este correo comprueba el envío de alertas de seguridad. El servidor revisa cada 4 horas los 39 avisos de Debian 13 y el de picomatch. Recibirás un aviso con la versión corregida cuando se publique.',
        } : {
          subject: 'Hay parches de seguridad disponibles — Vamos al Santísimo',
          text: ['Se publicaron parches para estos avisos:', '', ...patches.map(fix =>
            `- ${fix.pkg} ${fix.version} · ${fix.id}\n  ${fix.url}`), '', 'El aviso no instala los parches.'].join('\n'),
        }
        const receipt = await deliver(state, {
          id: deliveryId, message, now: Date.now(), save, send: async (key, mail) => {
            const messageId = `<${key}@vamosalsantisimo.com>`
            const sent = await transport.sendMail({
              from: { name: 'Vamos al Santísimo — Seguridad', address: process.env.SMTP_FROM },
              to: recipient, ...mail, messageId, disableFileAccess: true, disableUrlAccess: true,
            })
            return { accepted: sent.accepted?.some(value => String(value).toLowerCase() === recipient.toLowerCase()), messageId }
          },
        })
        console.log(JSON.stringify({ status: receipt.status, count: patches.length, code: receipt.code }))
        if (receipt.status !== 'sent') process.exitCode = 1
      }
    } finally { transport.close() }
  } finally { await rmdir(lock) }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => {
    console.error(JSON.stringify({ status: 'error', code: String(error.code ?? error.name).slice(0, 40) }))
    process.exitCode = 1
  })
}

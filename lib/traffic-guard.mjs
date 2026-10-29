import { readFileSync } from 'node:fs'

export const memoryThresholdPercent = 90
export const memoryRecoveryPercent = 85
export const trafficRetrySeconds = 30

// MemFree excludes reclaimable cache and would incorrectly close the site on
// a healthy Linux host. /proc/meminfo is host-wide, even inside this container.
export function parseHostMemory(source) {
  const total = /^MemTotal:\s+(\d+)\s+kB\s*$/m.exec(source)
  const available = /^MemAvailable:\s+(\d+)\s+kB\s*$/m.exec(source)
  if (!total || !available) throw new Error('memory_metrics_unavailable')
  const totalBytes = Number(total[1]) * 1024
  const availableBytes = Number(available[1]) * 1024
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0 ||
      !Number.isSafeInteger(availableBytes) || availableBytes < 0 || availableBytes > totalBytes) {
    throw new Error('memory_metrics_invalid')
  }
  return { totalBytes, availableBytes, usedPercent: 100 * (1 - availableBytes / totalBytes) }
}

export function readHostMemory() {
  // Only the operator's environment can choose a fixture for isolated tests;
  // request headers, cookies and query strings cannot override the measurement.
  // Host procfs and private test fixtures are runtime inputs, never build files.
  return parseHostMemory(readFileSync(/* turbopackIgnore: true */ process.env.TRAFFIC_GUARD_MEMINFO_PATH || '/proc/meminfo', 'utf8'))
}

export function createMemoryGate({ read = readHostMemory, now = Date.now, cacheMs = 1000 } = {}) {
  let sampledAt = -Infinity
  let waiting = false
  let cached = { waiting: false, available: false }
  return () => {
    const time = now()
    if (time - sampledAt < cacheMs) return cached
    sampledAt = time
    try {
      const memory = read()
      if (memory.usedPercent >= memoryThresholdPercent) waiting = true
      else if (memory.usedPercent <= memoryRecoveryPercent) waiting = false
      cached = { ...memory, waiting, available: true }
    } catch {
      // Missing metrics must not take the website down or lock visitors out.
      waiting = false
      cached = { waiting: false, available: false }
    }
    return cached
  }
}

export function isTrafficEntry(method, pathname) {
  if (!['GET', 'HEAD'].includes(method)) return false
  let path
  try { path = decodeURIComponent(pathname) } catch { return false }
  path = path.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/'
  if (/^\/(?:api|_next|admin)(?:\/|$)/.test(path)) return false
  // Preserve checkout, returns, already-issued QR credentials and recovery.
  if (/^\/(?:formacion|taller)\/(?:pago|comprobante)(?:\/|$)/.test(path)) return false
  if (/\.[^/]+$/.test(path)) return false
  return true
}

export const trafficWaitHtml = `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Estamos preparando tu visita · Vamos al Santísimo</title>
<style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:28px 18px;background:#f8f4e9;color:#182944;font-family:system-ui,-apple-system,sans-serif}
main{width:min(100%,510px);padding:48px 32px;text-align:center;background:#fffdf7;border:1px solid #e5d6b4;border-radius:26px;box-shadow:0 22px 65px #3228180c}
.mark{display:grid;place-items:center;width:66px;height:66px;margin:0 auto 28px;border-radius:50%;background:#182944;color:#edcd83;font:700 19px Georgia,serif;letter-spacing:2px}
.eyebrow{font-size:11px;letter-spacing:2.3px;color:#927443;font-weight:650}h1{margin:18px 0;font:400 clamp(31px,7vw,42px)/1.12 Georgia,serif;letter-spacing:-1px}p{font-size:16px;line-height:1.65;color:#5b626d}
.timer{display:inline-grid;place-items:center;margin:16px auto 10px;width:78px;height:78px;border:2px solid #e5d6b4;border-radius:50%;font-size:28px;font-variant-numeric:tabular-nums;color:#182944}
.note{font-size:13px;margin:12px 0 0}.brand{margin-top:28px;font-size:12px;color:#927443}a{color:#182944;text-underline-offset:4px}
@media(max-width:420px){main{padding:36px 24px}}
</style><script src="/traffic-wait.js" defer></script>
<noscript><meta http-equiv="refresh" content="30"></noscript></head>
<body><main><div class="mark" aria-hidden="true">VAS</div><div class="eyebrow">UN MOMENTO, POR FAVOR</div>
<h1>Estamos preparando<br>tu visita.</h1><p>La página está cargando. Estamos regulando el ingreso para que puedas navegar con tranquilidad.</p>
<div class="timer" id="traffic-countdown" aria-hidden="true">30</div><p class="note" id="traffic-status" role="status">Volveremos a intentar el ingreso automáticamente en unos 30 segundos.</p>
<p class="note">Si todavía hay mucha demanda, conservaremos esta pantalla un momento más.</p>
<noscript><p class="note">También podés <a href="">volver a intentar el ingreso</a>.</p></noscript>
<div class="brand">VAMOS AL SANTÍSIMO · 2026</div></main></body></html>`

export const trafficWaitHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Retry-After': String(trafficRetrySeconds),
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self'; script-src-attr 'none'; style-src 'unsafe-inline'",
}

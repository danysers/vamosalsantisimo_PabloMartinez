const DAY = 86_400_000
const HOUR = 3_600_000
export const SETTINGS_URL = 'https://www.mercadopago.com.ar/costs-section/merchant-svcs/processing/options'

function midnight(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid calendar date')
  const result = Date.parse(`${date}T00:00:00-03:00`)
  if (!Number.isFinite(result) || new Date(result - 3 * HOUR).toISOString().slice(0, 10) !== date) {
    throw new Error('Invalid calendar date')
  }
  return result
}

export function buildSchedule(config) {
  if (!/^[a-z0-9-]+$/.test(config.planId) || config.timezone !== 'America/Argentina/Buenos_Aires') {
    throw new Error('Invalid plan or timezone')
  }
  const target = midnight(config.targetDate)
  if (JSON.stringify(config.advanceDays) !== '[4,3,2]' || config.advanceHour !== 9) {
    throw new Error('Unexpected reminder frequency')
  }
  if (!Array.isArray(config.phases) || config.phases.length !== 3) throw new Error('Expected three phases')
  let previousDays = 35
  const phasesSeen = new Set()
  return config.phases.flatMap((phase) => {
    if (!/^[a-z0-9-]+$/.test(phase.id) || phasesSeen.has(phase.id) ||
        phase.fromDays !== previousDays || ![18, 10, 0].includes(phase.toDays) ||
        phase.toDays >= phase.fromDays || !Number.isFinite(phase.ratePercent) ||
        phase.ratePercent < 0 || phase.ratePercent > 100) throw new Error('Invalid phase')
    previousDays = phase.toDays
    phasesSeen.add(phase.id)
    const switchAt = target - phase.fromDays * DAY
    const events = config.advanceDays.map((daysBefore) => ({
      id: `${config.planId}-${phase.id}-previo-${daysBefore}`,
      phaseId: phase.id, phase, switchAt, daysBefore, kind: 'advance',
      at: switchAt - daysBefore * DAY + config.advanceHour * HOUR,
      expiresAt: switchAt - (daysBefore - 1) * DAY,
    }))
    for (let hour = 0; hour < 24; hour += 1) {
      events.push({
        id: `${config.planId}-${phase.id}-hora-${hour}`,
        phaseId: phase.id, phase, switchAt, hour, daysBefore: 0, kind: 'hourly',
        at: switchAt + hour * HOUR, expiresAt: switchAt + (hour + 1) * HOUR,
      })
    }
    return events
  }).sort((a, b) => a.at - b.at)
}

export function dueEvents(config, state, now) {
  return buildSchedule(config).filter((event) =>
    event.at <= now && now < event.expiresAt && !state.sent[event.id] &&
    !state.acknowledged[event.phaseId] && !state.uncertain[event.id] &&
    (state.attempts[event.id]?.nextAt ?? 0) <= now &&
    (state.attempts[event.id]?.count ?? 0) < 3)
}

export function emptyState(config) {
  return { version: 1, planId: config.planId, sent: {}, acknowledged: {}, attempts: {}, uncertain: {} }
}

export function validateState(config, state) {
  if (state.version !== 1 || state.planId !== config.planId ||
      !['sent', 'acknowledged', 'attempts', 'uncertain'].every((key) =>
        state[key] && typeof state[key] === 'object' && !Array.isArray(state[key]))) {
    throw new Error('Invalid persistent state; refusing to resend')
  }
  return state
}

const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
})
export const formatDate = (timestamp) => dateFormat.format(new Date(timestamp))
export const phaseLabel = (phase) => phase.toDays === 0 ? 'al instante' : `${phase.toDays} días`
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

export function reminderMessage(config, event) {
  const label = phaseLabel(event.phase)
  const date = formatDate(event.switchAt)
  const subject = event.kind === 'advance'
    ? `En ${event.daysBefore} días: cambiar Mercado Pago a ${label} — ${date}`
    : `Hoy: cambiar Mercado Pago a ${label} — aviso ${String(event.hour).padStart(2, '0')}:00`
  const text = [
    'Vamos al Santísimo — Taller del 19 de diciembre de 2026', '',
    event.kind === 'advance' ? `Faltan ${event.daysBefore} días para el cambio.` : 'El cambio está previsto para hoy, desde las 00:00.',
    `El ${date}, seleccioná disponibilidad ${label} en Checkout de Mercado Pago y guardá el cambio.`,
    `Comisión observada: ${event.phase.ratePercent.toLocaleString('es-AR')}% antes de IVA y retenciones. Verificá la tarifa vigente en tu cuenta.`,
    'El objetivo es disponer de los fondos el 16/12/2026, tres días antes del taller.', '',
    'Pasos: abrí Costos y cuotas → Checkout → Configurar costos por cobro, elegí el plazo indicado y pulsá Guardar. Recargá para comprobar que quedó seleccionado.',
    SETTINGS_URL, '',
    'Estos avisos no cambian automáticamente la configuración de Mercado Pago. Si ya guardaste este plazo, no necesitás repetir el cambio.',
    'Horarios de Argentina. Los pagos anteriores conservan sus condiciones.',
  ].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;line-height:1.6;color:#251c12"><p>VAMOS AL SANTÍSIMO · TALLER 2026</p><h1>${escapeHtml(subject)}</h1><p>${escapeHtml(text.split('\n\n')[1])}</p><p>Buscamos disponer del dinero el <strong>16 de diciembre</strong>, tres días antes del taller.</p><p>Abrí <strong>Costos y cuotas → Checkout → Configurar costos por cobro</strong>, elegí <strong>${escapeHtml(label)}</strong>, pulsá <strong>Guardar</strong> y recargá para verificar.</p><p><a href="${SETTINGS_URL}" style="display:inline-block;background:#d7b46a;color:#15100a;padding:14px 22px;text-decoration:none;border-radius:6px">Abrir configuración de Mercado Pago</a></p><p>El aviso no realiza el cambio. Si ya lo guardaste, no necesitás repetirlo. Horarios de Argentina.</p><p style="font-size:12px">Los pagos anteriores conservan sus condiciones. Verificá la tarifa vigente en tu cuenta.</p></div>`
  return { subject, text, html }
}

export function setupMessage(config) {
  const schedule = buildSchedule(config)
  const lines = config.phases.map((phase) => {
    const events = schedule.filter((event) => event.phaseId === phase.id)
    return `• ${phaseLabel(phase)}: avisos previos ${events.filter((event) => event.kind === 'advance').map((event) => formatDate(event.at)).join(', ')} a las 09:00; el ${formatDate(events[0].switchAt)}, un aviso por hora de 00:00 a 23:00.`
  })
  return {
    subject: 'Alertas de Mercado Pago activadas — Taller Vamos al Santísimo 2026',
    text: ['Las alertas quedaron programadas en el servidor y funcionan aunque tu PC esté apagada.', '',
      ...lines, '', 'Todos los horarios son de Argentina. Son 81 avisos programados en total.',
      'Los avisos recuerdan el cambio manual en Mercado Pago; no lo realizan automáticamente.',
      'Objetivo de disponibilidad: 16/12/2026. No se modifican precios ni pagos anteriores.', SETTINGS_URL].join('\n'),
  }
}

// A pending SMTP transaction after a process crash is ambiguous. Keep it for
// operator review instead of retrying blindly and risking duplicate email.
export async function deliver(state, { id, message, now, save, send }) {
  const count = (state.attempts[id]?.count ?? 0) + 1
  state.attempts[id] = { count, nextAt: now + 5 * 60_000 }
  state.uncertain[id] = { startedAt: new Date(now).toISOString() }
  await save(state)
  let receipt
  try { receipt = await send(id, message) } catch (error) {
    const code = String(error?.code ?? 'SMTP_ERROR').replace(/[^A-Z0-9_-]/gi, '').slice(0, 50)
    // A dropped connection/timeout can occur after acceptance by the server.
    // Authentication, DNS, connection and explicit SMTP rejections are safe to retry.
    if (['EAUTH', 'EDNS', 'ECONNECTION', 'ECONNREFUSED', 'ENETUNREACH'].includes(code) ||
        Number(error?.responseCode) >= 400) delete state.uncertain[id]
    state.attempts[id].errorCode = code
    await save(state)
    return { id, status: state.uncertain[id] ? 'uncertain' : 'failed', code }
  }
  if (!receipt?.accepted) {
    delete state.uncertain[id]
    state.attempts[id].errorCode = 'RECIPIENT_NOT_ACCEPTED'
    await save(state)
    return { id, status: 'failed', code: 'RECIPIENT_NOT_ACCEPTED' }
  }
  state.sent[id] = { acceptedAt: new Date(now).toISOString(), messageId: receipt.messageId }
  delete state.uncertain[id]
  delete state.attempts[id]
  await save(state)
  return { id, status: 'sent', messageId: receipt.messageId }
}

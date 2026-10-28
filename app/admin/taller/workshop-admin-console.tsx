'use client'

import { useEffect, useState } from 'react'
import SettlementPlanner from './settlement-planner'

type Lot = { id: string; number: number; amountMinor: number; serviceFeeMinor: number; onlineAmountMinor: number }
type Promo = { id: string; code: string; kind: 'bundle' | 'group_fixed'; active: boolean;
  bundleSize: number | null; payablePeople: number | null; minPeople: number | null; maxPeople: number | null;
  groupTotalMinor: number | null; startsAt: string | null; endsAt: string | null; updatedAt: string }
type Config = { activeLot: number; registrationOpen: boolean; emailReady: boolean; capacity: number | null; serviceFeeMinor: number; onSitePriceMinor: number | null;
  lots: Lot[]; promotions: Promo[]; paymentMethods: { bankTransfer: boolean; onSite: boolean } }
type Person = { firstName: string; lastName: string; documentNumber: string; birthDate: string; phone: string; email: string;
  ecclesialState: string; prayerGroup: string; movement: string; occupation: string }
type Quote = { amountMinor: number; subtotalMinor: number; discountMinor: number;
  quoteHash: string;
  members: Array<{ reference: string | null; name: string; lotNumber: number; baseAmountMinor: number;
    discountMinor: number; dueAmountMinor: number }>; payerReference?: string; references?: string[];
  status?: string; replayed?: boolean; emailQueued?: number }

const blankPerson = (): Person => ({ firstName: '', lastName: '', documentNumber: '', birthDate: '', phone: '', email: '',
  ecclesialState: 'laico', prayerGroup: '', movement: '', occupation: '' })
const formatMoney = (minor: number) => (minor / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
function pesosToMinor(value: string) {
  const clean = value.trim().replace(',', '.')
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(clean)) return null
  const [whole, cents = ''] = clean.split('.')
  return Number(whole) * 100 + Number(cents.padEnd(2, '0'))
}
function dateInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
function utc(value: string) { return value ? new Date(value).toISOString() : null }

async function send(path: string, body: object) {
  const response = await fetch(path, { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json()
  return { ok: response.ok, result }
}

function PromotionEditor({ initial, onSaved }: { initial?: Promo; onSaved: () => Promise<void> }) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [kind, setKind] = useState<'bundle' | 'group_fixed'>(initial?.kind ?? 'bundle')
  const [active, setActive] = useState(initial?.active ?? false)
  const [bundleSize, setBundleSize] = useState(String(initial?.bundleSize ?? 3))
  const [payablePeople, setPayablePeople] = useState(String(initial?.payablePeople ?? 2))
  const [minPeople, setMinPeople] = useState(String(initial?.minPeople ?? 3))
  const [maxPeople, setMaxPeople] = useState(String(initial?.maxPeople ?? 20))
  const [groupTotal, setGroupTotal] = useState(initial?.groupTotalMinor == null ? '' : String(initial.groupTotalMinor / 100))
  const [startsAt, setStartsAt] = useState(dateInput(initial?.startsAt ?? null))
  const [endsAt, setEndsAt] = useState(dateInput(initial?.endsAt ?? null))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function save() {
    const total = kind === 'group_fixed' ? pesosToMinor(groupTotal) : null
    if (kind === 'group_fixed' && total == null) { setMessage('Revisá el importe fijo.'); return }
    setBusy(true); setMessage('')
    try {
      const { ok, result } = await send('/api/admin/taller/configuracion', { type: 'promotion',
        ...(initial ? { id: initial.id } : {}), code: code.trim().toUpperCase(), kind, active,
        bundleSize: kind === 'bundle' ? Number(bundleSize) : null,
        payablePeople: kind === 'bundle' ? Number(payablePeople) : null,
        minPeople: kind === 'group_fixed' ? Number(minPeople) : null,
        maxPeople: kind === 'group_fixed' ? Number(maxPeople) : null,
        groupTotalMinor: total, startsAt: utc(startsAt), endsAt: utc(endsAt),
      })
      setMessage(ok ? 'Promoción guardada.' : result.error)
      if (ok) await onSaved()
    } catch { setMessage('No se pudo guardar. Revisá las fechas y la conexión.') }
    finally { setBusy(false) }
  }
  return <div className="admin-promo-card">
    <div className="admin-form-grid">
      <label>Código<input value={code} onChange={e => setCode(e.target.value)} maxLength={32} placeholder="3X2" /></label>
      <label>Tipo<select value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="bundle">Paquete (3×2 / 2×1)</option><option value="group_fixed">Precio fijo grupal</option></select></label>
      {kind === 'bundle' ? <><label>Personas por paquete<input type="number" min="2" max="20" value={bundleSize} onChange={e => setBundleSize(e.target.value)} /></label>
        <label>Personas que pagan<input type="number" min="1" max="19" value={payablePeople} onChange={e => setPayablePeople(e.target.value)} /></label></> : <>
        <label>Mínimo de personas<input type="number" min="2" max="20" value={minPeople} onChange={e => setMinPeople(e.target.value)} /></label>
        <label>Máximo de personas<input type="number" min="2" max="20" value={maxPeople} onChange={e => setMaxPeople(e.target.value)} /></label>
        <label>Total grupal (ARS)<input inputMode="decimal" value={groupTotal} onChange={e => setGroupTotal(e.target.value)} placeholder="20000" /></label></>}
      <label>Desde (opcional)<input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></label>
      <label>Hasta (opcional)<input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} /></label>
    </div>
    <label className="admin-check"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Activa</label>
    <button className="button button-gold" disabled={busy} onClick={save}>Guardar promoción</button>
    <p role="status">{message}</p>
  </div>
}

export default function WorkshopAdminConsole({ canConfigure }: { canConfigure: boolean }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [loadError, setLoadError] = useState('')
  const [lotAmounts, setLotAmounts] = useState<Record<number, string>>({})
  const [onlineFee, setOnlineFee] = useState('')
  const [onSitePrice, setOnSitePrice] = useState('')
  const [configMessage, setConfigMessage] = useState('')
  const [configBusy, setConfigBusy] = useState(false)
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [people, setPeople] = useState<Person[]>([blankPerson(), blankPerson()])
  const [references, setReferences] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ reference: string; name: string; email: string; lotNumber: number; amountMinor: number | null }>>([])
  const [searchMessage, setSearchMessage] = useState('')
  const [payerIndex, setPayerIndex] = useState(0)
  const [payerReference, setPayerReference] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'on_site'>('bank_transfer')
  const [promotionId, setPromotionId] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [groupMessage, setGroupMessage] = useState('')
  const [groupBusy, setGroupBusy] = useState(false)
  const [key, setKey] = useState(() => crypto.randomUUID())

  async function reload() {
    const response = await fetch('/api/admin/taller/configuracion', { cache: 'no-store', credentials: 'same-origin' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar el taller.')
    setConfig(data)
    setLotAmounts(Object.fromEntries((data.lots as Lot[]).map(lot => [lot.number, String(lot.amountMinor / 100)])))
    setOnlineFee(String(data.serviceFeeMinor / 100))
    setOnSitePrice(data.onSitePriceMinor == null ? '' : String(data.onSitePriceMinor / 100))
  }
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/taller/configuracion', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar el taller.')
        return data as Config
      })
      .then(data => {
        if (cancelled) return
        setConfig(data)
        setLotAmounts(Object.fromEntries(data.lots.map(lot => [lot.number, String(lot.amountMinor / 100)])))
        setOnlineFee(String(data.serviceFeeMinor / 100))
        setOnSitePrice(data.onSitePriceMinor == null ? '' : String(data.onSitePriceMinor / 100))
      })
      .catch(error => { if (!cancelled) setLoadError(error.message) })
    return () => { cancelled = true }
  }, [])

  function changed() { setQuote(null); setGroupMessage(''); setKey(crypto.randomUUID()) }
  function changePerson(index: number, field: keyof Person, value: string) {
    setPeople(current => current.map((person, i) => i === index ? { ...person, [field]: value } : person)); changed()
  }
  function draft() {
    const common = { paymentMethod, promotionId: promotionId || null, idempotencyKey: key }
    return mode === 'new' ? { ...common, mode, people, payerIndex }
      : { ...common, mode, references: references.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean), payerReference }
  }
  async function saveConfig(body: object) {
    setConfigBusy(true); setConfigMessage('')
    try {
      const { ok, result } = await send('/api/admin/taller/configuracion', body)
      setConfigMessage(ok ? 'Configuración guardada. Los pagos anteriores conservan su cotización.' : result.error)
      if (ok) { await reload(); changed() }
    } catch { setConfigMessage('No se pudo guardar. Consultá el estado antes de reintentar.') }
    finally { setConfigBusy(false) }
  }
  async function preview() {
    setGroupBusy(true); setGroupMessage(''); setQuote(null)
    try {
      const { ok, result } = await send('/api/admin/taller/grupos/cotizar', draft())
      if (ok) setQuote(result)
      else setGroupMessage(result.error)
    } catch { setGroupMessage('No se pudo calcular el grupo.') }
    finally { setGroupBusy(false) }
  }
  async function searchRegistrations() {
    setSearchMessage('')
    try {
      const response = await fetch(`/api/admin/taller/inscripciones?q=${encodeURIComponent(searchTerm.trim())}`, { cache: 'no-store', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) { setSearchMessage(result.error); return }
      setSearchResults(result.registrations)
      if (!result.registrations.length) setSearchMessage('No se encontraron inscripciones individuales pendientes.')
    } catch { setSearchMessage('No se pudo buscar inscripciones.') }
  }
  async function create() {
    if (!quote || !window.confirm('¿Confirmás estas inscripciones y el pago grupal pendiente? Se enviarán avisos por correo cuando el trabajador esté activo.')) return
    setGroupBusy(true); setGroupMessage('')
    try {
      const { ok, result } = await send('/api/admin/taller/grupos', { ...draft(), expectedQuoteHash: quote.quoteHash })
      if (ok) { setQuote(result); setGroupMessage(result.replayed ? 'La operación ya estaba registrada; no se duplicó.' : 'Grupo registrado. El pago está pendiente y los correos quedaron en cola.') }
      else setGroupMessage(result.error)
    } catch { setGroupMessage('No se pudo confirmar la respuesta. Consultá el estado antes de reintentar con la misma operación.') }
    finally { setGroupBusy(false) }
  }
  if (loadError) return <p role="alert">{loadError}</p>
  if (!config) return <p>Cargando configuración…</p>
  const ready = config.registrationOpen && config.emailReady
  const availablePromos = config.promotions.filter(promo => promo.active &&
    (!promo.startsAt || new Date(promo.startsAt) <= new Date()) && (!promo.endsAt || new Date(promo.endsAt) > new Date()))
  const existingRefs = references.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean)
  return <>
    <section className="admin-accreditation-block">
      <h2>Lotes</h2>
      <p>Lote activo: <strong>{config.activeLot}</strong>. {config.registrationOpen ? 'Inscripción abierta en la base.' : 'Inscripción cerrada en la base.'}</p>
      <p>Alias y QR usan el precio del lote, sin gastos de servicio. El pago en efectivo en el taller tiene precio de ventanilla separado, sin promociones; mientras no se defina, queda pendiente sin importe. Mercado Pago permite tarjeta y suma el gasto configurado.</p>
      <div className="admin-lot-row"><label>Precio de ventanilla · efectivo en el taller · ARS
        <input inputMode="decimal" disabled={!canConfigure} value={onSitePrice} onChange={e => setOnSitePrice(e.target.value)} placeholder="A definir" />
        <small>Dejá vacío para mantenerlo sin definir. No se aplican lotes ni promociones. Los importes ya cotizados no cambian.</small>
      </label>{canConfigure && <button className="button button-outline" disabled={configBusy} onClick={() => {
        const amountMinor = onSitePrice.trim() ? pesosToMinor(onSitePrice) : null
        if (onSitePrice.trim() && (amountMinor == null || amountMinor > 200_000_000)) { setConfigMessage('Revisá el precio de ventanilla.'); return }
        void saveConfig({ type: 'on_site_price', amountMinor })
      }}>Guardar precio de ventanilla</button>}</div>
      <div className="admin-lot-row"><label>Gasto de servicio de Mercado Pago · ARS
        <input inputMode="decimal" disabled={!canConfigure} value={onlineFee} onChange={e => setOnlineFee(e.target.value)} />
        <small>Se suma una vez al precio de cada inscripción online. No se aplica a alias, QR ni pago en efectivo en el taller.</small>
      </label>{canConfigure && <button className="button button-outline" disabled={configBusy} onClick={() => {
        const amountMinor = pesosToMinor(onlineFee)
        if (amountMinor == null || amountMinor > 20_000_000) { setConfigMessage('Revisá el gasto de servicio en pesos.'); return }
        void saveConfig({ type: 'online_fee', amountMinor })
      }}>Guardar gasto</button>}</div>
      <div className="admin-lot-list">{config.lots.map(lot => <div key={lot.id} className="admin-lot-row">
        <label>Lote {lot.number} · ARS<input inputMode="decimal" disabled={!canConfigure} value={lotAmounts[lot.number] ?? ''}
          onChange={e => setLotAmounts(current => ({ ...current, [lot.number]: e.target.value }))} />
          <small>Pago online: {formatMoney(lot.onlineAmountMinor)}. Incluye {formatMoney(lot.serviceFeeMinor)} de gastos de servicio sobre el precio guardado.</small></label>
        {canConfigure && <><button className="button button-outline" disabled={configBusy} onClick={() => {
          const amountMinor = pesosToMinor(lotAmounts[lot.number] ?? '')
          if (amountMinor == null) { setConfigMessage('Revisá el importe en pesos.'); return }
          void saveConfig({ type: 'lot', number: lot.number, amountMinor })
        }}>Guardar precio</button><button className="button button-gold" disabled={configBusy || config.activeLot === lot.number}
          onClick={() => void saveConfig({ type: 'active_lot', number: lot.number })}>Activar lote</button></>}
      </div>)}</div>
      <p role="status">{configMessage}</p>
    </section>
    <SettlementPlanner canConfigure={canConfigure} />
    <section className="admin-accreditation-block">
      <h2>Promociones</h2>
      <p>Se aplican solo a integrantes del mismo lote y precio. El grupo puede pagar sin promoción. Una promoción ya utilizada conserva sus condiciones históricas; para cambiarlas, creá otro código.</p>
      <div className="admin-promo-list">{config.promotions.map(promo => canConfigure
        ? <PromotionEditor key={promo.id + promo.updatedAt} initial={promo} onSaved={reload} />
        : <p key={promo.id}><strong>{promo.code}</strong> · {promo.active ? 'activa' : 'inactiva'} · {promo.kind === 'bundle' ? `${promo.bundleSize}×${promo.payablePeople}` : formatMoney(promo.groupTotalMinor ?? 0)}</p>)}</div>
      {canConfigure && <><h3>Nueva promoción</h3><PromotionEditor onSaved={reload} /></>}
    </section>
    <section className="admin-accreditation-block">
      <h2>Inscripción y pago grupal</h2>
      <p>Una persona paga por todas. El importe se calcula en el servidor y queda congelado por integrante. La transferencia o el pago presencial permanecen pendientes hasta verificación humana; recién entonces se emiten los QR personales.</p>
      {!ready && <p className="admin-operator-notice" role="status">Creación bloqueada: falta abrir la inscripción en la base y/o confirmar que el trabajador de correo está listo. Podés calcular una vista previa sin registrar participantes.</p>}
      <div className="admin-radio-row"><label><input type="radio" checked={mode === 'new'} onChange={() => { setMode('new'); changed() }} /> Personas nuevas</label>
        <label><input type="radio" checked={mode === 'existing'} onChange={() => { setMode('existing'); changed() }} /> Referencias ya inscriptas</label></div>
      {mode === 'existing' ? <>
        <div className="admin-group-search"><label>Buscar una inscripción pendiente por referencia, nombre o correo
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} maxLength={100} /></label>
          <button className="button button-outline" onClick={searchRegistrations}>Buscar</button>
          <p role="status">{searchMessage}</p>
          {searchResults.length > 0 && <ul>{searchResults.map(person => <li key={person.reference}>
            {person.name} · {person.reference} · lote {person.lotNumber} · {person.amountMinor == null ? 'precio a definir' : formatMoney(person.amountMinor)}
            <button className="button button-outline" onClick={() => {
              if (existingRefs.includes(person.reference)) return
              setReferences(current => `${current.trim()}${current.trim() ? '\n' : ''}${person.reference}`)
              if (!payerReference) setPayerReference(person.reference)
              changed()
            }}>Agregar</button></li>)}</ul>}
        </div>
        <label>Referencias personales, una por línea<textarea rows={5} value={references} onChange={e => { setReferences(e.target.value); changed() }} placeholder="Una referencia por línea" /></label>
        <label>Pagador/a del grupo<select value={payerReference} onChange={e => { setPayerReference(e.target.value); changed() }}><option value="">Elegir referencia</option>
          {existingRefs.map((ref, i) => <option value={ref} key={`${ref}-${i}`}>{ref}</option>)}</select></label>
        <p>Solo se pueden agrupar inscripciones individuales pendientes, sin pago aprobado, ayuda ni QR. Si un lote cambió de precio desde la inscripción, no se recotiza automáticamente.</p>
      </> : <>
        {people.map((person, i) => <fieldset className="admin-person-card" key={i}><legend>Persona {i + 1}</legend>
          <div className="admin-form-grid">
            {([['firstName','Nombre'],['lastName','Apellido'],['documentNumber','D.N.I'],['birthDate','Fecha de nacimiento'],['phone','Teléfono'],
              ['email','Correo electrónico'],['prayerGroup','Grupo de oración (opcional)'],['movement','Movimiento (opcional)'],
              ['occupation','Ocupación (opcional)']] as const).map(([field,label]) => <label key={field}>{label}
              <input type={field === 'birthDate' ? 'date' : field === 'email' ? 'email' : 'text'} value={person[field]}
                onChange={e => changePerson(i, field, e.target.value)} /></label>)}
            <label>Estado eclesial<select value={person.ecclesialState} onChange={e => changePerson(i, 'ecclesialState', e.target.value)}>
              {['laico','religioso','seminarista','diacono','postulante-novicia','presbitero','otro'].map(value => <option key={value} value={value}>{value}</option>)}
            </select></label>
          </div>
          {people.length > 2 && <button className="button button-outline" onClick={() => { setPeople(current => current.filter((_, index) => index !== i)); setPayerIndex(0); changed() }}>Quitar persona</button>}
        </fieldset>)}
        <button className="button button-outline" disabled={people.length >= 20} onClick={() => { setPeople(current => [...current, blankPerson()]); changed() }}>Agregar persona</button>
        <label>Pagador/a del grupo<select value={payerIndex} onChange={e => { setPayerIndex(Number(e.target.value)); changed() }}>
          {people.map((person, i) => <option key={i} value={i}>{person.firstName || `Persona ${i + 1}`} {person.lastName}</option>)}
        </select></label>
        <p>Las nuevas inscripciones usan el lote activo {config.activeLot}. Para unir personas ya inscriptas, usá sus referencias.</p>
      </>}
      <div className="admin-form-grid">
        <label>Forma de pago<select value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value as typeof paymentMethod); changed() }}>
          <option value="bank_transfer" disabled={!config.paymentMethods.bankTransfer}>Transferencia</option>
          <option value="on_site" disabled={!config.paymentMethods.onSite || config.onSitePriceMinor == null}>Efectivo en el taller · {config.onSitePriceMinor == null ? 'precio a definir' : formatMoney(config.onSitePriceMinor)}</option>
        </select></label>
        <label>Promoción<select value={promotionId} onChange={e => { setPromotionId(e.target.value); changed() }}><option value="">Sin promoción</option>
          {availablePromos.map(promo => <option key={promo.id} value={promo.id}>{promo.code}</option>)}</select></label>
      </div>
      <div className="admin-accreditation-actions">
        <button className="button button-outline" disabled={groupBusy} onClick={preview}>Calcular grupo</button>
        <button className="button button-gold" disabled={!ready || groupBusy || !quote || !!quote.status} onClick={create}>Registrar grupo pendiente</button>
      </div>
      <p role="status" aria-live="polite">{groupMessage}</p>
      {quote && <div className="admin-group-preview"><h3>{quote.status ? 'Grupo registrado' : 'Cotización previa'}</h3>
        <p>Subtotal: {formatMoney(quote.subtotalMinor)} · Descuento: {formatMoney(quote.discountMinor)} · <strong>Total: {formatMoney(quote.amountMinor)}</strong></p>
        <ul>{quote.members?.map((member, i) => <li key={i}>{member.name} · {member.reference ?? 'Nueva inscripción'} · lote {member.lotNumber} · corresponde {formatMoney(member.dueAmountMinor)}</li>)}</ul>
        {quote.payerReference && <p>Referencia del pagador: <strong>{quote.payerReference}</strong>. Usala para confirmar el pago en «Pagos y acreditación».</p>}
      </div>}
    </section>
  </>
}

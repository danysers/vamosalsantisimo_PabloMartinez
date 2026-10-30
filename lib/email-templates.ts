export type PaymentChoice = 'mercado_pago' | 'bank_transfer' | 'on_site' | 'assistance' | 'waived' | 'paid'

export function lotChangedEmail(input: {
  eventTitle: string; fromLot: number; toLot: number; threshold: number; paidPlaces: number;
  amountMinor: number; changedAt: string
}) {
  const when = new Date(input.changedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  const price = (input.amountMinor / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
  const text = [
    `El taller ${input.eventTitle} cambió automáticamente del lote ${input.fromLot} al lote ${input.toLot}.`,
    `Se alcanzó el límite de ${input.threshold} lugares con pago confirmado del lote ${input.fromLot}. Conteo al realizar el cambio: ${input.paidPlaces} personas.`,
    `Nuevo precio base: ${price}. Mercado Pago suma el gasto de plataforma configurado.`,
    `Fecha del cambio: ${when} (hora argentina).`,
    'Las nuevas inscripciones usan el nuevo lote. Las cotizaciones anteriores conservan el importe que ya tenían.',
    'Podés consultar el historial del cambio y el estado de este aviso en el panel, en Precios y grupos → Lotes.',
  ].join('\n\n')
  return { subject: `Lote ${input.toLot} activado · Taller Pablo Martínez`, text, html: brandedEmailHtml(text) }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!)

// Table layout and inline styles keep the source email's black/gold/white
// visual identity in clients that strip stylesheets. No priest contact is shown.
export function brandedEmailHtml(text: string, qrCid?: string): string {
  const paragraphs = text.trim().split(/\n\s*\n/).map(paragraph =>
    `<p style="margin:0 0 18px">${paragraph.split('\n').map(escapeHtml).join('<br>')}</p>`,
  ).join('')
  const qr = qrCid ? `<p style="margin:0 0 18px;text-align:center"><img src="cid:${escapeHtml(qrCid)}" alt="QR de acreditación" width="280" style="display:block;width:280px;max-width:100%;height:auto;margin:0 auto"></p>` : ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111111">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="660" cellspacing="0" cellpadding="0" style="width:100%;max-width:660px;background:#ffffff">
<tr><td align="center" style="padding:32px 28px 27px;background:#000000"><img src="https://vamosalsantisimo.com/logo-vamos.png" width="158" alt="Vamos al Santísimo" style="display:block;width:158px;max-width:100%;height:auto;margin:0 auto"><div style="font-size:11px;letter-spacing:2px;font-weight:bold;color:#ffffff;margin-top:15px">FORMOSA · ARGENTINA</div></td></tr>
<tr><td style="height:3px;background:#d2ad58;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:39px 44px 32px;font-size:15px;line-height:1.78;color:#111111"><h1 style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.3;font-weight:normal;color:#000000;margin:0 0 12px">Taller de música</h1><div style="width:56px;height:3px;background:#d2ad58;margin:0 0 25px"></div>${paragraphs}${qr}</td></tr>
<tr><td style="padding:24px 44px;background:#ffffff;border-top:1px solid #d2ad58"><p style="font-family:Georgia,'Times New Roman',serif;font-size:16px;text-align:center;margin:0 0 12px"><em>Con fraternal cercanía,</em></p><p style="font-size:13px;line-height:1.8;margin:0;padding:8px 0;border-bottom:1px solid #dddddd"><strong>Sergio Daniel Servin</strong> · <a href="tel:+543704258770" style="color:#111111">(+54 3704) 258770</a> · <a href="mailto:danielservin@vamosalsantisimo.com" style="color:#111111">danielservin@vamosalsantisimo.com</a></p><p style="font-size:13px;line-height:1.8;margin:0;padding:8px 0;border-bottom:1px solid #dddddd"><strong>Luciano Barrios</strong> · <a href="tel:+543704632884" style="color:#111111">(+54 3704) 632884</a> · <a href="mailto:lucianobarrios@vamosalsantisimo.com" style="color:#111111">lucianobarrios@vamosalsantisimo.com</a></p><p style="font-size:13px;line-height:1.8;margin:0;padding:8px 0"><strong>Enzo Machuca</strong> · (+54 3704) 208333 · <a href="mailto:contactos@vamosalsantisimo.com" style="color:#111111">contactos@vamosalsantisimo.com</a></p><p style="font-size:11px;line-height:1.6;text-align:center;border-top:1px solid #dddddd;padding-top:11px;margin:8px 0 0"><strong><em>Coordinadores locales de la Comunidad Vamos al Santísimo</em></strong></p></td></tr>
<tr><td align="center" style="padding:19px 27px 20px;background:#000000;color:#ffffff;font-size:12px;line-height:1.8">Correo oficial: <a href="mailto:contactos@vamosalsantisimo.com" style="color:#ffffff">contactos@vamosalsantisimo.com</a><br>Redes oficiales: <a href="https://www.instagram.com/vamosalsantisimof/" style="color:#d2ad58">Instagram</a> · <a href="https://www.facebook.com/vamosalsantisimof/" style="color:#d2ad58">Facebook</a> · <a href="https://www.tiktok.com/@vamosalsantisimo" style="color:#d2ad58">TikTok</a><br><span style="font-size:10px">Comunidad Vamos al Santísimo · Formosa</span></td></tr>
<tr><td style="height:3px;background:#d2ad58;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr></table></body></html>`
}

export function proofWhatsappUrl(phoneE164: string, reference: string): string {
  if (!/^\d{10,15}$/.test(phoneE164)) throw new Error('Invalid WhatsApp destination')
  const message = `Tengo un problema con el comprobante de pago. Mi número de gestión es ${reference}.`
  return `https://wa.me/${phoneE164}?text=${encodeURIComponent(message)}`
}

export function assistanceWhatsappUrl(phoneE164: string, reference: string): string {
  if (!/^\d{10,15}$/.test(phoneE164)) throw new Error('Invalid WhatsApp destination')
  const message = `Hola, solicité ayuda para la inscripción al taller porque no puedo pagar. Mi referencia es ${reference}.`
  return `https://wa.me/${phoneE164}?text=${encodeURIComponent(message)}`
}

export function registrationEmail(input: {
  firstName: string
  reference: string
  choice: PaymentChoice
  amountMinor?: number
  transferAlias?: string | null
  transferProvider?: string | null
  transferHolder?: string | null
  transferDocument?: string | null
  proofWhatsappE164?: string | null
  proofUrl?: string
}) {
  const name = input.firstName.trim()
  const amount = input.amountMinor == null ? null : `$${(input.amountMinor / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const lines = [
    `Hola ${name}:`,
    '',
    'Tu inscripción al taller de música de Pablo Martínez fue registrada con éxito.',
    `Tu referencia es ${input.reference}.`,
    'Taller: sábado 19 de diciembre de 2026, 15:00 h, Parroquia San Luis de Francia, Formosa.',
    '',
  ]
  if (input.choice === 'bank_transfer') {
    lines.push('Elegiste pagar por alias o QR. No se agregan gastos de servicio y tu pago está PENDIENTE de verificación.')
    if (amount) lines.push(`Importe a transferir: ${amount}.`)
    if (input.transferAlias) lines.push(`Alias: ${input.transferAlias}.`)
    if (input.transferProvider) lines.push(`Billetera: ${input.transferProvider}.`)
    if (input.transferHolder) lines.push(`Titular: ${input.transferHolder}.`)
    if (input.transferDocument) lines.push(`DNI del titular: ${input.transferDocument}.`)
    lines.push('Una vez que hiciste el pago, no pagues dos veces: subí el comprobante para que podamos verificarlo.')
    if (!input.proofUrl) lines.push('Podés volver desde la opción «Enviar comprobante» de la página del taller, con tu DNI o número de gestión y el código que enviamos a tu correo.')
    if (input.proofWhatsappE164) lines.push('Si tenés dificultades para subirlo, pedí ayuda por WhatsApp:', proofWhatsappUrl(input.proofWhatsappE164, input.reference))
  } else if (input.choice === 'on_site') {
    lines.push('Registramos tu inscripción con pago en efectivo en el taller. Abonarás a precio de ventanilla el día del encuentro; tu pago todavía está PENDIENTE. No aplican los precios de los lotes ni las promociones.')
    lines.push(amount ? `Precio de ventanilla: ${amount}.` : 'Precio de ventanilla a definir.')
    lines.push('Si tenés alguna duda, comunicate con los coordinadores que figuran al pie de este correo o por WhatsApp: https://wa.me/5493704258770')
  } else if (input.choice === 'mercado_pago') {
    // The checkout itself communicates its current status. Do not promise a
    // settlement or accreditation timeline that depends on merchant settings.
  } else if (input.choice === 'assistance') {
    lines.push('Recibimos tu solicitud por inconvenientes para pagar. Está pendiente de revisión; por ahora no necesitás abonar.')
  } else if (input.choice === 'paid') {
    lines.push('Tu pago ya fue confirmado. No tenés ningún importe pendiente para esta inscripción.')
  } else {
    lines.push('La organización aprobó tu exención de pago. No tenés que abonar la inscripción.')
  }
  if (input.proofUrl) lines.push('', 'Tu acceso personal para enviar el comprobante, sin volver a cargar tus datos:', input.proofUrl,
    'Usalo si pagaste por transferencia o QR. Mercado Pago se verifica automáticamente; en efectivo no hace falta adjuntar comprobante. No compartas este enlace.')
  if (!['mercado_pago', 'on_site'].includes(input.choice)) lines.push('', 'El volante de acreditación con QR se enviará por separado después de verificar el pago o aprobar la excepción.')
  lines.push('', 'Vamos al Santísimo')
  const text = lines.join('\n')
  return { subject: `Inscripción registrada · ${input.reference}`, text, html: actionEmailHtml(text, input.proofUrl, 'Subir mi comprobante') }
}

export function paymentProofReminderEmail(input: { firstName: string; reference: string; proofUrl: string; proofWhatsappE164?: string | null }) {
  const lines = [
    `Hola ${input.firstName.trim()}:`, '',
    'Tu inscripción al taller de música de Pablo Martínez está registrada, pero aún no recibimos el comprobante de pago por transferencia o QR.',
    `Tu referencia es ${input.reference}.`,
    'Si ya pagaste, no vuelvas a pagar: quizá hubo un inconveniente al adjuntarlo. Podés enviarlo desde este enlace personal, sin volver a cargar tus datos:',
    input.proofUrl,
    'No compartas este enlace. El pago seguirá pendiente hasta que una persona de la organización revise el comprobante.',
  ]
  if (input.proofWhatsappE164) lines.push('', 'Si no podés subirlo, pedí ayuda por WhatsApp:', proofWhatsappUrl(input.proofWhatsappE164, input.reference))
  lines.push('', 'Vamos al Santísimo')
  const text = lines.join('\n')
  return { subject: `Aún no recibimos tu comprobante · ${input.reference}`, text, html: actionEmailHtml(text, input.proofUrl, 'Subir mi comprobante') }
}

export function registrationAccessEmail(input:{firstName:string;code:string}) {
  const text=[`Hola ${input.firstName.trim()}:`,'','Solicitaste volver a tu inscripción para enviar el comprobante o consultar tu pago.',
    `Tu código de acceso es: ${input.code}`,'El código vence en 15 minutos y se puede utilizar una sola vez. No lo compartas.',
    'Volvé a la sección «Enviar comprobante» del taller e ingresá el código. Si no lo solicitaste, podés ignorar este correo.'].join('\n')
  return {subject:'Código para enviar tu comprobante · Vamos al Santísimo',text,html:brandedEmailHtml(text)}
}

export function groupPaymentEmail(input: {
  firstName: string; reference: string; payerName: string; payerReference: string;
  isPayer: boolean; memberCount: number; amountMinor: number; status: 'pending' | 'approved';
  source: 'bank_transfer' | 'on_site'; transferAlias?: string | null;
  transferProvider?: string | null; transferHolder?: string | null;
  transferDocument?: string | null; proofWhatsappE164?: string | null; proofUrl?: string
}) {
  const lines = [
    `Hola ${input.firstName.trim()}:`, '',
    'Tu inscripción al taller de música quedó incorporada a un pago grupal.',
    `Tu referencia personal es ${input.reference}. El grupo reúne ${input.memberCount} personas.`,
    'Taller: sábado 19 de diciembre de 2026, 15:00 h, Parroquia San Luis de Francia, Formosa.', '',
  ]
  if (input.status === 'approved') {
    lines.push('El pago grupal ya fue confirmado. Tu QR personal de acreditación se envía por separado.')
  } else if (input.isPayer) {
    const amount = `$${(input.amountMinor / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    lines.push(`Sos la persona encargada de pagar el total del grupo: ${amount}. El pago está PENDIENTE de verificación.`)
    if (input.source === 'bank_transfer') {
      if (input.transferAlias) lines.push(`Alias: ${input.transferAlias}.`)
      if (input.transferProvider) lines.push(`Billetera: ${input.transferProvider}.`)
      if (input.transferHolder) lines.push(`Titular: ${input.transferHolder}.`)
      if (input.transferDocument) lines.push(`DNI del titular: ${input.transferDocument}.`)
      lines.push(input.proofUrl ? 'Después de pagar, subí el comprobante con tu acceso personal, sin volver a cargar datos:' : 'Después de pagar, adjuntá el comprobante desde tu inscripción en el mismo navegador.')
      if (input.proofUrl) lines.push(input.proofUrl, 'No compartas este enlace.')
      if (input.proofWhatsappE164) lines.push('Si no podés subirlo, pedí ayuda por WhatsApp:', proofWhatsappUrl(input.proofWhatsappE164, input.payerReference))
      lines.push('El comprobante debe ser revisado por una persona de la organización.')
    } else lines.push('El pago se registra en el lugar el día del taller.')
  } else {
    lines.push(`${input.payerName} figura como pagador/a del grupo. No hagas otro pago individual por esta referencia.`,
      'Tu QR personal se enviará por separado cuando se confirme el pago grupal.')
  }
  lines.push('', 'Vamos al Santísimo')
  const text = lines.join('\n')
  return { subject: `Inscripción grupal · ${input.reference}`, text, html: actionEmailHtml(text, input.proofUrl, 'Subir el comprobante del grupo') }
}

export function assistanceReviewEmail(input: { fullName: string; reference: string; email: string; phone: string; reason: string | null }) {
  const text = [
    'Solicitud de ayuda para pagar el taller.', '',
    `${input.fullName} indicó que no puede abonar la inscripción.`,
    `Referencia: ${input.reference}.`,
    `Correo de contacto: ${input.email}.`,
    `Teléfono de contacto: ${input.phone}.`, '',
    'Motivo de la solicitud:',
    input.reason?.trim() || 'No se informó un motivo en esta solicitud anterior.', '',
    'La solicitud está pendiente de revisión. No se enviará una aprobación al participante hasta que un administrador la apruebe.',
    '', 'Vamos al Santísimo',
  ].join('\n')
  return { subject: `Revisar solicitud de ayuda · ${input.reference}`, text, html: brandedEmailHtml(text) }
}

export function assistanceApprovedEmail(input: { firstName: string; reference: string }) {
  const text = [
    `Hola ${input.firstName.trim()}:`, '',
    'Tu solicitud por inconvenientes para pagar fue aprobada. No tenés que abonar la inscripción.',
    `Tu referencia es ${input.reference}.`,
    'El volante de acreditación con QR se enviará por separado cuando esté emitido.',
    '', 'Vamos al Santísimo',
  ].join('\n')
  return { subject: `Solicitud de ayuda aprobada · ${input.reference}`, text, html: brandedEmailHtml(text) }
}

export function assistanceDeclinedEmail(input: { firstName: string; reference: string }) {
  const text = [
    `Hola ${input.firstName.trim()}:`, '',
    'Revisamos tu solicitud por inconvenientes para pagar, pero no pudimos aprobar la excepción.',
    `Tu referencia es ${input.reference}.`,
    'Contactá a la organización para acordar una forma de pago antes del taller. Tu pago sigue pendiente.',
    '', 'Vamos al Santísimo',
  ].join('\n')
  return { subject: `Respuesta a tu solicitud de ayuda · ${input.reference}`, text, html: brandedEmailHtml(text) }
}

function actionEmailHtml(text: string, url?: string, label = 'Abrir', cid?: string) {
  const html = brandedEmailHtml(text, cid)
  if (!url) return html
  const parsed = new URL(url)
  if (parsed.username || parsed.password || (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))) throw new Error('Invalid email action URL')
  return html.replace(escapeHtml(url), `<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;background:#701c2d;color:#ffffff;border-radius:8px;font-weight:bold;text-decoration:none">${escapeHtml(label)}</a>`)
}

export function accreditationEmail(input: { firstName: string; reference: string; paymentConfirmed?: boolean; passUrl?: string }) {
  const message = {
    subject: `Tu acreditación al taller · ${input.reference}`,
    text: [
      `Hola ${input.firstName.trim()}:`, '',
      input.paymentConfirmed ? 'Tu pago fue registrado y tu inscripción quedó confirmada. ¡Te esperamos en el taller! Adjuntamos tu QR personal de acreditación.'
        : 'Tu inscripción al taller quedó confirmada. Adjuntamos tu QR personal de acreditación.',
      `Referencia: ${input.reference}.`,
      'Presentá este mensaje o el volante impreso al ingresar. El QR identifica una sola inscripción y no debe compartirse.',
      'Taller: sábado 19 de diciembre de 2026, 15:00 h, Parroquia San Luis de Francia, Formosa.',
      ...(input.passUrl ? ['', 'Abrí tu volante personal y elegí «Imprimir mi acreditación»:', input.passUrl, 'Este enlace es personal; no lo compartas.'] : []),
      '', 'Vamos al Santísimo',
    ].join('\n'),
  }
  return { ...message, html: actionEmailHtml(message.text, input.passUrl, 'Ver mi volante e imprimir', 'acreditacion') }
}

export function paymentProofReviewEmail(input: { fullName: string; reference: string; amountMinor: number; proofUrl: string; panelUrl: string }) {
  const proofUrl = new URL(input.proofUrl)
  const panelUrl = new URL(input.panelUrl)
  if (!['https:', 'http:'].includes(proofUrl.protocol) || proofUrl.origin !== panelUrl.origin) throw new Error('Invalid panel origin')
  const text = [
    'Nuevo comprobante del taller para revisar.', '',
    `Persona: ${input.fullName}.`, `Referencia: ${input.reference}.`,
    `Importe esperado: $${(input.amountMinor / 100).toLocaleString('es-AR')}.`,
    'El pago y la inscripción siguen pendientes hasta que verifiques el movimiento.', '',
    `Ver comprobante: ${proofUrl.href}`, `Abrir panel: ${panelUrl.href}`,
  ].join('\n')
  let html = brandedEmailHtml(text)
  for (const url of [proofUrl.href, panelUrl.href]) html = html.replace(escapeHtml(url), `<a href="${escapeHtml(url)}" style="color:#701c2d">${escapeHtml(url)}</a>`)
  return { subject: `Comprobante para revisar · ${input.reference}`, text, html }
}

export function settlementReminderEmail(input: { switchDate: string; targetDate: string; releaseDays: number }) {
  const message = {
    subject: 'Revisar plazo de acreditación de Mercado Pago · taller 2026',
    text: [
      'Recordatorio para la organización:', '',
      `Revisá manualmente en tu cuenta de Mercado Pago el plazo de dinero disponible para futuros cobros el ${input.switchDate}.`,
      `El plan sugiere disponibilidad ${input.releaseDays === 0 ? 'al instante' : `a ${input.releaseDays} días`} a partir de esa fecha.`,
      `Objetivo estimado de disponibilidad: ${input.targetDate}.`,
      'Confirmá tasas y plazos reales en tu cuenta; esta aplicación no cambia la configuración de Mercado Pago y no puede garantizar la fecha exacta de liberación.',
      'Después de cambiarla, marcá el recordatorio como realizado en el panel.',
    ].join('\n'),
  }
  return { ...message, html: brandedEmailHtml(message.text) }
}

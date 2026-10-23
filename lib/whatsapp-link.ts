// Public organization contact; operators may replace it via server config.
// The mobile number uses Argentina's +54 9 international WhatsApp format.
export const organizationWhatsApp = process.env.ORGANIZATION_WHATSAPP_E164 || '5493704258770'

export function buildWhatsAppLink(phone: string, reference?: string): string {
  if (!/^549\d{10}$/.test(phone)) throw new Error('Invalid WhatsApp number')
  if (reference !== undefined && !/^[A-Za-z0-9_-]{16}$/.test(reference)) {
    throw new Error('Invalid registration reference')
  }
  const message = `Hola, quiero consultar por el taller de músicos de Vamos al Santísimo del 19 de diciembre de 2026.${reference ? ` Mi referencia de inscripción es ${reference}.` : ''}`
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

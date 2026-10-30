export function paymentMethodLabel(source: string | null | undefined, paymentDifficulty = false): string {
  switch (source) {
    case 'mercado_pago': return 'Mercado Pago'
    case 'bank_transfer': return 'Transferencia (alias / QR)'
    case 'on_site': return 'Efectivo en el taller'
    case 'manual': return 'Registro manual'
    default: return paymentDifficulty ? 'Solicitud de ayuda para pagar' : 'Sin medio registrado'
  }
}

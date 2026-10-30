import type { AdminRegistration } from './registration-admin'
import type { RegistrationOperations } from './registration-operations'
import type { RegistrationOperationInput } from './registration-operations-policy'

export function registrationEmailActions(detail: AdminRegistration) {
  const inactive = detail.deleted || detail.archived || !detail.editable
  const state = detail.operations
  const exception = state?.waived || state?.assisted
  const cash = state?.paymentMethod === 'on_site' && !exception
  const inactiveReason = 'Restaurá o desarchivá esta inscripción antes de continuar.'
  const passReason = inactive ? inactiveReason
    : cash ? 'El pago en ventanilla no entrega volante personal.'
    : detail.status !== 'confirmed' ? 'Primero confirmá la inscripción con un pago o una excepción aprobados.'
    : state?.qrBlocked ? 'El QR quedó bloqueado por una corrección administrativa. Generá uno nuevo para habilitar la acreditación; aprobar el pago no quita ese bloqueo.'
    : !detail.credential.issued ? 'No hay un QR vigente. Generá la acreditación antes de copiar su enlace o reenviarla.' : ''
  const issueReason = inactive ? inactiveReason
    : !state ? 'No está disponible la gestión de esta inscripción.'
    : cash ? 'El pago en ventanilla no entrega volante personal.'
    : state.admitted ? 'Ya hay un ingreso registrado. Revisalo desde «Editar estado, pago y acreditación» antes de cambiar el QR.'
    : detail.status !== 'confirmed' ? 'Primero confirmá la inscripción desde «Editar estado, pago y acreditación».'
    : state.paymentStatus !== 'approved' && !exception ? 'Primero aprobá el pago o autorizá la ayuda o exención.' : ''
  const generateReason = issueReason || (detail.credential.issued && !state?.qrBlocked
    ? 'Ya hay un QR vigente. Copiá su enlace o reenviá la acreditación para conservar el mismo QR.' : '')
  const replaceReason = issueReason || (!detail.credential.issued ? 'No hay un QR vigente para reemplazar. Usá «Generar QR de acreditación».' : '')
  const revokeReason = inactive ? inactiveReason : state?.admitted
    ? 'Ya hay un ingreso registrado. Revisalo desde «Editar estado, pago y acreditación» antes de revocar el QR.'
    : !detail.credential.issued ? 'No hay un QR vigente para revocar.' : ''
  const proofReason = detail.proofReminderEligible ? ''
    : inactive ? inactiveReason
    : state?.paymentStatus === 'approved' || exception ? 'El pago o la excepción ya están aprobados. No corresponde pedir otro comprobante.'
    : detail.proofs.length ? 'Ya se recibió un comprobante. Revisalo en «Pagos y comprobantes».'
    : state?.paymentMethod !== 'bank_transfer' ? 'Este aviso corresponde sólo a pagos por transferencia (alias / QR).'
    : detail.status !== 'pending' ? 'La inscripción debe estar pendiente para solicitar el comprobante.'
    : state.members > 1 ? 'El aviso y el enlace se gestionan desde la ficha del pagador del grupo.'
    : 'El pago debe ser una transferencia pendiente del pagador, sin comprobante cargado.'
  return { passReason, generateReason, replaceReason, revokeReason, proofReason }
}

// Reuse the owner-only operational API. No payment, date, exemption or group
// changes are authorized by this shortcut; its version and replay guards apply.
export function accreditationPreparation(reference: string, state: RegistrationOperations, requestId: string,
  reason: string, confirmed: boolean, qrAction: 'revoke' | 'reissue' = 'reissue'): RegistrationOperationInput {
  return { reference, version: state.version, requestId,
    registrationStatus: state.registrationStatus as RegistrationOperationInput['registrationStatus'],
    paymentMethod: state.paymentMethod as RegistrationOperationInput['paymentMethod'],
    paymentStatus: state.paymentStatus as RegistrationOperationInput['paymentStatus'],
    amountMinor: state.amountMinor, paidAmountMinor: state.paidAmountMinor, feeMinor: state.feeMinor,
    manualReference: state.manualReference, registeredAt: state.registeredAt,
    qrAction, waiver: 'keep', undoAdmission: false, notify: false,
    confirmGroup: false, confirmPayment: false, confirmQrChange: confirmed, reason: reason.trim() }
}

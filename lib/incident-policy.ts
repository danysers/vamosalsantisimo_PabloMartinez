import { z } from 'zod'

export const incidentCodes = ['upload_network', 'upload_http', 'upload_response', 'state_unavailable', 'request_failed',
  'runtime_exception', 'unhandled_rejection', 'asset_unavailable', 'server_unavailable', 'invalid_request', 'upload_rejected', 'link_unavailable'] as const
export const incidentOperations = ['proof_upload', 'payment_status', 'checkout', 'payment_method', 'registration', 'recovery', 'email_link', 'page', 'server'] as const
export const incidentSchema = z.object({
  correlationId: z.uuid(), operation: z.enum(incidentOperations), code: z.enum(incidentCodes),
  page: z.enum(['main', 'workshop', 'panel']).optional(), httpStatus: z.number().int().min(400).max(599).optional(),
  fileSize: z.number().int().min(0).max(100 * 1024 * 1024).optional(),
  fileType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'other']).optional(),
  online: z.boolean().optional(), outcome: z.enum(['unknown', 'saved', 'missing', 'unavailable']).optional(),
}).strict()
export type IncidentInput = z.infer<typeof incidentSchema>
export const incidentLabels: Record<IncidentInput['code'], string> = {
  upload_network: 'La subida no obtuvo una respuesta de red. No identifica por sí sola dónde ocurrió el corte.',
  upload_http: 'El servidor o intermediario devolvió un error HTTP al subir el archivo.',
  upload_response: 'La respuesta de la subida no tenía el formato esperado.',
  state_unavailable: 'No se pudo consultar el estado de la inscripción.',
  request_failed: 'Una solicitud de la página no pudo completarse.',
  runtime_exception: 'El navegador notificó un error al ejecutar la página.',
  unhandled_rejection: 'Una operación del navegador terminó sin poder completarse.',
  asset_unavailable: 'El navegador no pudo cargar un recurso de la página.',
  server_unavailable: 'El servidor no pudo completar la operación.',
  invalid_request: 'La solicitud no cumplía las validaciones.',
  upload_rejected: 'El servidor rechazó la subida del comprobante.',
  link_unavailable: 'El enlace personal no estaba disponible o había vencido.',
}

import { z } from 'zod'
export const registrationOperationSchema = z.object({
  reference: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/), version: z.string().regex(/^[a-f0-9]{32}$/), requestId: z.uuid(),
  registrationStatus: z.enum(['pending','waiting','confirmed','review','cancelled']),
  paymentMethod: z.enum(['none','bank_transfer','on_site','mercado_pago','manual']),
  paymentStatus: z.enum(['created','pending','approved','review','rejected','cancelled','refunded','partially_refunded','charged_back']),
  amountMinor: z.number().int().min(1).max(200_000_000).nullable(),
  paidAmountMinor: z.number().int().min(0).max(200_000_000),
  feeMinor: z.number().int().min(0).max(199_999_999),
  manualReference: z.string().trim().max(120),
  registeredAt: z.iso.datetime({ offset: true }).nullable(),
  qrAction: z.enum(['keep','revoke','reissue']),
  waiver: z.enum(['keep','grant','revoke']), undoAdmission: z.boolean(),
  confirmGroup: z.boolean(), confirmPayment: z.boolean(), confirmQrChange: z.boolean(), notify: z.boolean(),
  reason: z.string().trim().min(5).max(500),
}).strict().superRefine((input,ctx)=>{
  if(input.paymentMethod!=='none'&&input.amountMinor===null)ctx.addIssue({code:'custom',path:['amountMinor'],message:'Ingresá el importe de la operación.'})
  if(input.paymentMethod!=='none'&&input.paymentStatus==='approved'&&input.paidAmountMinor<(input.amountMinor||0))ctx.addIssue({code:'custom',path:['paidAmountMinor'],message:'Para aprobar, el importe abonado debe cubrir la operación.'})
  if(input.feeMinor&&(input.paymentMethod!=='mercado_pago'||input.feeMinor>=(input.amountMinor||0)))ctx.addIssue({code:'custom',path:['feeMinor'],message:'Revisá el gasto de plataforma.'})
})
export type RegistrationOperationInput = z.infer<typeof registrationOperationSchema>

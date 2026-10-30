import { simpleParser } from 'mailparser'

export const MAX_BOUNCE_BYTES = 256 * 1024
const messageIdPattern = /^<([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})@vamosalsantisimo\.com>$/i
const header = (text, name) => {
  const unfolded = text.replace(/\r?\n[ \t]+/g, ' ')
  return unfolded.match(new RegExp('^' + name + ':\\s*(.+)$', 'im'))?.[1]?.trim() || ''
}
export function safeDiagnostic(value) {
  return String(value).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/https?:\/\/\S+/gi, '[enlace]')
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+/gi, '[correo]').replace(/\s+/g, ' ').trim().slice(0, 500)
}
export function bounceReason(status, diagnostic) {
  if (/[45]\.2\.2/.test(status + ' ' + diagnostic) || /mailbox.{0,20}full|insufficient storage|falta de espacio|quota exceeded/i.test(diagnostic)) return 'mailbox_full'
  if (/[45]\.1\.[012]/.test(status + ' ' + diagnostic) || /user unknown|no such user|does not exist/i.test(diagnostic)) return 'invalid_recipient'
  if (/[45]\.7\./.test(status + ' ' + diagnostic)) return 'policy_rejected'
  return status.startsWith('4') ? 'temporary_failure' : 'delivery_rejected'
}

// Only structured DSNs may influence a message's delivery display. Ordinary
// mail, quoted body text and an outer In-Reply-To are never identity evidence.
// These reports are advisory: they cannot approve payments or trigger resends.
export async function parseDeliveryReport(source) {
  if (!Buffer.isBuffer(source) || source.length > MAX_BOUNCE_BYTES) return []
  const mail = await simpleParser(source, { keepDeliveryStatus: true, skipHtmlToText: true, skipTextToHtml: true,
    skipImageLinks: true, maxHtmlLengthToParse: 0 })
  const type = mail.headers.get('content-type')
  if (type?.value !== 'multipart/report' || String(type.params?.['report-type']).toLowerCase() !== 'delivery-status') return []
  const statuses = mail.attachments.filter(part => part.contentType === 'message/delivery-status')
  const originals = mail.attachments.filter(part => ['message/rfc822', 'text/rfc822-headers'].includes(part.contentType))
  const ids = new Set(originals.map(part => header(part.content.toString('utf8').split(/\r?\n\r?\n/)[0], 'Message-ID'))
    .map(value => value.match(messageIdPattern)?.[1]?.toLowerCase()).filter(Boolean))
  if (ids.size !== 1) return []
  const emailId = [...ids][0]
  const date = mail.date && Number.isFinite(mail.date.getTime()) ? mail.date : new Date()
  // Untrusted dates cannot move a report beyond receipt time.
  const reportedAt = new Date(Math.min(date.getTime(), Date.now())).toISOString()
  const result = []
  for (const part of statuses) for (const block of part.content.toString('utf8').split(/\r?\n\r?\n/)) {
    const action = header(block, 'Action').toLowerCase(), status = header(block, 'Status')
    const recipient = header(block, 'Final-Recipient').match(/^rfc822;\s*([^\s<>;,]+@[^\s<>;,]+)$/i)?.[1]?.toLowerCase()
    if (!recipient || !['failed', 'delayed'].includes(action) || !/^[45]\.\d{1,3}\.\d{1,3}$/.test(status)) continue
    const diagnostic = safeDiagnostic(header(block, 'Diagnostic-Code'))
    result.push({ emailId, recipient, action, enhancedStatus: status, diagnostic,
      reasonCode: bounceReason(status, diagnostic), reportedAt })
  }
  return result
}

export async function recordDeliveryReport(db, report, reportKey) {
  // Match BOTH the exact original Message-ID and its actual envelope recipient.
  // A DSN for one person or one resend never changes another attempt.
  const result = await db.query(`INSERT INTO email_delivery_reports
    (email_id,report_key,action,enhanced_status,reason_code,diagnostic,reported_at)
    SELECT id,$1,$2,$3,$4,$5,$6 FROM email_outbox WHERE id=$7 AND lower(to_email)=$8
      AND status IN ('sent','sending')
    ON CONFLICT(report_key) DO NOTHING RETURNING id`,
  [reportKey, report.action, report.enhancedStatus, report.reasonCode, report.diagnostic, report.reportedAt, report.emailId, report.recipient])
  return result.rowCount === 1
}

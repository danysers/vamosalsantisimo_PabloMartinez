export const exampleMessageId = '12345678-1234-4234-8234-123456789012'
export function deliveryFixture({ id = exampleMessageId, recipient = 'person@example.invalid', action = 'failed', status = '5.0.0',
  diagnostic = 'smtp; 550-5.2.2 Recipient mailbox recently reported insufficient storage.', originalType = 'message/rfc822' } = {}) {
  return Buffer.from([
    'From: Mail Delivery System <mailer-daemon@provider.invalid>', 'To: contactos@vamosalsantisimo.com',
    'Date: Thu, 29 Oct 2026 21:19:07 -0300', 'MIME-Version: 1.0',
    'Content-Type: multipart/report; report-type=delivery-status; boundary="report"', '',
    '--report', 'Content-Type: text/plain; charset=utf-8', '', 'Delivery failed.', '',
    '--report', 'Content-Type: message/delivery-status', '', 'Reporting-MTA: dns; provider.invalid', '',
    `Final-Recipient: rfc822; ${recipient}`, `Action: ${action}`, `Status: ${status}`, `Diagnostic-Code: ${diagnostic}`, '',
    '--report', `Content-Type: ${originalType}`, '', `Message-ID: <${id}@vamosalsantisimo.com>`,
    'From: contactos@vamosalsantisimo.com', `To: ${recipient}`, 'Subject: Test accreditation', '', 'No real QR', '--report--', '',
  ].join('\r\n'))
}


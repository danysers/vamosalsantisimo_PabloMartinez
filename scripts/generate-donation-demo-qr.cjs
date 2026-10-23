const QRCode = require('qrcode')
const fs = require('node:fs')
const path = require('node:path')
const directory = path.resolve(__dirname, '../public/2026/donaciones')
fs.mkdirSync(directory, { recursive: true })
// Deliberately independent from the real account: replace with an approved payment QR later.
QRCode.toFile(path.join(directory, 'qr-prueba.png'), 'https://example.org/donacion-prueba', {
  type: 'png', width: 420, margin: 4, errorCorrectionLevel: 'M',
  color: { dark: '#17120d', light: '#fffaf0' },
}).catch(error => { console.error(error); process.exitCode = 1 })

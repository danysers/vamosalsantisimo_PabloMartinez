const fs = require('fs')
const path = require('path')
const sharp = require('../../node_modules/.pnpm/sharp@0.35.5_@types+node@22.20.5/node_modules/sharp')

const root = path.resolve(__dirname, '../../../')
const photos = {
  woods: path.join(root, 'recursos/PMFOTOS/FOTOS 2026 SUGERIDAS/2026 FLYER H.jpg'),
  singer: path.join(root, 'recursos/PMFOTOS/FOTOS 2026 SUGERIDAS/2026 FLYER F.JPEG'),
  stage: path.join(root, 'recursos/PMFOTOS/OTRAS FOTOS PARA FOLLETOS/2022 H.JPG'),
  logo: path.resolve(__dirname, '../../public/2026/logo.webp'),
}
const output = path.join(__dirname, 'con-fotos-reales')
fs.mkdirSync(output, { recursive: true })

const W = 1600, H = 1830
const serif = 'Georgia,Times New Roman,serif'
const sans = 'Arial,Helvetica,sans-serif'
const image = (key, x, y, w, h, anchor = 'xMidYMid') => `<image href="${data[key]}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${anchor} slice"/>`
const text = (x, y, content, size, fill = '#f1ede5', family = serif, extra = '') => `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" ${extra}>${content}</text>`
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`
const line = (x1, y1, x2, y2, color = '#baa576', opacity = '.55') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" opacity="${opacity}"/>`
let data

function heading() {
  return rect(0, 0, W, 186, '#050505') +
    text(800, 50, 'EL MISMO DÍA, DOS EXPERIENCIAS', 19, '#baa576', sans, 'letter-spacing="5" text-anchor="middle"') +
    line(322, 43, 510, 43) + line(1090, 43, 1278, 43) +
    text(800, 110, 'Una tarde de formación católica.', 57, '#f3eee6', serif, 'text-anchor="middle"') +
    text(800, 168, 'Una noche de adoración.', 57, '#f3eee6', serif, 'text-anchor="middle"')
}
function formationText(x, y, dark = false) {
  return text(x, y, 'FORMACIÓN · 17:00 H', 18, '#c6a56d', sans, 'letter-spacing="4"') +
    text(x, y + 78, 'Formación católica', 64) +
    text(x, y + 136, 'Un espacio para profundizar la fe', 27) +
    text(x, y + 172, 'y compartir en comunidad.', 27) +
    line(x, y + 205, x + 70, y + 205, '#8a193b', '.9') +
    text(x, y + 251, '19 de diciembre · 17:00 h', 25, '#d6bc8c', serif)
}
function adorationText(x, y) {
  return text(x, y, 'ADORACIÓN · 20:00 H', 18, '#c6a56d', sans, 'letter-spacing="4"') +
    text(x, y + 78, 'Adoración', 70) +
    text(x, y + 136, 'Un encuentro para compartir la fe y la música', 26) +
    text(x, y + 172, 'junto a Pablo Martínez.', 26) +
    line(x, y + 205, x + 70, y + 205, '#8a193b', '.9') +
    text(x, y + 250, '19 de diciembre · 20:00 h · María Auxiliadora', 25, '#d6bc8c') +
    rect(x, y + 282, 222, 44, '#640c2a') + text(x + 20, y + 312, 'Entrada gratuita', 22, '#fff0e5')
}
function footer() {
  return rect(0, 1330, W, 500, '#050505') +
    `<g clip-path="url(#footerClip)">${image('stage', 0, 1330, W, 302, 'xMidYMid')}</g>` +
    rect(0, 1330, W, 302, 'url(#footerShade)') +
    text(116, 1405, 'NOS ENCONTRAMOS EN LA FE', 14, '#baa576', sans, 'letter-spacing="3"') +
    text(116, 1476, 'Preguntas frecuentes', 53) +
    text(116, 1520, 'Algunas respuestas para acompañarte', 22, '#dad5ca', sans) +
    text(116, 1550, 'antes del encuentro.', 22, '#dad5ca', sans) +
    rect(116, 1570, 255, 44, '#070707aa', 'rx="4" stroke="#a48d58" stroke-opacity=".7"') +
    text(138, 1599, 'Ver preguntas frecuentes   ↓', 16, '#ecdcb9', sans) +
    line(0, 1632, W, 1632, '#baa576', '.2') +
    `<image href="${data.logo}" x="112" y="1650" width="170" height="125" preserveAspectRatio="xMidYMid meet"/>` +
    text(550, 1715, 'Inicio   |   Encuentro   |   Taller   |   Pablo Martínez   |   Contacto', 21, '#d5d0c7', sans) +
    line(112, 1792, 1488, 1792, '#ffffff', '.1') +
    text(112, 1817, '© 2026 Vamos al Santísimo', 14, '#858079', sans)
}
function formation(i) {
  const y = 186, h = 565
  if (i === 1) return `<g clip-path="url(#formationClip)">${image('woods', 0, y, W, h, 'xMidYMid')}${image('singer', 1080, 266, 390, 420, 'xMidYMid')}</g>` + rect(0,y,W,h,'url(#leftShade)') + rect(1070,256,410,440,'none','stroke="#baa576" stroke-opacity=".55"') + formationText(100, 290)
  if (i === 2) return rect(0,y,W,h,'#080808') + `<g clip-path="url(#formationClip)">${image('singer', 795, y, 805, h, 'xMidYMid')}${image('woods', 75, 578, 460, 155, 'xMidYMid')}</g>` + rect(795,y,805,h,'url(#rightShade)') + rect(75,578,460,155,'none','stroke="#baa576" stroke-opacity=".5"') + formationText(100, 290)
  if (i === 3) return `<g clip-path="url(#formationClip)">${image('woods', 0, y, W, h, 'xMidYMid')}</g>` + rect(0,y,W,h,'url(#leftShade)') + `<circle cx="1350" cy="470" r="176" fill="#070707" stroke="#baa576" stroke-opacity=".65"/><clipPath id="roundPortrait"><circle cx="1350" cy="470" r="170"/></clipPath><g clip-path="url(#roundPortrait)">${image('singer', 1170, 292, 360, 360, 'xMidYMid')}</g>` + formationText(100, 290)
  if (i === 4) return rect(0,y,W,h,'#070707') + `<g clip-path="url(#formationClip)">${image('woods', 880, y, 720, h, 'xMidYMid')}${image('singer', 1030, 235, 415, 430, 'xMidYMid')}</g>` + rect(880,y,720,h,'url(#rightShade)') + rect(1020,225,435,450,'none','stroke="#baa576" stroke-opacity=".65"') + formationText(100, 290)
  return `<g clip-path="url(#formationClip)">${image('woods', 0, y, W, h, 'xMidYMid')}${image('singer', 870, y, 730, h, 'xMidYMid')}</g>` + rect(0,y,W,h,'url(#leftShade)') + line(870,y,870,y+h,'#baa576','.3') + formationText(100, 290)
}
function adoration(i) {
  const y=751,h=579
  const anchor=['xMidYMid','xMidYMid','xMidYMid','xMidYMid','xMidYMid'][i-1]
  return `<g clip-path="url(#adorationClip)">${image('stage',0,y,W,h,anchor)}</g>` + rect(0,y,W,h,'url(#leftShade)') + rect(0,y,W,h,'url(#bottomShade)') + adorationText(100, 850) + line(0,y,W,y,'#baa576','.52')
}
function svg(i) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>
    <clipPath id="formationClip">${rect(0,186,W,565,'white')}</clipPath><clipPath id="adorationClip">${rect(0,751,W,579,'white')}</clipPath><clipPath id="footerClip">${rect(0,1330,W,302,'white')}</clipPath>
    <linearGradient id="leftShade"><stop offset="0" stop-color="#050505" stop-opacity=".98"/><stop offset=".43" stop-color="#050505" stop-opacity=".72"/><stop offset=".83" stop-color="#050505" stop-opacity=".14"/><stop offset="1" stop-color="#050505" stop-opacity=".06"/></linearGradient>
    <linearGradient id="rightShade"><stop offset="0" stop-color="#050505" stop-opacity=".3"/><stop offset="1" stop-color="#050505" stop-opacity="0"/></linearGradient>
    <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050505" stop-opacity=".2"/><stop offset="1" stop-color="#050505" stop-opacity=".72"/></linearGradient>
    <linearGradient id="footerShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050505" stop-opacity=".5"/><stop offset="1" stop-color="#050505" stop-opacity=".95"/></linearGradient>
  </defs>${rect(0,0,W,H,'#050505')}${heading()}${formation(i)}${adoration(i)}${footer()}</svg>`
}
async function main() {
  data = {}
  for (const [key, file] of Object.entries(photos)) {
    const buffer = await sharp(file).resize({width: 1800, withoutEnlargement: true}).jpeg({quality: 83}).toBuffer()
    data[key] = `data:image/jpeg;base64,${buffer.toString('base64')}`
  }
  for (let i=1;i<=5;i++) {
    await sharp(Buffer.from(svg(i))).png().toFile(path.join(output, `ejemplo-${i}.png`))
  }
}
main().catch(error => {console.error(error);process.exitCode=1})

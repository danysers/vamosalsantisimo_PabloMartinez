// Minimal workshop-only studies using the original image as the composition.
// No recoloring, graphic marks, frames, gradients, or decorative elements.
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const QRCode = require('qrcode')
const out = __dirname
const source = path.resolve(out, '../../../public/formacion/assets/pablo-martinez.png')
const logoSource = path.resolve(out, '../../../public/formacion/assets/logo-dorado.png')
const W = 1080, H = 1350, photoH = 810
const paper = '#fffaef' // sampled from the original image's empty upper-left area
const ink = '#30231c'
const muted = '#674b39'
const phone = '3718 63-2884'
const instagramFacebook = '@vamosalsantisimof'
const tiktok = '@vamosalsantisimo'
// Current preview destination is access-restricted; the organizer will replace it later.
const targetUrl = process.env.FLYER_URL || 'https://pablomartinez.vamosalsantisimo.com/formacion'
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
const tx = (x,y,s,size,options={}) => `<text x="${x}" y="${y}" fill="${options.color||ink}" font-family="${options.serif?'Georgia,serif':'Arial,sans-serif'}" font-size="${size}" font-weight="${options.weight||400}" font-style="${options.italic?'italic':'normal'}" text-anchor="${options.anchor||'start'}" letter-spacing="${options.space||0}">${esc(s)}</text>`
const rows = (x,y,items,size,options={}) => items.map((s,i)=>tx(x,y+i*(options.leading||size*1.05),s,size,options)).join('')
const eyebrow = (x,y,s,options={}) => tx(x,y,s,options.size||21,{weight:700,space:options.space||3.2,color:options.color||muted,anchor:options.anchor})
const pricesColumns = (y,opts={}) => {
 const xs = [60,385,710], vals=['$ 10.000','$ 15.000','$ 20.000']
 return eyebrow(60,y,'VALORES POR LOTE',{size:19})+
   xs.map((x,i)=>eyebrow(x,y+55,`LOTE 0${i+1}`,{size:17,space:2})+
     tx(x,y+115,vals[i],opts.size||42,{serif:opts.serif!==false,weight:700})).join('')
}
const pricesLines = (y,opts={}) =>
 eyebrow(60,y,'VALORES POR LOTE',{size:19})+
 ['01  ·  $ 10.000','02  ·  $ 15.000','03  ·  $ 20.000'].map((p,i)=>tx(60,y+58+i*48,p,opts.size||35,{serif:true,weight:700})).join('')
const pricesInline = (y,opts={}) =>
 [60,385,710].map((x,i)=>eyebrow(x,y,`LOTE 0${i+1}`,{size:17,space:1.8})+
   tx(x,y+70,['$10.000','$15.000','$20.000'][i],opts.size||40,{serif:true,weight:700})).join('')
const dateLine = (y,opts={}) =>
 eyebrow(60,y,'SÁBADO 19 DE DICIEMBRE DE 2026',{size:opts.size||21,space:opts.space||2.5})+
 tx(60,y+64,'17:00 h',opts.big||51,{serif:opts.serif!==false,weight:700})
const contactFooter = (url,qrHref) => {
 const displayUrl = url.replace(/^https?:\/\//,'').replace(/\/$/,'')
 return tx(60,1200,'Precios de referencia · Lugar a confirmar',18,{color:muted})+
   eyebrow(60,1231,'MÁS INFORMACIÓN E INSCRIPCIÓN',{size:17,space:2})+
   tx(60,1265,`Contacto: ${phone}`,25,{weight:700})+
   tx(60,1295,displayUrl,19,{color:ink})+
   tx(60,1325,`IG / FB ${instagramFacebook}  ·  TikTok ${tiktok}`,18,{color:muted})+
   `<image href="${qrHref}" x="873" y="1185" width="150" height="150"/>`
}

function top(n) {
 switch(n) {
  case 1: return eyebrow(60,84,'TALLER DE MÚSICOS')+
   rows(60,180,['La música como','camino de','encuentro'],62,{serif:true,weight:700,leading:68})+
   tx(60,419,'Con Pablo Martínez',29,{color:muted})
  case 2: return eyebrow(60,84,'FORMACIÓN CATÓLICA')+
   rows(60,183,['La música','como camino','de encuentro'],62,{serif:true,italic:true,weight:700,leading:68})+
   tx(60,425,'Pablo Martínez',31,{color:muted})
  case 3: return eyebrow(60,83,'PABLO MARTÍNEZ')+
   rows(60,190,['Taller de','músicos'],78,{serif:true,weight:700,leading:85})+
   rows(60,404,['La música como','camino de encuentro'],30,{serif:true,italic:true,leading:37,color:muted})
  case 4: return eyebrow(60,84,'TALLER DE FORMACIÓN')+
   rows(60,185,['LA MÚSICA','COMO CAMINO','DE ENCUENTRO'],49,{weight:700,leading:57})+
   tx(60,420,'con Pablo Martínez',30,{serif:true,color:muted})
  case 5: return eyebrow(60,87,'19 DE DICIEMBRE · 17:00 H')+
   rows(60,192,['La música','como camino','de encuentro'],64,{serif:true,weight:700,leading:70})+
   tx(60,435,'Taller con Pablo Martínez',27,{color:muted})
  case 6: return eyebrow(60,84,'TALLER DE MÚSICOS')+
   rows(60,192,['Formación','católica'],73,{serif:true,weight:700,leading:82})+
   rows(60,414,['La música como','camino de encuentro'],28,{serif:true,italic:true,leading:35,color:muted})
  case 7: return eyebrow(60,82,'UN TALLER CON PABLO MARTÍNEZ')+
   rows(60,188,['La música','como camino','de encuentro'],60,{weight:700,leading:68})+
   tx(60,424,'Formación católica',28,{serif:true,italic:true,color:muted})
  case 8: return eyebrow(60,84,'TALLER DE MÚSICOS')+
   rows(60,190,['La música como','camino de','encuentro'],59,{serif:true,weight:700,leading:65})+
   tx(60,415,'Pablo Martínez',32,{serif:true,color:muted})
  case 9: return eyebrow(60,83,'FORMACIÓN CATÓLICA')+
   rows(60,185,['La música','como camino','de encuentro'],65,{serif:true,weight:700,leading:70})+
   tx(60,429,'con Pablo Martínez',29,{color:muted})
  case 10: return eyebrow(60,84,'TALLER DE MÚSICOS')+
   rows(60,194,['La música como','camino de','encuentro'],60,{serif:true,italic:true,weight:700,leading:67})+
   tx(60,432,'Pablo Martínez',30,{color:muted})
 }
}
function bottom(n) {
 switch(n) {
  case 1: return dateLine(884)+pricesColumns(1030)
  case 2: return tx(60,885,'Pablo Martínez',30,{serif:true,weight:700})+
   dateLine(939,{big:47})+pricesColumns(1050,{size:39})
  case 3: return dateLine(882,{big:56})+
   pricesLines(1012,{size:33})+
   tx(580,1058,'INSCRIPCIÓN',18,{weight:700,space:2,color:muted})+
   tx(580,1105,'Previa recomendada',25,{serif:true})+
   tx(580,1144,'También en el lugar',25,{serif:true})
  case 4: return tx(60,888,'SÁBADO 19 DE DICIEMBRE DE 2026  ·  17:00 H',27,{weight:700})+
   pricesColumns(1030,{size:43})
  case 5: return tx(60,890,'PABLO MARTÍNEZ',32,{weight:700,space:2})+
   tx(60,951,'Sábado 19 de diciembre de 2026 · 17:00 h',28,{serif:true})+
   pricesColumns(1045,{size:41})
  case 6: return dateLine(884)+
   pricesInline(1053,{size:42})
  case 7: return dateLine(882,{big:56})+
   pricesColumns(1030,{size:40})
  case 8: return tx(60,889,'SÁBADO 19 DICIEMBRE 2026',23,{weight:700,space:2})+
   tx(60,958,'17:00 h',57,{serif:true,weight:700})+
   pricesColumns(1038,{size:44})
  case 9: return dateLine(882,{big:47})+
   pricesLines(1018,{size:35})+
   tx(580,1055,'Inscripción previa',26,{serif:true})+
   tx(580,1092,'recomendada',26,{serif:true})
  case 10: return tx(60,887,'SÁBADO 19 DE DICIEMBRE · 17:00 H',25,{weight:700,space:1.7})+
   pricesColumns(1028,{size:43})
 }
}
async function main() {
 if (!targetUrl) throw new Error('Set FLYER_URL to the confirmed public workshop URL before generating flyers with a QR.')
 const parsed = new URL(targetUrl)
 if (parsed.protocol !== 'https:') throw new Error('FLYER_URL must be HTTPS')
 const qrHref = await QRCode.toDataURL(targetUrl,{width:450,margin:2,color:{dark:ink,light:paper}})
 fs.writeFileSync(path.join(out,'qr-taller.png'),Buffer.from(qrHref.split(',')[1],'base64'))
 const image = await sharp(source).resize({width:W,height:photoH,fit:'fill'}).png().toBuffer()
 const href='data:image/png;base64,'+image.toString('base64')
 const logoHref='data:image/png;base64,'+fs.readFileSync(logoSource).toString('base64')
 const pngs=[]
 for(let n=1;n<=10;n++) {
  const id=String(n).padStart(2,'0')
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${paper}"/><image href="${href}" x="0" y="0" width="${W}" height="${photoH}"/><image href="${logoHref}" x="810" y="820" width="230" height="170" preserveAspectRatio="xMidYMid meet"/>${top(n)}${bottom(n)}${contactFooter(targetUrl,qrHref)}</svg>`
  fs.writeFileSync(path.join(out,`minimal-${id}.svg`),svg)
  const p=path.join(out,`minimal-${id}.png`)
  await sharp(Buffer.from(svg)).png().toFile(p)
  pngs.push(p)
 }
 const tw=324,th=405,gap=30,cols=5,rows=2,sw=gap+cols*(tw+gap),sh=90+rows*(th+75)+gap
 const composites=[]
 for(let i=0;i<pngs.length;i++)composites.push({input:await sharp(pngs[i]).resize(tw,th).png().toBuffer(),left:gap+(i%cols)*(tw+gap),top:90+Math.floor(i/cols)*(th+75)})
 const labels=`<svg width="${sw}" height="${sh}"><rect width="100%" height="100%" fill="${paper}"/><text x="30" y="52" font-family="Arial" font-size="28" font-weight="700" fill="${ink}">10 propuestas minimalistas · Foto original</text>${Array.from({length:10},(_,i)=>`<text x="${gap+(i%cols)*(tw+gap)}" y="${90+Math.floor(i/cols)*(th+75)+th+32}" font-family="Arial" font-size="24" fill="${ink}">VERSIÓN ${String(i+1).padStart(2,'0')}</text>`).join('')}</svg>`
 await sharp(Buffer.from(labels)).composite(composites).png().toFile(path.join(out,'comparativa-minimal.png'))
 console.log('Created 10 minimal SVG/PNG flyers and comparison')
}
main().catch(e=>{console.error(e);process.exitCode=1})

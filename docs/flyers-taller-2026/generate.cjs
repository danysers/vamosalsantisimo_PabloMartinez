// Ten editable SVG/PNG flyer studies. Run with:
// NODE_PATH=<bundled node_modules> node docs/flyers-taller-2026/generate.cjs
// Uses the original workshop portrait. Prices are reference amounts, not an open checkout.
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const root = path.resolve(__dirname, '../..')
const portrait = path.join(root, 'public/formacion/assets/pablo-martinez.png')
const W = 1080, H = 1350
const C = {
  cream:'#fbf5e9', paper:'#fffaf0', ink:'#221b18', wine:'#7a213f',
  rose:'#b84962', gold:'#c29548', pale:'#efdcb8', sand:'#dfbc8b',
  forest:'#1f3a34', night:'#171719', amber:'#e6a65c', white:'#fffdf7'
}
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
const rect = (x,y,w,h,fill,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`
const line = (x1,y1,x2,y2,color,width=2,extra='') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${extra}/>`
const circle = (x,y,r,fill,extra='') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`
const text = (x,y,s,size,color,opts={}) => `<text x="${x}" y="${y}" fill="${color}" font-family="${opts.serif?'Georgia,serif':'Arial,sans-serif'}" font-size="${size}" font-weight="${opts.weight||400}" font-style="${opts.italic?'italic':'normal'}" letter-spacing="${opts.ls||0}" text-anchor="${opts.anchor||'start'}">${esc(s)}</text>`
const title = (x,y,lines,size,color,opts={}) => lines.map((s,i)=>text(x,y+i*(opts.leading||size*1.03),s,size,color,{serif:true,weight:opts.weight||700,italic:opts.italic||false,anchor:opts.anchor||'start'})).join('')
const photo = (href,x,y,w,h,opts={}) => `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${opts.fit||'xMidYMid slice'}" ${opts.extra||''}/>`
const logo = (x,y,color,scale=1) => `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round">
  <circle cx="25" cy="25" r="23"/><path d="M10 34 C20 28 27 20 38 16 M12 39 C23 33 28 25 40 21 M34 13 V33 C34 40 25 43 23 38 C21 34 26 31 34 33"/>
  </g>`
const tiny = (x,y,s,color,opts={}) => text(x,y,s,opts.size||19,color,{weight:700,ls:opts.ls||3,anchor:opts.anchor||'start'})
const wordmark = (x,y,color,opts={}) => logo(x,y-37,color,opts.scale||1)+tiny(x+65,y-13,'TALLER DE',color,{size:19,ls:4})+text(x+65,y+19,'MÚSICOS',35,color,{serif:true,weight:700})
const date = (x,y,color,opts={}) => tiny(x,y,'SÁBADO 19 DICIEMBRE 2026',color,{size:opts.size||19,ls:opts.ls||2.8})+
  text(x,y+55,'17:00 h',opts.big||52,color,{serif:true,weight:700})
const name = (x,y,color,opts={}) => tiny(x,y,'CON PABLO MARTÍNEZ',color,{size:opts.size||20,ls:opts.ls||2.5})
const note = (x,y,color,opts={}) => text(x,y,'Inscripción previa recomendada · También en el lugar',opts.size||22,color,{weight:opts.weight||400})
const priceCards = (y,theme={}) => {
  const bg=theme.bg||C.paper, fg=theme.fg||C.ink, border=theme.border||C.gold
  let s=rect(50,y,980,207,bg,`rx="18" stroke="${border}" stroke-width="2"`)
  s+=tiny(82,y+43,'TRES LOTES',fg,{size:17,ls:4})
  const ps=['$ 10.000','$ 15.000','$ 20.000']
  ps.forEach((p,i)=>{const x=82+i*321; if(i) s+=line(x-18,y+63,x-18,y+166,border,1)
    s+=tiny(x,y+92,`LOTE 0${i+1}`,fg,{size:17,ls:2})+text(x,y+145,p,43,fg,{serif:true,weight:700})})
  s+=text(82,y+190,'Valores de referencia · Lotes habilitados por la organización',17,fg)
  return s
}
const footer = (color,y=1321) => text(540,y,'Lugar a confirmar  ·  Inscripción aún no habilitada',18,color,{anchor:'middle'})
const defs = `<defs>
 <linearGradient id="cream" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdf8"/><stop offset="1" stop-color="#f1dfbe"/></linearGradient>
 <linearGradient id="wine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5a1933"/><stop offset="1" stop-color="#a84660"/></linearGradient>
 <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8dfaa"/><stop offset="1" stop-color="#c18b3e"/></linearGradient>
 <linearGradient id="night" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1d1b1c"/><stop offset="1" stop-color="#503327"/></linearGradient>
 <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#171719" stop-opacity="0"/><stop offset="1" stop-color="#171719" stop-opacity="1"/></linearGradient>
 <clipPath id="round"><rect x="0" y="0" width="1080" height="1350" rx="0"/></clipPath>
 <clipPath id="portraitCircle"><circle cx="540" cy="510" r="300"/></clipPath>
 <clipPath id="portraitArch"><path d="M160 780 V470 A380 380 0 0 1 920 470 V780 Z"/></clipPath>
 </defs>`

function one(h) {
 return rect(0,0,W,H,'url(#cream)')+
 rect(0,0,38,H,C.wine)+wordmark(80,100,C.wine)+
 photo(h,80,220,920,580,{fit:'xMidYMid slice'})+
 rect(80,790,920,6,C.wine)+
 title(80,887,['La música como','camino de encuentro'],66,C.ink,{leading:72})+
 name(83,1025,C.wine)+date(83,1100,C.ink,{big:47})+
 rect(575,1040,425,245,C.wine,'rx="8"')+
 tiny(610,1082,'LOTES',C.white,{size:17})+
 text(610,1130,'$ 10.000',39,C.white,{serif:true,weight:700})+
 text(610,1179,'$ 15.000',39,C.white,{serif:true,weight:700})+
 text(610,1228,'$ 20.000',39,C.white,{serif:true,weight:700})+
 text(80,1300,'Valores de referencia · Inscripción previa recomendada',18,C.ink)+
 text(80,1327,'Lugar a confirmar · también podés inscribirte en el lugar',18,C.ink)
}
function two(h) {
 return rect(0,0,W,H,'url(#wine)')+
 circle(540,495,350,'none',`stroke="${C.pale}" stroke-width="3"`)+
 `<g clip-path="url(#portraitCircle)">${photo(h,120,160,840,630)}</g>`+
 wordmark(75,92,C.white)+tiny(1005,68,'2026',C.pale,{anchor:'end'})+
 rect(65,792,950,484,C.cream,'rx="22"')+
 title(100,870,['Formación','católica'],70,C.wine,{leading:75})+
 name(100,1030,C.ink)+date(100,1095,C.ink,{big:48})+
 line(520,827,520,1235,C.gold,2)+
 tiny(555,867,'VALORES POR LOTE',C.wine,{size:17,ls:2})+
 text(555,930,'01  $ 10.000',41,C.ink,{serif:true,weight:700})+
 text(555,1006,'02  $ 15.000',41,C.ink,{serif:true,weight:700})+
 text(555,1082,'03  $ 20.000',41,C.ink,{serif:true,weight:700})+
 text(555,1160,'Precios de referencia',20,C.ink)+
 text(555,1190,'Lotes por habilitación manual',18,C.ink)+
 text(540,1312,'Inscripción previa recomendada · también en el lugar · lugar a confirmar',18,C.white,{anchor:'middle'})
}
function three(h) {
 return rect(0,0,W,H,C.paper)+
 rect(0,0,520,H,C.forest)+
 photo(h,395,0,685,900,{fit:'xMidYMid slice'})+
 rect(395,885,685,465,C.paper)+
 wordmark(48,100,C.pale)+
 title(48,270,['UN CAMINO','DE','ENCUENTRO'],38,C.white,{leading:46})+
 line(48,389,330,389,C.gold,3)+
 text(48,440,'Taller de formación',29,C.pale,{serif:true,italic:true})+
 name(48,485,C.white,{size:18})+
 date(48,555,C.white,{big:47})+
 text(48,710,'Música · fe · comunidad',27,C.white,{serif:true})+
 text(48,758,'Inscripción recomendada',22,C.pale)+
 tiny(440,949,'TRES LOTES',C.forest,{size:19})+
 text(440,1009,'$ 10.000',47,C.ink,{serif:true,weight:700})+
 text(440,1078,'$ 15.000',47,C.ink,{serif:true,weight:700})+
 text(440,1147,'$ 20.000',47,C.ink,{serif:true,weight:700})+
 text(440,1220,'Valores de referencia',20,C.forest)+
 text(440,1250,'Lugar a confirmar',20,C.forest)+
 text(48,1315,'También en el lugar',18,C.white)
}
function four(h) {
 return rect(0,0,W,H,C.night)+
 rect(0,0,W,495,C.gold)+
 wordmark(68,92,C.night)+
 title(70,265,['La música','nos encuentra'],86,C.night,{leading:91,italic:true})+
 photo(h,70,500,940,425)+
 rect(70,925,940,3,C.gold)+
 name(70,980,C.pale)+
 date(70,1040,C.white,{big:50})+
 text(530,1034,'FORMACIÓN CATÓLICA',22,C.pale,{weight:700,ls:3})+
 text(530,1076,'Lotes 01 / 02 / 03',22,C.white)+
 text(70,1175,'$10.000',45,C.gold,{serif:true,weight:700})+
 text(380,1175,'$15.000',45,C.gold,{serif:true,weight:700})+
 text(690,1175,'$20.000',45,C.gold,{serif:true,weight:700})+
 line(70,1210,1010,1210,C.gold,2)+
 note(70,1260,C.white,{size:22})+
 text(70,1300,'Valores de referencia · Lugar a confirmar · Inscripción aún no habilitada',17,C.pale)
}
function five(h) {
 return rect(0,0,W,H,C.paper)+
 rect(0,0,W,12,C.wine)+
 wordmark(70,100,C.wine)+
 text(1000,72,'19.12.26',29,C.wine,{serif:true,weight:700,anchor:'end'})+
 title(70,255,['La música','como camino','de encuentro'],86,C.ink,{leading:89})+
 line(70,500,1010,500,C.wine,2)+
 photo(h,70,550,940,405)+
 rect(70,975,940,60,C.wine)+
 text(540,1016,'PABLO MARTÍNEZ · SÁBADO 17:00 H',27,C.white,{weight:700,ls:2,anchor:'middle'})+
 priceCards(1058,{bg:C.paper,fg:C.ink,border:C.wine})+
 footer(C.ink)
}
function six(h) {
 return rect(0,0,W,H,'url(#night)')+
 circle(920,170,300,'none',`stroke="${C.gold}" stroke-width="2" opacity=".55"`)+
 circle(160,1170,360,'none',`stroke="${C.gold}" stroke-width="2" opacity=".35"`)+
 wordmark(68,90,C.gold)+
 title(70,285,['TALLER','DE MÚSICOS'],91,C.white,{leading:92})+
 text(72,420,'CON PABLO MARTÍNEZ',26,C.gold,{weight:700,ls:4})+
 rect(70,475,940,500,C.cream,'rx="10"')+
 photo(h,70,475,940,500)+
 rect(70,960,940,12,C.gold)+
 date(70,1040,C.white,{big:50})+
 text(535,1035,'La música como camino de encuentro',28,C.white,{serif:true,italic:true})+
 text(70,1170,'$ 10.000',44,C.gold,{serif:true,weight:700})+
 text(385,1170,'$ 15.000',44,C.gold,{serif:true,weight:700})+
 text(700,1170,'$ 20.000',44,C.gold,{serif:true,weight:700})+
 tiny(70,1208,'LOTE 01',C.white,{size:16})+tiny(385,1208,'LOTE 02',C.white,{size:16})+tiny(700,1208,'LOTE 03',C.white,{size:16})+
 text(70,1275,'Valores de referencia · Inscripción previa recomendada',20,C.white)+
 text(70,1310,'También en el lugar · Lugar a confirmar',19,C.pale)
}
function seven(h) {
 return rect(0,0,W,H,C.cream)+
 `<path d="M0 0 H1080 V690 L0 910 Z" fill="${C.wine}"/>`+
 photo(h,500,65,580,685,{fit:'xMidYMid slice'})+
 rect(500,65,580,685,'none',`stroke="${C.gold}" stroke-width="4"`)+
 wordmark(55,90,C.white)+
 title(55,280,['Formación','católica'],59,C.white,{leading:72})+
 name(55,460,C.pale,{size:18})+
 text(55,595,'SÁBADO 19 DICIEMBRE',22,C.white,{weight:700,ls:2})+
 text(55,650,'17:00 h',56,C.white,{serif:true,weight:700})+
 text(55,765,'LA MÚSICA COMO',21,C.pale,{weight:700,ls:2})+
 text(55,798,'CAMINO DE ENCUENTRO',21,C.pale,{weight:700,ls:2})+
 priceCards(1025,{bg:C.white,fg:C.wine,border:C.wine})+
 text(540,1280,'Inscripción previa recomendada · también en el lugar',20,C.ink,{anchor:'middle'})+
 footer(C.ink,1316)
}
function eight(h) {
 return rect(0,0,W,H,C.paper)+
 rect(35,35,1010,1280,'none',`rx="25" stroke="${C.gold}" stroke-width="4"`)+
 rect(65,65,950,1200,C.cream,'rx="14"')+
 wordmark(93,118,C.wine)+
 text(965,92,'FORMACIÓN CATÓLICA',20,C.wine,{weight:700,ls:2,anchor:'end'})+
 title(93,310,['La música como','camino de encuentro'],65,C.ink,{leading:69})+
 photo(h,95,438,890,435)+
 line(95,900,985,900,C.wine,3,`stroke-dasharray="15 10"`)+
 text(95,958,'PABLO MARTÍNEZ',28,C.wine,{weight:700,ls:3})+
 text(95,1016,'SÁBADO 19 DICIEMBRE 2026 · 17:00 H',27,C.ink,{weight:700})+
 line(95,1050,985,1050,C.gold,2)+
 tiny(95,1090,'LOTE 01',C.wine,{size:16})+tiny(405,1090,'LOTE 02',C.wine,{size:16})+tiny(715,1090,'LOTE 03',C.wine,{size:16})+
 text(95,1148,'$10.000',43,C.ink,{serif:true,weight:700})+
 text(405,1148,'$15.000',43,C.ink,{serif:true,weight:700})+
 text(715,1148,'$20.000',43,C.ink,{serif:true,weight:700})+
 text(95,1212,'Valores de referencia · Inscripción previa recomendada',19,C.ink)+
 text(95,1243,'También en el lugar · Lugar a confirmar',19,C.ink)
}
function nine(h) {
 return rect(0,0,W,H,C.forest)+
 rect(0,0,W,865,C.paper)+
 photo(h,0,0,W,720)+
 rect(0,620,W,245,'url(#fade)')+
 wordmark(65,95,C.wine)+
 rect(45,770,990,260,C.paper,'rx="8"')+
 tiny(80,820,'FORMACIÓN CATÓLICA',C.forest,{size:22})+
 title(80,915,['La música como','camino de encuentro'],61,C.ink,{leading:65})+
 name(80,1010,C.forest)+
 date(80,1095,C.white,{big:52})+
 line(80,1175,1000,1175,C.gold,2)+
 text(80,1225,'01  $10.000',35,C.pale,{serif:true,weight:700})+
 text(395,1225,'02  $15.000',35,C.pale,{serif:true,weight:700})+
 text(710,1225,'03  $20.000',35,C.pale,{serif:true,weight:700})+
 text(80,1273,'Lotes con valores de referencia · Inscripción previa recomendada',18,C.white)+
 text(80,1308,'También en el lugar · Lugar a confirmar',18,C.pale)
}
function ten(h) {
 return rect(0,0,W,H,C.cream)+
 rect(0,0,W,195,C.wine)+
 wordmark(65,102,C.white)+
 text(1008,72,'19 DIC 2026',26,C.pale,{weight:700,anchor:'end'})+
 photo(h,0,195,W,635)+
 rect(0,810,W,540,C.wine)+
 title(65,900,['Música para','encontrarnos'],69,C.white,{leading:72,italic:true})+
 name(65,1035,C.pale)+
 text(65,1100,'SÁBADO · 17:00 H',31,C.white,{weight:700,ls:2})+
 line(65,1136,1015,1136,C.gold,3)+
 tiny(65,1180,'LOTE 01',C.pale,{size:17})+tiny(385,1180,'LOTE 02',C.pale,{size:17})+tiny(705,1180,'LOTE 03',C.pale,{size:17})+
 text(65,1240,'$10.000',42,C.white,{serif:true,weight:700})+
 text(385,1240,'$15.000',42,C.white,{serif:true,weight:700})+
 text(705,1240,'$20.000',42,C.white,{serif:true,weight:700})+
 text(65,1290,'Valores de referencia · Inscripción previa recomendada',18,C.pale)+
 text(65,1322,'También en el lugar · Lugar a confirmar',18,C.pale)
}

async function main() {
 const input = await sharp(portrait).resize(1250,null,{withoutEnlargement:true}).jpeg({quality:84,mozjpeg:true}).toBuffer()
 const href = 'data:image/jpeg;base64,'+input.toString('base64')
 const layouts=[one,two,three,four,five,six,seven,eight,nine,ten]
 const pngs=[]
 for (let i=0;i<layouts.length;i++) {
   const n=String(i+1).padStart(2,'0')
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${layouts[i](href)}</svg>`
   const svgPath=path.join(__dirname,`version-${n}.svg`)
   const pngPath=path.join(__dirname,`version-${n}.png`)
   fs.writeFileSync(svgPath,svg)
   await sharp(Buffer.from(svg)).png().toFile(pngPath)
   pngs.push(pngPath)
 }
 const thumbW=324, thumbH=405, gap=30, cols=5, rows=2
 const comps=[]
 for(let i=0;i<pngs.length;i++) {
   const thumb=await sharp(pngs[i]).resize(thumbW,thumbH).png().toBuffer()
   comps.push({input:thumb,left:gap+(i%cols)*(thumbW+gap),top:90+Math.floor(i/cols)*(thumbH+75)})
 }
 const sheetW=gap+cols*(thumbW+gap),sheetH=90+rows*(thumbH+75)+gap
 const labels=`<svg width="${sheetW}" height="${sheetH}"><rect width="100%" height="100%" fill="#eee8de"/><text x="30" y="50" font-family="Arial" font-size="28" font-weight="700" fill="#392b2b">10 propuestas · Taller de músicos</text>${Array.from({length:10},(_,i)=>`<text x="${gap+(i%cols)*(thumbW+gap)}" y="${90+Math.floor(i/cols)*(thumbH+75)+thumbH+32}" font-family="Arial" font-size="24" fill="#392b2b">VERSIÓN ${String(i+1).padStart(2,'0')}</text>`).join('')}</svg>`
 await sharp(Buffer.from(labels)).composite(comps).png().toFile(path.join(__dirname,'comparativa.png'))
 console.log('Created 10 SVGs, 10 PNGs and comparativa.png')
}
main().catch(e=>{console.error(e);process.exitCode=1})

const fs = require('fs')
const path = require('path')
const sharp = require('../../node_modules/.pnpm/sharp@0.35.5_@types+node@22.20.5/node_modules/sharp')

const dir = __dirname
const sources = {
  milaDark: 'mila-blanco-sobre-negro.png',
  milaLight: 'mila-negro-sobre-claro.png',
  alma: 'alma-verde.png',
  cabildo: 'cabildo.png',
  kalas: 'las-kalas.png',
}
const imageData = Object.fromEntries(Object.entries(sources).map(([name, file]) => [name, `data:image/png;base64,${fs.readFileSync(path.join(dir, 'logos-originales', file)).toString('base64')}`]))
const W = 2000, H = 1125
const gold = '#bda26d', wine = '#5c1e2a', cream = '#f1e9dc', black = '#050505'
const esc = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;')
const txt = (x,y,t,size,color=cream,font='Georgia,Times New Roman,serif',extra='') => `<text x="${x}" y="${y}" fill="${color}" font-family="${font}" font-size="${size}" ${extra}>${esc(t)}</text>`
const rect = (x,y,w,h,fill,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`
const line = (x1,y1,x2,y2,c=gold,opacity='.45') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" opacity="${opacity}"/>`
const image = (name,x,y,w,h,pad=20) => `<image href="${imageData[name]}" x="${x+pad}" y="${y+pad}" width="${w-2*pad}" height="${h-2*pad}" preserveAspectRatio="xMidYMid meet"/>`

function card(name,x,y,w,h,{featured=false,light=false,frame=true}={}){
  const fill = light ? '#f7f2e8' : '#080807'
  const stroke = featured ? '#c7a566' : '#a58a5950'
  const base = rect(x,y,w,h,fill,`rx="18" stroke="${frame?stroke:'none'}" stroke-width="${featured?2:1}"`)
  const inner = image(name,x,y,w,h,featured?Math.min(92,w*.085):Math.min(48,w*.10))
  const corners = featured ? `<path d="M ${x+26} ${y+26} h 34 M ${x+w-26} ${y+26} h -34 M ${x+26} ${y+h-26} h 34 M ${x+w-26} ${y+h-26} h -34" fill="none" stroke="${gold}" opacity=".42"/>` : ''
  return base+inner+corners
}
function backdrop(i){
  const stars = Array.from({length:24},(_,n)=>{let x=(n*337+i*187)%W,y=(n*241+i*131)%H,r=(n%4===0?4:2);return `<circle cx="${x}" cy="${y}" r="${r}" fill="#c29651" opacity="${n%4===0?.4:.2}"/>`}).join('')
  return `<defs><radialGradient id="halo"><stop stop-color="#5a3c1f" stop-opacity=".38"/><stop offset="1" stop-color="#050505" stop-opacity="0"/></radialGradient><linearGradient id="wine"><stop stop-color="${wine}"/><stop offset="1" stop-color="#050505"/></linearGradient></defs>`+
    rect(0,0,W,H,black)+`<ellipse cx="${1550-i*42}" cy="${250+i*18}" rx="650" ry="570" fill="url(#halo)"/>`+
    `<path d="M -130 ${870+i*8} C 420 ${220+i*24}, 1300 ${300+i*23}, 2150 ${120+i*10}" fill="none" stroke="#ad8246" stroke-width="1.8" opacity=".36"/>`+
    `<path d="M -130 ${902+i*8} C 420 ${253+i*24}, 1300 ${333+i*23}, 2150 ${153+i*10}" fill="none" stroke="#cca669" stroke-width=".8" opacity=".22"/>`+stars+
    line(90,1055,1910,1055,'#a18a63','.25')
}
function heading(i){
  const centered=[1,3,5,6,8,9].includes(i),x=centered?1000:130,align=centered?'text-anchor="middle"':''
  const top = txt(x,82,'VAMOS AL SANTÍSIMO · 2026',20,gold,'Arial,Helvetica,sans-serif',`letter-spacing="5" ${align}`)+
    txt(x,177,'Marcas que nos acompañan',64,cream,'Georgia,Times New Roman,serif',align)+
    txt(x,246,'en este encuentro',64,cream,'Georgia,Times New Roman,serif',align)
  return top+(centered?line(890,293,1110,293,wine,'1'):line(130,293,350,293,wine,'1'))
}
function caption(x,y,t='Un lugar especial para Mila Club'){
  return txt(x,y,t,20,gold,'Arial,Helvetica,sans-serif','letter-spacing="2"')
}
function layout(i){
  const small=(a,b,c)=>card('alma',...a,{light:true})+card('cabildo',...b)+card('kalas',...c)
  switch(i){
    case 1:return caption(770,360,'MILA CLUB · PRESENCIA DESTACADA')+card('milaDark',360,390,1280,305,{featured:true})+small([220,760,460,230],[770,760,460,230],[1320,760,460,230])
    case 2:return card('milaLight',130,365,1050,615,{featured:true,light:true})+caption(145,350,'MILA CLUB')+small([1260,365,580,185],[1260,580,580,185],[1260,795,580,185])
    case 3:return card('milaDark',170,360,1660,285,{featured:true})+small([170,710,480,270],[760,710,480,270],[1350,710,480,270])
    case 4:return caption(130,350,'NOS ACOMPAÑAN')+card('milaDark',130,390,1030,420,{featured:true})+card('alma',1220,355,620,190,{light:true})+card('cabildo',1220,575,620,190)+card('kalas',1220,795,620,190)
    case 5:return card('milaLight',560,360,900,530,{featured:true,light:true})+card('alma',160,420,330,260,{light:true})+card('cabildo',1510,420,330,260)+card('kalas',835,920,330,110)
    case 6:return card('milaDark',290,355,1420,420,{featured:true,frame:false})+line(360,805,1640,805)+small([240,845,440,145],[780,845,440,145],[1320,845,440,145])
    case 7:return card('milaDark',800,350,1090,600,{featured:true})+card('alma',130,365,540,175,{light:true})+card('cabildo',130,565,540,175)+card('kalas',130,765,540,175)
    case 8:return small([180,350,460,235],[770,350,460,235],[1360,350,460,235])+caption(680,650,'MILA CLUB · DESTACADO')+card('milaDark',250,680,1500,305,{featured:true})
    case 9:return card('milaDark',440,360,1120,395,{featured:true})+line(300,795,1700,795)+small([210,820,450,175],[775,820,450,175],[1340,820,450,175])
    case 10:return card('milaLight',820,350,1040,635,{featured:true,light:true})+caption(130,375,'CON EL APOYO DE')+card('alma',130,420,560,165,{light:true})+card('cabildo',130,620,560,165)+card('kalas',130,820,560,165)
  }
}
async function main(){
  for(const [index,i] of [1,4,7].entries()){
    const thanks=txt(W/2,1092,'Agradecemos a cada uno de ellos y que Dios siga multiplicando el 100x1.',21,'#a99b85','Georgia,Times New Roman,serif','text-anchor="middle"')
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${backdrop(i)}${heading(i)}${layout(i)}${thanks}</svg>`
    await sharp(Buffer.from(svg)).png().toFile(path.join(dir,`seleccion-${index+1}.png`))
  }
}
main().catch(e=>{console.error(e);process.exitCode=1})

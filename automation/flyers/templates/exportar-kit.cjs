const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const ROOT='D:/CODSS/PabloMartinez-VamosAlSantisimo/site/design/flyers-adoracion-2026';
const SOURCE=path.join(ROOT,'historia-redes-sociales-v12');
const OUT=path.join(ROOT,'kit-recursos-guia-vamos-al-santisimo');
const {sharp}=require(path.join(ROOT,'seleccion-redes-sociales-v2/generate_santisimo_models.cjs'));
const instagram='<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 48 48"><g transform="translate(4 4) scale(2)" fill="none" stroke="#d8bd83" stroke-width="1.8"><rect width="20" height="20" rx="5"/><circle cx="10" cy="10" r="4.4"/><circle cx="15.3" cy="4.8" r="1" fill="#d8bd83" stroke="none"/></g></svg>';
const facebook='<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 48 48"><path transform="translate(-48 3) scale(2)" d="M32 19V8.3c0-3.5 2.1-5.5 5.3-5.5 1.1 0 2.1.1 2.7.2v3.6h-2c-1.5 0-2 .7-2 2v1.5h3.8l-.6 3.7h-3.2V19" fill="#d8bd83"/></svg>';
const tiktok='<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 48 48"><g transform="translate(5 3) scale(1.7)" fill="#d8bd83"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.12 6.15-1.71.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.08-.14 1.62.24 1.65 1.83 3.04 3.52 2.89 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></g></svg>';
async function main(){
 await fs.mkdir(path.join(OUT,'assets','iconos-redes'),{recursive:true});
 await fs.copyFile(path.join(SOURCE,'Flyer-final-historia-v12.svg'),path.join(OUT,'Flyer-final-editable.svg'));
 for(const f of await fs.readdir(path.join(SOURCE,'assets')))await fs.copyFile(path.join(SOURCE,'assets',f),path.join(OUT,'assets',f));
 for(const [name,svg] of [['instagram',instagram],['facebook',facebook],['tiktok',tiktok]])await sharp(Buffer.from(svg)).png().toFile(path.join(OUT,'assets','iconos-redes',name+'.png'));
 const svg=await fs.readFile(path.join(SOURCE,'Flyer-final-historia-v12.svg'),'utf8');
 const embedded=svg.replace(/href="assets\/([^"]+)"/g,(_,file)=>'href="data:image/png;base64,'+require('node:fs').readFileSync(path.join(OUT,'assets',file)).toString('base64')+'"');
 await sharp(Buffer.from(embedded)).png({compressionLevel:9,adaptiveFiltering:true}).toFile(path.join(OUT,'Flyer-final-historia.png'));
 const qr=svg.match(/<g data-role="qr" transform="translate\(930 58\)">[\s\S]*?<\/g>/)[0].replace('transform="translate(930 58)"','transform="translate(-930 -58)"');
 await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">'+qr+'</svg>')).png().toFile(path.join(OUT,'assets','qr-vamosalsantisimo-100.png'));
 const meta={};
 for(const name of ['logo','host','pablo','mila','alma','cabildo','kalas']){const p=path.join(OUT,'assets',name+'.png'),m=await sharp(p).metadata();meta[name]={file:'assets/'+name+'.png',width:m.width,height:m.height,hasAlpha:m.hasAlpha,format:m.format}}
 await fs.writeFile(path.join(OUT,'assets-manifest.json'),JSON.stringify({canvas:{width:1080,height:1920},qr:{url:'https://www.vamosalsantisimo.com',width:100,height:100},images:meta,networkIcons:{files:['assets/iconos-redes/instagram.png','assets/iconos-redes/facebook.png','assets/iconos-redes/tiktok.png'],width:96,height:96,color:'#d8bd83',transparent:true}},null,2));
 console.log(JSON.stringify(meta,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});


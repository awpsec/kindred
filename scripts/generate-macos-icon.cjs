// Render the existing vector mark on an opaque black macOS background.
// Run with KINDRED_PLAYWRIGHT_MODULE pointing to Playwright when installed externally.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const icons=path.resolve(__dirname,'../desktop/icons');
 const mark=fs.readFileSync(path.join(icons,'icon.svg'),'utf8').replace(/<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 128 128">\n<rect width="128" height="128" fill="#000"/>\n<g transform="translate(12.8 12.8) scale(.8)">'+mark+'</g>\n</svg>\n';
 fs.writeFileSync(path.join(icons,'macos.svg'),svg);
 const browser=await chromium.launch();
 try{
  const p=await browser.newPage();
  const images=await p.evaluate(async svg=>{
   const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(svg);await img.decode();
   const images={};for(const size of [16,32,64,128,256,512,1024]){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,size,size);
    const rgba=ctx.getImageData(0,0,size,size).data;
    for(let i=3;i<rgba.length;i+=4)if(rgba[i]!==255)throw Error('Non-opaque icon at '+size);
    images[size]=canvas.toDataURL('image/png').split(',')[1];
   }return images;
  },svg);
  fs.writeFileSync(path.join(icons,'macos.png'),Buffer.from(images[1024],'base64'));
  // ICNS records contain PNG images; include standard and Retina representations.
  const entries={icp4:16,icp5:32,icp6:64,ic07:128,ic08:256,ic09:512,ic10:1024,ic11:32,ic12:64,ic13:256,ic14:512};
  const records=Object.entries(entries).map(([type,size])=>{const png=Buffer.from(images[size],'base64'),header=Buffer.alloc(8);header.write(type);header.writeUInt32BE(png.length+8,4);return Buffer.concat([header,png]);});
  const header=Buffer.alloc(8);header.write('icns');header.writeUInt32BE(8+records.reduce((n,b)=>n+b.length,0),4);
  fs.writeFileSync(path.join(icons,'macos.icns'),Buffer.concat([header,...records]));
  console.log('Generated opaque macOS PNG and ICNS (16–1024 px).');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

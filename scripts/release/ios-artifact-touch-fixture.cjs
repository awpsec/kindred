// Disposable loopback artifact reproduction. Never connects to a real account.
'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),[cert,key]=process.argv.slice(2);
if(!cert||!key)throw Error('Expected fixture certificate and key paths');
process.env.KINDRED_TEST_SECURITY_HEADERS='1';
const fixture=require(path.join(root,'tools/frontend/fixtures/desktop.cjs'));
const original=fixture.server.listeners('request')[0];
const hashes=Object.fromEntries(fs.readdirSync(path.join(root,'ui')).filter(name=>/\.(js|css|html|txt)$/.test(name)).sort().map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'ui',name))).digest('hex')]));
const items=['one','two','three'].map((name,i)=>({id:'touch-'+name,title:'Touch review '+name,language:'markdown',source:'# Touch review '+name,state:{},revision:1,updated:1791302400-i,created:1791302400,type:'document'}));
function pdf(label){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R 10 0 R] /Count 4 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(let i=0;i<4;i++){
  const stream=`BT /F1 24 Tf 50 710 Td (${label} page ${i+1}) Tj ET`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 }
 let text='%PDF-1.4\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(text.length);text+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const start=text.length;
 text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(text);
}
const server=https.createServer({cert:fs.readFileSync(cert),key:fs.readFileSync(key)},(req,res)=>{
 const route=new URL(req.url,'https://localhost:8765').pathname;
 const json=data=>{fixture.securityHeaders(req,res);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 if(route==='/fixture/ready')return json({fixture:'artifact-touch-uikit',origin:'https://localhost:8765',manual_gestures:process.env.KINDRED_ARTIFACT_GESTURES==='1',ui_sha256:hashes,disposable_documents:items.map(item=>item.id)});
 if(route.startsWith('/api/workspace-artifacts')){
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  const parts=route.split('/').filter(Boolean),item=items.find(item=>item.id===parts[2]);
  if(parts[3]==='preview'&&item){fixture.securityHeaders(req,res);res.writeHead(200,{'Content-Type':'application/pdf','Cache-Control':'no-store'});return res.end(pdf(item.title));}
  if(parts[3]==='file'&&item){res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});return res.end(fs.readFileSync(path.join(root,'tools/frontend/fixtures/document-originals/original-v1.docx')));}
  return json(parts.length===2?items:item||{error:'Unknown disposable artifact'});
 }
 return original(req,res);
});
server.listen(8765,'127.0.0.1',()=>console.log('Artifact touch fixture ready on loopback TLS'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));

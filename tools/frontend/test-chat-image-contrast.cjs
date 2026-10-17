const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const luminance=rgb=>rgb.slice(0,3).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'test-artifacts/chat-image-contrast';fs.mkdirSync(out,{recursive:true});const snapshots=[],mismatches=[];
 try{
 for(const width of [1100,390,320])for(const theme of ['light','dark']){
  const p=await browser.newPage({viewport:{width,height:844},hasTouch:width<500,isMobile:width<500}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  const png=Buffer.from(await p.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=800;const x=c.getContext('2d');x.fillStyle='#287cb8';x.fillRect(0,0,1200,800);x.fillStyle='#e3ac56';x.fillRect(0,0,300,800);return c.toDataURL('image/png').split(',')[1]}),'base64');
  await p.addInitScript(({token,mobile})=>{sessionStorage.setItem('kindred-token',token);if(mobile){window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios'}},{token,mobile:width<500});
  const chat={id:'dm-piper',name:'Piper',members:['piper']},images=n=>Array.from({length:n},(_,i)=>({id:'image'+i,name:'image'+i+'.png',mime:'image/png'}));
  await p.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname;
   if(n==='/api/settings')return r.fulfill({json:{name:'You',theme,approval_mode:'auto'}});
   if(n==='/api/chats')return r.fulfill({json:[chat]});
   if(n==='/api/chats/dm-piper')return r.fulfill({json:{chat,messages:[{seq:1,sender:'user',kind:'message',text:'Please review the attached files.',created:1791810000,files:images(5)},{seq:2,sender:'user',kind:'message',text:'Caption remains unchanged.',created:1791810010,files:[{id:'doc1',name:'first.pdf',mime:'application/pdf'},...images(4),{id:'doc2',name:'second.txt',mime:'text/plain'}]}],page:{has_before:false,has_after:false}}});
   if(n.startsWith('/api/uploads/'))return r.fulfill({contentType:'image/png',body:png});return r.continue();});
  if(process.env.KINDRED_TEST_STYLE_SOURCE)await p.route(origin+'/style.css',r=>r.fulfill({contentType:'text/css',body:fs.readFileSync(process.env.KINDRED_TEST_STYLE_SOURCE,'utf8')}));
  await p.goto(origin);await p.locator('.attachment-only .message-images-more').waitFor();await p.waitForFunction(()=>[...document.querySelectorAll('.message-file-image img')].every(n=>n.complete&&n.naturalWidth>0));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const photo=p.locator('.message-group[data-message="1"]'),text=p.locator('.message-group[data-message="2"]'),tile=photo.locator('.message-images-more');
  assert.equal(await photo.locator('.message-file-image').count(),3);assert.equal(await tile.innerText(),'+2');assert.equal(await text.locator('.message-file-image').count(),3);assert.equal(await text.locator('.message-images-more').innerText(),'+1');
  const snapshot=await p.evaluate(()=>{const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};const rgba=value=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=value;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data]};const a=document.querySelector('.attachment-only .message-images-more'),b=document.querySelector('.message-group[data-message="2"] .message-images-more'),group=document.querySelector('.message-group[data-message="2"]'),bubble=group.querySelector('.message-bubble'),row=group.querySelector('.message-row'),strip=group.querySelector('.message-images');return {photo:{rect:rect(a),bg:rgba(getComputedStyle(a).backgroundColor),fg:rgba(getComputedStyle(a).color)},text:{rect:rect(b),bg:rgba(getComputedStyle(b).backgroundColor),fg:rgba(getComputedStyle(b).color)},photoThumbs:[...document.querySelectorAll('.attachment-only .message-file-image')].map(rect),strip:rect(strip),row:rect(row),documents:[...group.querySelectorAll('.message-file')].map(n=>({name:n.textContent,rect:rect(n)})),normalBubble:{background:getComputedStyle(bubble).backgroundColor,color:getComputedStyle(bubble).color},viewport:{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}}});
  snapshot.width=width;snapshot.theme=theme;snapshot.photo.contrast=contrast(snapshot.photo.bg,snapshot.photo.fg);snapshot.text.contrast=contrast(snapshot.text.bg,snapshot.text.fg);snapshots.push(snapshot);
  assert(snapshot.photo.rect.w>=44&&snapshot.photo.rect.h>=44);assert(snapshot.strip.w>0&&snapshot.row.h>0);assert(Math.abs(snapshot.row.y-snapshot.strip.y-snapshot.strip.h-6)<1);assert(!snapshot.viewport.overflow);assert(snapshot.documents.every(n=>n.rect.y>=snapshot.row.y+snapshot.row.h));assert.deepEqual(snapshot.documents.map(n=>n.name),['first.pdf','second.txt']);
  if(JSON.stringify(snapshot.photo.bg)!==JSON.stringify(snapshot.text.bg)||JSON.stringify(snapshot.photo.fg)!==JSON.stringify(snapshot.text.fg)||snapshot.photo.contrast<3)mismatches.push({width,theme,photo:snapshot.photo,text:snapshot.text});
  await tile.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,`${engine}-${width}-${theme}-photo-only.png`)});width<500?await tile.tap():await tile.click();
  const gallery=p.locator('.attachment-gallery');await gallery.waitFor();assert.equal(await gallery.locator('.message-file-image').count(),5);assert.deepEqual(await gallery.locator('.chat-media-open').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label').replace('Open image: ',''))),images(5).map(f=>f.name));
  await gallery.locator('.uploaded-image-open').last().click();await p.locator('.chat-media-dialog img').waitFor();await p.waitForFunction(()=>{const n=document.querySelector('.chat-media-dialog img');return n?.complete&&n.naturalWidth===1200});assert.equal(await p.locator('.chat-media-dialog img').getAttribute('alt'),'image4.png');
  await p.keyboard.press('Escape');await p.locator('.chat-media-dialog').waitFor({state:'detached'});await p.keyboard.press('Escape');await gallery.waitFor({state:'detached'});assert(await tile.evaluate(n=>document.activeElement===n),'gallery returns focus to +N');
  assert.deepEqual(errors,[]);await p.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({engine,snapshots,mismatches},null,2));assert.deepEqual(mismatches,[],'photo-only tile shares text tile palette and readable contrast');console.log(JSON.stringify({engine,passed:true,cases:snapshots.length}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});

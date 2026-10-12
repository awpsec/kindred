const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs'),assert=require('node:assert/strict');
(async()=>{
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await(process.env.WEBKIT?webkit:chromium).launch();
try{
const p=await browser.newPage();await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
const chat={id:'dm-piper',name:'Piper',members:['piper']};let count=5;
await p.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname;
if(n==='/api/chats')return r.fulfill({json:[chat]});
if(n==='/api/chats/dm-piper')return r.fulfill({json:{chat,messages:[{seq:1,sender:'user',kind:'message',text:'Check these images.',created:Math.floor(Date.now()/1000),files:[...Array.from({length:count},(_,i)=>({id:'image'+i,name:'image'+i+'.png',mime:'image/png'})),{id:'doc',name:'notes.txt',mime:'text/plain'}]}],page:{has_before:false,has_after:false}}});
if(n.startsWith('/api/uploads/'))return r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});return r.continue();});
for(const width of [1100,390,320])for(count of [1,3,4,7]){
await p.setViewportSize({width,height:844});await p.goto(origin);const group=p.locator('.message-group[data-message="1"]');await group.locator('.message-images').waitFor();
assert.equal(await group.locator('.message-file-image').count(),Math.min(count,3));
const images=await group.locator('.message-images').boundingBox(),row=await group.locator('.message-row').boundingBox();assert(Math.abs(row.y-images.y-images.height-6)<1,JSON.stringify({width,count,images,row}));assert(images.x>=0&&images.x+images.width<=width);
assert.equal(await group.locator('.message-file').last().innerText(),'notes.txt');
if(count>3){const more=group.locator('.message-images-more');assert.equal(await more.innerText(),'+'+(count-3));await more.click();assert.equal(await p.locator('.attachment-gallery .message-file-image').count(),count);await p.locator('.attachment-gallery .uploaded-image-open').last().click();await p.locator('.screenshot-dialog img').waitFor();}
}
console.log('PASS image order, gap, overflow gallery and viewing at desktop/mobile widths');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});

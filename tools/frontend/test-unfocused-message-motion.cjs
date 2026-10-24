const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
try{
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+String.fromCharCode(10)+'export {revealReply};'}));
await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await page.goto(origin);
const result=await page.evaluate(async()=>{
 const {revealReply}=await import('/app.js');
 let focused=true;Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>focused});
 const rows=Array.from({length:3},(_,i)=>{const row=document.createElement('div');row.textContent='Recent message '+i;document.body.append(row);return row;});
 rows.forEach(row=>revealReply(row,Date.now()));
 const foreground=rows.every(row=>row.getAnimations().length===1);
 focused=false;window.dispatchEvent(new Event('blur'));
 const settled=rows.every(row=>!row.getAnimations().length&&!row.classList.contains('reply-arriving')&&getComputedStyle(row).opacity==='1');
 rows.forEach(row=>revealReply(row,Date.now()));
 const background=rows.every(row=>!row.getAnimations().length);
 document.dispatchEvent(new MouseEvent('mouseenter'));focused=true;window.dispatchEvent(new Event('focus'));
 const noReplay=rows.every(row=>!row.getAnimations().length&&getComputedStyle(row).opacity==='1');
 revealReply(rows[0],Date.now()-1000);
 const stale=!rows[0].getAnimations().length;
 rows.forEach(row=>row.remove());return {foreground,settled,background,noReplay,stale};
});
assert.deepEqual(result,{foreground:true,settled:true,background:true,noReplay:true,stale:true});
assert.deepEqual(errors,[]);console.log('Unfocused message motion: foreground entrances, blur settlement, background suppression and no replay passed');
}finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

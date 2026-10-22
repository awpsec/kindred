const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();let release,releaseWrite;
 try{
  const p=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>ms===2500?0:interval(fn,ms,...args);},token);
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.testRefresh=()=>refresh(true);window.testWrite=()=>api("/fixture-pending-write","POST",{});'}));
  await p.route(origin+'/api/runs',r=>r.fulfill({json:[]}));
  let messages=[{seq:1,sender:'piper',kind:'message',text:'Initial message',created:100}],bots=0,hold=false,blocked=false,writes=0;
  await p.route(origin+'/api/bots',async r=>{bots++;await r.continue();});
  await p.route(origin+'/api/activity',async r=>{if(hold){hold=false;blocked=true;await new Promise(resolve=>release=resolve);}try{await r.fulfill({json:{}});}catch{}});
  await p.route(origin+'/api/fixture-pending-write',async r=>{writes++;await new Promise(resolve=>releaseWrite=resolve);await r.fulfill({json:{saved:true}});});
  await p.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages,page:{has_before:false,has_after:false}}}));
  await p.goto(origin);await p.getByText('Initial message',{exact:true}).waitFor();await p.waitForTimeout(500);
  await p.locator('#prompt').fill('Keep my unsent draft');
  messages.push({seq:2,sender:'piper',kind:'message',text:'New work while minimized',created:101});
  const before=bots,start=Date.now();
  await p.evaluate(()=>{window.dispatchEvent(new Event('kindred-desktop-resume'));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  await p.getByText('New work while minimized',{exact:true}).waitFor({timeout:1800});assert(Date.now()-start<1800);assert.equal(bots-before,1,'Foreground signals must coalesce');assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Keep my unsent draft');
  // A suspended read cannot block new foreground data; a dispatched write is untouched.
  await p.waitForTimeout(450);hold=true;await p.evaluate(()=>{window.oldRefresh=window.testRefresh();window.writeResult=window.testWrite();});
  while(!blocked||!releaseWrite)await p.waitForTimeout(10);
  messages.push({seq:3,sender:'piper',kind:'message',text:'Fresh after stalled read',created:102});
  await p.evaluate(()=>window.dispatchEvent(new Event('kindred-desktop-resume')));
  await p.getByText('Fresh after stalled read',{exact:true}).waitFor({timeout:1800});
  assert.equal(writes,1);releaseWrite();releaseWrite=null;assert.deepEqual(await p.evaluate(()=>window.writeResult),{saved:true});release();release=null;
  await p.evaluate(()=>window.oldRefresh);assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Keep my unsent draft');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,immediateForeground:true,coalesced:true,stalledReadReplaced:true,writePreserved:true,draftPreserved:true}));
 }finally{release?.();releaseWrite?.();await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

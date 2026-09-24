const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage();p.setDefaultTimeout(12000);const errors=[],sessions=[],shots=[];p.on('pageerror',e=>errors.push(e.message));
  const bots=[{id:'piper',name:'Piper'},{id:'iz',name:'Izabella'},{id:'old',name:'Archived bot'}].map(b=>({...b,provider:'codex',profile:{shape:'pebble',color:'#2475ff',archived:b.id==='old'}}));
  const screenshots=Object.fromEntries(bots.map(b=>[b.id,'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380"><rect width="600" height="380" fill="${b.id==='piper'?'#153a50':'#664322'}"/><text x="35" y="70" font-family="sans-serif" font-size="32" fill="white">${b.name}'s computer</text></svg>`).toString('base64')]));
  let hold=false,release;
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),name=u.pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);
   if(name==='/status')return send({version:'0.18.1',screen_bot_id:u.searchParams.get('bot_id'),takeover:false,vm_enabled:true,public_url:origin});
   if(name==='/computer'){const id=u.searchParams.get('bot_id');shots.push(id);if(hold&&id==='piper'){hold=false;await new Promise(r=>release=r);}return send({image:screenshots[id]});}
   if(name==='/computer/resources')return send({cpu_percent:12,cpus:4,memory_used:2e9,memory_total:8e9,disk_used:5e9,disk_total:24e9,uptime_seconds:500,sampled_at:Math.floor(Date.now()/1000)});
   if(name==='/computer/session'){sessions.push(req.postDataJSON());return send({ticket:'fixture',control:false});}
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  await p.locator('#bot-details').click();await p.locator('.bot-identity-form').waitFor();assert.equal(await p.locator('#computer-preview-image').count(),0);
  hold=true;await p.locator('#settings-button').click();await p.locator('#settings-dialog').getByRole('button',{name:'Bot Computer',exact:true}).click();
  const choice=p.getByRole('combobox',{name:'Preview bot screen',exact:true});assert.equal(await choice.inputValue(),'piper');assert.deepEqual(await choice.locator('option').allTextContents(),['Piper’s screen','Izabella’s screen']);
  for(let i=0;i<100&&!release;i++)await p.waitForTimeout(20);assert(release,'Piper preview is in flight');
  await choice.selectOption('iz');release();
  await p.waitForFunction(src=>document.querySelector('#computer-settings-preview-image')?.src===src,screenshots.iz);
  assert.equal(await p.locator('#computer-settings-preview-image').getAttribute('alt'),'Izabella’s screen');
  assert.equal(await p.locator('.bot-identity-form').getByLabel('Name',{exact:true}).inputValue(),'Piper','Screen settings keep the underlying profile identity');
  assert.equal(sessions.length,0,'Choosing a preview does not take control or open a desktop session');assert.equal(await p.locator('#heading').textContent(),'Piper');
  const bounds=await choice.boundingBox();assert(bounds.width<220&&bounds.height<32);
  await p.waitForTimeout(250);await p.screenshot({path:path.join(artifacts,engine+'-settings-screen.png')});
  await p.setViewportSize({width:390,height:844});await p.waitForTimeout(250);const mobile=await choice.boundingBox();assert(mobile.x>=0&&mobile.x+mobile.width<=390);await p.screenshot({path:path.join(artifacts,engine+'-settings-screen-mobile.png')});
  await p.setViewportSize({width:1320,height:900});await p.locator('#computer-settings-preview-image').click();
  await p.waitForFunction(()=>document.querySelector('#screen-picker')?.value==='iz');
  for(let i=0;i<100&&!sessions.length;i++)await p.waitForTimeout(20);assert.equal(sessions[0]?.bot_id,'iz');assert.equal(sessions[0]?.control,false);
  assert(shots.includes('piper')&&shots.includes('iz'));assert.deepEqual(errors,[]);await context.close();
  console.log(JSON.stringify({passed:true,engine,compactSelector:true,screenIdentity:true,stalePreviewGuard:true,openSelectedScreen:true,mobile:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});

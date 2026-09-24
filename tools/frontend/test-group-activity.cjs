const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true,args:process.env.WEBKIT?[]:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:820,height:520}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const out=process.env.ARTIFACTS||'/tmp/kindred-group-activity';fs.mkdirSync(out,{recursive:true});
 try{
 await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {node,buddy,elapsedTime,reconcileConversation};'}));
 await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await page.goto(origin);await page.waitForSelector('#content');
 await page.evaluate(async()=>{
  const app=await import('/app.js'),activity=await import('/group-activity.js');
  const root=document.createElement('section');root.id='activity-fixture';root.style.cssText='position:fixed;inset:0;z-index:9999;background:var(--bg,#000);padding:42px;color:var(--text);';
  document.body.append(root);root.innerHTML='<h3>Team General</h3><p style="font-size:14px;margin:24px 0 28px;color:var(--muted)">I’ll bring the findings together when everyone’s finished.</p><div id="activity-demo"></div>';
  const colors=['#a9df20','#ffc900','#ff684d','#7956ff'],names=['Rowan','Piper','Atlas','Scratch'];
  window.stopped=[];window.showWorkers=(count,status='running',withControls=false)=>{
   const items=names.slice(0,count).map((name,i)=>({id:'demo-'+i,name,status,label:i===1?'Running a command':undefined,created:Math.floor(Date.now()/1000)-83-i*21,profile:{color:colors[i],shape:['pill','round','hexagon','rounded'][i]}}));
   const desired=document.createElement('div');desired.append(activity.groupActivity(items,{node:app.node,elapsed:app.elapsedTime,avatar:(m,size)=>app.buddy(m,size,false),control:m=>{if(!withControls||m.id==='demo-3')return null;const b=app.node('button','work-stop','Stop');b.setAttribute('aria-label','Stop task for '+m.name);b.onclick=()=>window.stopped.push(m.id);return b;}}));
   app.reconcileConversation(document.querySelector('#activity-demo'),desired);
  };window.showWorkers(3);
 });
 assert.equal(await page.locator('.group-working-row').count(),3);assert.equal(await page.locator('.group-working-time').count(),3);
 assert.match(await page.locator('.group-activity').textContent(),/Piper running a command/);
 await page.screenshot({path:path.join(out,'three-bots.png')});
 await page.evaluate(()=>showWorkers(4));assert.equal(await page.locator('.group-working-row').count(),1);assert.equal(await page.locator('[data-worker]').count(),4);
 assert.match(await page.locator('.group-activity').textContent(),/4 bots are working/);await page.waitForTimeout(350);await page.screenshot({path:path.join(out,'four-bots.png')});
 assert(await page.evaluate(()=>{showWorkers(3);return document.querySelector('.group-activity').getAnimations().length>0;}));assert.equal(await page.locator('.group-working-row').count(),3);await page.waitForTimeout(350);
 await page.evaluate(()=>showWorkers(2,'awaiting_approval'));assert.match(await page.locator('.group-activity').textContent(),/waiting for approval/);assert.equal(await page.locator('.group-working-dots').count(),0);
 await page.evaluate(()=>{document.documentElement.dataset.motion='off';showWorkers(4);});await page.waitForTimeout(350);await page.evaluate(()=>showWorkers(3));assert.equal(await page.locator('.group-activity').evaluate(n=>n.getAnimations().length),0);
 await page.evaluate(()=>{document.documentElement.dataset.motion='on';showWorkers(4);});await page.waitForTimeout(350);
 for(let i=0;i<26;i++){if(i===6)await page.evaluate(()=>showWorkers(3));await page.screenshot({path:path.join(out,`frame-${String(i).padStart(2,'0')}.png`)});await page.waitForTimeout(45);}
 await page.setViewportSize({width:360,height:520});await page.evaluate(()=>showWorkers(3));assert(await page.locator('.group-activity').evaluate(n=>n.scrollWidth<=n.clientWidth));
 await page.evaluate(()=>showWorkers(4,'running',true));
 const controls=page.locator('.group-working-controls');await controls.locator('summary').click();
 assert.equal(await controls.getByRole('button').count(),3,'remote bot must not get a local stop control');
 await controls.getByRole('button',{name:'Stop task for Atlas',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.stopped),['demo-2']);
 await page.evaluate(()=>showWorkers(4,'awaiting_approval',true));assert.equal(await controls.evaluate(n=>n.open),true,'polling must preserve task controls');
 await page.evaluate(()=>showWorkers(3,'running',true));assert.equal(await page.locator('.group-working-row button').count(),3);
 assert.deepEqual(errors,[]);console.log('Group activity: stacked, clustered, elapsed, waiting, motion, narrow layout passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());

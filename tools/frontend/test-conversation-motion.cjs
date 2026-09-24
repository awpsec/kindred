const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':process.env.KINDRED_TEST_BROWSER==='edge'?'edge':'chromium';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:!process.env.KINDRED_HEADED}:{headless:!process.env.KINDRED_HEADED,...(engine==='edge'?{channel:'msedge'}:{})});
 try{
 const p=await browser.newPage({viewport:{width:1320,height:860}});p.setDefaultTimeout(12000);
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const now=Math.floor(Date.now()/1000);
 let bots=[{id:'piper',name:'Piper',provider:'codex',model:'test',reasoning_effort:'high',instructions:'Fixture',memory:'',approval_mode:'ask',profile:{shape:'round',color:'#ffffff',label:'Assistant',description:'A helpful teammate'}}];
 let run={id:'latest',bot_id:'piper',chat_id:'dm-piper',prompt:'Please check the outline.',output:'The outline is ready for your review.',error:'',status:'completed',created:now-3601,depth:0};
 let created=0;
 await p.route(origin+'/api/**',async route=>{
  const request=route.request(),u=new URL(request.url()),name=u.pathname.slice(4);const send=json=>route.fulfill({json});
  if(name==='/bots'){
   if(request.method()==='POST'){const b={...request.postDataJSON(),id:'new-bot'};bots.push(b);created++;return send(b);}return send(bots);
  }
  if(name==='/runs')return send([run]);
  if(name==='/runs/latest')return send({run,events:[],approvals:[],attachments:[]});
  if(name==='/activity')return send({piper:{status:run.status,shape:run.status==='running'?'think':'waiting',label:'Thinking it through',started_at:run.created,last_active_at:run.created}});
  if(name==='/chats')return send(bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false})));
  if(name.startsWith('/chats/')){const id=name.slice(7),b=bots.find(b=>'dm-'+b.id===id);return send({chat:{id,name:b.name,members:[b.id]},messages:b.id==='piper'?[{seq:1,sender:'user',text:run.prompt,kind:'message',created:run.created},{seq:2,sender:'piper',text:run.output||run.error,kind:'result',run_id:run.id,created:run.created}]:[]});}
  return route.continue();
 });
 await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
 const preview=p.locator('#bots [aria-label="Piper"] .bot-preview');await preview.waitFor();
 assert.equal(await preview.textContent(),run.output);
 const idleStates=await p.evaluate(async()=>{
  const {activityState}=await import('/characters.js');const now=10000;
  return {
   completed:[0,7,300,1799,1800].map(age=>activityState({status:'completed',shape:'success',last_active_at:now-age},now).action),
   fresh:[1799,1800].map(age=>activityState(null,now,now-age).action),
   active:['running','queued','awaiting_approval','awaiting_user','cancelling'].map(status=>activityState({status,shape:status==='running'?'think':'waiting',last_active_at:1},now).action)
  };
 });
 assert.deepEqual(idleStates,{completed:['idle','idle','idle','idle','rest'],fresh:['idle','rest'],active:['working','idle','waiting','waiting','waiting']});
 assert.equal(await p.locator('#bot-status').count(),0);
 assert(await p.locator('#bot-details').evaluate(b=>{const a=b.querySelector('.character').getBoundingClientRect(),n=b.querySelector('strong').getBoundingClientRect();return Math.abs(a.y+a.height/2-n.y-n.height/2)<1}));
 await p.waitForFunction(()=>document.querySelector('#bots .character')?.dataset.action==='rest');
 assert.equal(await preview.textContent(),run.output);
 await p.screenshot({path:path.join(artifacts,`${engine}-message-preview.png`)});
 for(const status of ['queued','running','awaiting_approval','awaiting_user','failed']){
  run={...run,status,created:now,prompt:'Latest message while '+status.replaceAll('_',' '),output:'',error:status==='failed'?'The request could not finish.':''};
  await p.waitForFunction(expected=>document.querySelector('#bots [aria-label="Piper"] .bot-preview')?.textContent===expected,({queued:'...queued',running:'...working',awaiting_approval:'...awaiting approval',awaiting_user:'...waiting for you'})[status]||run.error||run.prompt);
  assert.equal(await p.locator('#bot-status').count(),0);
  if(status==='running'){
   const line=p.locator('.work-line').first(),label=line.locator('.work-label'),avatar=line.locator('.character');
   await line.waitFor();await p.locator('#heading').hover();
   assert.equal(await line.getByRole('button',{name:'Stop',exact:true}).count(),0);
   assert.equal(await avatar.evaluate(a=>a.offsetWidth),48);
   // Live step labels remain visible, including without hover (since 0.48.10).
   await p.waitForFunction(()=>getComputedStyle(document.querySelector('.work-label')).opacity==='1');
   await p.screenshot({path:path.join(artifacts,`${engine}-working-bot.png`)});
   await avatar.hover();await p.waitForFunction(()=>getComputedStyle(document.querySelector('.work-label')).opacity==='1');
   assert.equal(await label.evaluate(a=>getComputedStyle(a).animationName),'working-glimmer');
   assert.equal(await label.evaluate(a=>getComputedStyle(a).color),'rgba(0, 0, 0, 0)');
   await p.screenshot({path:path.join(artifacts,`${engine}-working-hover.png`)});
   await p.locator('#heading').hover();await line.focus();assert(await line.evaluate(a=>a===document.activeElement));
   await p.waitForFunction(()=>getComputedStyle(document.querySelector('.work-label')).opacity==='1');
   await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await label.evaluate(a=>getComputedStyle(a).animationName),'none');
   await p.emulateMedia({reducedMotion:'no-preference'});
   await line.evaluate(a=>a.blur());
   await p.setViewportSize({width:390,height:844});await line.scrollIntoViewIfNeeded();
   assert(await line.evaluate(a=>a.getBoundingClientRect().right<=innerWidth));
   await p.setViewportSize({width:1320,height:860});
  }
 }
 await p.locator('#new-bot').click();await p.locator('#new-menu').getByRole('button',{name:'New bot',exact:true}).click();await p.locator('#bot-form [name=name]').fill('Clover');
 await p.locator('#bot-form button.primary').click();
 const born=p.locator('#bots [aria-label="Clover"] .character');await born.waitFor();
 const birth=await born.evaluate(box=>({arrived:box._character.arrived,scale:box._character.presence.getAttribute('transform')}));
 assert(birth.arrived);assert(birth.scale?.includes('scale('),JSON.stringify(birth));assert.equal(created,1);
 await p.waitForFunction(()=>!document.querySelector('#bots [aria-label="Clover"] .character')?.classList.contains('arriving'));
 await born.evaluate(box=>window.originalBorn=box);
 await p.locator('#search').fill('Clover');await p.locator('#search').fill('');
 assert(await born.evaluate(box=>box===window.originalBorn&&!box.classList.contains('arriving')));
 // Deterministic frames use the same renderer as the live RAF loop.
 await p.route(origin+'/motion-review',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="dark"><link rel="stylesheet" href="/style.css"><style>body{height:auto;overflow:auto;padding:28px;background:#101010}.samples{display:flex;align-items:center;gap:28px;padding:28px 12px}.label{font-size:12px;color:#999}.sample{text-align:center}</style><body><div class="samples"></div></body></html>'}));
 await p.goto(origin+'/motion-review');await p.setViewportSize({width:760,height:300});
 await p.evaluate(async()=>{
  window.art=await import('/characters.js');window.motionNow=1000000;Date.now=()=>window.motionNow;window.boxes=[];
  for(const [shape,color] of [['cloud','#ff9638'],['round','#ffffff'],['triangle','#2ec767'],['capsule','#2475ff']]){
   const sample=document.createElement('div');sample.className='sample';
   const box=art.character({shape,color},100);sample.append(box);
   const small=art.character({shape,color},36);sample.append(small);
   document.querySelector('.samples').append(sample);boxes.push(box,small);
   for(const b of [box,small]){art.setActivity(b,'think',{immediate:true,startedAt:1000000});for(const a of b.getAnimations({subtree:true})){a.pause();a.currentTime=0;}}
  }
 });
 const frames=[];
 for(const ms of [0,1700,9250,9410,9520,9630,9740,9950,10250,10800]){
  const pose=await p.evaluate(ms=>{motionNow=1000000+ms;for(const b of boxes)art.renderCharacterMotion(b,motionNow);return boxes.map(b=>({opacity:Number(b._character.faceProjection.style.opacity),transform:b._character.motion.getAttribute('transform'),face:b._character.faceProjection.getAttribute('transform'),path:b._character.path.getAttribute('d')}));},ms);
  frames.push({ms,pose});await p.screenshot({path:path.join(artifacts,`${engine}-turn-${ms}.png`)});
 }
 assert(frames.find(f=>f.ms===9520).pose.every(p=>p.opacity===0));
 assert(frames.find(f=>f.ms===9950).pose.every(p=>p.opacity===1));
 assert(frames.at(-1).pose.every((p,i)=>p.path===frames[0].pose[i].path));
 for(const frame of frames)for(let i=0;i<frame.pose.length;i+=2)assert.equal(frame.pose[i].transform,frame.pose[i+1].transform);
 assert.equal(await p.locator('.character-stars,.character-dream,.character-yawn').count(),0);
 await p.evaluate(()=>{window.birth=art.character({shape:'cloud',color:'#ff9638'},100);document.querySelector('.samples').replaceChildren(birth);art.arriveCharacter(birth,1003800);});
 for(const ms of [0,400,620,780,940,1150]){
  await p.evaluate(ms=>{motionNow=1003800+ms;art.renderCharacterMotion(birth,motionNow);},ms);
  await p.screenshot({path:path.join(artifacts,`${engine}-birth-${ms}.png`)});
 }
 assert.equal(await p.evaluate(()=>birth.classList.contains('arriving')),false);
 // Tool gestures must still wait for their silhouette to finish morphing.
 const morph=await p.evaluate(async()=>{
  const samples=[];art.setActivity(birth,'hammer');const begun=performance.now();
  while(performance.now()-begun<700){samples.push({morph:birth.classList.contains('morphing'),animation:getComputedStyle(birth._character.body).animationName,exact:birth._character.path.getAttribute('d').startsWith('M25 9L70 9')});await new Promise(requestAnimationFrame);}return samples;
 });
 assert(morph.some(f=>f.morph));assert(morph.filter(f=>f.morph).every(f=>f.animation==='none'));assert(morph.find(f=>!f.morph).exact);
 await p.evaluate(()=>art.setActivity(birth,'think',{immediate:true,startedAt:Date.now()-2500}));
 await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(80);
 assert.equal(await p.evaluate(()=>birth._character.motion.getAttribute('transform')),null);
 assert.equal(await p.evaluate(()=>birth._character.faceProjection.getAttribute('transform')),null);
 assert.equal(await p.evaluate(()=>birth.getAnimations({subtree:true}).length),0);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,engine,messagePreviewStates:6,completionIsNeutral:true,dormantAfterThirtyMinutes:true,workingBot48px:true,persistentStepLabel:true,hoverShimmer:true,noInlineStop:true,headerStatusRemoved:true,birthOnce:true,turnFrames:frames.length,shapePreservation:true,synchronizedSizes:true,toolMorphOrder:true,reducedMotion:true}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1});

const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/notch');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const context=await browser.newContext({viewport:{width:240,height:76}}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  await p.route(origin+'/notch.*',route=>{const file=new URL(route.request().url()).pathname.slice(1);return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui',file),'utf8')});});
  await p.addInitScript(()=>{
   // Keep layout/interaction fixtures alive under a busy test host. The external
   // fixture below separately checks the real three-second expiry, including hover.
   const schedule=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>schedule(fn,delay===3000&&window.queue?.[0]?.id!=='external'?30000:delay,...args);
   window.calls=[];window.animated=[];
   // Record which properties each alert animates, to prove Reduce Motion only dissolves.
   const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){animated.push({id:window.queue?.[0]?.id,props:[...new Set(frames.flatMap(Object.keys))].filter(k=>!['offset','easing','composite'].includes(k))});return animate.call(this,frames,options);};
   window.layout={top:32,notched:true,bridge_width:176};
   window.queue=[{id:'first',title:'Harold',body:'Your inbox is checked. Two messages need your attention.',avatar:{shape:'capsule',color:'#7960ff',eyes:'curious'},reduced_motion:false}];
   window.__TAURI__={event:{listen:async(_,callback)=>{window.changed=callback;return()=>{};}},core:{invoke:async(command,args)=>{
    calls.push({command,...args,at:Date.now(),paint:args.action==='present'?{clip:getComputedStyle(document.querySelector('#alert')).clipPath,opacity:getComputedStyle(document.querySelector('#open')).opacity}:null});const current=queue[0];
    if(args.action==='state')return current?structuredClone({...current,queued:queue.length-1,layout}):null;
    if(current?.id!==args.id)return null;
    if(['present','hold','release'].includes(args.action))window.lastRenewed=Date.now();
    if(['open','dismiss'].includes(args.action)){queue.shift();setTimeout(()=>changed(),0);}
    return null;
   }}};
   setInterval(()=>{if(queue[0]?.id==='external'&&lastRenewed&&Date.now()-lastRenewed>=4000){calls.push({action:'watchdog'});queue.shift();changed();}},100);
  });
  await p.mouse.move(-10,-10);await p.goto(origin+'/notch.html');await p.waitForFunction(()=>calls.some(c=>c.action==='present'));await p.mouse.move(239,75);await p.waitForTimeout(600);
  const initialPaint=await p.evaluate(()=>calls.find(c=>c.action==='present').paint);assert(initialPaint.clip.startsWith('path('),'Native presentation must start with the collapsed silhouette');assert.equal(initialPaint.opacity,'0','Content must not flash before expansion');
  assert.equal(await p.locator('#avatar .character').count(),1);
  assert.equal(await p.locator('#announce').textContent(),'Harold sent you a message.');
  assert.equal(await p.locator('#announce').getAttribute('role'),'status');
  const type=await p.evaluate(()=>['#title','#message'].map(s=>{const c=getComputedStyle(document.querySelector(s));return{size:parseFloat(c.fontSize),weight:+c.fontWeight,color:c.color};}));
  assert(type[0].size>=13&&type[0].weight>=600&&type[1].size>=11.5,JSON.stringify(type));
  assert.equal(await p.evaluate(()=>animated.filter(a=>a.id==='first').some(a=>a.props.includes('clipPath'))),true,'Arrival morphs the silhouette');
  for(const selector of ['.notch-card','.notch-bridge'])assert.equal(await p.locator(selector).evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(0, 0, 0)');
  const resting=await p.locator('.notch-card').boundingBox();assert(resting.height<=32.1,JSON.stringify({resting,transform:await p.locator('#alert').evaluate(n=>getComputedStyle(n).transform)}));
  assert.equal((await p.locator('.notch-card').boundingBox()).width,224);
  await p.setViewportSize({width:274,height:76});
  await p.evaluate(()=>{layout.bridge_width=210;changed();});
  await p.waitForFunction(()=>document.querySelector('.notch-card').getBoundingClientRect().width===258);
  await p.setViewportSize({width:240,height:76});
  await p.evaluate(()=>{layout.bridge_width=176;changed();});
  for(const top of [32,37,48]){
    await p.setViewportSize({width:240,height:top+44});await p.evaluate(top=>{layout.top=top;changed();},top);
    await p.waitForFunction(top=>document.querySelector('.notch-card').getBoundingClientRect().top===top,top);
    const boxes=await p.evaluate(()=>['#avatar','#title','#message'].map(selector=>{const n=document.querySelector(selector),r=n.getBoundingClientRect();return{selector,top:r.top,bottom:r.bottom,right:r.right,width:r.width};}));
    for(const b of boxes){assert(b.top>=top&&b.bottom<=top+32&&b.right<=240&&b.width>0,JSON.stringify(b));}
    assert.equal(await p.locator('#alert').evaluate(n=>getComputedStyle(n).appearance),'none');
  }
  await p.setViewportSize({width:240,height:76});await p.evaluate(()=>{layout.top=32;changed();});
  assert.equal(await p.locator('#avatar .character').getAttribute('data-shape'),'capsule');
  const before=await p.locator('#avatar').evaluate(n=>n.getAnimations({subtree:true})[0].currentTime);
  await p.waitForTimeout(300);
  assert(await p.locator('#avatar').evaluate((n,before)=>n.getAnimations({subtree:true})[0].currentTime>before,before),'Avatar animation advances while visible');
  await p.screenshot({path:path.join(artifacts,engine+'-notched.png'),omitBackground:true});
  await p.evaluate(()=>{queue[0]={id:'tribute-oliver',title:'Oliver',body:'Ready when you are.',avatar:{shape:'pebble',color:'#ffbe16'},reduced_motion:false};changed();});
  await p.locator('#avatar [data-tribute="oliver"]').waitFor();
  assert.equal(await p.locator('#avatar .character').getAttribute('data-action'),'idle');
  await p.evaluate(()=>{queue[0]={id:'tribute-vivienne',title:'Vivienne · Project chat',body:'Your task is complete.',avatar:{name:'Vivienne',shape:'triangle',color:'#2ec767'},reduced_motion:false};changed();});
  await p.locator('#avatar [data-tribute="vivienne"]').waitFor();
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('#open')).opacity==='1'&&document.getAnimations().every(a=>a.playState!=='running'||a.effect?.target?.closest?.('.character')));
  assert(await p.locator('#alert').isVisible(),'Replacing a visible alert keeps the surface open');
  await p.screenshot({path:path.join(artifacts,engine+'-notch-tribute.png'),omitBackground:true});
  await p.setViewportSize({width:304,height:56});
  await p.evaluate(()=>{layout={top:12,notched:false,bridge_width:240};queue[0]={id:'external',title:'A very long bot name that must stay contained',body:'Untrusted preview <img src=x onerror=alert(1)> '+('A long message with useful details. '.repeat(20)),avatar:{shape:'hexagon',color:'#ff9638'},reduced_motion:true};changed();});
  await p.waitForFunction(()=>calls.some(c=>c.action==='present'&&c.id==='external'));
  assert.equal(await p.locator('#message img').count(),0);
  assert.equal(await p.locator('#message').innerText(),'sent you a message.');
  assert.equal(await p.locator('.notch-copy').evaluate(n=>getComputedStyle(n).whiteSpace),'nowrap');
  assert.equal(await p.locator('html').getAttribute('data-notched'),'false');
  const layout=await p.locator('.notch-card').evaluate(n=>{const r=n.getBoundingClientRect();return{bottom:r.bottom,right:r.right,width:n.scrollWidth,client:n.clientWidth,animations:document.getAnimations().filter(a=>a.playState==='running').length};});
  assert(layout.bottom<=56&&layout.right<=304&&layout.width<=layout.client+1,JSON.stringify(layout));
  await p.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));
  const reduced=await p.evaluate(()=>[...new Set(animated.filter(a=>a.id==='external').flatMap(a=>a.props))]);
  assert.deepEqual(reduced,['opacity'],'Reduce Motion dissolves without morphing, moving or blurring');
  await p.screenshot({path:path.join(artifacts,engine+'-external.png'),omitBackground:true});
  assert.equal(await p.locator('#dismiss').count(),0);
  await p.setViewportSize({width:320,height:56});
  // Exercise the native fallback without browser mouse events: non-key Mac
  // windows don't receive WKWebView's normal tracking-area hover callbacks.
  const rust=fs.readFileSync(path.resolve(__dirname,'../../desktop/src/notch.rs'),'utf8');
  const nativeScript=rust.match(/window\.eval\(&format!\(r#"([\s\S]*?)"#\)\)/)[1];
  const nativePointer=(x,y)=>nativeScript.replaceAll('{{','{').replaceAll('}}','}').replaceAll('{x}',String(x)).replaceAll('{y}',String(y)).replaceAll('{id}',JSON.stringify('external'));
  await p.mouse.move(-10,-10);
  const restingClip=await p.locator('#alert').evaluate(n=>n.style.clipPath);
  await p.evaluate(nativePointer(160,32));
  await p.waitForTimeout(4500);
  assert(await p.locator('#alert').isVisible(),'Hover must outlast both dismissal deadlines');
  assert.equal(await p.evaluate(()=>calls.filter(c=>c.action==='dismiss'&&c.id==='external').length),0);
  assert(await p.evaluate(()=>calls.filter(c=>c.action==='hold'&&c.id==='external').length)>=4,'Native watchdog lease renews while hovered');
  // Hover widens the silhouette; text is never magnified.
  assert.notEqual(await p.locator('#alert').evaluate(n=>n.style.clipPath),restingClip,'Hover swells the silhouette');
  assert.equal(await p.locator('#alert').evaluate(n=>getComputedStyle(n).transform),'none');
  assert.notEqual(await p.locator('#message').evaluate(n=>getComputedStyle(n).color),'rgba(235, 235, 245, 0.66)','Hover brightens secondary text');
  assert.equal(await p.evaluate(()=>calls.filter(c=>c.action==='watchdog').length),0);
  const enlarged=await p.locator('#alert').boundingBox();assert(enlarged.x>=0&&enlarged.x+enlarged.width<=320&&enlarged.y+enlarged.height<=56);
  const released=Date.now();await p.evaluate(nativePointer(0,55));
  await p.waitForFunction(()=>calls.some(c=>c.action==='dismiss'&&c.id==='external'));
  const lifetime=await p.evaluate(()=>calls.find(c=>c.action==='dismiss'&&c.id==='external').at-calls.find(c=>c.action==='present'&&c.id==='external').at);
  assert(lifetime>=7000,'Hover must extend the lifetime: '+lifetime);assert(Date.now()-released>=2800&&Date.now()-released<4500,'Leaving restarts the three-second countdown');
  await p.locator('#alert').waitFor({state:'hidden'});
  assert.equal(await p.locator('#announce').textContent(),'');
  // Keyboard: focus holds like hover, Escape dismisses, and a queued alert takes
  // over the open shape without the surface collapsing or hiding in between.
  await p.evaluate(()=>{queue.push({id:'keys',title:'Mira',body:'x',avatar:{shape:'round',color:'#2475ff'},reduced_motion:false},{id:'next',title:'Juno',body:'x',avatar:{shape:'round',color:'#ff9638'},reduced_motion:false});changed();});
  await p.waitForFunction(()=>calls.some(c=>c.action==='present'&&c.id==='keys'));
  await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(()=>document.activeElement.id),'alert');
  await p.waitForFunction(()=>calls.some(c=>c.action==='hold'&&c.id==='keys'));
  assert.notEqual(await p.locator('#open').evaluate(n=>getComputedStyle(n).boxShadow),'none','Keyboard focus draws a ring inside the silhouette');
  await p.evaluate(()=>{window.hiddenDuringHandoff=false;new MutationObserver(()=>{if(document.querySelector('#alert').hidden)hiddenDuringHandoff=true;}).observe(document.querySelector('#alert'),{attributes:true,attributeFilter:['hidden']});});
  await p.keyboard.press('Escape');
  await p.waitForFunction(()=>calls.some(c=>c.action==='present'&&c.id==='next'));
  assert(await p.evaluate(()=>calls.some(c=>c.action==='dismiss'&&c.id==='keys')));
  assert.equal(await p.evaluate(()=>hiddenDuringHandoff),false,'Queued handoff keeps the surface open');
  await p.waitForFunction(()=>document.querySelector('#title').textContent==='Juno'&&getComputedStyle(document.querySelector('#open')).opacity==='1');
  await p.locator('#alert').focus();await p.keyboard.press('Enter');
  await p.waitForFunction(()=>calls.some(c=>c.action==='open'&&c.id==='next'));
  await p.locator('#alert').waitFor({state:'hidden'});
  await p.evaluate(()=>{queue.push({id:'open-me',title:'Rowan',body:'Your task is complete.',avatar:{shape:'round',color:'#2ec767'},reduced_motion:false});changed();});
  await p.waitForFunction(()=>calls.some(c=>c.action==='present'&&c.id==='open-me'));
  await p.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await p.locator('#alert').evaluate(n=>n.tagName),'BUTTON');
  await p.locator('.notch-card').click({position:{x:2,y:2}});
  await p.waitForFunction(()=>calls.some(c=>c.action==='open'&&c.id==='open-me'));
  assert.deepEqual(errors,[]);await context.close();
  for(const platform of ['macos','windows','linux']){
   const c=await browser.newContext({viewport:{width:1250,height:900}}),page=await c.newPage();
   await c.addInitScript(({platform,token})=>{
    sessionStorage.setItem('kindred-token',token);window.__KINDRED_DESKTOP={platform};window.calls=[];
    window.__TAURI__={core:{invoke:async(command,args)=>{calls.push({command,args});if(command==='notification_status')return{enabled:true,notch:{supported:platform==='macos',enabled:false}};return null;}}};
   },{platform,token});
   await page.goto(origin);await page.locator('#settings-button').click();
   if(platform==='macos'){
    const toggle=page.getByRole('switch',{name:'Notch notifications',exact:true});await toggle.waitFor();await toggle.click();
    assert(await page.evaluate(()=>calls.some(c=>c.command==='set_notch_notifications'&&c.args.enabled===true)));
    await page.getByRole('button',{name:'Test notification',exact:true}).click();assert(await page.getByText('Notch test sent.',{exact:false}).isVisible());
   }else {await page.getByRole('button',{name:'Test notification',exact:true}).waitFor();assert.equal(await page.getByText('Notch notifications',{exact:true}).count(),0);}
   await c.close();
  }
  console.log(engine+': hover hold, silhouette swell, keyboard hold/escape/enter, queued handoff, announcement, dissolve-only reduced motion, resumed expiry, no close button, notch rendering, safe text, open/dismiss, motion, external display layout and three-platform settings passed');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

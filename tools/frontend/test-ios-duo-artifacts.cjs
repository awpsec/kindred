const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit,chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID,snapshot}=require('./fixtures/duo.cjs');
const resources=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-duo-artifacts';
const baseline=!!process.env.KINDRED_TEST_BASELINE;
function pdf(count){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${Array.from({length:count},(_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${count} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(let i=0;i<count;i++){
  const landscape=i===12,stream=`BT /F1 24 Tf 50 ${landscape?520:710} Td (Review document - page ${i+1}) Tj ET`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${landscape?'792 612':'612 792'}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 }
 let text='%PDF-1.4\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(text.length);text+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const start=text.length;
 text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(text);
}

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.CHROMIUM?chromium:webkit).launch();fs.mkdirSync(out,{recursive:true});
 try{
 const p=await browser.newPage({viewport:{width:867,height:645},hasTouch:true});p.setDefaultTimeout(10000);const errors=[];p.on('pageerror',e=>errors.push(e.stack||e.message));
 await p.addInitScript(({token,profileID,css,js})=>{
  if(window.top!==window)return; // Native user scripts apply to the main frame only.
  window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';window.__KINDRED_MOBILE_PROFILE=profileID;window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;
  window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:0,leftInset:0,rightInset:84,isSlab:false,isDuo:true,isDuoInner:true,usesNativeRail:true,railSide:'right',isPortrait:false,viewportHeight:645};
  window.__KINDRED_NATIVE_GEOMETRY={width:867,height:645,windowWidth:945,windowHeight:685,reservedRegions:[]};
  window.accountRequests=[];window.webkit={messageHandlers:{kindredAccounts:{postMessage:v=>accountRequests.push(v)},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
  sessionStorage.setItem('kindred-token',token);
  document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);(0,eval)(js);},{once:true});
 },{token,profileID,css:fs.readFileSync(path.join(resources,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(resources,'MobileLayout.js'),'utf8')});
 const example={id:'duo-document',title:'Weekly project review',language:'markdown',source:'# Weekly project review',state:{},revision:1,updated:1791302400,created:1791302400,type:'document'};
 const app={...example,id:'duo-app',title:'Project checklist',language:'html',type:'app',source:'<!doctype html><html><body style="font:16px system-ui;padding:24px"><h1>Project checklist</h1><p>A sample interactive artifact.</p><button id="counter" onclick="this.textContent=String(Number(this.textContent)+1)">0</button><div style="height:1000px"></div><p>End of checklist</p></body></html>'};
 const items=[example,app,...Array.from({length:12},(_,i)=>({...example,id:'duo-doc-'+i,title:'Project notes '+(i+1),updated:example.updated-i-1}))];
 await p.route('**/api/workspace-artifacts**',async r=>{const parts=new URL(r.request().url()).pathname.split('/').filter(Boolean);if(r.request().method()!=='GET')throw Error('Unexpected artifact mutation');
  if(parts[3]==='preview')return r.fulfill({body:pdf(4),contentType:'application/pdf'});
  if(parts[3]==='file')return r.fulfill({body:fs.readFileSync(path.join(__dirname,'fixtures/document-originals/original-v1.docx')),contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  return r.fulfill({json:parts.length===2?items:items.find(i=>i.id===parts[2])});
 });
 const action=name=>p.evaluate(name=>__kindredDuoActions.perform(name),name);
 const settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
 const relay=async({width=867,height=645,inner=true,duo=true,side='right',edge=84,regions=[],scale=1,top=0,bottom=0})=>{
  await p.setViewportSize({width,height});await p.evaluate(v=>{const {width,height,inner,duo,side,edge,regions,scale,top,bottom}=v;document.documentElement.style.setProperty('--text-scale',String(scale));document.documentElement.dataset.motion='off';
   __KINDRED_IOS_LAYOUT={topInset:top,bottomInset:bottom,leftInset:side==='left'?edge:0,rightInset:side==='right'?edge:0,isSlab:!inner,isDuo:duo,isDuoInner:inner,usesNativeRail:duo,railSide:side,isPortrait:height>=width,viewportHeight:height};
   __KINDRED_NATIVE_GEOMETRY={width,height,windowWidth:inner?Math.max(width,945):width,windowHeight:height,reservedRegions:regions};dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-native-geometry'));
  },{width,height,inner,duo,side,edge,regions,scale,top,bottom});await settle();
 };
 const geometry=()=>p.evaluate(()=>{const root=document.querySelector('.artifact-studio'),rect=selector=>{const n=document.querySelector(selector),r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,visible:!!n.getClientRects().length,inert:n.inert};};return {layout:root.dataset.iosArtifactLayout,view:root.dataset.iosArtifactView,library:rect('.artifact-studio-library'),document:rect('.artifact-workbench'),scroll:document.documentElement.scrollWidth,route:location.pathname};});
 await p.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-vivienne');await p.locator('#prompt').waitFor();await p.waitForFunction(()=>window.__kindredDuoActions);await action('artifacts');await p.locator('[data-artifact-id="duo-document"]').waitFor({state:'visible'});await settle();
 await p.screenshot({path:path.join(out,'inner-library.png')});
 await p.locator('[data-artifact-id="duo-document"]').click();await p.locator('.artifact-title-input').waitFor();await p.locator('.document-pdf-page[data-page="1"] canvas').waitFor();await settle();
 await p.screenshot({path:path.join(out,'inner-document.png')});fs.writeFileSync(path.join(out,'controls.json'),JSON.stringify(await p.locator('.artifact-library-filters select').evaluateAll(ns=>ns.map(n=>({html:n.outerHTML,value:n.value,color:getComputedStyle(n).color,display:getComputedStyle(n).display,rect:n.getBoundingClientRect().toJSON()}))),null,2));
 if(baseline){fs.writeFileSync(path.join(out,'geometry.json'),JSON.stringify(await geometry(),null,2));return;}
 let g=await geometry();assert.equal(g.layout,'split');assert(g.library.visible&&g.document.visible&&!g.library.inert&&!g.document.inert);assert(g.library.x+g.library.width<=g.document.x+1);assert(g.document.x+g.document.width<=783.1,'preview clears measured right rail');
 await relay({});
 const resize=p.getByRole('separator',{name:'Resize artifact list'});
 const drag=async delta=>{const r=await resize.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2+delta,r.y+r.height/2,{steps:8});await p.mouse.up();await settle();};
 await drag(-180);g=await geometry();assert.equal(Math.round(g.library.width),76,'artifact list collapses to an icon rail');assert.equal(await p.locator('.artifact-studio').getAttribute('data-ios-artifact-compact'),'true');
 await drag(1200);g=await geometry();assert(g.library.width<=867/4+1,'artifact list uses the chat pane width limit');
 const savedWidth=g.library.width;await resize.focus();await resize.press('ArrowLeft');g=await geometry();assert.equal(g.library.width,Math.max(76,savedWidth-16),'keyboard resizing follows the same bounds');
 const beforeCancel=g.library.width,r=await resize.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2-70,r.y+r.height/2);await p.keyboard.press('Escape');await p.mouse.up();await settle();assert.equal((await geometry()).library.width,beforeCancel,'cancel restores the prior width');assert.equal(await p.locator('.pane-resize-shield').count(),0);
 await action('chats');await settle();g=await geometry();assert(g.library.inert&&g.document.width>=780,'hide artifact list expands the retained document');
 let navigation=await p.evaluate(()=>accountRequests.filter(v=>v.action==='duo-navigation').at(-1));assert(navigation.listToggleAvailable&&!navigation.listVisible&&!navigation.artifactLibraryVisible);
 await action('chats');await settle();assert.equal((await geometry()).library.width,beforeCancel,'show restores the user width');
 const transition=await p.evaluate(async()=>{
  const root=document.querySelector('.artifact-studio'),library=root.querySelector('.artifact-studio-library'),pane=root.querySelector('.artifact-workbench');
  document.documentElement.dataset.motion='on';const before=pane.getBoundingClientRect();await __kindredDuoActions.perform('chats');await new Promise(requestAnimationFrame);
  const effects=[...library.getAnimations(),...pane.getAnimations()].filter(a=>a.effect.getKeyframes().some(k=>k.width!==undefined||k.left!==undefined));
  for(const effect of effects){effect.pause();effect.currentTime=140;}
  const middle=pane.getBoundingClientRect();for(const effect of effects)effect.finish();await new Promise(r=>setTimeout(r,30));const after=pane.getBoundingClientRect();
  return {count:effects.length,before:before.width,middle:middle.width,after:after.width};
 });assert(transition.count>=2&&transition.middle>transition.before&&transition.middle<transition.after,'artifact sidebar and document interpolate their widths');
 await p.evaluate(()=>document.documentElement.dataset.motion='off');await action('chats');await settle();
 const documentNode=await p.locator('.artifact-studio-preview').evaluate(n=>{n.dataset.retentionProbe='kept';return true;});assert(documentNode);
 const originalLoads=snapshot().loads;await p.getByRole('button',{name:'Show 9 more',exact:true}).click();await p.locator('.artifact-studio-library-list').evaluate(e=>e.scrollTop=100);const originalListScroll=await p.locator('.artifact-studio-library-list').evaluate(e=>e.scrollTop);assert(originalListScroll>0);
 for(const side of ['left','right']){
  await relay({side});g=await geometry();assert.equal(g.layout,'split');assert(g.library.x>=(side==='left'?84:0));assert(g.document.x+g.document.width<=867-(side==='right'?84:0)+1);assert(g.scroll<=867);assert.equal(await p.locator('.artifact-studio-library-list').evaluate(e=>e.scrollTop),originalListScroll,'moving the rail retains library scroll');
 }
 await action('search');await p.locator('.artifact-studio-library-search').focus(); await relay({width:466,height:678,inner:false});g=await geometry();assert.equal(g.layout,'single');assert(!g.library.visible&&g.document.visible);assert(await p.locator('.artifact-workbench').evaluate(e=>e===document.activeElement),'focus moves out of hidden library');assert(g.document.x+g.document.width<=382.1);navigation=await p.evaluate(()=>accountRequests.filter(v=>v.action==='duo-navigation').at(-1));assert(!navigation.listToggleAvailable&&!navigation.listVisible,'closed document uses the list button instead of a pane toggle');await p.screenshot({path:path.join(out,'outer-document.png')});
 await action('back');await p.waitForURL('**/artifacts');g=await geometry();assert(g.library.visible&&!g.document.visible);
 await p.locator('[data-artifact-id="duo-document"]').click();await p.waitForURL('**/artifacts/duo-document');
 await relay({regions:[{kind:'division',active:true,x:400,y:0,width:40,height:645}]});g=await geometry();assert.equal(g.layout,'split');assert(g.library.x+g.library.width<=400);assert(g.document.x>=440);await p.screenshot({path:path.join(out,'book-document.png')});
 await relay({regions:[{kind:'division',active:true,x:400,y:0,width:40,height:645},{kind:'division',active:true,x:0,y:300,width:867,height:40}]});g=await geometry();for(const pane of [g.library,g.document])assert(pane.y+pane.height<=300||pane.y>=340,'both active folds are reserved');
 await relay({width:867,height:900,regions:[{kind:'division',active:true,x:0,y:400,width:867,height:40}]});g=await geometry();assert.equal(g.layout,'stacked');assert(g.document.y+g.document.height<=400);assert(g.library.y>=440);await p.screenshot({path:path.join(out,'tabletop-document.png')});
 await relay({width:867,height:350,regions:[{kind:'division',active:true,x:0,y:400,width:867,height:40}]});g=await geometry();assert(g.document.height>150&&g.document.y+g.document.height<=350);assert(g.scroll<=867);
 await relay({scale:1.5});g=await geometry();assert.equal(g.layout,'single','larger text prioritizes readable preview');assert(g.document.width>=700);
 await relay({regions:[{kind:'occlusion',active:true,x:700,y:0,width:167,height:80}]});g=await geometry();assert(g.document.y>=80||g.document.x+g.document.width<=700,'preview controls clear camera region');
 await relay({});await p.waitForFunction(()=>document.querySelector('.artifact-studio').dataset.iosArtifactLayout==='split');
 assert.equal((await geometry()).library.width,beforeCancel,'closed and open poses retain the resized list');
 assert.equal(await p.locator('.artifact-studio-preview').getAttribute('data-retention-probe'),'kept','folding retains preview DOM');assert.equal(snapshot().loads,originalLoads,'folding does not reload the app');
 if(await p.locator('.artifact-studio-library-search').isHidden())await action('search');await p.locator('.artifact-studio-library-search').fill('missing artifact');await p.locator('[data-artifact-id="duo-document"]').waitFor({state:'hidden'});await p.locator('.artifact-studio-library-search').fill('');await p.locator('[data-artifact-id="duo-document"]').waitFor({state:'visible'});
 await action('newChat');const menu=await p.evaluate(()=>accountRequests.filter(v=>v.action==='native-menu').at(-1));assert(menu&&menu.items.some(i=>i.title==='New doc'),'native Add remains available with preview open');
 // A toolbar measurement arriving independently updates only the affected pane.
 await p.evaluate(()=>{__KINDRED_IOS_TOOLBAR={x:700,y:0,width:167,height:240};dispatchEvent(new Event('kindred-ios-toolbar'));});await settle();g=await geometry();assert(g.document.x+g.document.width<=700||g.document.y>=240);await p.evaluate(()=>{delete __KINDRED_IOS_TOOLBAR;dispatchEvent(new Event('kindred-ios-toolbar'));});await settle();
 assert(await p.evaluate(()=>accountRequests.filter(v=>v.action==='duo-navigation').at(-1).artifactLibraryVisible),'native toolbar exposes artifact controls in split document view');
 // Keep a live app iframe and its state through closing/opening and rotation.
 await p.locator('[data-artifact-id="duo-app"]').click();const frame=p.frameLocator('.artifact-studio-preview iframe.artifact-frame');await frame.locator('#counter').waitFor();await frame.locator('#counter').click();assert.equal(await frame.locator('#counter').textContent(),'1');
 await relay({width:466,height:678,inner:false});await relay({side:'left'});assert.equal(await frame.locator('#counter').textContent(),'1');assert.equal(snapshot().loads,originalLoads);
 await p.screenshot({path:path.join(out,'inner-app.png')});
 await p.locator('[data-artifact-id="duo-document"]').click();await p.locator('.document-pdf-page[data-page="1"] canvas').waitFor();
 // Ordinary iPhone uses the same single-page navigation with its HTML controls.
 await relay({width:390,height:700,inner:false,duo:false,side:'none',edge:0,top:24,bottom:20});g=await geometry();assert.equal(g.layout,'single');assert(g.document.visible&&!g.library.visible);await p.getByRole('button',{name:'Back to artifacts',exact:true}).click();await p.locator('[data-artifact-id="duo-document"]').waitFor({state:'visible'});await p.screenshot({path:path.join(out,'phone-library.png')});
 await p.locator('.ios-artifact-navigation .ios-artifact-more').click();await p.waitForFunction(()=>accountRequests.some(v=>v.action==='native-menu'&&v.items.some(i=>i.title==='Chats')));
 const options=await p.evaluate(()=>accountRequests.filter(v=>v.action==='native-menu').at(-1));assert(options.items.some(i=>i.title==='Settings')&&options.items.some(i=>i.title==='Manage accounts'));assert(!options.items.some(i=>i.title==='Artifacts'));
 await p.evaluate(id=>__kindredNativeMenus.perform(id),options.items.find(i=>i.title==='Chats').id);await p.locator('.artifact-studio').waitFor({state:'detached'});
 assert.deepEqual(errors,[]);assert.equal(snapshot().events.filter(e=>['artifact-create','artifact-edit','send'].includes(e.type)).length,0);console.log(JSON.stringify({passed:true,engine:process.env.CHROMIUM?'chromium':'webkit',cases:['inner split','both rail sides','outer','book','multiple folds','tabletop','keyboard','larger text','occlusion','retained preview and app state','library scroll','focus transfer','toolbar measurement','search and add','phone'],errors}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

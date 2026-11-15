const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit,chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID,snapshot}=require('./fixtures/duo.cjs');
const resources=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-duo-artifacts';
const baseline=!!process.env.KINDRED_TEST_BASELINE;
const nativeDock=process.env.KINDRED_ARTIFACT_NATIVE_DOCK==='1';
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
 await p.addInitScript(({token,profileID,css,js,nativeDock})=>{
  if(nativeDock)window.__KINDRED_IOS_DUO_ARTIFACT_CONTROLS=1;
  if(window.top!==window)return; // Native user scripts apply to the main frame only.
  window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';window.__KINDRED_MOBILE_PROFILE=profileID;window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;window.__KINDRED_NATIVE_GLASS=true;
  window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:0,leftInset:0,rightInset:84,isSlab:false,isDuo:true,isDuoInner:true,usesNativeRail:true,railSide:'right',isPortrait:false,viewportHeight:645};
  window.__KINDRED_NATIVE_GEOMETRY={width:867,height:645,windowWidth:945,windowHeight:685,reservedRegions:[]};
  window.accountRequests=[];window.webkit={messageHandlers:{kindredAccounts:{postMessage:v=>accountRequests.push(v)},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
  sessionStorage.setItem('kindred-token',token);
  document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);(0,eval)(js);},{once:true});
 },{token,profileID,nativeDock,css:fs.readFileSync(path.join(resources,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(resources,'MobileLayout.js'),'utf8')});
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
 if(nativeDock){
  const read=()=>p.evaluate(()=>accountRequests.filter(v=>v.action==='duo-navigation').at(-1)?.artifactControls);
  const perform=(command,model)=>p.evaluate(({command,model})=>__kindredDuoArtifacts.perform({root:model.root,owner:model.owner,...command}),{command,model});
  const first=await read();assert(first&&first.zoom&&first.actions.some(a=>a.id==='refresh')&&first.filters.length===2);
  assert(await p.locator('.ios-document-zoom-trigger').isVisible(),'web fallback remains until native dock acknowledges ownership');
  assert.equal(await p.evaluate(root=>__kindredDuoArtifacts.ack(root),'stale-root'),false);
  assert.equal(await p.evaluate(root=>__kindredDuoArtifacts.ack(root),first.root),true);await settle();
  assert(await p.locator('.ios-document-zoom-trigger').isHidden());assert(await p.locator('.ios-artifact-document-actions').isHidden());assert(await p.locator('.artifact-library-filters').isHidden());
  const zoomAction=async title=>{
   const model=await read(),option=model.zoomOptions.find(option=>option.label===title);assert(option&&option.enabled);
   assert(await perform({action:'zoom',value:option.id},model));
   await p.waitForFunction(title=>document.querySelector('.ios-document-zoom-menu button[aria-pressed=true]')?.textContent===title,title);
   assert.equal(await p.locator('.ios-document-zoom-menu').evaluate(n=>n.matches(':popover-open')),false,'native dock zoom never opens a hidden web popover');
  };
  await zoomAction('Fit width');await zoomAction('Fit page');
  assert.equal(await perform({action:'refresh'},{...first,root:'stale'}),false);
  assert.equal(await perform({action:'refresh'},{...first,owner:'stale'}),false);
  const refresh=p.locator('.artifact-workbench-actions button[aria-label="Refresh document"]');
  await refresh.evaluate(n=>n.disabled=true);await settle();assert.equal((await read()).actions.find(a=>a.id==='refresh').enabled,false);assert.equal(await perform({action:'refresh'},await read()),false);
  await refresh.evaluate(n=>n.disabled=false);await settle();
  const old=await p.locator('.ios-document-zoom-menu').elementHandle();assert(await perform({action:'refresh'},await read()));
  await p.waitForFunction(n=>!n.isConnected,old);await p.locator('.document-pdf-page canvas').first().waitFor();await p.waitForFunction(()=>/%$/.test(document.querySelector('.ios-document-zoom-trigger')?.textContent||''));
  await zoomAction('Fit page');
  const level=()=>p.locator('.ios-document-zoom-trigger').textContent().then(v=>Number(v.replace('%','')));
  // In the narrow split pane Fit page can already equal Fit width. Begin at
  // a distinct manual zoom so this assertion actually exercises a transition.
  const fitPageLevel=await level();
  assert(await perform({action:'zoom',value:'out'},await read()));
  await p.waitForFunction(before=>parseFloat(document.querySelector('.ios-document-zoom-trigger').textContent)<before,fitPageLevel);
  await settle();
  const fitted=await level();await p.locator('.document-pdf-page canvas').first().waitFor();
  const animated=await p.evaluate(async()=>{
   document.documentElement.dataset.motion='on';const surface=document.querySelector('.document-pdf'),r=surface.getBoundingClientRect(),canvas=surface.querySelector('canvas');
   surface.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+140}));
   await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   return {moving:surface.hasAttribute('data-document-pinching'),retained:canvas.isConnected,scale:visualViewport.scale};
  });
  assert(animated.moving&&animated.retained,'double-tap animates retained document pixels');assert.equal(animated.scale,1);
  await p.waitForFunction(()=>!document.querySelector('.document-pdf').hasAttribute('data-document-pinching'));
  assert(await level()>fitted,'double-tap fits the width');
  assert.equal(await p.locator('.ios-document-zoom-menu button[aria-pressed=true]').textContent(),'Fit width');
  await p.locator('.document-pdf').dblclick({position:{x:200,y:140}});
  await p.waitForFunction(()=>!document.querySelector('.document-pdf').hasAttribute('data-document-pinching'));
  assert(Math.abs(await level()-fitted)<=1,'second double-tap restores the previous manual zoom');
  const reduced=await p.evaluate(async()=>{
   document.documentElement.dataset.motion='off';const surface=document.querySelector('.document-pdf'),r=surface.getBoundingClientRect();
   surface.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+140}));await new Promise(requestAnimationFrame);
   return {moving:surface.hasAttribute('data-document-pinching'),level:parseFloat(document.querySelector('.ios-document-zoom-trigger').textContent),scale:visualViewport.scale};
  });
  assert(!reduced.moving&&reduced.level>fitted,'Reduce motion settles double-tap in one frame');assert.equal(reduced.scale,1);
  await zoomAction('Fit page');
  const beforeSwitch=await read();
  await p.locator('[data-artifact-id="duo-doc-0"]').click();await p.locator('.document-pdf-page canvas').first().waitFor();await settle();
  assert.notEqual((await read()).owner,beforeSwitch.owner,'switching documents invalidates delayed dock actions');assert.equal(await perform({action:'refresh'},beforeSwitch),false);
  assert(await perform({action:'filter',filter:'type',value:'document'},await read()));assert.equal(await p.locator('select[aria-label="Artifact type"]').inputValue(),'document');
  assert.equal(await perform({action:'filter',filter:'sort',value:'unrecognized'},await read()),false);
  assert(await perform({action:'filter',filter:'sort',value:'name'},await read()));assert.equal(await p.locator('select[aria-label="Sort artifacts"]').inputValue(),'name');
  assert(await perform({action:'filter',filter:'type',value:''},await read()),'All types uses the empty string value');
  await p.locator('.artifact-studio-preview').evaluate(n=>n.dataset.nativeDockRetention='kept');
  const poses=[['open-landscape',{}],['open-portrait',{width:669,height:951,side:'right',edge:84}],['cover',{width:466,height:678,inner:false}],['cover-rotated',{width:678,height:466,inner:false}],['book',{regions:[{kind:'division',active:true,x:400,y:0,width:40,height:645}]}],['tabletop',{width:867,height:900,regions:[{kind:'division',active:true,x:0,y:400,width:867,height:40}]}],['large-text',{scale:1.5}]];
  for(const [name,pose]of poses){await relay(pose);const g=await geometry();assert(g.scroll<=Math.max(pose.width||867,867),'no document-wide horizontal overflow');assert(await p.locator('.ios-document-zoom-trigger').isHidden());assert.equal(await p.locator('.artifact-studio-preview').getAttribute('data-native-dock-retention'),'kept');await zoomAction('Fit width');await p.screenshot({path:path.join(out,'native-dock-'+name+'.png')});}
  await relay({});await action('chats');await settle();assert.equal(await perform({action:'filter',filter:'type',value:'app'},await read()),false,'hidden library cannot receive stale filter selections');await action('chats');await settle();
  await relay({width:390,height:700,inner:false,duo:false,side:'none',edge:0,top:24,bottom:20});
  assert(await p.locator('.ios-document-zoom-trigger').isVisible(),'iPhone retains its compact header control');assert(await p.locator('.ios-artifact-document-actions').isVisible());
  assert.equal(await perform({action:'refresh'},await read()),false,'Duo-only commands stop when the native rail is unavailable');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,nativeDock:true,cases:['acknowledged ownership','native zoom menu and fit','refresh after fit','disabled refresh','stale document and root','filter and sort','all Duo poses','retained preview','iPhone fallback'],errors}));return;
 }
 const zoom=p.locator('.ios-document-zoom-trigger');
 for(const [theme,surround] of [['dark','rgb(17, 17, 17)'],['light','rgb(233, 235, 239)']]){
  const colors=await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;const view=document.querySelector('.document-pdf'),paper=view.querySelector('.document-pdf-page'),canvas=paper.querySelector('canvas');return {surround:getComputedStyle(view).backgroundColor,paper:getComputedStyle(paper).backgroundColor,filter:getComputedStyle(view).filter,pageFilter:getComputedStyle(canvas).filter};},theme);
  assert.equal(colors.surround,surround,'document surround follows '+theme+' mode');assert.equal(colors.paper,'rgb(255, 255, 255)','theme never changes the original PDF paper');assert.equal(colors.filter,'none');assert.equal(colors.pageFilter,'none');
 }
 await p.evaluate(()=>document.documentElement.dataset.theme='dark');
 await p.waitForFunction(()=>{const trigger=document.querySelector('.ios-document-zoom-trigger'),control=accountRequests.filter(v=>v.action==='glass-controls').at(-1)?.controls.find(c=>c.id==='artifact-zoom');return /%$/.test(trigger?.textContent||'')&&control?.title===trigger.textContent;});
 const zoomPlacement=await p.evaluate(()=>{const r=n=>{const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,height:b.height};};return {header:r(document.querySelector('.artifact-workbench-header')),trigger:r(document.querySelector('.ios-document-zoom-trigger')),body:r(document.querySelector('.document-body')),pages:r(document.querySelector('.document-pdf-continuous')),menu:getComputedStyle(document.querySelector('.ios-document-zoom-menu')).display};});
 assert(zoomPlacement.trigger.top>=zoomPlacement.header.top&&zoomPlacement.trigger.bottom<=zoomPlacement.header.bottom,'zoom belongs to the document header');assert(zoomPlacement.header.height<=80&&zoomPlacement.pages.top<=zoomPlacement.body.top+1,'no separate toolbar row takes document height');assert.equal(zoomPlacement.menu,'none');
 const nativeControls=await p.evaluate(()=>accountRequests.filter(v=>v.action==='glass-controls').at(-1).controls);assert(nativeControls.some(c=>c.id==='artifact-document-more'&&c.symbol==='ellipsis'));
 const zoomAction=async title=>{const count=await p.evaluate(()=>accountRequests.length);await zoom.click();await p.waitForFunction(count=>accountRequests.slice(count).some(v=>v.action==='native-menu'&&v.title.startsWith('Document zoom')),count);const model=await p.evaluate(()=>accountRequests.filter(v=>v.action==='native-menu').at(-1));assert.deepEqual(model.items.map(i=>i.title),['Zoom out','Zoom in','Fit page','Fit width']);await p.evaluate(id=>__kindredNativeMenus.perform(id),model.items.find(i=>i.title===title).id);};
 const initialZoom=Number((await zoom.textContent()).replace('%',''));await zoomAction('Zoom in');await p.waitForFunction(before=>Number(document.querySelector('.ios-document-zoom-trigger').textContent.replace('%',''))>before,initialZoom);
 await zoomAction('Fit width');await p.waitForFunction(()=>document.querySelector('.ios-document-zoom-menu button[aria-pressed=true]')?.textContent==='Fit width');

  await zoomAction('Fit page');await settle();
  const level=()=>p.locator('.ios-document-zoom-trigger').textContent().then(v=>Number(v.replace('%','')));
  const fitted=await level();await p.locator('.document-pdf-page canvas').first().waitFor();
  const animated=await p.evaluate(async()=>{
   document.documentElement.dataset.motion='on';const surface=document.querySelector('.document-pdf'),r=surface.getBoundingClientRect(),canvas=surface.querySelector('canvas');
   surface.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+140}));
   await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   return {moving:surface.hasAttribute('data-document-pinching'),retained:canvas.isConnected,scale:visualViewport.scale};
  });
  assert(animated.moving&&animated.retained,'double-tap animates retained document pixels');assert.equal(animated.scale,1);
  await p.waitForFunction(()=>!document.querySelector('.document-pdf').hasAttribute('data-document-pinching'));
  assert(await level()>fitted,'double-tap fits the width');
  assert.equal(await p.locator('.ios-document-zoom-menu button[aria-pressed=true]').textContent(),'Fit width');
  await p.locator('.document-pdf').dblclick({position:{x:200,y:140}});
  await p.waitForFunction(()=>!document.querySelector('.document-pdf').hasAttribute('data-document-pinching'));
  assert(Math.abs(await level()-fitted)<=1,'second double-tap restores the previous fit');
  const reduced=await p.evaluate(async()=>{
   document.documentElement.dataset.motion='off';const surface=document.querySelector('.document-pdf'),r=surface.getBoundingClientRect();
   surface.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+140}));await new Promise(requestAnimationFrame);
   return {moving:surface.hasAttribute('data-document-pinching'),level:parseFloat(document.querySelector('.ios-document-zoom-trigger').textContent),scale:visualViewport.scale};
  });
  assert(!reduced.moving&&reduced.level>fitted,'Reduce motion settles double-tap in one frame');assert.equal(reduced.scale,1);
  await zoomAction('Fit width');

 await p.locator('.document-pdf-page canvas').first().waitFor();
 await p.evaluate(()=>{
  const surface=document.querySelector('.document-pdf-continuous'),r=surface.getBoundingClientRect();
  window.documentTouch=(type,distance)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:distance?[{clientX:r.left+r.width/2-distance/2,clientY:r.top+120},{clientX:r.left+r.width/2+distance/2,clientY:r.top+120}]:[]});surface.dispatchEvent(event);return event.defaultPrevented;};
  window.pinchStartLevel=Number(document.querySelector('.ios-document-zoom-trigger').textContent.replace('%',''));
  window.retainedPinchCanvas=surface.querySelector('canvas');
  documentTouch('touchstart',100);documentTouch('touchmove',150);
 });
 await p.waitForFunction(()=>Number(document.querySelector('.ios-document-zoom-trigger').textContent.replace('%',''))>pinchStartLevel*1.35);
 assert(await p.evaluate(()=>retainedPinchCanvas?.isConnected),'pinch keeps rendered pixels instead of blanking the document');
 assert(await p.evaluate(()=>{documentTouch('touchend',0);return retainedPinchCanvas.isConnected;}),'settling zoom retains old pixels until the sharp replacement is ready');
 await p.waitForFunction(()=>!document.querySelector('.document-pdf-continuous').hasAttribute('data-document-pinching'));
 await p.locator('.document-pdf-page canvas').first().waitFor();
 // A selected fit mode must settle rather than continually republishing zoom.
 await p.evaluate(()=>{window.zoomMutations=0;window.zoomWatch=new MutationObserver(records=>zoomMutations+=records.length);zoomWatch.observe(document.querySelector('.document-zoom-value'),{childList:true,subtree:true});});
 await p.waitForTimeout(500);assert(await p.evaluate(()=>zoomMutations)<4,'document zoom settles');
 await p.evaluate(()=>zoomWatch.disconnect());
 await zoomAction('Fit page');await p.waitForFunction(()=>document.querySelector('.ios-document-zoom-menu button[aria-pressed=true]')?.textContent==='Fit page');
 const previousZoom=await p.locator('.ios-document-zoom-menu').elementHandle();
 await p.locator('.ios-artifact-document-actions').click();
 await p.waitForFunction(()=>accountRequests.filter(v=>v.action==='native-menu').at(-1)?.title==='Document actions');
 const actions=await p.evaluate(()=>accountRequests.filter(v=>v.action==='native-menu').at(-1));
 await p.evaluate(id=>__kindredNativeMenus.perform(id),actions.items.find(i=>i.title==='Refresh document').id);
 // The previous canvas remains visible while Refresh is loading. Wait for the
 // replacement controller before starting fold/retention checks.
 await p.waitForFunction(n=>!n.isConnected,previousZoom);
 await p.waitForFunction(()=>document.querySelector('[aria-label="Refresh document"]')?.disabled===false);
 await p.locator('.document-pdf-page[data-page="1"] canvas').waitFor();await p.waitForFunction(()=>/%$/.test(document.querySelector('.ios-document-zoom-trigger')?.textContent||''));assert.equal(await zoom.count(),1,'refresh replaces the zoom controller without leaving a stale header control');assert.equal(await p.locator('.ios-document-zoom-menu').count(),1);
 await p.screenshot({path:path.join(out,'inner-document.png')});fs.writeFileSync(path.join(out,'controls.json'),JSON.stringify(await p.locator('.artifact-library-filters select').evaluateAll(ns=>ns.map(n=>({html:n.outerHTML,value:n.value,color:getComputedStyle(n).color,display:getComputedStyle(n).display,rect:n.getBoundingClientRect().toJSON()}))),null,2));
 if(baseline){fs.writeFileSync(path.join(out,'geometry.json'),JSON.stringify(await geometry(),null,2));return;}
 let g=await geometry();assert.equal(g.layout,'split');assert(g.library.visible&&g.document.visible&&!g.library.inert&&!g.document.inert);assert(g.library.x+g.library.width<=g.document.x+1);assert(g.document.x+g.document.width<=783.1,'preview clears measured right rail');
 await relay({});
 const resize=p.getByRole('separator',{name:'Resize artifact list'});
 const drag=async delta=>{const r=await resize.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2+delta,r.y+r.height/2,{steps:8});await p.mouse.up();await settle();};
 await drag(-180);g=await geometry();assert.equal(Math.round(g.library.width),76,'artifact list collapses to an icon rail');assert.equal(await p.locator('.artifact-studio').getAttribute('data-ios-artifact-compact'),'true');
 await action('search');await p.locator('.artifact-studio-library-search').waitFor({state:'visible'});assert((await geometry()).library.width>=128,'search expands a collapsed artifact rail');await action('search');
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
 await relay({width:669,height:951,side:'none',edge:0,top:64});g=await geometry();assert.equal(g.layout,'split','open portrait keeps a resizable list when the preview fits');assert(await resize.isVisible());assert(g.document.width>=320);
 await relay({});assert.equal((await geometry()).library.width,beforeCancel,'portrait clamping does not overwrite the preferred width');
 const documentNode=await p.locator('.artifact-studio-preview').evaluate(n=>{n.dataset.retentionProbe='kept';return true;});assert(documentNode);
 const originalLoads=snapshot().loads;await p.getByRole('button',{name:'Show 9 more',exact:true}).click();await p.locator('.artifact-studio-library-list').evaluate(e=>e.scrollTop=100);const originalListScroll=await p.locator('.artifact-studio-library-list').evaluate(e=>e.scrollTop);assert(originalListScroll>0);
 for(const side of ['left','right']){
  await relay({side});g=await geometry();assert.equal(g.layout,'split');assert(g.library.x>=(side==='left'?84:0));assert(g.document.x+g.document.width<=867-(side==='right'?84:0)+1);assert(g.scroll<=867);assert.equal(await p.locator('.artifact-studio-library-list').evaluate(e=>e.scrollTop),originalListScroll,'moving the rail retains library scroll');
 }
 await action('search');await p.locator('.artifact-studio-library-search').focus(); await relay({width:466,height:678,inner:false,bottom:34});g=await geometry();assert.equal(g.layout,'single');assert(!g.library.visible&&g.document.visible);assert.equal(g.document.y+g.document.height,678,'document paints through the bottom safe area');assert.equal(await p.locator('.artifact-workbench').evaluate(n=>getComputedStyle(n).paddingBottom),'0px','no extra black padding beneath the reading surface');assert(await p.locator('.artifact-workbench').evaluate(e=>e===document.activeElement),'focus moves out of hidden library');assert.equal(g.document.x,0);assert.equal(g.document.width,466,'cover document fills the screen beneath glass controls');assert((await p.locator('.artifact-workbench-header').boundingBox()).width<=382.1,'header controls still clear the rail');navigation=await p.evaluate(()=>accountRequests.filter(v=>v.action==='duo-navigation').at(-1));assert(!navigation.listToggleAvailable&&!navigation.listVisible,'closed document uses the list button instead of a pane toggle');assert((await p.locator('.artifact-workbench-header').boundingBox()).height<=80,'closed view keeps a single compact header row');await p.screenshot({path:path.join(out,'outer-document.png')});
 // A file opened from chat uses a modal, not the studio frame. Both fill the cover.
 await p.evaluate(async encoded=>{const {openDocumentPreview}=await import('/document-preview.js');await openDocumentPreview({name:'Cover workbook.xlsx',extension:'xlsx',card:document.body,getBlob:async()=>new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))]),download:()=>{}});},fs.readFileSync(path.join(__dirname,'fixtures/document-originals/styled-multi-sheet.xlsx')).toString('base64'));
 await p.locator('.document-dialog .document-grid').waitFor();await settle();
 const modal=await p.locator('.document-dialog').boundingBox(),modalHeader=await p.locator('.document-dialog .document-header').boundingBox();
 assert.equal(modal.x,0);assert.equal(modal.width,466);assert(modalHeader.x+modalHeader.width<=382.1,'modal controls remain reachable beside native rail');
 await p.screenshot({path:path.join(out,'outer-workbook.png')});
 await p.evaluate(()=>document.querySelector('.document-dialog').close());

 assert.equal(await p.locator('.artifact-studio-preview').getAttribute('data-retention-probe'),'kept','rail and cover changes retain preview DOM before navigation');
 await action('back');await p.waitForURL('**/artifacts');g=await geometry();assert(g.library.visible&&!g.document.visible);
 await p.locator('[data-artifact-id="duo-document"]').click();await p.waitForURL('**/artifacts/duo-document');
 // Returning through the library creates a new preview. Check folding against
 // that mounted document, not the intentionally closed navigation instance.
 await p.locator('.document-pdf-page canvas').first().waitFor();
 await p.locator('.artifact-studio-preview').evaluate(n=>n.dataset.retentionProbe='kept');
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
 await p.locator('[data-artifact-id="duo-app"]').click();const frame=p.frameLocator('.artifact-studio-preview iframe.artifact-frame');await frame.locator('#counter').waitFor();assert.equal(await zoom.count(),0,'app artifacts do not retain the previous document zoom control');await frame.locator('#counter').click();assert.equal(await frame.locator('#counter').textContent(),'1');
 await relay({width:466,height:678,inner:false});await relay({side:'left'});assert.equal(await frame.locator('#counter').textContent(),'1');assert.equal(snapshot().loads,originalLoads);
 await p.screenshot({path:path.join(out,'inner-app.png')});
 await p.locator('[data-artifact-id="duo-document"]').click();await p.locator('.document-pdf-page[data-page="1"] canvas').waitFor();
 // Ordinary iPhone uses the same single-page navigation with its HTML controls.
 await relay({width:390,height:700,inner:false,duo:false,side:'none',edge:0,top:24,bottom:20});g=await geometry();assert.equal(g.layout,'single');assert(g.document.visible&&!g.library.visible);assert((await p.locator('.artifact-workbench-header').boundingBox()).height<=100,'ordinary iPhone also fits zoom in the header row');await p.getByRole('button',{name:'Back to artifacts',exact:true}).click();await p.locator('[data-artifact-id="duo-document"]').waitFor({state:'visible'});await p.screenshot({path:path.join(out,'phone-library.png')});
 await p.locator('.ios-artifact-navigation .ios-artifact-more').click();await p.waitForFunction(()=>accountRequests.some(v=>v.action==='native-menu'&&v.items.some(i=>i.title==='Chats')));
 const options=await p.evaluate(()=>accountRequests.filter(v=>v.action==='native-menu').at(-1));assert(options.items.some(i=>i.title==='Settings')&&options.items.some(i=>i.title==='Manage accounts'));assert(!options.items.some(i=>i.title==='Artifacts'));
 await p.evaluate(id=>__kindredNativeMenus.perform(id),options.items.find(i=>i.title==='Chats').id);await p.locator('.artifact-studio').waitFor({state:'detached'});
 assert.deepEqual(errors,[]);assert.equal(snapshot().events.filter(e=>['artifact-create','artifact-edit','send'].includes(e.type)).length,0);console.log(JSON.stringify({passed:true,engine:process.env.CHROMIUM?'chromium':'webkit',cases:['inner split','both rail sides','outer','book','multiple folds','tabletop','keyboard','larger text','occlusion','retained preview and app state','library scroll','focus transfer','toolbar measurement','search and add','phone'],errors}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

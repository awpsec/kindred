// The native material replaces floating chrome without replacing page actions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const bundle=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch();
 try{
  for(const native of [true,false]){
   const page=await browser.newPage({viewport:{width:1000,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({token,profileID,native,css,js})=>{
    sessionStorage.setItem('kindred-token',token);Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true,__KINDRED_NATIVE_GLASS:native});
    window.__glassMessages=[];
    window.webkit={messageHandlers:{kindredAccounts:{postMessage:value=>{if(value.action==='glass-controls'){__glassMessages.push(value);queueMicrotask(()=>__kindredGlassControls?.setActive(value.document,value.controls.map(c=>c.id),value.sequence));}}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
    window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:24,leftInset:0,rightInset:84,railSide:'right',isDuo:true,isDuoInner:true,usesNativeRail:true,isPortrait:false,viewportHeight:720};
    window.__KINDRED_NATIVE_GEOMETRY={width:1000,height:720,windowWidth:1000,windowHeight:720,reservedRegions:[]};
    addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
   },{token,profileID,native,css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
   await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-piper');
   await page.locator('#content [data-message="71"]').waitFor({state:'attached'});
   if(!native){assert.equal(await page.evaluate(()=>__glassMessages.length),0);assert.equal(await page.locator('[data-ios-native-glass]').count(),0);await page.close();continue;}
   await page.waitForFunction(()=>document.querySelector('.bot-heading')?.hasAttribute('data-ios-native-glass'));
   await page.waitForFunction(()=>document.querySelector('.bot-heading').getAnimations().every(a=>a.playState!=='running'));
   const identity=await page.evaluate(()=>__glassMessages.at(-1).controls.find(c=>c.id==='identity'));
   assert.equal(identity.title,'Piper');assert.equal(identity.shape,'cloud');assert.equal(identity.color,'#2475ff');assert.equal(identity.label,'Piper details');assert(identity.rect[2]>44&&identity.rect[3]>=38,JSON.stringify(identity));
   const slots=await page.locator('.bot-heading').evaluate(node=>{const r=node.getBoundingClientRect(),t=node.querySelector('strong').getBoundingClientRect(),a=node.querySelector('.character').parentElement.getBoundingClientRect(),round=n=>Math.round(n*100)/100;return {titleRect:[t.x-r.x,t.y-r.y,t.width,t.height].map(round),avatarCenter:[a.x+a.width/2-r.x,a.y+a.height/2-r.y].map(round)};});
   assert.deepEqual(identity.titleRect,slots.titleRect,'native text receives the actual compact title slot');assert.deepEqual(identity.avatarCenter,slots.avatarCenter);
   assert.equal(await page.locator('.bot-heading').evaluate(n=>getComputedStyle(n).visibility),'visible','the retained nametag keeps its layout/morph geometry');
   assert.equal(await page.locator('#composer[data-ios-native-glass],.message-bubble[data-ios-native-glass],.bot-link[data-ios-native-glass]').count(),0,'editing and content are not lifted into glass chrome');
   assert.equal(await page.evaluate(()=>__glassMessages.at(-1).controls.some(c=>['accounts','search','new'].includes(c.id))),false,'Duo does not duplicate its native sidebar toolbar');
   await page.evaluate(()=>{const d=__glassMessages.at(-1).document;__kindredGlassControls.perform('identity','stale-document');});
   assert.equal(await page.locator('#computer-panel').evaluate(n=>n.hidden),true,'stale document actions cannot navigate');
   await page.evaluate(()=>__kindredGlassControls.perform('identity',__glassMessages.at(-1).document));
   await page.waitForFunction(()=>document.documentElement.dataset.iosBotCenter==='details'||document.querySelector('#details-panel')?.hidden===false);
   await page.waitForFunction(()=>!__glassMessages.at(-1).controls.some(c=>c.id==='identity'));
   assert.equal(await page.locator('.bot-heading').getAttribute('aria-hidden'),null,'inactive replacements restore the source accessibility state');
   await page.evaluate(()=>__kindredDuoActions.perform('back'));
   await page.waitForFunction(()=>__glassMessages.at(-1).controls.some(c=>c.id==='identity'));
   const staleAck=await page.evaluate(()=>{const p=__glassMessages.at(-1);return __kindredGlassControls.setActive(p.document,[],p.sequence-1);});
   assert.equal(staleAck,false,'an older geometry acknowledgement cannot reveal duplicate web chrome');
   const morphStart=await page.evaluate(()=>__glassMessages.length);
   await page.evaluate(()=>{__KINDRED_IOS_TOOLBAR={x:700,y:10,width:250,height:44,identity:{x:720,y:10,width:38,height:38}};Object.assign(__KINDRED_IOS_LAYOUT,{railSide:'none'});dispatchEvent(new Event('kindred-ios-toolbar'));dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
   await page.waitForFunction(()=>document.documentElement.dataset.iosToolbarIdentity==='true'&&!document.documentElement.hasAttribute('data-ios-identity-handoff'));
   const morph=await page.evaluate(start=>__glassMessages.slice(start).flatMap(p=>p.controls).filter(c=>c.id==='identity'&&!c.interactive),morphStart);
   assert(morph.some(c=>c.rect[2]>40&&c.rect[2]<identity.rect[2]-2&&c.opacity>0&&c.opacity<1),'native glass follows intermediate nametag morph frames');
   await page.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{railSide:'right'});__KINDRED_IOS_TOOLBAR=null;dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-ios-toolbar'));});
   await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-ios-identity-handoff')&&__glassMessages.at(-1).controls.some(c=>c.id==='identity'&&c.interactive));
   await page.evaluate(()=>{__KINDRED_NATIVE_GEOMETRY.reservedRegions=[{active:true,kind:'division',x:480,y:0,width:40,height:720},{active:true,kind:'occlusion',x:916,y:0,width:84,height:120}];dispatchEvent(new Event('kindred-native-geometry'));});
   await page.waitForFunction(()=>{const n=document.querySelector('.bot-heading'),r=n.getBoundingClientRect();return getComputedStyle(n).position==='absolute'&&r.left>=520&&r.right<=916&&!n.getAnimations().some(a=>a.playState==='running');});
   const bookIdentity=await page.evaluate(()=>__glassMessages.at(-1).controls.find(c=>c.id==='identity'));
   assert(bookIdentity.rect[0]>=520&&bookIdentity.rect[0]+bookIdentity.rect[2]<=916,'glass identity stays on one leaf and clear of the status rail');
   await page.evaluate(()=>{__KINDRED_NATIVE_GEOMETRY.reservedRegions=[];dispatchEvent(new Event('kindred-native-geometry'));});
   // A sheet covers native chrome too; dismissal restores it without replacing
   // the retained composer or the current draft.
   await page.evaluate(()=>{const prompt=document.querySelector('#prompt');prompt.textContent='Kept draft';prompt.dispatchEvent(new Event('input',{bubbles:true}));const d=document.createElement('dialog');d.id='glass-test-modal';document.body.append(d);d.showModal();});
   await page.waitForFunction(()=>__glassMessages.at(-1).controls.length===0);
   await page.evaluate(()=>{document.querySelector('#glass-test-modal').close();document.querySelector('#glass-test-modal').remove();});
   await page.waitForFunction(()=>__glassMessages.at(-1).controls.some(c=>c.id==='identity'));
   assert.equal(await page.locator('#prompt').textContent(),'Kept draft');
   // Retained chat chrome is still in the DOM while Artifacts owns the screen.
   // It must not be lifted above either the library or the document viewer.
   const chatControls=['identity','latest','chats','computer','bot-settings'];
   await page.evaluate(()=>__kindredDuoActions.perform('artifacts'));
   await page.locator('[data-artifact-id="duo-document"]').waitFor({state:'visible'});
   await page.waitForFunction(ids=>!__glassMessages.at(-1).controls.some(c=>ids.includes(c.id)),chatControls);
   await page.locator('[data-artifact-id="duo-document"]').click();
   await page.waitForURL('**/artifacts/duo-document');
   await page.waitForFunction(ids=>!__glassMessages.at(-1).controls.some(c=>ids.includes(c.id)),chatControls);
   await page.evaluate(()=>__kindredDuoActions.perform('back'));await page.waitForURL('**/artifacts');
   await page.evaluate(()=>__kindredDuoActions.perform('back'));
   await page.waitForFunction(()=>__glassMessages.at(-1).controls.some(c=>c.id==='identity'));
   assert.equal(await page.locator('#prompt').textContent(),'Kept draft');
   // The same bridge supplies the visible sidebar controls on an ordinary
   // iPhone, where the Duo's native right rail is absent.
   await page.setViewportSize({width:430,height:780});
   await page.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{isDuo:false,isDuoInner:false,usesNativeRail:false,rightInset:0,railSide:'none',isPortrait:true,viewportHeight:780});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
   await page.waitForFunction(()=>__glassMessages.at(-1).controls.some(c=>c.id==='chats'));
   await page.evaluate(()=>__kindredGlassControls.perform('chats',__glassMessages.at(-1).document));
   await page.waitForFunction(()=>__glassMessages.at(-1).controls.some(c=>c.id==='search'));
   const ids=await page.evaluate(()=>__glassMessages.at(-1).controls.map(c=>c.id));for(const id of ['accounts','search','new'])assert(ids.includes(id),id+' has native sidebar glass');
   await page.evaluate(()=>document.querySelector('#artifacts-button').click());
   await page.waitForFunction(()=>__glassMessages.at(-1).controls.some(c=>c.id==='artifact-chats'));
   const artifactIDs=await page.evaluate(()=>__glassMessages.at(-1).controls.map(c=>c.id));
   for(const id of ['artifact-chats','artifact-search','artifact-new'])assert(artifactIDs.includes(id),id+' keeps its native glass');
   assert(!artifactIDs.some(id=>chatControls.includes(id)));
   await page.locator('[data-artifact-id="duo-document"]').click();await page.waitForURL('**/artifacts/duo-document');
   await page.waitForFunction(()=>__glassMessages.at(-1).controls.some(c=>c.id==='artifact-back'));
   assert.equal(await page.evaluate(()=>__glassMessages.at(-1).controls.some(c=>c.id==='identity')),false);
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log(JSON.stringify({passed:true,nativeNametag:true,sidebarButtons:true,retainedActions:true,modalClearance:true,legacyFallback:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

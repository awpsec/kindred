// Actual media renderer + native layout, synthetic local media only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit,chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-ios-media-previews';
const native=path.join(__dirname,'../../mobile/ios/KindredCompanion/Web');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.CHROMIUM?'chromium':'webkit',browser=await({webkit,chromium}[engine]).launch();fs.mkdirSync(out,{recursive:true});
 const p=await browser.newPage({viewport:{width:466,height:678},hasTouch:true,isMobile:true});p.setDefaultTimeout(12000);const errors=[],results=[];p.on('pageerror',e=>errors.push(e.message));
 try {
 await p.addInitScript(({token,profileID,css,js})=>{
  if(window!==top)return;sessionStorage.setItem('kindred-token',token);
  Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});
  __KINDRED_IOS_LAYOUT={topInset:0,bottomInset:0,leftInset:0,rightInset:84,isDuo:true,isDuoInner:false,isSlab:true,usesNativeRail:true,railSide:'right',viewportHeight:678};
  __KINDRED_NATIVE_GEOMETRY={width:466,height:678,reservedRegions:[]};
  window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
  const make=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.previewURLs=new Set();URL.createObjectURL=b=>{const u=make(b);previewURLs.add(u);return u};URL.revokeObjectURL=u=>{previewURLs.delete(u);revoke(u)};
  document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);(0,eval)(js);},{once:true});
 },{token,profileID,css:fs.readFileSync(path.join(native,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(native,'MobileLayout.js'),'utf8')});
 await p.route(origin+'/fixture.mp4',r=>r.fulfill({body:fs.readFileSync(path.join(__dirname,'fixtures/media/recording.mp4')),contentType:'video/mp4'}));
 await p.goto(origin+'/#kindred-chat=dm-vivienne');await p.locator('#prompt').waitFor();
 await p.evaluate(()=>{const b=document.createElement('button');b.id='preview-origin';b.textContent='Open video';document.body.append(b);});
 const relay=async({width,height,inner=false,duo=true,side='right',edge=84,regions=[],toolbar=null,top=0,bottom=0})=>{
  await p.setViewportSize({width,height});await p.evaluate(v=>{
   __KINDRED_IOS_LAYOUT={topInset:v.top,bottomInset:v.bottom,leftInset:v.side==='left'?v.edge:0,rightInset:v.side==='right'?v.edge:0,isDuo:v.duo,isDuoInner:v.inner,isSlab:!v.inner,usesNativeRail:v.duo,railSide:v.side,isPortrait:v.height>=v.width,viewportHeight:v.height};
   __KINDRED_NATIVE_GEOMETRY={width:v.width,height:v.height,reservedRegions:v.regions};__KINDRED_IOS_TOOLBAR=v.toolbar;
   dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-native-geometry'));dispatchEvent(new Event('kindred-ios-toolbar'));
  },{width,height,inner,duo,side,edge,regions,toolbar,top,bottom});await p.waitForTimeout(100);
 };
 const open=async()=>{await p.evaluate(async()=>{
  const {openChatMedia}=await import('/chat-media.js');window.previewDownloads=0;
  window.videoDialog=openChatMedia({name:'walkthrough.mp4',type:{video:true,mime:'video/mp4'},getBlob:()=>fetch('/fixture.mp4').then(r=>r.blob()),download:()=>{previewDownloads++},origin:document.querySelector('#preview-origin')});
 });await p.waitForFunction(()=>document.querySelector('.chat-media-dialog[data-ios-preview-fit] video')?.readyState>=2);};
 const check=async(label,v)=>{
  const g=await p.evaluate(()=>{const d=document.querySelector('.chat-media-dialog'),v=d.querySelector('video');return {dialog:d.getBoundingClientRect().toJSON(),video:v.getBoundingClientRect().toJSON(),header:getComputedStyle(d.querySelector('header')).clipPath,src:v.src,current:v.currentTime,controls:v.controls,autoplay:v.autoplay};});
  for(const r of [g.dialog,g.video]){assert(r.x>=((v.side||'right')==='left'?(v.edge??84):0)-1,label+' left');assert(r.right<=v.width-((v.side||'right')==='right'?(v.edge??84):0)+1,label+' right');assert(r.y>=(v.top||0)-1&&r.bottom<=v.height-(v.bottom||0)+1,label+' vertical '+JSON.stringify(g));for(const z of [...v.regions||[],...v.toolbar?[v.toolbar]:[]])assert(r.right<=z.x+1||r.x>=z.x+z.width-1||r.bottom<=z.y+1||r.y>=z.y+z.height-1,label+' native occlusion');}
  assert.equal(g.header,'inset(50%)');assert(g.controls&&!g.autoplay);results.push({label,...g});return g;
 };
 const poses=[
  {label:'closed-right',width:466,height:678},
  {label:'closed-left',width:466,height:678,side:'left'},
  {label:'closed-toolbar',width:466,height:678,edge:0,toolbar:{x:382,y:40,width:84,height:390}},
  {label:'inner',width:951,height:669,inner:true},
  {label:'inner-hinge',width:951,height:669,inner:true,regions:[{kind:'division',active:true,x:450,y:0,width:32,height:669}]},
  {label:'rotated',width:678,height:350},
  {label:'iphone',width:402,height:874,duo:false,edge:0,top:62,bottom:34}
 ];
 await open();const src=await p.locator('.chat-media-dialog video').getAttribute('src');await p.locator('.chat-media-dialog video').evaluate(v=>{v.currentTime=1;});
 for(const v of poses){await relay(v);const g=await check(v.label,v);assert.equal(g.src,src,'fold retains video');assert(g.current>=.9,'fold retains playback position');await p.screenshot({path:path.join(out,engine+'-'+v.label+'.png')});}
 await p.locator('.chat-media-dialog video').click({position:{x:20,y:20}});assert(await p.locator('.chat-media-dialog').isVisible(),'playback taps do not dismiss');
 // Keyboard and VoiceOver retain Close, but no on-screen window controls.
 await p.keyboard.press('Tab');await p.keyboard.press('Escape');await p.locator('.chat-media-dialog').waitFor({state:'detached'});assert(await p.locator('#preview-origin').evaluate(n=>n===document.activeElement));await p.waitForFunction(()=>previewURLs.size===0);
 await relay(poses[0]);await open();const g=await check('outside-dismiss',poses[0]);await p.touchscreen.tap(g.dialog.x+8,g.dialog.y+8);await p.locator('.chat-media-dialog').waitFor({state:'detached'});await p.waitForFunction(()=>previewURLs.size===0);
 // Tall image fits the same safe lane; image toolbar stays usable.
 await p.evaluate(async()=>{const {openChatMedia}=await import('/chat-media.js');const canvas=document.createElement('canvas');canvas.width=500;canvas.height=1400;const ctx=canvas.getContext('2d');ctx.fillStyle='#598aff';ctx.fillRect(0,0,500,1400);const blob=await new Promise(r=>canvas.toBlob(r));openChatMedia({name:'Tall image.png',type:{video:false,mime:'image/png'},getBlob:()=>Promise.resolve(blob),download:()=>{},origin:document.querySelector('#preview-origin')});});
 await p.waitForFunction(()=>document.querySelector('.chat-media-dialog[data-ios-preview-fit] img')?.naturalHeight===1400);
 const photo=await p.locator('.chat-media-dialog img').boundingBox();assert(photo.x+photo.width<=382.1&&photo.y>=0&&photo.y+photo.height<=678,'tall image fits safe viewport');await p.getByRole('button',{name:'Zoom in',exact:true}).click();await p.getByRole('button',{name:'Fit to window',exact:true}).click();await p.keyboard.press('Escape');await p.locator('.chat-media-dialog').waitFor({state:'detached'});
 // A codec error still offers an actionable download without the window bar.
 await open();await p.locator('.chat-media-dialog video').evaluate(v=>v.dispatchEvent(new Event('error')));await p.locator('.chat-media-loading').getByRole('button',{name:'Download',exact:true}).click();assert.equal(await p.evaluate(()=>previewDownloads),1);assert(await p.locator('.chat-media-dialog').isVisible());await p.keyboard.press('Escape');await p.locator('.chat-media-dialog').waitFor({state:'detached'});await p.waitForFunction(()=>previewURLs.size===0);
 // Other renderers use the same safe frame, retaining their own controls.
 await p.evaluate(()=>{const d=document.createElement('dialog');d.className='document-dialog';d.innerHTML='<header class="document-header"><strong>Document</strong><button>Close</button></header><div style="flex:1;min-height:0;overflow:auto">Document preview</div>';document.body.append(d);d.showModal();});await p.waitForFunction(()=>document.querySelector('.document-dialog')?.hasAttribute('data-ios-preview-fit'));
 const doc=await p.locator('.document-dialog').boundingBox();assert(doc.x+doc.width<=382.1,'document clears right rail');await p.evaluate(()=>document.querySelector('.document-dialog').close());
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,engine+'.json'),JSON.stringify({engine,passed:true,results},null,2));console.log(JSON.stringify({engine,passed:true,poses:poses.length,outsideDismiss:true,playbackRetained:true,documentRail:true}));
 }catch(e){await p.screenshot({path:path.join(out,engine+'-failure.png')}).catch(()=>{});throw e;}finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

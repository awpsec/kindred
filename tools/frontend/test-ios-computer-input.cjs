// Shipped noVNC, actual RFB wire coordinates and the installed iOS adapter.
// No real VM, accounts, provider, or replacement RFB client.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const {attachComputerStream}=require('./fixtures/computer-stream.cjs');
const stream=attachComputerStream(server,{width:1440,height:900});
const bundle=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
const engine=process.env.WEBKIT?'webkit':'chromium',out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-ios-computer-input';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,browser=await({chromium,webkit}[engine]).launch();
 try{
  const page=await browser.newPage({viewport:{width:402,height:874},isMobile:true,hasTouch:true,deviceScaleFactor:3});
  page.setDefaultTimeout(12000);let controlling=false;const errors=[],reports=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({token,css,js})=>{
   sessionStorage.setItem('kindred-token',token);
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});
   window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
   window.__KINDRED_IOS_LAYOUT={topInset:44,bottomInset:20,leftInset:0,rightInset:72,railSide:'right',isDuo:true,isDuoInner:false,usesNativeRail:true,isSlab:true,isPortrait:true,viewportHeight:874};
   window.__KINDRED_NATIVE_GEOMETRY={width:402,height:874,windowWidth:402,windowHeight:874,displayCorners:{},reservedRegions:[]};
   document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
  },{token,css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
  await page.route(origin+'/api/**',route=>{
   const req=route.request(),u=new URL(req.url()),send=json=>route.fulfill({json});
   if(u.pathname==='/api/status')return send({screen_bot_id:'piper',takeover:controlling,control_pauses:controlling?[{bot_id:'piper',control_id:'fixture-pause',reason:'manual'}]:[],vm_enabled:true});
   if(u.pathname==='/api/computer/screen-state')return send({state:'ready'});
   if(u.pathname==='/api/computer/resources')return send({cpus:2,cpu_percent:12,memory_used:1,memory_total:4,disk_used:10,disk_total:32,uptime_seconds:60});
   if(u.pathname==='/api/computer/session')return send({ticket:stream.ticket('piper')});
   if(u.pathname==='/api/takeover'){controlling=req.postDataJSON().enabled;return send({enabled:controlling});}
   return route.continue();
  });
  await page.goto(origin);await page.locator('#prompt').waitFor();
  await page.locator('#show-computer').evaluate(n=>n.click());
  await page.waitForFunction(()=>document.querySelector('#desktop-mode')?.textContent==='Watching live');
  await page.locator('#take-control').click();
  await page.waitForFunction(()=>document.querySelector('#computer-panel').classList.contains('is-controlling'));
  for(const [label,width,height,inner,keyboard] of [
   ['cover',402,874,false,false],['cover-keyboard',402,535,false,true],['cover-landscape',874,402,false,false],['cover-landscape-no-rail',874,402,false,true],
   ['inner-portrait',669,951,true,false],['inner-portrait-keyboard',669,590,true,true],
   ['inner-landscape',951,669,true,false],['inner-landscape-keyboard',951,390,true,true],['cover-return',402,874,false,false]
  ]){
   await page.setViewportSize({width,height});
   await page.evaluate(({label,width,height,inner,keyboard})=>{
    const portrait=width<height,l=__KINDRED_IOS_LAYOUT,g=__KINDRED_NATIVE_GEOMETRY;
    Object.assign(l,{topInset:inner&&portrait?82:24,bottomInset:keyboard?0:20,rightInset:portrait&&inner?0:72,railSide:portrait&&inner?'none':'right',isDuoInner:inner,isSlab:!inner,isPortrait:portrait,keyboardVisible:keyboard,viewportHeight:height,usesNativeRail:label!=='cover-landscape-no-rail'});
    Object.assign(g,{width,height,windowWidth:width,windowHeight:height,reservedRegions:inner?[{kind:'division',active:false,x:width/2,y:0,width:0,height}]:[]});
    dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:l}));dispatchEvent(new Event('kindred-native-geometry'));
    if(!keyboard)document.activeElement?.blur();else window.__kindredComputerInput.focus();
   },{label,width,height,inner,keyboard});
   await page.waitForTimeout(650);
   const geometry=await page.locator('.desktop-canvas canvas').evaluate(c=>({rect:c.getBoundingClientRect().toJSON(),pixels:[c.width,c.height],inline:[c.style.width,c.style.height],focus:document.activeElement?.id,scrollY,visualOffset:visualViewport.offsetTop,hit:document.elementFromPoint(c.getBoundingClientRect().x+c.getBoundingClientRect().width/2,c.getBoundingClientRect().y+c.getBoundingClientRect().height/2)?.tagName}));
   if(keyboard)assert.equal(geometry.focus,'ios-computer-input',label+': Duo typing is available in either orientation');
   const taps=[];
   for(const [fx,fy] of [[.2,.2],[.5,.5],[.8,.8]]){
    const r=geometry.rect,x=r.x+r.width*fx,y=r.y+r.height*fy,start=stream.inputs.length;
    if(y<0||y>=height)continue;
    await page.touchscreen.tap(x,y);await page.waitForTimeout(150);
    const events=stream.inputs.slice(start).filter(e=>e.kind===5),press=events.find(e=>e.buttons===1);
    const after=await page.locator('.desktop-canvas canvas').evaluate(c=>({rect:c.getBoundingClientRect().toJSON(),focus:document.activeElement?.id,classes:document.querySelector('#computer-panel').className,canvases:[...document.querySelectorAll('#desktop canvas')].map(c=>({class:c.className,pixels:[c.width,c.height],rect:c.getBoundingClientRect().toJSON()}))}));
    taps.push({point:{x,y},expected:{x:Math.floor(1440*fx),y:Math.floor(900*fy)},events,after});
    fs.writeFileSync(path.join(out,engine+'-'+label+'.json'),JSON.stringify({geometry,taps},null,2));
    await page.screenshot({path:path.join(out,engine+'-'+label+'.png')});
    assert(press,`${label}: touching the visible screen must produce a press: ${JSON.stringify({geometry,taps})}`);
    // WebKit quantizes a simulated finger to logical pixels; at cover scale
    // one logical pixel can span several framebuffer pixels.
    assert(Math.abs(press.x-1440*fx)<=Math.max(2,1440/r.width*1.5)&&Math.abs(press.y-900*fy)<=Math.max(2,900/r.height*1.5),`${label}: touch must reach its visible framebuffer point: ${JSON.stringify(taps.at(-1))}`);
    assert(Math.abs(after.rect.y-r.y)<1&&Math.abs(after.rect.height-r.height)<1,`${label}: a finger must not reflow the screen`);
    if(geometry.focus==='ios-computer-input')assert.equal(after.focus,geometry.focus,'remote touches retain native text entry');
    assert(events.some(e=>e.buttons===0),'touch releases its button');
   }
   await page.screenshot({path:path.join(out,engine+'-'+label+'.png')});reports.push({label,geometry,taps});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,realRfb:true,reports}));
 }finally{stream.close();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();stream.close();});

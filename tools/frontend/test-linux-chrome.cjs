// Linux layout and IPC ordering. Native GTK coverage is a separate test.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/linux-chrome');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1320,height:860}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(token=>{
   sessionStorage.setItem('kindred-token',token);window.__KINDRED_DESKTOP={platform:'linux'};window.nativeCalls=[];let maximized=true;
   window.__TAURI__={core:{invoke:async(command,args={})=>{
    nativeCalls.push({command,args});
    if(command==='window_action'){
     if(args.action==='state'&&window.holdNextState){window.holdNextState=false;return new Promise(r=>window.releaseOldState=()=>r(false));}
     if(args.action==='maximize')maximized=!maximized;
     return maximized;
    }
    if(command==='notification_status')return {enabled:true};return null;
   }}};
  },token);
  await page.route('**/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,setComputerExpanded,updateDesktopState};'}));
  await page.goto(origin);await page.locator('.message-row.assistant').waitFor();
  await page.getByRole('button',{name:'Restore window',exact:true}).waitFor();
  assert.equal(await page.locator('.desktop-window-title,.sidebar-top .wordmark').count(),0);
  const measurements=[];
  for(const width of [800,900,1000,1100,1320])for(const size of [100,150]){
   await page.setViewportSize({width,height:860});await page.evaluate(size=>KindredReadingSize.set(size),size);
   for(const pane of ['chat','details','computer','expanded']){
    await page.evaluate(async pane=>{
     const m=await import('/app.js'),computer=document.querySelector('#computer-panel'),details=document.querySelector('#details-panel');
     document.documentElement.dataset.motion='off';computer.hidden=!['computer','expanded'].includes(pane);details.hidden=pane!=='details';
     m.setComputerExpanded(pane==='expanded');m.state.desktopConnected=true;m.updateDesktopState();
    },pane);
    const metric=await page.evaluate(()=>{
     const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
     const controls=[...document.querySelectorAll('.window-control')];
     return {bar:rect('.desktop-titlebar'),shell:rect('.shell'),search:rect('#search-trigger'),plus:rect('#new-bot'),controls:controls.length,hit:controls.every(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),pane:rect('#computer-panel > .panel-header'),visible:!document.querySelector('#computer-panel').hidden,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.equal(metric.controls,3);assert(metric.hit&&!metric.overflow,JSON.stringify(metric));
    assert.equal(metric.bar.h,32);assert.equal(metric.bar.w,width);assert.equal(metric.shell.y,32);
    assert(Math.abs(metric.search.y-metric.plus.y)<2&&metric.search.right<=metric.plus.x,JSON.stringify(metric));
    if(metric.visible)assert(metric.pane.y>=32,JSON.stringify(metric));
    measurements.push({width,size,pane,...metric});
    if(width===1000&&size===150&&['chat','computer','expanded'].includes(pane))await page.screenshot({path:path.join(out,`${process.env.WEBKIT?'webkit':'chromium'}-${pane}.png`)});
   }
  }
  await page.evaluate(()=>{
   document.querySelector('#computer-panel').hidden=true;document.querySelector('#details-panel').hidden=true;
   const start=nativeCalls.length;
   for(const e of document.querySelectorAll('.search,.search span,.search svg,.search kbd,.search input'))e.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,detail:1}));
   if(nativeCalls.slice(start).some(c=>c.args?.action==='drag'))throw Error('Search initiated window dragging');
   document.querySelector('.desktop-titlebar').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,detail:1}));
   if(!nativeCalls.slice(start).some(c=>c.args?.action==='drag'))throw Error('Blank strip is not draggable');
   holdNextState=true;dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(()=>window.releaseOldState);
  await page.getByRole('button',{name:'Restore window',exact:true}).click();
  await page.getByRole('button',{name:'Maximize window',exact:true}).click();
  await page.evaluate(()=>releaseOldState());await page.getByRole('button',{name:'Restore window',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,`${process.env.WEBKIT?'webkit':'chromium'}-checks.json`),JSON.stringify({passed:true,measurements,initialMaximize:true,staleReadIgnored:true,searchDoesNotDrag:true},null,2));
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',cases:measurements.length}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.closeAllConnections();server.close();});

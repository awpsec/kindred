const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const engine=process.env.WEBKIT?'webkit':'chromium',out=process.env.KINDRED_TEST_ARTIFACTS;
if(out)fs.mkdirSync(out,{recursive:true});
const vendor=`export * from './vendor.js?real';
export class RFB extends EventTarget {
 constructor(host){super();this.host=host;this.screen=document.createElement('div');this.screen.style.cssText='display:flex;width:100%;height:100%;align-items:center;justify-content:center;overflow:hidden';this.canvas=document.createElement('canvas');this.canvas.style.flexShrink='0';this.screen.append(this.canvas);host.append(this.screen);this.setSize(1440,900);this.observer=new ResizeObserver(()=>this.scaleViewport=true);this.observer.observe(host);window.screenFixture=this;setTimeout(()=>this.dispatchEvent(new Event('connect')),20);}
 setSize(w,h){this.canvas.width=w;this.canvas.height=h;this.canvas.dataset.framebufferWidth=w;this.canvas.dataset.framebufferHeight=h;const c=this.canvas.getContext('2d'),g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#284d68');g.addColorStop(1,'#1d233b');c.fillStyle=g;c.fillRect(0,0,w,h);c.fillStyle='#e5e7eb';c.fillRect(w*.12,h*.13,w*.76,h*.67);c.fillStyle='#f7f8fa';c.fillRect(w*.12,h*.13,w*.76,h*.055);c.fillStyle='#263645';c.font=Math.round(w/48)+'px sans-serif';c.fillText('Remote desktop',w*.15,h*.17);c.font=Math.round(w/34)+'px sans-serif';c.fillText(w+' × '+h,w*.17,h*.34);c.fillStyle='#111923';c.fillRect(0,h*.95,w,h*.05);this.scaleViewport=true;}
 set scaleViewport(v){const b=this.host.getBoundingClientRect(),s=Math.min(b.width/this.canvas.width,b.height/this.canvas.height);this.canvas.style.width=this.canvas.width*s+'px';this.canvas.style.height=this.canvas.height*s+'px';}
 disconnect(){this.observer.disconnect();this.host.remove();}set viewOnly(v){this.passive=v;}set resizeSession(v){this.resizeRequested=v;}set background(v){}
}`;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await({chromium,webkit}[engine]).launch({headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1280,height:1400}});p.setDefaultTimeout(8000);const errors=[],sessions=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.route(origin+'/vendor.js',r=>r.fulfill({contentType:'text/javascript',body:vendor}));
  await p.route(origin+'/vendor.js?real',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/vendor.js'))}));
  await p.route(origin+'/api/computer/session',r=>{sessions.push(r.request().postDataJSON());return r.fulfill({json:{ticket:'fixture'}});});
  await p.route(origin+'/api/routines',r=>r.fulfill({json:Array.from({length:8},(_,i)=>({id:'routine-'+i,bot_id:'piper',name:'Environment check '+(i+1),trigger:'activity',enabled:true,monitor:{}}))}));
  await p.route(origin+'/api/computer/screen-state*',r=>r.fulfill({json:{state:'ready'}}));
  await p.goto(origin);await p.locator('#prompt').waitFor();await p.locator('#bot-details').click();await p.getByRole('tab',{name:'Computer',exact:true}).click();await p.locator('.desktop-glass.ready').waitFor();await p.waitForTimeout(450);
  const sample=()=>p.evaluate(()=>{const rect=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};return {frame:rect(document.querySelector('#desktop')),canvas:rect(document.querySelector('.desktop-canvas canvas')),footer:rect(document.querySelector('.desktop-footer')),routines:rect(document.querySelector('#computer-routines')),panel:rect(document.querySelector('#computer-panel')),pixels:[screenFixture.canvas.width,screenFixture.canvas.height],resize:screenFixture.resizeRequested,passive:screenFixture.passive};});
  const reports=[];
  const check=async label=>{await p.waitForTimeout(350);await p.waitForFunction(()=>document.querySelector('.desktop-canvas')?.getAnimations().every(a=>a.playState!=='running'));const s=await sample();if(out){fs.writeFileSync(path.join(out,`${engine}-${label}.json`),JSON.stringify(s,null,2));await p.screenshot({path:path.join(out,`${engine}-${label}.png`)});if(label==='expanded-tall')await p.locator('#computer-panel').screenshot({path:path.join(out,'screen-fit-preview.png')});}assert(Math.abs(s.frame.y-s.canvas.y)<2&&Math.abs(s.frame.bottom-s.canvas.bottom)<2,`${label}: remove vertical letterbox space ${JSON.stringify(s)}`);assert(Math.abs(s.frame.x-s.canvas.x)<2&&Math.abs(s.frame.right-s.canvas.right)<2,label+': frame follows the full uncropped desktop');assert(Math.abs(s.canvas.width/s.canvas.height-s.pixels[0]/s.pixels[1])<.01,label+': keep remote proportions');assert(s.footer.y>=s.frame.bottom&&s.footer.y-s.frame.bottom<4,label+': footer sits directly below screen');assert.equal(s.resize,false);assert.equal(s.passive,true);reports.push({label,...s});};
  await check('compact');await p.getByRole('button',{name:'Open computer screen',exact:true}).click();await p.waitForTimeout(450);await check('expanded-tall');
  assert((await sample()).routines.y<900,'routines move up into the useful screen area');assert((await sample()).routines.height>155,'routines use the space reclaimed from letterboxing');
  for(const viewport of [{width:1280,height:720},{width:800,height:1180},{width:390,height:844}]){await p.setViewportSize(viewport);await check('expanded-'+viewport.width);const s=await sample();assert(s.footer.bottom<=s.panel.bottom+1,'footer stays visible when height constrains the desktop');assert(s.routines.height>=155,'routines retain a usable scrolling area');}
  await p.setViewportSize({width:1280,height:1400});
  for(const [w,h] of [[1920,1080],[1024,1280]]){await p.evaluate(([w,h])=>screenFixture.setSize(w,h),[w,h]);await check('remote-'+w+'-'+h);assert.deepEqual((await sample()).pixels,[w,h],'do not alter remote resolution');}
  await p.locator('#computer-expand').click();await p.waitForTimeout(450);await check('compact-portrait');
  await p.getByRole('button',{name:'Open computer screen',exact:true}).click();await p.waitForTimeout(450);await p.locator('#computer-close').click();await p.waitForTimeout(600);
  assert.equal(await p.locator('.desktop-canvas').count(),0);assert.equal(await p.locator('#computer-panel').evaluate(n=>n.classList.contains('screen-sized')),false);assert.equal(sessions.length,1,'resizing does not reconnect');
  // The installed iOS adapter supplies its own aspect and fold/keyboard layout.
  // Load its real CSS and representative controls wrapper; shared sizing must yield.
  const nativeLayout=process.env.KINDRED_NATIVE_LAYOUT_CSS||path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web/MobileLayout.css');
  if(fs.existsSync(nativeLayout)){
  await p.setViewportSize({width:390,height:844});
  await p.addStyleTag({content:fs.readFileSync(nativeLayout,'utf8')});
  await p.evaluate(()=>{window.__KINDRED_MOBILE_PLATFORM='ios';const html=document.documentElement;Object.assign(html.dataset,{kindredIos:'true',iosBotCenter:'true',iosLayout:'compact',iosSlab:'true'});html.style.setProperty('--ios-viewport-height','844px');html.style.setProperty('--ios-safe-top','0px');html.style.setProperty('--ios-safe-bottom','0px');const panel=document.querySelector('#computer-panel'),controls=document.createElement('section');controls.className='ios-computer-controls';for(const child of [...panel.children])if(!child.matches('.panel-header,#desktop,.bot-center-heading,.pane-resizer'))controls.append(child);panel.append(controls);panel.style.setProperty('--ios-screen-ratio','1.6');});
  await p.locator('#bot-details').click();await p.getByRole('tab',{name:'Computer',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#desktop-mode').textContent==='Watching live');await p.waitForTimeout(600);
  const native=await sample();assert(Math.abs(native.frame.height/native.frame.width-.625)<.01,'retain the iOS adapter aspect fit');assert(Math.abs(native.frame.y-native.canvas.y)<2&&Math.abs(native.frame.bottom-native.canvas.bottom)<2,'native frame retains its own fit');assert.equal(await p.locator('#computer-panel').evaluate(n=>n.classList.contains('screen-sized')),false,'shared sizing must not replace native geometry');reports.push({label:'native-css-compatibility',...native});
  }else reports.push({label:'native-css-compatibility',not_exercised:'Native companion CSS is absent; run this case from the desktop checkout or set KINDRED_NATIVE_LAYOUT_CSS.'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,reports}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

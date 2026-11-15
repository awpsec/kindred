// Actual Settings content with the native adapter, using synthetic OS size signals.
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const resources=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-settings-text-size';
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch();fs.mkdirSync(out,{recursive:true});
 try{
  const receipts=[],failures=[];
  for(const [pose,width,height,duo,inner] of [['phone',390,844,false,false],['cover',466,678,true,false],['inner',867,645,true,true]]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:true,reducedMotion:'reduce'}),p=await context.newPage();
   await p.addInitScript(({token,css,js,duo,inner,width,height})=>{
    window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';window.__KINDRED_SYSTEM_TEXT_SCALE=1;
    window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:34,leftInset:0,rightInset:duo?84:0,isDuo:duo,isDuoInner:inner,isSlab:!inner,usesNativeRail:duo,railSide:'right',isPortrait:height>width,viewportHeight:height};
    window.__KINDRED_NATIVE_GEOMETRY={width,height,windowWidth:width,windowHeight:height,reservedRegions:[]};
    window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
    sessionStorage.setItem('kindred-token',token);
    document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);(0,eval)(js);},{once:true});
   },{token,duo,inner,width,height,css:fs.readFileSync(path.join(resources,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(resources,'MobileLayout.js'),'utf8')});
   await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('#prompt').waitFor();
   await p.locator('#settings-button').evaluate(n=>n.click());await p.locator('.ios-account-copy strong').waitFor();
   for(const tab of ['General','Connections','Computer','Routines','Skills','Archived']){
    const button=p.locator('#settings-nav').getByRole('button',{name:tab,exact:true});if(!await button.count())continue;
    await button.click();await p.locator('#settings-content').waitFor();
    await p.evaluate(async()=>{window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:1}}));await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const baseline=await p.evaluate(()=>[...document.querySelectorAll('#settings-dialog :is(h1,h2,h3,h4,p,strong,label,small,summary,button,input,textarea,select,span)')].filter(n=>n.getClientRects().length&&/[\p{L}\p{N}]{2}/u.test([...n.childNodes].filter(v=>v.nodeType===3).map(v=>v.textContent).join(''))).map((n,i)=>{n.dataset.textSizeProbe=String(i);return {id:String(i),text:n.textContent.trim().slice(0,32),selector:n.tagName+'.'+n.className,size:parseFloat(getComputedStyle(n).fontSize)}}));
    assert(baseline.length>2,tab+' has real visible settings text');
    for(const scale of [14/17,1.35,2.1]){
     const actual=await p.evaluate(async scale=>{window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale}}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return [...document.querySelectorAll('[data-text-size-probe]')].map(n=>({id:n.dataset.textSizeProbe,size:parseFloat(getComputedStyle(n).fontSize)}));},scale);
     for(const b of baseline){const a=actual.find(n=>n.id===b.id);if(a&&Math.abs(a.size-b.size*scale)>=.06)failures.push({pose,tab,scale,text:b.text,selector:b.selector,base:b.size,actual:a.size});}
     assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Settings keep the viewport width');
     receipts.push({pose,tab,scale,checked:baseline.length});
    }
    if(tab==='Connections')await p.screenshot({path:path.join(out,pose+'-connections.png')});
   }
   await context.close();
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:!failures.length,syntheticSystemSizeSignals:true,receipts,failures},null,2));assert.deepEqual(failures,[]);console.log(JSON.stringify({passed:true,contexts:receipts.length,syntheticSystemSizeSignals:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

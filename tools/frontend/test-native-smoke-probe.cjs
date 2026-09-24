// Exercise the real native smoke probe against browser fixtures. This does not
// establish native Mac validation; that still runs on each packaged Mac app.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{channel:'msedge',headless:true});
 try{
  for(const missing of [false,true]){
   const out=path.join(root,'test-results','native-smoke-probe-'+Date.now());fs.mkdirSync(out,{recursive:true});
   const child=spawn(process.execPath,[path.join(root,'scripts/release/native-smoke-server.cjs'),root,out],{stdio:'ignore',windowsHide:true});
   const context=await browser.newContext();
   try{
    for(let i=0;i<100&&!fs.existsSync(path.join(out,'fixture.json'));i++)await sleep(50);
    const {url}=JSON.parse(fs.readFileSync(path.join(out,'fixture.json'))),page=await context.newPage();
    await context.addInitScript(()=>{
     sessionStorage.setItem('kindred-token','native-test-token-only');
     window.__TAURI__={core:{invoke:async name=>name==='profile_home_state'?{entries:[],version:'browser-fixture'}:null}};
     const raf=window.requestAnimationFrame.bind(window);
     window.requestAnimationFrame=callback=>raf(time=>setTimeout(()=>callback(time),700));
    });
    if(missing)await context.route(url+'/api/**',async route=>{
     const response=await route.fetch(),body=(await response.text()).replaceAll('Here is the screenshot.','Unexpected fixture content');await route.fulfill({response,body});
    });
    await page.goto(url);
    for(let i=0;i<220&&!fs.existsSync(path.join(out,'reports.json'));i++)await sleep(100);
    const [report]=JSON.parse(fs.readFileSync(path.join(out,'reports.json')));
    if(missing){assert.equal(report.passed,false);assert.match(report.error,/did not become ready/);}
    else{
     assert.equal(report.passed,true);assert.equal(report.phase,'chat');assert.match(report.text,/Here is the screenshot\./);assert.deepEqual(report.errors,[]);
     assert.equal(await page.locator('#chat-loading').count(),0);assert.equal(await page.locator('#content').getAttribute('aria-busy'),null);
    }
   }finally{await context.close();child.kill();}
  }
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'edge',delayedReadyChatAccepted:true,missingExpectedContentRejected:true,nativeMacValidation:false}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

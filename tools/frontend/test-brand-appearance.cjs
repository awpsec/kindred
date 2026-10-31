// The app's explicit theme must win even when the OS appearance is opposite.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/brand-appearance');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  for(const theme of ['light','dark']){
   const page=await browser.newPage({viewport:{width:560,height:740},colorScheme:theme==='light'?'dark':'light'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(theme=>{window.__TAURI__={core:{invoke:async name=>{
    if(name==='profile_home_state')return {entries:[],version:'test',theme,platform:'macos'};
    if(name==='profile_activity'||name==='standalone_status')return {};
    throw Error(name);
   }}};window.__KINDRED_NATIVE_FRAME=true;},theme);
   await page.goto('http://127.0.0.1:'+server.address().port+'/profile-home.html');
   const brand=page.locator('.welcome-brand');await brand.waitFor();
   const image=brand.locator('img:visible');assert.equal(await image.count(),1);
   assert.equal(await image.getAttribute('src'),'brand-icon-'+theme+'.svg');
   await image.evaluate(async image=>{await image.decode();if(!image.naturalWidth)throw Error('Brand icon did not decode');});
   const ink=await brand.locator('svg path').first().evaluate(e=>getComputedStyle(e).fill);
   const luminance=ink.match(/[\d.]+/g).slice(0,3).map(Number).reduce((a,b)=>a+b)/3;
   assert(theme==='dark'?luminance>150:luminance<100,'Wordmark must contrast with '+theme+' canvas: '+ink);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(out,theme+'.png')});
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Light/dark identity, original-color images and wordmark contrast passed with opposite OS themes');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});

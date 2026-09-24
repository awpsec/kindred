const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:560,height:480}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const name of ['linux-update.html','linux-update.js','linux-update.css','profile-home.css'])await page.route('**/'+name,r=>r.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui',name),'utf8')}));
  await page.addInitScript(()=>{
   window.fixture={calls:[],status:{status:'idle'}};
   window.__TAURI__={core:{invoke:async(name,args)=>{
    fixture.calls.push({name,args});
    if(name==='linux_update_state')return structuredClone(fixture.status);
    if(name==='choose_linux_appimage'){fixture.status={status:'selected',filename:'Kindred-0.51.AppImage',message:'Ready to install this client.'};return;}
    if(name==='install_linux_appimage'){fixture.status={status:'extracting',filename:'Kindred-0.51.AppImage',busy:true,progress:30,message:'Unpacking the client…'};return;}
    if(name==='restart_linux_client')throw Error('The new client closed during startup. Restore the previous client.');
    throw Error('Unexpected IPC '+name);
   }}};
  });
  const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin+'/linux-update.html');
  assert(await page.getByRole('button',{name:'Install client',exact:true}).isDisabled());
  await page.getByRole('button',{name:'Choose AppImage…'}).click();
  await page.getByText('Kindred-0.51.AppImage',{exact:true}).waitFor();
  await page.locator('#install').evaluate(n=>{n.click();n.click();});
  assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.name==='install_linux_appimage').length),1);
  assert(await page.locator('#choose').isDisabled());assert(await page.locator('#install').isDisabled());
  await page.waitForFunction(()=>document.querySelector('progress').value===30);
  await page.evaluate(()=>fixture.status={status:'error',message:'System GStreamer is missing autoaudiosink.',filename:'Kindred-0.51.AppImage'});
  await page.getByText('System GStreamer is missing autoaudiosink.').waitFor();
  assert(!(await page.locator('#choose').isDisabled()));
  await page.evaluate(()=>fixture.status={status:'ready',message:'Client installed. Your standalone server keeps running.',filename:'Kindred-0.51.AppImage',runtime:'system',progress:100,rollback:true});
  await page.getByRole('button',{name:'Restart Kindred'}).waitFor();
  assert(await page.locator('#install').isHidden());
  await page.getByRole('button',{name:'Restart Kindred'}).click();
  await page.getByText('The new client closed during startup. Restore the previous client.').waitFor();
  assert(!(await page.getByRole('button',{name:'Restore previous client'}).isDisabled()));
  const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/linux-client-update');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,(process.env.WEBKIT?'webkit':'chromium')+'-ready.png')});
  await page.evaluate(()=>fixture.status.theme='light');await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.setViewportSize({width:390,height:640});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Restore previous client'}).click();
  assert((await page.evaluate(()=>fixture.calls.filter(c=>c.name==='install_linux_appimage').at(-1))).args.rollback);
  await page.close();
  // New server UI does not advertise the installer to old clients or other OSes.
  for(const supported of [false,true]){
   const p=await browser.newPage({viewport:{width:1100,height:900}});
   await p.addInitScript(({token,supported})=>{
    sessionStorage.setItem('kindred-token',token);window.__KINDRED_LINUX_UPDATER=supported;window.fixture={opened:0};
    window.__TAURI__={core:{invoke:async name=>{if(name==='open_linux_update'){fixture.opened++;return;}throw Error('Unexpected IPC '+name);}}};
   },{token,supported});
   await p.goto(origin);await p.locator('#settings-button').click();
   const action=p.getByRole('button',{name:'Install downloaded AppImage…'});
   if(supported)await action.waitFor();else await p.locator('.general-settings-form').waitFor();
   assert.equal(await action.count(),supported?1:0);
   if(supported){await action.click();await p.waitForFunction(()=>fixture.opened===1);assert(await p.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('kindred-update-resume-'))));}
   await p.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',singleInstall:true,progress:true,failureRetry:true,rollback:true,narrowLayout:true,platformGate:true,drafts:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

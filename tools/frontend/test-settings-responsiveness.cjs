const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch({headless:true});
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/settings-responsiveness');fs.mkdirSync(out,{recursive:true});
 let held=[];
 try{
  const p=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  let slow=false,settings={name:'Ready account',identity:'Saved preferences',theme:'dark',timezone:'UTC',timezone_mode:'fixed',approval_mode:'ask',notifications:'all'};
  await p.route(origin+'/api/settings',async route=>{
   if(route.request().method()==='GET'&&slow){await new Promise(r=>held.push(r));return route.fulfill({json:{...settings,name:'Stale response'}}).catch(()=>{});}
   if(route.request().method()==='PUT')settings={...settings,...route.request().postDataJSON()};
   return route.fulfill({json:settings});
  });
  await p.addInitScript(token=>{
   sessionStorage.setItem('kindred-token',token);window.__KINDRED_PROFILE_HOST=true;window.__KINDRED_DICTATION_MODELS=true;
   window.deviceHang=true;window.enumerations=0;window.__TAURI__={core:{invoke:async name=>{
    if(['profile_home_state','dictation_status','configure_dictation'].includes(name)&&window.deviceHang)return new Promise(()=>{});
    if(name==='profile_home_state')return {entries:[],launch_on_startup:true,hardware_acceleration_supported:false};
    if(name==='dictation_status'||name==='configure_dictation')return {phase:'off',supported:true,models:[]};return {};
   }}};
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{enumerateDevices:()=>{window.enumerations++;return window.deviceHang?new Promise(()=>{}):Promise.resolve([{kind:'audioinput',deviceId:'usb',label:'USB microphone'}]);},getUserMedia:async()=>({getTracks:()=>[]})}});
  },token);
  await p.goto(origin);await p.locator('#app').waitFor({state:'visible',timeout:15000});
  await p.locator('#settings-button').click();
  const name=p.locator('.general-settings-form').getByLabel('Name',{exact:true});await name.waitFor({timeout:1500});await p.waitForFunction(()=>!document.querySelector('.general-settings-form input[required]').disabled);
  await name.fill('Still responsive');await name.blur();await p.waitForFunction(()=>document.querySelector('.preference-status')?.textContent==='Saved');
  assert.equal(await p.evaluate(()=>window.enumerations),0,'Opening Settings must not enumerate devices');await p.getByRole('button',{name:'Refresh microphones',exact:true}).click();await p.getByText('Microphones did not respond. Your saved selection is unchanged.',{exact:true}).waitFor();await p.getByRole('button',{name:'Retry device settings',exact:true}).waitFor();await p.getByRole('button',{name:'Retry dictation status',exact:true}).waitFor();
  assert.equal(await name.inputValue(),'Still responsive');
  await p.evaluate(()=>window.deviceHang=false);
  await p.getByRole('button',{name:'Refresh microphones',exact:true}).click();await p.getByRole('button',{name:'Retry device settings',exact:true}).click();await p.getByRole('button',{name:'Retry dictation status',exact:true}).click();
  await p.getByRole('combobox',{name:'Microphone',exact:true}).selectOption('usb');assert(await p.getByRole('switch',{name:'Open Kindred at sign-in'}).isChecked());
  slow=true;await p.locator('#settings-dialog').getByRole('button',{name:'General',exact:true}).click();
  await name.waitFor({timeout:1500});assert(await name.isDisabled());assert(await p.getByRole('combobox',{name:'Text size',exact:true}).isEnabled());
  await p.getByRole('button',{name:'Retry settings',exact:true}).waitFor({timeout:12000});
  assert(await name.isDisabled());assert.equal(await p.getByText('Loading…',{exact:true}).count(),0);
  await p.screenshot({path:path.join(out,engine+'-server-timeout.png')});
  // Abandoned same-tab requests cannot replace newer controls or overwrite edits.
  await p.getByRole('button',{name:'Retry settings',exact:true}).click();
  await p.waitForTimeout(100);await p.locator('#settings-dialog').getByRole('button',{name:'Skills',exact:true}).click();
  slow=false;await p.locator('#settings-dialog').getByRole('button',{name:'General',exact:true}).click();
  await p.waitForFunction(()=>!document.querySelector('.general-settings-form input[required]').disabled);
  await name.fill('Newest edit');const releases=held.splice(0);releases.forEach(r=>r());await p.waitForTimeout(200);
  assert.equal(await name.inputValue(),'Newest edit');assert.equal(await p.locator('.general-settings-form').count(),1);
  await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.screenshot({path:path.join(out,engine+'-responsive-mobile.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,deviceHangDoesNotBlockLogin:true,generalLoadsDespiteHungDevices:true,deviceRetries:true,boundedServerWait:true,staleRequestsDiscarded:true,editableFreshSettings:true,mobile:true}));
 }finally{held.forEach(r=>r());await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

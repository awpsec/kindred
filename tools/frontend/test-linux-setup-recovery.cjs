const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const script=fs.readFileSync(path.resolve(__dirname,'../../desktop/linux/setup.sh'),'utf8');
  const command="bash -s -- '/home/casey/Downloads/Kindred.AppImage' <<'KINDRED_LINUX_SETUP'\n"+script+"\nKINDRED_LINUX_SETUP\n";
  const p=await browser.newPage({viewport:{width:680,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  for(const name of ['profile-home.html','profile-home.js','profile-home.css','bundled-dialog.js','bundled-dialog.css'])await p.route('**/'+name,r=>r.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui',name),'utf8')}));
  await p.addInitScript(command=>{
   window.fixture={starts:0,status:{status:'error',message:'Docker Engine is missing.',linux_recovery:{command,appimage:true,note:'Run as your normal user. Sign out of the desktop and sign back in after joining the docker group; newgrp only updates a shell.'}}};
   window.__TAURI__={core:{invoke:async name=>{
    if(name==='profile_home_state')return {version:'fixture',platform:'linux',theme:'dark',entries:[],last:null};
    if(name==='standalone_status')return structuredClone(window.fixture.status);
    if(name==='profile_activity')return {};
    if(name==='start_standalone'){window.fixture.starts++;window.fixture.status.status='working';window.fixture.status.message='Preparing…';return;}
    throw Error('Unexpected IPC: '+name);
   }}};
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.fixture.denyClipboard)throw Error('Clipboard unavailable');window.fixture.copied=text;}}});
  },command);
  await p.goto('http://127.0.0.1:'+server.address().port+'/profile-home.html');
  const help=p.locator('#linux-recovery');await help.waitFor();assert.equal(await help.getAttribute('open'),'');
  assert.equal(await p.locator('#linux-setup-command').inputValue(),command);
  await p.getByRole('button',{name:'Copy setup block'}).click();
  assert.equal(await p.evaluate(()=>window.fixture.copied),command);
  assert.equal(await p.evaluate(()=>window.fixture.starts),0,'Copy must not execute setup');
  await p.evaluate(()=>window.fixture.denyClipboard=true);await p.getByRole('button',{name:'Copy setup block'}).click();
  assert.equal(await p.locator('#linux-setup-command').evaluate(n=>n.selectionEnd-n.selectionStart),command.length);
  assert((await p.locator('#linux-copy-status').innerText()).includes('Ctrl+C'));
  await p.locator('#standalone').evaluate(n=>{n.click();n.click();});
  assert.equal(await p.evaluate(()=>window.fixture.starts),1);assert(await p.locator('#standalone').isDisabled());
  await p.evaluate(()=>{window.fixture.status.status='error';window.fixture.status.message='Sign out of the desktop and sign back in.';});
  await p.getByText('Sign out of the desktop and sign back in.',{exact:true}).waitFor();
  assert.equal(await p.locator('#standalone').isDisabled(),false);assert(await p.locator('#open-local').isHidden());
  await p.evaluate(()=>{window.fixture.status={status:'idle',message:'',linux_recovery:{command:'Unnecessary first-time setup block'},local_server:{version:'0.48.34',desktop_version:'0.48.35',update_available:true}};window.dispatchEvent(new Event('kindred-dialog-refresh'));});
  await p.getByRole('button',{name:'Update local server',exact:true}).waitFor();
  assert(await help.isHidden(),'A healthy installed server must not show first-time prerequisite instructions');
  assert((await p.locator('#standalone-versions').innerText()).includes('Desktop app 0.48.35 · Local server 0.48.34'));
  assert((await p.locator('#standalone-versions').innerText()).includes('hosted accounts are unchanged'));
  const before=await p.evaluate(()=>window.fixture.starts);await p.getByRole('button',{name:'Update local server',exact:true}).click();
  assert.equal(await p.evaluate(()=>window.fixture.starts),before+1);
  await p.evaluate(()=>{window.fixture.status={status:'ready',message:'Your local server is ready.',local_server:{version:'0.48.35',desktop_version:'0.48.35',update_available:false}};});
  await p.getByRole('button',{name:'Repair local server',exact:true}).waitFor();assert(await p.locator('#open-local').isVisible());
  // Restore the recovery view for the existing narrow-layout proof.
  await p.evaluate(command=>{window.fixture.status={status:'error',message:'Docker Engine is missing.',linux_recovery:{command,appimage:true,note:'Run as your normal user.'}};window.dispatchEvent(new Event('kindred-dialog-refresh'));},command);
  await help.waitFor();
  const artifacts=path.resolve(__dirname,'../../test-results/linux-setup-recovery');fs.mkdirSync(artifacts,{recursive:true});
  const engine=process.env.WEBKIT?'webkit':'edge';await help.screenshot({path:path.join(artifacts,engine+'-recovery.png')});
  await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await help.screenshot({path:path.join(artifacts,engine+'-recovery-mobile.png')});
  await p.locator('#standalone').click();await p.evaluate(()=>{window.fixture.status.status='ready';window.fixture.status.message='Your local server is ready.';});
  await p.locator('#open-local').waitFor();
  await p.evaluate(()=>{window.fixture.status={status:'idle',message:''};window.dispatchEvent(new Event('kindred-dialog-refresh'));});
  await p.waitForFunction(()=>document.querySelector('#linux-recovery').hidden);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,copyDoesNotRun:true,clipboardFallback:true,reloginGuidance:true,singleSetupAttempt:true,readyRetry:true,otherPlatformsHidden:true,mobile:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

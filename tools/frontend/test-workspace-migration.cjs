const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(out,{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:560,height:680}}),p=await context.newPage(),errors=[],calls=[];
  p.on('pageerror',e=>errors.push(e.message));
  let directory={version:'fixture',entries:[{key:'source',server:origin,profile_id:'source',name:'Work',username:'owner',session_available:true}],intent:{mode:'transfer',source:'source',server:origin,name:'Work'}};
  let progress=null,finish=null;
  await context.exposeFunction('fixtureInvoke',async(command,args={})=>{
   calls.push({command,args});
   if(command==='profile_home_state')return directory;
   if(command==='profile_activity')return {};
   if(command==='standalone_status')return {status:'ready',local_server:{version:'fixture',desktop_version:'fixture'}};
   if(command==='profile_transfer_status')return progress;
   if(command==='transfer_profile'){
    directory.transfer_request={source:'source',destination:args.address,username:args.username,protocol:1};
    progress={state:'working',stage:'Copying conversations, files and the bot computer',completed:4,total:8,copied_bytes:4194304,total_bytes:16777216};
    return new Promise(r=>finish=r);
   }
   if(command==='cancel_profile_transfer')return {requested:true};
   return null;
  });
  await context.addInitScript(()=>{window.__TAURI__={core:{invoke:(...args)=>window.fixtureInvoke(...args)}};});
  await p.goto(origin+'/profile-home.html');await p.locator('#transfer-view').waitFor({state:'visible'});
  await p.locator('#transfer-view').getByLabel('Server address',{exact:true}).fill('https://new.example');await p.getByLabel('Username',{exact:true}).fill('owner');await p.getByLabel('Password',{exact:true}).fill('synthetic-password');
  await p.getByRole('button',{name:'Move workspace',exact:true}).click();
  await p.getByText('Copying conversations, files and the bot computer',{exact:true}).waitFor();
  assert.equal(await p.locator('#transfer-steps li').count(),8);assert.equal(await p.locator('#transfer-steps [data-state=complete]').count(),4);
  assert.equal(await p.locator('#transfer-bytes').textContent(),'4 of 16 MB copied');
  assert(await p.getByRole('button',{name:'Cancel move',exact:true}).isEnabled());
  const cancelBox=await p.locator('#transfer-cancel').boundingBox();assert(cancelBox.y+cancelBox.height<=680,'Cancel remains visible without scrolling during the copy');
  assert(await p.locator('#transfer-fields').isHidden());
  await p.screenshot({path:path.join(out,engine+'-migration-copy.png')});
  await p.getByRole('button',{name:'Cancel move',exact:true}).click();
  await p.getByText('Cancelling safely — checking the destination first',{exact:true}).waitFor();
  assert(!((await p.locator('#transfer-error').textContent()).includes('original workspace is active')),'Cancellation request is not a completed rollback');
  progress={state:'cancelled',stage:'Original workspace restored',completed:0,total:8};delete directory.transfer_request;finish({cancelled:true});
  await p.getByText(/Move cancelled. Your original workspace is active again/).waitFor();
  assert(await p.getByRole('button',{name:'Move workspace',exact:true}).isEnabled());
  // Hosted to Standalone uses the same migration, selecting the managed local
  // server automatically. A local source cannot migrate back onto itself.
  await p.getByLabel('Destination',{exact:true}).selectOption('local');
  await p.getByText('Standalone ready',{exact:true}).waitFor();
  assert(await p.locator('#transfer-remote').isHidden());
  await p.getByLabel('Password',{exact:true}).fill('synthetic-password');
  await p.getByRole('button',{name:'Move workspace',exact:true}).click();
  await p.getByText('Copying conversations, files and the bot computer',{exact:true}).waitFor();
  assert.equal(calls.filter(c=>c.command==='transfer_profile').at(-1).args.address,'http://127.0.0.1:9444');
  progress={state:'cancelled',stage:'Original workspace restored',completed:0,total:8};delete directory.transfer_request;finish({cancelled:true});
  await p.getByText(/Move cancelled. Your original workspace is active again/).waitFor();
  directory.intent.server='http://127.0.0.1:9444';directory.entries[0].server='http://127.0.0.1:9444';
  await p.reload();await p.locator('#transfer-view').waitFor({state:'visible'});
  assert(await p.locator('#transfer-target option[value=local]').isDisabled(),'Standalone cannot choose itself as destination');
  directory.intent.server=origin;directory.entries[0].server=origin;
  // Closing the app during copy must restore durable progress and offer resume.
  directory.transfer_request={source:'source',destination:'https://new.example',username:'owner',protocol:1};
  progress={state:'error',stage:'Checking the database, connections and computer',completed:5,total:8,error:'Move interrupted. Resume or cancel; both copies are retained.'};
  await p.reload();await p.getByText(progress.error,{exact:true}).waitFor();
  assert.equal(await p.locator('#transfer-view').getByLabel('Server address',{exact:true}).inputValue(),'https://new.example');
  assert.equal(await p.getByLabel('Password',{exact:true}).inputValue(),'');
  assert(await p.getByRole('button',{name:'Cancel move',exact:true}).isVisible());
  await p.screenshot({path:path.join(out,engine+'-migration-recovery.png')});
  delete directory.intent;delete directory.transfer_request;progress=null;
  directory.entries[0].migration_state='recovery';
  directory.entries.push({key:'new',server:'https://new.example',profile_id:'new',name:'Work',username:'owner',session_available:true,migration_state:'active'});
  await p.reload();await p.getByText('Recovery copy · paused',{exact:true}).waitFor();
  assert.equal(await p.locator('.saved-profile').count(),2);
  await p.screenshot({path:path.join(out,engine+'-migration-profiles.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,steps:8,cancelRequiresReceipt:true,recoveryProgress:true,bothProfilesRetained:true,standaloneDestination:true,localSelfMoveBlocked:true}));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

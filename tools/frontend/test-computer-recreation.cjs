const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
  const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
  const evidence=process.env.KINDRED_EVIDENCE_DIR;if(evidence)fs.mkdirSync(evidence,{recursive:true});
  try{
    const page=await browser.newPage({viewport:{width:1060,height:850}}),writes=[],errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    let resources={cpus:2,memory_mb:4096,disk_gb:160},provisioned=true,state='shut off',reject=true,supported=true;
    await page.route('**/identity/**',async route=>{
      const request=route.request(),url=new URL(request.url()).pathname,body=request.method()==='POST'?request.postDataJSON():null;
      let value={};
      if(url.endsWith('/meta'))value={profiles:true,registration:false};
      if(url.endsWith('/profiles'))value={active:'personal',account_id:'owner',username:'Admin',admin:true,profiles:[{id:'personal',name:'Personal',active:true}]};
      if(url.endsWith('/admin'))value={users:[],registration:false};
      if(url.endsWith('/admin/password-resets'))value={requests:[]};
      if(url.endsWith('/computer-settings'))value={provisioned,recreation_supported:supported,state,resources,limits:{cpus:[1,4],memory_mb:[1024,8192],disk_gb:[8,2048]},diagnostics:{acceleration:{effective:'tcg'},warnings:['KVM is not exposed to the server container. Enable virtualization on the host and persist the KVM Compose overlay.']}};
      if(url.endsWith('/computer-settings/recreate')){
        writes.push(body);
        if(reject)return route.fulfill({status:409,json:{error:'A bot is working. Stop active tasks first.'}});
        resources=body.resources;provisioned=false;value={archive_id:'fixture-archive',state:'shut off'};
      }
      return route.fulfill({json:value});
    });
    await page.route('**/recreate-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="identity-row"></div><input id="remember-device" type="checkbox"><form id="connect-form"><h1>Connect</h1></form></body></html>'}));
    async function open(){
      await page.goto(origin+'/recreate-fixture');
      await page.evaluate(async()=>{const {createProfileUI}=await import('/profiles.js');const ui=createProfileUI({getToken:()=> 'fixture',setToken:()=>{},connect:async()=>{},notice:m=>{throw Error(m)}});await ui.init();});
      await page.getByRole('button',{name:'Switch accounts',exact:true}).click();
      await page.getByRole('menuitem',{name:'Server administration',exact:true}).click();
      await page.locator('.settings-nav').getByRole('button',{name:'Computers',exact:true}).click();
      await page.getByText('Startup acceleration: software emulation (TCG)',{exact:true}).waitFor();
    }
    await open();
    assert.equal(await page.getByLabel('Disk (GB)',{exact:true}).getAttribute('min'),'160');
    await page.getByText(/KVM is not exposed/).waitFor();
    if(evidence)await page.screenshot({path:path.join(evidence,engine+'-setup-checks.png')});
    await page.getByRole('button',{name:'Recreate computer…',exact:true}).click();
    const dialog=page.locator('dialog').filter({has:page.getByRole('heading',{name:'Recreate computer',exact:true})});
    await dialog.getByText(/Chats, bots and workspace settings stay/).waitFor();
    assert.equal(await dialog.getByLabel('Disk (GB)',{exact:true}).inputValue(),'30');
    assert.equal(await dialog.getByLabel('Disk (GB)',{exact:true}).getAttribute('min'),'8');
    const confirmation=dialog.getByLabel('Type RECREATE to confirm',{exact:true});
    await confirmation.fill('yes');await dialog.getByRole('button',{name:'Archive and recreate',exact:true}).click();
    await dialog.getByText('Type RECREATE to confirm a fresh computer.',{exact:true}).waitFor();assert.equal(writes.length,0);
    await confirmation.fill('RECREATE');await dialog.getByLabel('Disk (GB)',{exact:true}).fill('16');
    if(evidence)await page.screenshot({path:path.join(evidence,engine+'-recreate-confirmation.png')});
    await dialog.getByRole('button',{name:'Archive and recreate',exact:true}).click();
    await dialog.getByText('A bot is working. Stop active tasks first.',{exact:true}).waitFor();assert.equal(resources.disk_gb,160);
    reject=false;await dialog.getByRole('button',{name:'Archive and recreate',exact:true}).click();
    await page.getByText('Old computer archived. Start the computer to set up the fresh disk.',{exact:true}).waitFor();
    assert.deepEqual(writes[1],{confirmation:'RECREATE',resources:{cpus:2,memory_mb:4096,disk_gb:16}});
    assert.equal(await page.getByRole('button',{name:'Recreate computer…',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'Start computer',exact:true}).isEnabled(),true);
    provisioned=true;state='running';await open();assert.equal(await page.getByRole('button',{name:'Recreate computer…',exact:true}).isDisabled(),true);
    state='shut off';await page.setViewportSize({width:390,height:844});await open();
    await page.getByRole('button',{name:'Recreate computer…',exact:true}).click();
    const bounds=await dialog.boundingBox();assert(bounds.x>=-1&&bounds.x+bounds.width<=391);
    if(evidence)await page.screenshot({path:path.join(evidence,engine+'-recreate-mobile.png')});
    supported=false;await open();assert.equal(await page.getByRole('button',{name:'Recreate computer…',exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({engine,passed:['shrink-explanation','acceleration-warning','explicit-confirmation','failed-request-preserves-state','fresh-disk-without-account-reset','no-auto-start','running-refused','mobile-dialog-fit','older-server-capability-gate']}));
  }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

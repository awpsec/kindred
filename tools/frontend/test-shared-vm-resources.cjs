const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
  try {
    const page=await browser.newPage(),writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
    let resources={cpus:2,memory_mb:6144,disk_gb:30};
    await page.route('**/identity/**',route=>{
      const path=new URL(route.request().url()).pathname,body=route.request().method()==='POST'?route.request().postDataJSON():null;
      let value={};
      if(path.endsWith('/meta'))value={profiles:true,registration:false};
      if(path.endsWith('/profiles'))value={active:'personal',account_id:'owner',username:'Admin',admin:true,profiles:[{id:'personal',name:'Personal',active:true}]};
      if(path.endsWith('/admin'))value={users:[],max_users:128,registration:false};
      if(path.endsWith('/admin/password-resets'))value={requests:[]};
      if(path.endsWith('/computer-settings')){
        if(body){writes.push(body);resources=body;}
        value={supported:true,provisioned:false,state:'shut off',resources,limits:{cpus:[1,2],memory_mb:[1024,2048],disk_gb:[8,2048]},capacity:{cpus:2,memory_available_mb:2560,memory_budget_mb:2048,reserved_memory_mb:512}};
      }
      return route.fulfill({json:value});
    });
    await page.route('**/resource-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="/style.css"></head><body><div id="identity-row"></div><input id="remember-device" type="checkbox"><form id="connect-form"><h1>Connect</h1></form></body></html>'}));
    await page.goto(origin+'/resource-fixture');
    await page.evaluate(async()=>{const {createProfileUI}=await import('/profiles.js');window.ui=createProfileUI({getToken:()=> 'fixture',setToken:()=>{},connect:async()=>{},notice:m=>{throw new Error(m)}});await ui.init();});
    await page.getByRole('button',{name:'Switch accounts',exact:true}).click();await page.getByRole('menuitem',{name:'Server administration',exact:true}).click();
    await page.locator('.settings-nav').getByRole('button',{name:'Computers',exact:true}).click();
    await page.getByRole('heading',{name:'Shared VM resources'}).waitFor();
    const memory=page.getByLabel('RAM (GB)',{exact:true}),start=page.getByRole('button',{name:'Start computer',exact:true}),save=page.getByRole('button',{name:'Save resources',exact:true});
    assert.equal(await memory.isEnabled(),true);assert.equal(await memory.getAttribute('max'),'2');assert.equal(await start.isDisabled(),true);
    await page.getByText(/Server\/container: 2 CPUs, 2.0 GB/).waitFor();
    await memory.fill('2');await page.getByLabel('Disk (GB)',{exact:true}).fill('12');assert.equal(await start.isDisabled(),true);
    await save.click();await page.getByText('Saved. Start the computer to use the new resources.',{exact:true}).waitFor();
    assert.deepEqual(writes,[{cpus:2,memory_mb:2048,disk_gb:12}]);assert.equal(await start.isEnabled(),true);
    await page.getByLabel('CPUs',{exact:true}).fill('4');await save.click();assert.equal(writes.length,1);assert.equal(await start.isDisabled(),true);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({engine:process.env.WEBKIT?'webkit':'chromium',passed:['pre-start-editing','capacity-display','oversized-default','save-before-start','invalid-allocation']}));
  }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

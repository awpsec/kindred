const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'edge';
 const browser=await (process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(out,{recursive:true});const results=[];
 async function scenario(name,exercise){
  const context=await browser.newContext({viewport:{width:1000,height:900}}),p=await context.newPage();p.setDefaultTimeout(7000);const errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false};
  let list={id:'recovery-list',chat_id:chat.id,bot_id:'piper',revision:1,title:'Saved review list',archived:false,items:[{id:'review',title:'Review the draft',state:'pending',owner:'user',sources:[]}]};
  const control={reads:0,writes:0,failRead:0,failPatch:false,failChat:false,failChatAfterSave:false,delayRead:0};
  await context.addInitScript(t=>{
   sessionStorage.setItem('kindred-token',t);window.planningTimers=new Set();
   const set=window.setInterval,clear=window.clearInterval;
   window.setInterval=(fn,ms,...args)=>{const id=set(fn,ms,...args);if(fn.name==='reload')window.planningTimers.add(id);return id;};
   window.clearInterval=id=>{window.planningTimers.delete(id);return clear(id);};
  },token);
  await context.route(origin+'/api/**',async route=>{
   const r=route.request(),name=new URL(r.url()).pathname,send=json=>route.fulfill({json});
   if(name==='/api/runs')return send([]);
   if(name==='/api/chats')return send([chat]);
   if(name==='/api/chats/dm-piper'){
    if(control.failChat)return route.fulfill({status:503,json:{error:'Conversation refresh unavailable'}});
    return send({chat,messages:[{seq:1,sender:'piper',kind:'checklist',text:list.title,planning:list,run_id:'',created:1}],page:{has_before:false,has_after:false}});
   }
   if(name==='/api/bots/piper/artifacts'){
    const read=++control.reads;if(control.delayRead)await pause(control.delayRead);
    if(read===control.failRead)return route.fulfill({status:503,json:{error:'Planning temporarily unavailable'}});
    return send({items:[{id:list.id,title:list.title,kind:'checklist',created:1}],next_cursor:null});
   }
   if(name==='/api/bots/piper/artifacts/checklist/recovery-list')return send(list);
   if(name==='/api/chats/dm-piper/checklists/recovery-list'&&r.method()==='PATCH'){
    control.writes++;if(control.failPatch)return route.fulfill({status:503,json:{error:'Save temporarily unavailable'}});
    const patch=r.postDataJSON();assert.equal(patch.expected_revision,list.revision);
    list={...list,...(patch.title?{title:patch.title}:{}),revision:list.revision+1};
    if(patch.items)list.items=patch.items;
    if(patch.item_id)list.items=list.items.map(i=>i.id===patch.item_id?{...i,state:patch.state}:i);
    if(control.failChatAfterSave)control.failChat=true;
    return send(list);
   }
   return route.continue();
  });
  try{
   await p.goto(origin);await p.locator('#content [data-list="recovery-list"]').waitFor();
   await exercise(p,control,()=>list);assert.deepEqual(errors,[]);results.push({name,passed:true});
  }catch(e){results.push({name,passed:false,error:e.message});await p.screenshot({path:path.join(out,engine+'-'+name+'-failed.png')});}
  finally{await context.close();}
 }
 try{
  await scenario('overview-read-recovery',async(p,c)=>{
   c.failRead=1;await p.locator('#bot-details').click();await p.getByRole('button',{name:'Artifacts',exact:true}).click();
   const d=p.locator('.artifact-library');
   await d.getByText(/Planning temporarily unavailable/).waitFor();
   assert(await d.getByRole('button',{name:'Retry',exact:true}).isVisible());
   await p.setViewportSize({width:390,height:900});
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await p.screenshot({path:path.join(out,engine+'-overview-offline-mobile.png')});
   await d.getByRole('button',{name:'Retry',exact:true}).click();await d.locator('summary').waitFor();
   assert.equal(c.reads,2);await pause(2200);assert.equal(c.reads,2,'The artifact index does not poll');
   await p.screenshot({path:path.join(out,engine+'-overview-recovered.png')});
  });
  await scenario('overview-write-recovery',async(p,c,list)=>{
   c.failPatch=true;await p.locator('#bot-details').click();await p.getByRole('button',{name:'Artifacts',exact:true}).click();await p.locator('.artifact-library summary').click();
   const d=p.locator('.artifact-library'),check=d.getByRole('checkbox',{name:'Mark Review the draft done'});
   await check.check();await p.getByText('Save temporarily unavailable',{exact:true}).waitFor();
   assert(await d.getByRole('alert').filter({hasText:'Save temporarily unavailable'}).isVisible(),'Save errors appear inside the open dialog');
   await p.waitForFunction(()=>{const n=document.querySelector('.artifact-library [data-list] input[type=checkbox]');return n&&!n.disabled&&!n.checked;});
   assert.equal(list().items[0].state,'pending');c.failPatch=false;await check.check();
   await p.waitForFunction(()=>document.querySelector('.artifact-library .checklist-item.done'));
   assert.equal(c.writes,2);assert.equal(list().items[0].state,'done');
   await p.screenshot({path:path.join(out,engine+'-checkbox-recovered.png')});
  });
  await scenario('confirmed-save-refresh-failure',async(p,c,list)=>{
   c.failChatAfterSave=true;await p.locator('#content [data-list]').getByRole('button',{name:'Edit',exact:true}).click();
   const d=p.getByRole('dialog',{name:'Edit checklist'});await d.getByLabel('List title').fill('Confirmed saved title');await d.getByRole('button',{name:'Save',exact:true}).click();
   await d.waitFor({state:'detached'});assert.equal(c.writes,1);assert.equal(list().title,'Confirmed saved title');
   await p.getByText(/Saved.*conversation.*refresh/i).waitFor();
  });
  await scenario('editor-failed-save-keeps-draft',async(p,c,list)=>{
   c.failPatch=true;await p.locator('#content [data-list]').getByRole('button',{name:'Edit',exact:true}).click();
   const d=p.getByRole('dialog',{name:'Edit checklist'});await d.getByLabel('List title').fill('Unsaved revised title');await d.getByRole('button',{name:'Save',exact:true}).click();
   await d.getByRole('alert').filter({hasText:'Save temporarily unavailable'}).waitFor();
   await p.waitForFunction(()=>!document.querySelector('dialog.planning-dialog button[type=submit]').disabled);
   assert.equal(await d.getByLabel('List title').inputValue(),'Unsaved revised title');assert.equal(list().title,'Saved review list');
   await p.screenshot({path:path.join(out,engine+'-editor-save-error.png')});
   c.failPatch=false;await d.getByRole('button',{name:'Save',exact:true}).click();await d.waitFor({state:'detached'});assert.equal(c.writes,2);assert.equal(list().title,'Unsaved revised title');
  });
  await scenario('close-during-first-load',async(p,c)=>{
   c.delayRead=600;await p.locator('#bot-details').click();await p.getByRole('button',{name:'Artifacts',exact:true}).click();
   await p.locator('#details-close').click();
   await pause(850);assert.equal(await p.evaluate(()=>window.planningTimers.size),0,'Closed overview must not leave a polling interval');
  });
  console.log(JSON.stringify({engine,results,passed:results.every(r=>r.passed)}));assert(results.every(r=>r.passed),'Planning recovery regressions');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext(),p=await context.newPage(),errors=[],attempts=[],receipts=new Map();p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  const messages=[{seq:1,sender:'piper',kind:'message',text:'Send me your note.',created:1,reactions:[]}];let dropped=false,upload=0;
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/status'&&process.env.KINDRED_RECOVERY_UPDATE){const res=await route.fetch();return send({...await res.json(),version:'99.0.0'});}if(name==='/runs')return send([]);if(name==='/activity')return send({});
   if(name==='/uploads'&&req.method()==='POST')return send({id:'upload-'+(++upload),name:req.postDataJSON().name});
   if(name==='/chats/dm-piper')return send({chat:{id:'dm-piper',name:'Piper',members:['piper'],archived:false},messages});
   if(name==='/chats/dm-piper/messages'){
    const body=req.postDataJSON();attempts.push(body);assert.match(body.request_id,/^[a-f0-9-]{36}$/);
    let receipt=receipts.get(body.request_id);
    if(!receipt){receipt={runs:['accepted-'+receipts.size]};receipts.set(body.request_id,receipt);messages.push({seq:messages.length+1,sender:'user',kind:'message',text:body.prompt,created:messages.length+1,reactions:[]});}
    if(!dropped){dropped=true;return route.abort('failed');}return send(receipt);
   }
   return route.continue();
  });
  await p.goto(origin);await p.locator('#content').getByText('Send me your note.',{exact:true}).waitFor();
  await p.locator('[data-message="1"]').hover();await p.getByRole('button',{name:'Reply to message',exact:true}).click();
  await p.locator('#composer-actions').click();const pick=p.waitForEvent('filechooser');await p.getByRole('menuitem',{name:'Attach files',exact:true}).click();await(await pick).setFiles({name:'note.txt',mimeType:'text/plain',buffer:Buffer.from('A test note')});await p.getByRole('button',{name:'Remove note.txt'}).waitFor();
  await p.locator('#prompt').fill('Check my attached note');await p.locator('#send').click();await p.locator('#notice.error').waitFor();assert.equal(attempts.length,1);assert.equal(receipts.size,1);assert.equal(await p.locator('#prompt').innerText(),'Check my attached note');
  if(process.env.KINDRED_RECOVERY_UPDATE)await Promise.all([p.waitForEvent('load'),p.locator('#client-update').click()]);else await p.reload();await p.locator('#content').getByText('Send me your note.',{exact:true}).waitFor();await p.getByRole('button',{name:'Remove note.txt'}).waitFor();assert(await p.locator('#composer-reply').isVisible());assert.equal(await p.locator('#prompt').innerText(),'Check my attached note');
  await p.locator('#send').click();await p.waitForFunction(()=>document.querySelector('#prompt').value==='');assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);assert.equal(receipts.size,1);assert.equal(messages.filter(m=>m.sender==='user').length,1);assert(await p.locator('#composer-reply').isHidden());assert(await p.locator('.composer-files').isHidden());
  await p.reload();await p.locator('#content').getByText('Send me your note.',{exact:true}).waitFor();assert.equal(await p.locator('#prompt').innerText(),'');assert(await p.locator('.composer-files').isHidden());
  await p.locator('#prompt').fill('Check my attached note');await p.locator('#send').click();await p.waitForFunction(()=>document.querySelector('#prompt').value==='');assert.notEqual(attempts[2].request_id,attempts[0].request_id);assert.equal(receipts.size,2);
  assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'edge',lostResponseRetry:true,reloadPreservesRequestAndAttachmentAndQuote:true,oneAcceptedMessage:true,intentionalNewSend:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

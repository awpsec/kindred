const {chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1260,height:1080}}),origin='http://127.0.0.1:'+server.address().port,actions=[];
 page.on('pageerror',e=>console.error('PAGE ERROR',e.message));
 const card={id:'email-review',bot_id:'piper',kind:'email',connection:'Gmail',connector:'gmail',source:'Claude',tool:'send_email',title:'A quick project update',email_send:true,status:'pending',approval_id:'approval-email',revision:1,account:'casey@example.invalid',input:{to:['jordan@example.invalid'],subject:'A quick project update',body:'Hi Jordan,\n\nThe first round of testing is complete. We’re continuing the remaining checks during tonight’s agreed window.\n\nI’ll share the report once we’ve reviewed the results. Let me know if anything has changed on your side.\n\nThanks,\nCasey',attachments:[{filename:'project-summary.pdf'}]},records:[]};
 const fields=()=>{card.email={};for(const key of ['to','subject','body'])card.email[key]={key,text:Array.isArray(card.input[key])?card.input[key].join(', '):card.input[key],editable:true};};fields();card.email.from={text:'<sender.user>',editable:false};
 const messages=()=>[{seq:1,sender:'piper',kind:'connector_artifact',text:card.title,run_id:'preview',created:1789050000,connector_artifact:card}];
 await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await page.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:messages(),page:{has_before:false,has_after:false}}}));
 await page.route(origin+'/api/chats/dm-piper/messages*',r=>r.fulfill({json:{messages:messages(),page:{has_before:false,has_after:false}}}));
 await page.route(origin+'/api/connector-artifacts/*',r=>{const v=r.request().postDataJSON();actions.push(v);assert.equal(v.revision,card.revision);if(v.action==='remove_attachments')card.input.attachments=[];else if(v.action==='edit'){Object.assign(card.input,v.fields);fields();}else throw new Error('Preview must never approve a send');card.revision++;return r.fulfill({json:card});});
 await page.route(origin+'/api/approvals',r=>r.fulfill({json:[{id:'approval-email',run_id:'preview',tool:'claude_connector',status:'pending',args:{artifact_id:card.id},connector_artifact:card}]}));
 await page.route(origin+'/api/runs/preview',r=>r.fulfill({json:{run:{id:'preview',bot_id:'piper',chat_id:'dm-piper',status:'awaiting_approval',prompt:'Review email',output:'',error:'',depth:0,created:1789050000},events:[],attachments:[],approvals:[]}}));
 await page.route(origin+'/api/runs',r=>r.fulfill({json:[{id:'preview',bot_id:'piper',chat_id:'dm-piper',status:'awaiting_approval',prompt:'Review email',output:'',error:'',depth:0,created:1789050000}]}));
 await page.route(origin+'/identity/meta',r=>r.fulfill({status:404,body:''}));
 await page.goto(origin);
 const senders=await page.evaluate(async()=>{const {emailSenderLabel}=await import('/connector-cards.js');return [
  emailSenderLabel({from:{text:'<sender.user>'}},'casey@example.invalid'),
  emailSenderLabel({from:{text:'{{sender.user}}'}},'account_123'),
  emailSenderLabel({from:{text:{emailAddress:{address:'casey@example.invalid'}}}},''),
  emailSenderLabel({from:{text:'Casey <casey@example.invalid>'}},''),
  emailSenderLabel({from:{text:'me'}},'Work'),
 ];});
 assert.deepEqual(senders,['casey@example.invalid','Connected account','casey@example.invalid','Casey <casey@example.invalid>','Connected account']);
 const view=page.locator('[data-connector-artifact="email-review"]');await view.getByText('Draft · not sent',{exact:true}).waitFor();assert.equal(await view.getByText('<sender.user>',{exact:true}).count(),0);assert.equal(await view.getByText('casey@example.invalid',{exact:true}).count(),1);
 assert.equal(await page.locator('[data-approval="approval-email"]').count(),1,'Only the email card owns this approval');
 const output=process.env.KINDRED_TEST_ARTIFACTS||'/opt/kindred/testing/email-review';fs.mkdirSync(output,{recursive:true});
 for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await view.screenshot({path:path.join(output,'email-draft-'+theme+'.png')});}
 await view.getByRole('button',{name:'Edit draft',exact:true}).click();const editor=view.getByRole('form',{name:'Edit email draft'});
 assert(await view.getByRole('button',{name:'Send email',includeHidden:true,exact:true}).isDisabled());
 await view.screenshot({path:path.join(output,'email-editor-light.png')});
 await editor.getByLabel('Message',{exact:true}).fill('Updated draft, still not sent.');await editor.getByRole('button',{name:'Save draft changes',exact:true}).click();await view.getByText('Updated draft, still not sent.',{exact:true}).waitFor();
 await view.getByRole('button',{name:'Remove attachments',exact:true}).click();await view.getByText('project-summary.pdf',{exact:true}).waitFor({state:'detached'});
 assert.equal(card.status,'pending');assert.deepEqual(actions.map(a=>a.action),['edit','remove_attachments']);
 await page.setViewportSize({width:390,height:900});await view.screenshot({path:path.join(output,'email-draft-mobile.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 card.input={draft_id:'opaque-draft-id'};card.email={};await page.reload();
 await view.getByText('Email preview unavailable',{exact:true}).waitFor();
 assert(await view.getByRole('button',{name:'Send email',exact:true}).isDisabled());
 assert.equal(await view.getByText('opaque-draft-id',{exact:true}).count(),0);
 assert.equal(await page.locator('[data-approval="approval-email"]').count(),1);
 await view.screenshot({path:path.join(output,'email-preview-unavailable.png')});
 console.log('Email draft: saving and removing attachments never send; pending state, light/dark/mobile previews passed');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exit(1)});

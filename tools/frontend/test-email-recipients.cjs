const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const output=process.env.KINDRED_TEST_ARTIFACTS||path.join(require('node:os').tmpdir(),'kindred-email-composer');fs.mkdirSync(output,{recursive:true});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});try{
 const ctx=await browser.newContext({viewport:{width:960,height:850},...(process.env.RECORD?{recordVideo:{dir:output,size:{width:960,height:850}}}:{})}),p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{window.observerHeightWrites=[];const Original=ResizeObserver;window.ResizeObserver=class extends Original{constructor(callback){super((entries,observer)=>{const bodies=entries.filter(e=>e.target.matches('textarea[name=body]')).map(e=>({node:e.target,height:e.target.style.height}));callback(entries,observer);for(const {node,height} of bodies)if(node.style.height!==height)window.observerHeightWrites.push({before:height,after:node.style.height});});}};});
 await p.route('**/email-demo',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/style.css"></head><body style="overflow:auto"><main id="demo" style="max-width:760px;margin:32px auto;padding:0 12px"></main></body></html>'}));
 await p.goto('http://127.0.0.1:'+server.address().port+'/email-demo');
 await p.evaluate(async()=>{
  const {connectorCard}=await import('/connector-cards.js');window.calls=[];
  const card={id:'preview',kind:'email',connection:'Gmail',connector:'gmail',source:'Claude',tool:'send_email',title:'Project update',email_send:true,status:'pending',revision:1,account:'casey@example.invalid',input:{to:['jordan@example.invalid'],cc:[],bcc:[],subject:'Project update',body:'Hi Jordan,\n\nThe first round is complete. I’ll share the reviewed report tomorrow.\n\nThanks,\nCasey'},email:{}};
  const fields=()=>{for(const k of ['to','cc','bcc','subject','body'])card.email[k]={key:k,text:Array.isArray(card.input[k])?card.input[k].join(', '):card.input[k],array:Array.isArray(card.input[k]),editable:true};};fields();
  const button=(text,fn,cls)=>{const b=document.createElement('button');b.type='button';b.className=cls||'';b.textContent=text;b.onclick=async()=>{try{await fn();}catch(e){window.calls.push({error:e.message});}};return b;};
  const api=async(url,method,payload)=>{
   if(url.startsWith('/email-contacts'))return {contacts:[{name:'Morgan Lee',email:'morgan@example.invalid'},{name:'Jane Smith',email:'jane@example.invalid'}]};
   window.calls.push(payload);if(payload.action!=='edit')throw Error('No send allowed in preview');
   Object.assign(card.input,payload.fields);fields();card.revision++;return card;
  };
  const render=()=>document.querySelector('#demo').replaceChildren(connectorCard(card,{button,api,onChange:render,onDiscuss:()=>{},botName:'Piper',heading:()=>{const n=document.createElement('strong');n.textContent='Gmail';return n;},sanitizeHtml:text=>document.createTextNode(text)}));render();
 });
 await p.getByRole('button',{name:'Review',exact:true}).click();await p.getByRole('button',{name:'Edit draft',exact:true}).click();
 const form=p.getByRole('form',{name:'Edit email draft'}),to=form.getByRole('combobox',{name:'To',exact:true});
 const subject=form.getByLabel('Subject',{exact:true}),body=form.getByLabel('Message',{exact:true});
 assert((await to.boundingBox()).y<(await subject.boundingBox()).y);assert((await subject.boundingBox()).y<(await body.boundingBox()).y);
 await p.waitForTimeout(500);
 await to.pressSequentially('alex@example.invalid ',{delay:60});await p.waitForTimeout(550);
 assert.equal(await form.locator('.recipient-chip[data-address="alex@example.invalid"]').count(),1);
 await to.pressSequentially('mor',{delay:150});await form.getByRole('option').filter({hasText:'Morgan Lee'}).click();await p.waitForTimeout(500);
 await form.getByRole('button',{name:'Cc',exact:true}).click();
 const cc=form.getByRole('combobox',{name:'Cc',exact:true});
 await form.locator('.recipient-chip[data-address="alex@example.invalid"]').dragTo(cc);await p.waitForTimeout(550);
 assert.equal(await cc.locator('..').locator('.recipient-chip[data-address="alex@example.invalid"]').count(),1);
 await form.locator('.recipient-chip[data-address="morgan@example.invalid"]').click();await form.getByRole('menuitem',{name:'Move to Bcc',exact:true}).click();await p.waitForTimeout(550);
 await form.locator('.recipient-chip[data-address="alex@example.invalid"]').click();await form.getByRole('menuitem',{name:'Move to To',exact:true}).click();await p.waitForTimeout(550);
 await to.fill('unfinished');await form.getByRole('button',{name:'Save edits',exact:true}).click();assert.equal(await p.evaluate(()=>window.calls.length),0);
 await to.fill('');await to.evaluate(n=>{const e=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{getData:()=> '"Smith, Jane" <jane@example.invalid>; pat@example.invalid'}});n.dispatchEvent(e);});
 await p.waitForTimeout(450);assert.equal(await form.locator('[role=alert]').count(),0);
 for(const theme of ['dark','light']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await form.screenshot({path:path.join(output,'composer-'+theme+'.png')});}
 await p.evaluate(()=>document.documentElement.dataset.theme='dark');
 await form.getByRole('button',{name:'Save edits',exact:true}).click();
 const calls=await p.evaluate(()=>window.calls);assert.equal(calls.length,1);assert.equal(calls[0].action,'edit');assert.match(calls[0].fields.to,/"Smith, Jane" <jane@example.invalid>/);assert.match(calls[0].fields.bcc,/morgan@example.invalid/);assert(!calls[0].fields.to.includes('morgan@example.invalid'));
 await p.getByText('Sending permissions',{exact:true}).click();await p.screenshot({path:path.join(output,'review-permissions.png')});
 await p.getByRole('button',{name:'Edit draft',exact:true}).click();const originalBody=await body.inputValue();await body.focus();await body.evaluate(n=>n.setSelectionRange(5,5));await p.setViewportSize({width:390,height:844});await p.waitForTimeout(300);await form.screenshot({path:path.join(output,'composer-mobile.png')});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(await body.inputValue(),originalBody);assert.deepEqual(await body.evaluate(n=>({start:n.selectionStart,end:n.selectionEnd,focused:document.activeElement===n})),{start:5,end:5,focused:true});assert.deepEqual(await p.evaluate(()=>window.observerHeightWrites),[],'Width-driven autosize must not write height during observer delivery');assert.deepEqual(errors,[]);await ctx.close();console.log('Recipient composer: delimiters, suggestions, drag, touch move, incomplete input, named paste, field order, save-only and mobile layout passed');
 }finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

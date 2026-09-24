const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage(),errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(10000);
  let holdNext=false,held=null,failNext=false;
  let skills=[{name:'Domain review',command:'domain-review',description:'Review a domain and user list',parameters:[{name:'domain',required:true,rest:false},{name:'userlist',required:true,rest:false}],body:'Review {{domain}} using {{userlist}}.'}];
  const usage=c=>'/'+c.name+c.parameters.map(p=>' '+(p.required?'<':'[')+p.name+(p.required?'>':']')).join('');
  const builtins=[{name:'skills',description:'Open the skill library',parameters:[],action:'library'},{name:'new-skill',description:'Create a reusable skill',parameters:[{name:'description',required:true,rest:true}],action:'run'},{name:'summarize',description:'Summarize this conversation',parameters:[{name:'focus',required:false,rest:true}],action:'run'},{name:'send-email',description:'Send with your Gmail account',parameters:[{name:'recipient',required:true},{name:'message',required:true,rest:true}],action:'run',source:'Gmail'}].map(c=>({...c,source:c.source||'built-in',usage:usage(c)}));
  const catalog=()=>[...builtins,...skills.filter(s=>s.command).map(s=>({...s,name:s.command,skill_name:s.name,source:'skill',action:'run',usage:usage({name:s.command,parameters:s.parameters})}))];
  await context.route(origin+'/**',async route=>{
   const request=route.request(),name=new URL(request.url()).pathname,method=request.method(),body=['POST','PUT'].includes(method)?request.postDataJSON():null,send=json=>route.fulfill({json});
   if(name==='/app.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {commandsUI};'});
   if(name==='/identity/meta')return send({profiles:false});
   if(name==='/api/commands'){if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'Fixture unavailable'}});}const snapshot=catalog();if(holdNext){holdNext=false;return new Promise(resolve=>{held=()=>send(snapshot).then(resolve);});}return send(snapshot);}
   if(name==='/api/skills'&&method==='GET')return send(skills);
   if(name==='/api/skills'&&method==='POST'){writes.push({name,body});skills=skills.filter(s=>s.name!==body.name);skills.push({...body,command:body.command??body.name.toLowerCase().replaceAll(' ','-')});return send(body);}
   if(name.startsWith('/api/skills/')&&method==='DELETE'){skills=skills.filter(s=>encodeURIComponent(s.name)!==name.split('/').pop());return send({ok:true});}
   if(name==='/api/chats/dm-piper/messages'&&method==='POST'){writes.push({name,body});return send({runs:['command-run']});}
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#app').waitFor({state:'visible'});
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();const editor=p.locator('#prompt'),menu=p.locator('#command-options');
  await editor.focus();await editor.pressSequentially('/');await menu.getByRole('option').first().waitFor();assert.equal(await menu.getByRole('option').count(),5);
  await editor.fill('/dom');await menu.getByRole('option').filter({hasText:'/domain-review'}).click();assert.equal(await editor.evaluate(n=>n.value),'/domain-review ');
  assert.deepEqual(await p.evaluate(()=>[...CSS.highlights.get('kindred-command')].map(r=>r.toString())),['/domain-review']);
  await editor.fill('Compare /summarize and /skills with /made-up and //summarize.');
  assert.deepEqual(await p.evaluate(()=>[...CSS.highlights.get('kindred-command')].map(r=>r.toString())),['/summarize','/skills']);
  await editor.fill('/summarize-fake');assert.equal(await p.evaluate(()=>CSS.highlights.get('kindred-command').size),0);
  await editor.fill('/summarize/path');assert.equal(await p.evaluate(()=>CSS.highlights.get('kindred-command').size),0);
  await editor.evaluate(n=>{n.innerHTML='First line<div>/summarize this</div><div>/made-up</div>';n.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.deepEqual(await p.evaluate(()=>[...CSS.highlights.get('kindred-command')].map(r=>r.toString())),['/summarize']);
  await editor.fill('/domain-review ');
  assert.equal(await editor.getAttribute('data-command-params'),'<domain> <userlist>');assert.equal(await editor.textContent(),'/domain-review ');
  assert.equal(writes.length,0);await p.screenshot({path:path.join(artifacts,'commands-'+engine+'-parameters.png')});
  await editor.press('Enter');await p.getByText('Add <domain>. /domain-review <domain> <userlist>',{exact:true}).waitFor();assert.equal(writes.length,0);
  await editor.fill('/domain-review example.com "staff list.csv"');await editor.press('Enter');await p.waitForFunction(()=>document.querySelector('#prompt').value==='');
  assert.equal(writes.at(-1).body.prompt,'/domain-review example.com "staff list.csv"');assert(!writes.at(-1).body.prompt.includes('<userlist>'));
  await editor.fill('/su');await menu.getByRole('option').first().waitFor();await editor.press('Tab');assert.equal(await editor.evaluate(n=>n.value),'/summarize ');assert.equal(await editor.getAttribute('data-command-params'),'[focus]');
  await editor.fill('/');await menu.waitFor({state:'visible'});await editor.press('ArrowDown');await editor.press('Enter');assert((await editor.evaluate(n=>n.value)).endsWith(' '));assert.equal(writes.length,1);
  await editor.fill('/');await menu.waitFor({state:'visible'});await editor.press('Escape');await menu.waitFor({state:'hidden'});
  await editor.fill('/skills ');await editor.press('Enter');await p.locator('#settings-dialog').waitFor({state:'visible'});assert.equal(writes.length,1);
  await p.getByRole('button',{name:'Add skill',exact:true}).click();let dialog=p.locator('.skill-dialog');
  await dialog.getByLabel('Name',{exact:true}).fill('Invoice review');await dialog.getByLabel('Slash command',{exact:true}).fill('invoice-review');await dialog.getByLabel('Description',{exact:true}).fill('Check an invoice for a client');await dialog.getByLabel('Parameters',{exact:true}).fill('client [notes...]');await dialog.getByLabel('Instructions',{exact:true}).fill('Check the invoice for {{client}} using {{notes}}.');holdNext=true;await p.evaluate(()=>{void import('/app.js').then(m=>m.commandsUI.load(true));});await p.waitForFunction(()=>true);for(let tries=0;!held&&tries<1000;tries++)await new Promise(r=>setTimeout(r,5));assert(held,'Expected held catalogue request');await dialog.getByRole('button',{name:'Create skill',exact:true}).click();await held();held=null;const cached=await p.evaluate(async()=>await(await import('/app.js')).commandsUI.load());assert(cached.some(c=>c.name==='invoice-review'));await dialog.waitFor({state:'hidden'});
  assert.deepEqual(writes.at(-1).body.parameters,[{name:'client',description:'',required:true,rest:false},{name:'notes',description:'',required:false,rest:true}]);
  await p.getByRole('searchbox',{name:'Search skills and commands'}).fill('invoice');let row=p.locator('.skill-row').filter({hasText:'Invoice review'});await row.waitFor();assert.equal(await p.locator('.skill-row:visible').count(),1);
  assert.equal(await p.getByRole('button',{name:'Use command',exact:true}).count(),0);
  await p.getByRole('searchbox',{name:'Search skills and commands'}).fill('');
  assert.equal(await p.getByRole('img',{name:'Built-in Kindred command'}).count(),3);
  assert.equal(await p.locator('.command-defaults').getByRole('button').count(),0);
  await p.screenshot({path:path.join(artifacts,'commands-'+engine+'-library.png')});
  const beforeEdit=writes.length;
  await row.getByRole('button',{name:'Edit Invoice review',exact:true}).click();
  dialog=p.locator('.skill-dialog');
  assert.equal(await dialog.getByLabel('Instructions',{exact:true}).inputValue(),'Check the invoice for {{client}} using {{notes}}.');
  await dialog.getByLabel('Instructions',{exact:true}).fill('Discard this draft');
  assert.equal(writes.length,beforeEdit);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await row.getByRole('button',{name:'Edit Invoice review',exact:true}).click();
  assert.equal(await dialog.getByLabel('Instructions',{exact:true}).inputValue(),'Check the invoice for {{client}} using {{notes}}.');
  await dialog.getByLabel('Instructions',{exact:true}).fill('Updated instructions for {{client}}.');
  assert.equal(writes.length,beforeEdit);
  await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  assert.equal(writes.length,beforeEdit+1);
  assert.equal(writes.at(-1).body.body,'Updated instructions for {{client}}.');
  await row.getByRole('button',{name:'Edit Invoice review',exact:true}).click();
  assert.equal(await dialog.getByLabel('Instructions',{exact:true}).inputValue(),'Updated instructions for {{client}}.');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await p.locator('#settings-close').click();
  // Bot-created skills become available on the next / without reloading the app.
  skills.push({name:'Bot workflow',command:'bot-workflow',description:'Created by a bot',body:'Use {{domain}}',parameters:[{name:'domain',required:true}]});await editor.fill('/');await menu.getByRole('option').filter({hasText:'/bot-workflow'}).waitFor();await editor.fill('/bot-w');await menu.getByRole('option').filter({hasText:'/bot-workflow'}).click();assert.equal(await editor.evaluate(n=>n.value),'/bot-workflow ');
  // Generated hints are not pasted or serialized as message content.
  await editor.evaluate(n=>{const selection=getSelection(),range=document.createRange();range.selectNodeContents(n);range.collapse(false);selection.removeAllRanges();selection.addRange(range);const clipboardData=new DataTransfer();clipboardData.setData('text/plain','example.com');n.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));});assert.equal(await editor.evaluate(n=>n.value),'/bot-workflow example.com');
  // Enter continues the final bullet; Send submits the complete multiline command.
  const natural="/new-skill Check today's mail.\n\nDon't send anything.\n- Keep the client's formatting.";
  await editor.fill(natural);const countBefore=writes.length;await editor.dispatchEvent('keydown',{key:'Enter',isComposing:true});assert.equal(writes.length,countBefore);await p.locator('#send').click();await p.waitForFunction(()=>document.querySelector('#prompt').value==='');assert.equal(writes.at(-1).body.prompt,natural);
  // A slow catalogue response must neither send nor erase a subsequently edited draft.
  await p.waitForFunction(()=>document.querySelector('#send').dataset.pending!=='true');await editor.fill('/summarize details');holdNext=true;await editor.press('Enter');await p.waitForFunction(()=>true);for(let tries=0;!held&&tries<1000;tries++)await new Promise(r=>setTimeout(r,5));assert(held,'Expected held catalogue request');await editor.fill('A different draft');const count=writes.length;await held();held=null;await p.waitForFunction(()=>document.querySelector('#send').dataset.pending!=='true');assert.equal(writes.length,count);assert.equal(await editor.evaluate(n=>n.value),'A different draft');
  // Complete the word at the caret, not the whole draft; preserve suffixes,
  // list markup and noneditable person/bot mentions. Real keystrokes trigger it.
  await editor.fill('Please explain ');await editor.pressSequentially('/dom');await menu.getByRole('option').filter({hasText:'/domain-review'}).click();assert.equal(await editor.evaluate(n=>n.value),'Please explain /domain-review ');assert.equal(await editor.getAttribute('data-command-params'),null);
  await editor.fill('Compare /dom with yesterday.');await editor.evaluate(n=>{const r=document.createRange();r.setStart(n.firstChild,12);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);});await menu.getByRole('option').filter({hasText:'/domain-review'}).click();assert.equal(await editor.evaluate(n=>n.value),'Compare /domain-review with yesterday.');
  await editor.evaluate(n=>{n.innerHTML='<ul><li><span contenteditable="false" data-mention="piper" data-name="Piper">@Piper</span> explain /dom</li></ul>';const text=n.querySelector('li').lastChild,r=document.createRange();r.setStart(text,text.length);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);n.dispatchEvent(new Event('input',{bubbles:true}));});await menu.getByRole('option').filter({hasText:'/domain-review'}).click();assert.equal(await editor.locator('ul li [data-mention="piper"]').count(),1);assert.match(await editor.evaluate(n=>n.value),/^- @Piper explain \/domain-review /);
  await editor.evaluate(n=>{n.value='';n.dispatchEvent(new Event('input',{bubbles:true}));});
  for(const text of ['https://example.com/dom','Use /tmp/dom','Send //dom literally']){await editor.fill(text);await menu.waitFor({state:'hidden'});}
  // A failed initial catalogue fetch is visible and recoverable without deleting
  // the draft. Clear the cache to model a fresh installed app.
  await p.evaluate(async()=>{(await import('/app.js')).commandsUI.reset();});failNext=true;await editor.fill('/');await menu.getByRole('button',{name:'Retry',exact:true}).waitFor();await menu.getByRole('button',{name:'Retry',exact:true}).click();await menu.getByRole('option').first().waitFor();
  await editor.fill('Explain /domain-review without running it.');await p.locator('#send').click();await p.waitForFunction(()=>document.querySelector('#prompt').value==='');assert.equal(writes.at(-1).body.prompt,'Explain /domain-review without running it.');
  await p.setViewportSize({width:390,height:844});await editor.fill('/');await menu.waitFor({state:'visible'});await p.screenshot({path:path.join(artifacts,'commands-'+engine+'-mobile.png')});const bounds=await menu.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391);assert(bounds.y>=0);
  await p.evaluate(()=>document.documentElement.dataset.theme='light');await p.screenshot({path:path.join(artifacts,'commands-'+engine+'-light.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,commands:true,parameters:true,library:true,botCreated:true,naturalLanguage:true,staleCatalogue:true,draftDuringSend:true,ime:true,writes:writes.length,errors}));
 } finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

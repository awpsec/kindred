const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true}),engine=process.env.WEBKIT?'webkit':'chromium';
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/inline-approvals');fs.mkdirSync(out,{recursive:true});const results=[];
 try{for(const width of [1100,390,320])for(const theme of ['light','dark']){
  const phone=width<600,context=await browser.newContext({viewport:{width,height:1000},hasTouch:phone,isMobile:phone,reducedMotion:'reduce'});
  await context.addInitScript(({t,phone})=>{sessionStorage.setItem('kindred-token',t);if(phone){window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';}},{t:token,phone});
  if(process.env.KINDRED_INLINE_STYLE_REF){const body=cp.execFileSync('git',['show',process.env.KINDRED_INLINE_STYLE_REF+':ui/style.css'],{cwd:path.resolve(__dirname,'../..')});await context.route(origin+'/style.css',r=>r.fulfill({contentType:'text/css',body}));}
  if(process.env.KINDRED_INLINE_PARENT)for(const name of ['connector-cards.js','style.css']){const body=cp.execFileSync('git',['show',(process.env.KINDRED_INLINE_PARENT_REF||'HEAD^')+':ui/'+name],{cwd:path.resolve(__dirname,'../..')});await context.route(origin+'/'+name,r=>r.fulfill({contentType:name.endsWith('.css')?'text/css':'text/javascript',body}));}
  const cards=[
   {id:'read',kind:'page',connection:'Atlassian',connector:'confluence',source:'Claude',tool:'getConfluencePage',title:'Model text must not name approval',status:'pending',revision:3,approval_id:'read-approval',read_only:true,input:{cloudId:'https://tenant.example.invalid',pageId:'2580054428',contentFormat:'markdown'},records:[]},
   {id:'write',kind:'page',connection:'Atlassian',connector:'confluence',source:'Claude',tool:'updateConfluencePage',title:'Model title',status:'pending',revision:7,approval_id:'write-approval',read_only:false,input:{cloudId:'https://tenant.example.invalid',pageId:'2580054428',content:'Exact proposed replacement.\nSecond consequential line.',contentFormat:'markdown',version:4},preview_records:[{title:'Preview title',fields:{Preview:'Preview is not the exact input'}}],edit_fields:{content:{key:'content',label:'Page body',text:'Exact proposed replacement.\nSecond consequential line.',type:'textarea',editable:true}}},
   {id:'unknown',kind:'task',connection:'Asana',connector:'asana',source:'Codex',tool:'getButActuallyWrite',title:'Untrusted friendly model title',status:'pending',revision:1,input:{destination:'workspace-42',overwrite:true,content:'Unknown action still shows its effects',replacement:'',parameters:{name:'Sub-item name',overwrite:true,version:9,data:{body:'Nested change data'}}},records:[]}
  ].map(c=>({...c,bot_id:'piper'}));const actions=[];
  const messages=()=>cards.map((c,i)=>({seq:i+1,sender:'piper',kind:'connector_artifact',text:c.title,run_id:'run-screenshot',created:1792000000+i,connector_artifact:c}));
  await context.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:messages(),page:{has_before:false,has_after:false}}}));
  let release,holding=false;
  await context.route(origin+'/api/connector-artifacts/*',async r=>{
   const v=r.request().postDataJSON(),c=cards.find(c=>r.request().url().endsWith('/'+c.id));assert(c);assert.equal(v.revision,c.revision);actions.push({id:c.id,...v});
   if(holding)await new Promise(resolve=>release=resolve);
   if(v.action==='approve')c.status='approved';else if(v.action==='deny')c.status='denied';else if(v.action==='changes'){c.status='changes_requested';c.feedback=v.feedback;}else if(v.action==='edit'){Object.assign(c.input,v.fields);c.edit_fields.content.text=v.fields.content;c.edited_by_user=true;}else throw Error('Unexpected action');
   c.revision++;await r.fulfill({json:c});
  });
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin,{waitUntil:'domcontentloaded',timeout:30000});await page.locator('#prompt').waitFor();await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  const read=page.locator('[data-connector-artifact="read"]'),write=page.locator('[data-connector-artifact="write"]'),unknown=page.locator('[data-connector-artifact="unknown"]');
  try{await read.getByRole('button',{name:'Allow',exact:true}).waitFor();}catch(e){console.error('SETUP DOM',await page.locator('#content').innerText(),await read.count()?await read.evaluate(n=>n.outerHTML):'NO CARD',errors);await page.screenshot({path:path.join(out,'setup-failure.png'),fullPage:true});throw e;}
  if(process.env.KINDRED_INLINE_VISUAL){
   const issues=[],measurements={};
   const summary=read.locator('.connector-request-details > summary');
   measurements.chevron=await summary.evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);const b=n.getBoundingClientRect(),t=r.getBoundingClientRect(),p=getComputedStyle(n,'::before');return {textInset:t.x-b.x,chevronRight:parseFloat(p.left)+parseFloat(p.width)};});
   if(measurements.chevron.textInset<measurements.chevron.chevronRight+2)issues.push('H2 chevron overlaps text');
   const visibleSubmit=async(label)=>{
    const b=write.getByRole('button',{name:label,exact:true});await b.focus();
    const v=await b.evaluate(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect(),body=getComputedStyle(document.body);return {color:s.color,fill:s.backgroundColor,page:body.backgroundColor,width:r.width,height:r.height,outline:s.outlineWidth,outlineStyle:s.outlineStyle};});
    const rgb=x=>(x.match(/[\d.]+/g)||[]).slice(0,3).map(Number),lum=x=>rgb(x).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0),contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    v.contrast=contrast(v.color,v.fill==='rgba(0, 0, 0, 0)'?v.page:v.fill);measurements[label]=v;
    if(v.width<=0||v.height<=0||v.contrast<4.5)issues.push('H1 '+label+' invisible');
    await write.screenshot({path:path.join(out,`${engine}-${width}-${theme}-${label.startsWith('Save')?'edit':'feedback'}.png`)});
   };
   await write.getByRole('button',{name:'Edit fields',exact:true}).click();await visibleSubmit('Save field changes');await write.getByLabel('Page body').press('Escape');
   await write.getByRole('button',{name:'Ask for changes…',exact:true}).click();await write.getByLabel('What would you like changed?').fill('Visible feedback submit.');await visibleSubmit('Request changes');await write.getByLabel('What would you like changed?').press('Escape');
   assert.deepEqual(actions,[],'Visibility checks never approve or save');assert.deepEqual(errors,[]);results.push({width,theme,measurements,issues});await context.close();continue;
  }
  assert.equal(await read.getAttribute('role'),'group');assert.equal(await read.getAttribute('aria-label'),'Approval request: Read a Confluence page');
  assert.equal(await read.locator('.connector-request-title').textContent(),'Read a Confluence page');assert.equal(await unknown.locator('.connector-request-title').textContent(),'getButActuallyWrite');
  assert(await unknown.locator('.connector-artifact-content > .connector-record-fields').innerText().then(t=>t.includes('(empty)')&&t.includes('Sub-item name')&&t.includes('overwrite')&&t.includes('9')&&t.includes('Nested change data')),'Nested proposed fields and an empty replacement remain visible');
  assert.equal(await unknown.evaluate(n=>n.classList.contains('connector-request-write')),true,'Never infer read-only from a get prefix');
  assert.equal(await read.locator('.connector-request-title').getByText(/via Claude/).count(),0);assert.equal(await read.getByRole('button',{name:/always|future/i}).count(),0);
  assert.equal(await read.locator('.connector-request-details').evaluate(n=>n.open),false);
  assert(await read.locator('.connector-artifact-content > .connector-record-fields').innerText().then(t=>t.includes('2580054428')&&t.includes('https://tenant.example.invalid')));
  assert(await write.locator('.connector-artifact-content > .connector-record-fields').innerText().then(t=>t.includes(cards[1].input.content)&&t.includes('Version')&&t.includes('4')),'Exact write input visible even with a preview');
  const geom=await read.evaluate(n=>{const s=getComputedStyle(n),b=n.querySelector('.connector-request-allow'),v=getComputedStyle(b),r=b.getBoundingClientRect();return {background:s.backgroundColor,border:s.borderTopWidth,radius:s.borderRadius,buttonBackground:v.backgroundColor,buttonColor:v.color,buttonHeight:r.height,logo:n.querySelector('.connector-logo').getBoundingClientRect().width,width:n.getBoundingClientRect().width};});
  assert.equal(geom.background,'rgba(0, 0, 0, 0)');assert.equal(geom.border,'0px');assert.equal(geom.radius,'0px');assert(geom.logo>=14&&geom.logo<=16);if(phone)assert(geom.buttonHeight>=44);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await read.scrollIntoViewIfNeeded();await read.screenshot({path:path.join(out,`${engine}-${width}-${theme}-read.png`)});await write.scrollIntoViewIfNeeded();await write.screenshot({path:path.join(out,`${engine}-${width}-${theme}-write.png`)});
  const activate=async locator=>phone?locator.tap():locator.click();
  const details=read.locator('.connector-request-details > summary');await activate(details);assert.equal(await read.locator('.connector-request-details').evaluate(n=>n.open),true);const provenance=await read.locator('.connector-request-details').innerText();assert(provenance.includes('getConfluencePage')&&provenance.includes('Claude')&&provenance.includes('This request only'));
  await activate(write.getByRole('button',{name:'Edit fields',exact:true}));const edit=write.getByRole('form',{name:'Edit connector fields'});await edit.getByLabel('Page body').fill('Reviewed replacement with <literal markup>.');assert(await write.getByRole('button',{name:'Allow',exact:true}).isDisabled());await edit.getByRole('button',{name:'Save field changes'}).click();await write.getByText('Includes your saved edits',{exact:true}).waitFor();assert.equal(actions.at(-1).action,'edit');assert.deepEqual(actions.at(-1).fields,{content:'Reviewed replacement with <literal markup>.'});assert.equal(cards[1].status,'pending');assert.equal(cards[1].input.pageId,'2580054428');
  await activate(write.getByRole('button',{name:'Ask for changes…',exact:true}));await write.getByLabel('What would you like changed?').fill('Please keep the source references.');assert(await write.getByRole('button',{name:'Allow',exact:true}).isDisabled());await write.getByRole('button',{name:'Request changes',exact:true}).click();await write.getByText('Your feedback: Please keep the source references.',{exact:true}).waitFor();assert.equal(actions.at(-1).action,'changes');assert.equal(actions.at(-1).feedback,'Please keep the source references.');assert.equal(await page.evaluate(()=>document.activeElement===document.body),false);
  holding=true;const allow=read.getByRole('button',{name:'Allow',exact:true});await activate(allow);await page.waitForFunction(()=>document.querySelector('[data-connector-artifact="read"] button.connector-request-allow')?.disabled);assert.equal(actions.filter(a=>a.id==='read').length,1);assert.deepEqual(actions.find(a=>a.id==='read'),{id:'read',action:'approve',revision:3});release();holding=false;
  await page.getByText('Approved · waiting to run',{exact:true}).first().waitFor({state:'attached'});assert.equal(cards[0].status,'approved');await page.waitForFunction(()=>document.activeElement!==document.body);assert.equal(await page.evaluate(()=>document.activeElement===document.body),false,'Decision focus stays on the receipt/call');
  await activate(unknown.getByRole('button',{name:'Decline',exact:true}));assert.equal(actions.at(-1).action,'deny');assert.equal(cards[2].status,'denied');assert.deepEqual(errors,[]);
  results.push({width,theme,geometry:geom,actions:actions.map(a=>({id:a.id,action:a.action,revision:a.revision})),errors});await context.close();
 }
 const passed=results.every(c=>!c.issues?.length);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed,engine,cases:results},null,2));assert(passed,'Visual H1/H2 checks failed; see result.json');console.log(JSON.stringify({passed:true,engine,cases:results.length,scope:'synthetic browser; no connector execution'}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});

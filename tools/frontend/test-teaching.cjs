// Real teaching UI and input events; only the VM transport and HTTP API are fixtures.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');
fs.mkdirSync(artifacts,{recursive:true});
const vendor=`export * from './vendor.js?real';
export class RFB extends EventTarget {
 constructor(host){super();this.canvas=document.createElement('canvas');this.canvas.width=1280;this.canvas.height=800;this.canvas.tabIndex=0;
 this.canvas.style.cssText='width:100%;height:100%;object-fit:contain';host.append(this.canvas);
 const c=this.canvas.getContext('2d');c.fillStyle='#1c3038';c.fillRect(0,0,1280,800);c.fillStyle='#eee';c.font='30px sans-serif';c.fillText('Weekly reports · demonstration fixture',40,80);
 setTimeout(()=>this.dispatchEvent(new Event('connect')),30);}
 disconnect(){this.canvas.remove();this.dispatchEvent(new Event('disconnect'));}
}`;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true,...(process.env.WEBKIT?{}:{args:['--no-sandbox','--disable-dev-shm-usage']})});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage();p.setDefaultTimeout(15000);
  const errors=[],writes=[],sends=[],takeovers=[];let skills=[],controlled=false,failSave=false,confirmReplace=false;
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>confirmReplace?d.accept():d.dismiss());
  const commands=()=>skills.map(s=>({name:s.command,skill_name:s.name,description:s.description,parameters:[],source:'skill',action:'run',usage:'/'+s.command}));
  await context.route(origin+'/vendor.js',r=>r.fulfill({body:vendor,contentType:'text/javascript'}));
  await context.route(origin+'/api/**',r=>{
   const request=r.request(),u=new URL(request.url()),name=u.pathname,method=request.method(),send=json=>r.fulfill({json});
   if(name==='/api/status')return send({version:'test',screen_bot_id:'piper',takeover:controlled,vm_enabled:true});
   if(name==='/api/takeover'){const input=request.postDataJSON();takeovers.push(input);controlled=input.enabled;return send({enabled:controlled});}
   if(name==='/api/computer/session')return send({ticket:'fixture',control:controlled});
   if(name==='/api/computer/resources')return send({});
   if(name==='/api/commands')return send(commands());
   if(name==='/api/skills'){
    if(method!=='POST')return send(skills);
    if(failSave)return r.fulfill({status:503,json:{error:'Skill storage temporarily unavailable'}});
    const input=request.postDataJSON();writes.push(input);
    const saved={...input,command:'weekly-report',parameters:[]};skills=[saved];return send(saved);
   }
   if(name==='/api/chats/dm-piper/messages'&&method==='POST'){sends.push(request.postDataJSON());return send({runs:[]});}
   return r.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.goto(origin);await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();
  const editor=p.locator('#prompt'),bar=p.locator('#teaching-bar');
  // Warm the command cache before saving, so reuse also checks invalidation.
  await editor.fill('/');await editor.press('Escape');await editor.fill('');
  const start=async()=>{
   await p.locator('#composer-actions').click();await p.getByRole('menuitem',{name:'Teach a task',exact:true}).click();
   const dialog=p.locator('.teach-dialog[open]');await dialog.getByLabel('Skill name',{exact:true}).fill('Weekly report');
   await dialog.getByLabel('What should your bot learn?').fill('Prepare the current week’s report.');
   await dialog.getByRole('button',{name:'Start teaching',exact:true}).click();
   try{await bar.getByText('Recording · 0 steps',{exact:true}).waitFor();}catch(error){
    await p.screenshot({path:path.join(artifacts,'teaching-'+engine+'-start-failure.png')});
    console.error({notice:await p.locator('#notice').textContent(),mode:await p.locator('#desktop-mode').textContent(),controlled,takeovers,errors});throw error;
   }
  };
  const add=async note=>{
   await bar.getByRole('button',{name:'Add step',exact:true}).click();
   const dialog=p.locator('.teach-dialog[open]');await dialog.getByLabel('What did you do, and why?').fill(note);
   await dialog.getByRole('button',{name:'Add step',exact:true}).click();await dialog.waitFor({state:'hidden'});
  };
  await start();assert(controlled);assert.equal(takeovers[0].reason,'teaching');
  const canvas=p.locator('.desktop-canvas canvas');await canvas.click();await canvas.press('ArrowDown');
  await canvas.pressSequentially('private-demo-password');
  await bar.getByRole('button',{name:'Add step',exact:true}).click();
  let step=p.locator('.teach-dialog[open]');await step.getByLabel('What did you do, and why?').fill('   ');
  await step.getByRole('button',{name:'Add step',exact:true}).click();assert(await step.isVisible());
  await step.getByLabel('What did you do, and why?').fill('Open Reports and select the current week, not a fixed date.');
  await step.getByRole('button',{name:'Add step',exact:true}).click();await bar.getByText('Recording · 1 step',{exact:true}).waitFor();
  await bar.getByRole('button',{name:'Pause',exact:true}).click();await canvas.press('F7');
  await bar.getByRole('button',{name:'Finish',exact:true}).click();
  let review=p.locator('.teach-review[open]');await review.getByLabel('When to use this skill').fill('Prepare the weekly project report for review.');
  await review.getByLabel('Step 1',{exact:true}).fill('Open Reports and choose the current week. Verify its date range.');
  await review.getByLabel('How should the bot verify success?').fill('Check the date range and totals against the source.');
  const recorded=await review.locator('.teaching-log').textContent();assert(recorded.includes('Key ArrowDown'));assert(recorded.includes('Typed text (omitted)'));assert(!recorded.includes('F7')&&!recorded.includes('private-demo-password'));
  await review.getByRole('button',{name:'Keep teaching',exact:true}).click();await bar.getByText('Recording · 1 step',{exact:true}).waitFor();
  await canvas.press('ArrowUp');await add('Check that each project has an owner and a current status.');
  // A valid detailed lesson above the obsolete 16 KB limit can be saved.
  for(let i=0;i<6;i++)await add('Review section '+(i+1)+'. '+'Compare the current report with its source and explain any difference. '.repeat(40));
  await bar.getByRole('button',{name:'Finish',exact:true}).click();review=p.locator('.teach-review[open]');
  assert.equal(await review.getByLabel('When to use this skill').inputValue(),'Prepare the weekly project report for review.');
  assert.equal(await review.getByLabel('How should the bot verify success?').inputValue(),'Check the date range and totals against the source.');
  assert((await review.locator('.teaching-log').allTextContents()).join('').includes('Key ArrowUp'));
  // Failed persistence leaves the lesson editable, paused and under human control.
  failSave=true;await review.getByRole('button',{name:'Save skill & return control',exact:true}).click();
  await p.getByText('Skill storage temporarily unavailable',{exact:true}).waitFor();assert(await review.isVisible());assert(controlled);assert.equal(writes.length,0);
  failSave=false;await review.getByRole('button',{name:'Save skill & return control',exact:true}).click();
  await review.waitFor({state:'hidden'});await p.getByText('Skill saved as /weekly-report.',{exact:false}).waitFor();
  assert(!controlled);assert(await bar.isHidden());assert.equal(writes.length,1);assert.equal(sends.length,0);
  assert(Buffer.byteLength(writes[0].body)>16000);assert(writes[0].body.includes('Verify success: Check the date range'));
  assert.equal(writes[0].description,'Prepare the weekly project report for review.');
  assert.deepEqual(Object.keys(writes[0]).sort(),['body','description','name']);
  assert(!JSON.stringify(writes).match(/data:image|private-demo-password|Key ArrowUp|Click at/));
  await p.locator('#computer-close').click();await editor.fill('/weekly');
  await p.locator('#command-options').getByRole('option').filter({hasText:'/weekly-report'}).waitFor();
  await p.screenshot({path:path.join(artifacts,'teaching-'+engine+'-command.png')});
  await editor.press('Enter');await editor.press('Escape');await p.locator('#send').click();
  await p.waitForFunction(()=>document.querySelector('#prompt').value==='');assert.equal(sends.length,1);assert.equal(sends[0].prompt.trim(),'/weekly-report');
  // Reload and library discovery use the persisted entry, not transient UI state.
  await p.reload();await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();
  await p.locator('#settings-button').click();await p.getByRole('button',{name:'Skills',exact:true}).click();
  await p.locator('.skill-row').filter({hasText:'Weekly report'}).waitFor();await p.locator('#settings-close').click();
  // Re-teaching a name asks before replacement. Declining keeps both copies intact.
  await start();await add('A replacement procedure.');await bar.getByRole('button',{name:'Finish',exact:true}).click();
  review=p.locator('.teach-review[open]');await review.getByLabel('How should the bot verify success?').fill('Verify the updated result.');
  await review.getByRole('button',{name:'Save skill & return control',exact:true}).click();
  await review.getByRole('button',{name:'Save skill & return control',exact:true}).waitFor({state:'visible'});
  assert.equal(writes.length,1);assert(await review.isVisible());assert(controlled);
  // Mobile/light review fits, and discard doesn't start a workflow or release control.
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>document.documentElement.dataset.theme='light');
  await review.evaluate(async n=>Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const bounds=await review.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391);
  await p.screenshot({path:path.join(artifacts,'teaching-'+engine+'-mobile.png')});
  confirmReplace=true;await review.getByRole('button',{name:'Discard lesson',exact:true}).click();await review.waitFor({state:'hidden'});
  assert(await bar.isHidden());assert(controlled);assert.equal(writes.length,1);assert.equal(sends.length,1);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,demonstration:true,pausePrivacy:true,resumeAndReviewEdits:true,saveFailureRecovery:true,detailedLesson:true,commandReuse:true,reloadLibrary:true,replaceConsent:true,responsive:true}));
  await context.close();
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

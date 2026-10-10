const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try {
  const context=await browser.newContext({viewport:{width:1100,height:760},hasTouch:!!process.env.TOUCH}),p=await context.newPage(),errors=[],writes=[];
  p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false};
  const messages=[{seq:1,sender:'user',text:'Please review the report and highlight anything that needs my attention.',kind:'message',created:now-60},
    {seq:2,sender:'piper',text:'I have the report ready. The browser needs a quick verification before I can check the supporting evidence.',run_id:'takeover-run',kind:'assistant',created:now-55}];
  await context.route(origin+'/api/**',async route=>{
   const request=route.request(),name=new URL(request.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(request.method()!=='GET')writes.push(name);
   if(name==='/chats/'+chat.id)return send({chat,messages});
   if(name==='/runs')return send([{id:'takeover-run',bot_id:'piper',chat_id:chat.id,status:'awaiting_user',created:now-55,prompt:messages[0].text,output:'',error:''}]);
   if(name==='/runs/takeover-run')return send({run:{id:'takeover-run',bot_id:'piper',chat_id:chat.id,status:'awaiting_user',created:now-55},events:[],approvals:[],attachments:[]});
   if(name==='/user-tasks')return send([{id:'takeover-step',run_id:'takeover-run',bot_id:'piper',title:'Complete browser verification',instructions:'Complete the verification in the browser, then return control.',status:'pending',created:now-50}]);
   if(name==='/activity')return send({});
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  await p.getByText(messages[1].text,{exact:true}).waitFor();assert.equal(await p.locator('.model-change-notice').count(),0);
  messages.push({seq:3,sender:'system',kind:'model_change',text:'Model changed from claude-opus-5-5 to gpt-6-luna.',created:now,
    model_change:{from:{provider:'claude-code',model:'claude-opus-5-5'},to:{provider:'codex',model:'gpt-6-luna'}}});
  const row=p.locator('.model-change-notice');await row.waitFor();
  assert.match((await row.innerText()).replace(/\s+/g,' '),/Model changed from Opus 5.5 to Luna 6/);
  assert.equal(await row.locator('.model-change-mark').count(),2);assert.equal(await row.locator('.provider-symbol[data-provider="claude-code"]').count(),1);
  assert(await row.evaluate(el=>{const r=el.getBoundingClientRect(),c=el.querySelector('.model-change-copy').getBoundingClientRect();return Math.abs((r.left+r.right)-(c.left+c.right))<2&&getComputedStyle(el,'::before').height==='1px'&&getComputedStyle(el,'::after').height==='1px';}),'System notice is centered between two separator lines');
  assert.equal(await row.locator('button').count(),0);assert.equal(await row.locator('.bubble,.task-card').count(),0);
  for(const theme of ['dark','light']){
   await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const style=await row.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopWidth,font:parseFloat(s.fontSize),scale:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--text-scale'))||1};});
   assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.border,'0px');assert(Math.abs(style.font-12*style.scale)<.01);
   assert.equal(await row.locator('.openai-'+(theme==='dark'?'white':'black')).isVisible(),true);
   await p.screenshot({path:path.join(out,engine+'-model-'+theme+'.png')});
  }
  await p.reload();await row.waitFor();assert.equal(await row.count(),1,'Reload preserves the single persisted notice');
  const second=await context.newPage();await second.goto(origin);await second.locator('.model-change-notice').waitFor();assert.equal(await second.locator('.model-change-notice').count(),1);await second.close();
  messages.push({seq:4,sender:'system',kind:'model_change',text:'Model changed.',created:now+1,model_change:{from:{provider:'codex',model:''},to:{provider:'custom-test',model:'<unsafe>extremely-long-model-name'.repeat(8)}}});
  await row.nth(1).waitFor();assert.match(await row.nth(1).innerText(),/Default model/);assert.equal(await row.nth(1).locator('unsafe').count(),0);
  await p.setViewportSize({width:320,height:700});await p.evaluate(()=>document.documentElement.style.setProperty('--text-scale','1.5'));
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await row.evaluateAll(rows=>rows.every(el=>el.scrollWidth<=el.clientWidth)));
  await p.screenshot({path:path.join(out,engine+'-model-narrow.png')});
  assert.deepEqual(writes.filter(n=>!['/settings/timezone/initialize','/codex/account','/provider-cli/claude-code/account','/provider-cli/kimi-code/account'].includes(n)),[],'Notices add no catalog requests or mutation beyond normal startup');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,livePoll:true,reload:true,secondClient:true,providerMarks:true,narrowLargeText:true,untrustedLabels:true,readOnly:true}));
 } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

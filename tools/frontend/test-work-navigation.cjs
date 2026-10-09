const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});try{
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.join(require('node:os').tmpdir(),'kindred-work-navigation');fs.mkdirSync(out,{recursive:true});
 const p=await browser.newPage({viewport:{width:1100,height:760}}),origin='http://127.0.0.1:'+server.address().port,now=Math.floor(Date.now()/1000),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const chats=[{id:'dm-piper',name:'Orion',members:['piper'],archived:false},{id:'dm-requester',name:'Ochrane',members:['requester'],archived:false},{id:'team-helper',name:'Helper work',members:['piper'],bot_only:true,archived:false}];
 const primary={id:'primary-run',bot_id:'piper',chat_id:'dm-piper',status:'running',output:'',error:'',prompt:'Review results.',created:now-20};
 const run={id:'helper-run',bot_id:'piper',chat_id:'team-helper',status:'queued',output:'',error:'',prompt:'Help Ochrane.',created:now-10,delegation:{run_id:'helper-run',requester_bot_id:'requester',source_chat_id:'dm-requester'}};
 await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await p.route('**/api/**',async r=>{const name=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});
  if(name==='/api/bots'){const response=await r.fetch(),bots=await response.json();return send([{...bots[0],name:'Orion',profile:{...bots[0].profile,color:'#ff922b',shape:'flower'}},{...bots[0],id:'requester',name:'Ochrane'},{...bots[0],id:'seneca',name:'Seneca',profile:{...bots[0].profile,color:'#2475ff',shape:'triangle'}}]);}
  if(name==='/api/chats')return send(chats);
  if(name.startsWith('/api/chats/')&&!name.slice(11).includes('/'))return send({chat:chats.find(c=>name.endsWith(c.id)),messages:[],pending_waits:name.endsWith('dm-piper')?[{run_id:'seneca-run',parent_run_id:primary.id,bot_id:'seneca',requester_bot_id:'piper',chat_id:'team-helper'}]:[],page:{has_before:false,has_after:false}});
  if(name==='/api/runs')return send([primary,run]);if(name==='/api/runs/helper-run')return send({run,events:[],approvals:[]});if(name==='/api/runs/primary-run')return send({run:primary,events:[],approvals:[]});
  if(name==='/api/activity')return send({piper:{status:'running',shape:'reading',label:'Reviewing results',run_id:primary.id,server_time:now,started_at:now}});
  return r.continue();
 });
 await p.goto(origin);const group=p.locator('.helper-work'),open=group.getByRole('button',{name:"Open Ochrane's chat",exact:true});await open.waitFor();
 const secondary=group.locator('.work-line'),waiting=p.locator('.collaboration-wait .collaboration-wait-row'),main=p.locator('.work-line:not(.collaboration-wait-row)');
 const style=locator=>locator.evaluate(n=>({font:getComputedStyle(n).fontSize,gap:getComputedStyle(n).gap,padding:getComputedStyle(n).padding,avatar:n.querySelector('.character').style.width}));
 assert.deepEqual(await style(secondary),await style(waiting));assert.equal((await style(main)).avatar,'48px');assert.equal((await style(secondary)).avatar,'24px');
 assert.equal(await group.locator(':scope > button').count(),0);assert.equal(await open.locator('svg').count(),1);
 assert(await open.evaluate(n=>n.previousElementSibling.classList.contains('work-label')));
 await p.mouse.move(0,0);await p.waitForTimeout(180);assert.equal(await open.evaluate(n=>getComputedStyle(n).opacity),'0');
 for(const theme of ['light','dark']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await group.locator('.work-line').hover();await p.waitForTimeout(180);assert.equal(await open.evaluate(n=>getComputedStyle(n).opacity),'1');assert.equal(await group.locator('.work-stop').evaluate(n=>getComputedStyle(n).opacity),'1');await group.screenshot({path:path.join(out,'waiting-'+theme+'-hover.png')});await p.locator('#content').screenshot({path:path.join(out,'hierarchy-'+theme+'.png')});}
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await group.screenshot({path:path.join(out,'waiting-mobile.png')});await p.setViewportSize({width:1100,height:760});
 await p.mouse.move(0,0);await open.focus();await p.waitForTimeout(180);assert.equal(await open.evaluate(n=>getComputedStyle(n).opacity),'1');
 await p.waitForTimeout(1200);assert(await open.evaluate(n=>document.activeElement===n));await open.press('Enter');await p.waitForFunction(()=>document.querySelector('#bot-details')?.textContent.includes('Ochrane'));assert.equal(await p.locator('.helper-work').count(),0);

 const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const tp=await touch.newPage();await tp.goto(origin);await tp.setContent('<link rel="stylesheet" href="/style.css"><div class="work-line"><span class="work-label">Waiting for Ochrane <time>0s</time></span><button class="icon-button work-open" aria-label="Open chat">↗</button></div>');assert.equal(await tp.locator('.work-open').evaluate(n=>getComputedStyle(n).opacity),'1');await touch.close();
 assert.deepEqual(errors,[]);console.log('Waiting-row hierarchy and navigation: matching secondary sizing, primary avatar retained, hover, keyboard, touch visibility and chat target passed.');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});

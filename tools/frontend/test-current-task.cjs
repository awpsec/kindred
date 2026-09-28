const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();try{
 const p=await browser.newPage({viewport:{width:1200,height:740}}),origin='http://127.0.0.1:'+server.address().port,errors=[],writes=[];let task={label:'ACME Corp External Pen',revision:3};
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/current-task');fs.mkdirSync(out,{recursive:true});p.on('pageerror',e=>errors.push(e.message));
 await p.route(origin+'/api/bots',r=>r.fulfill({json:[{id:'piper',name:'Seneca',provider:'codex',model:'test',instructions:'Fixture',memory:'',profile:{shape:'triangle',color:'#2475ff',label:'Tester',current_task:task}}]}));
 await p.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Seneca',members:['piper'],archived:false},messages:[{seq:1,sender:'user',text:'Keep track of the current assignment here.',kind:'message',created:1700000000}]}}));
 await p.route(origin+'/api/bots/piper/task',r=>{const body=r.request().postDataJSON();writes.push(body);assert.deepEqual(body,{label:'',expected_revision:3});task={label:'',revision:4};return r.fulfill({json:task});});
 await p.route(origin+'/api/commands',r=>r.fulfill({json:[{name:'task',description:'Set current task label',parameters:[{name:'label',required:true,rest:true}],action:'task',usage:'/task <label>',source:'built-in'}]}));
 await p.route(origin+'/api/chats/dm-piper/messages',r=>{if(r.request().method()!=='POST')return r.continue();assert.equal(r.request().postDataJSON().prompt,'/task Review notes');task={label:'Review notes',revision:5};return r.fulfill({json:{runs:[]}});});
 await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#prompt').waitFor();
 const badge=p.locator('#header-current-task');await badge.getByText('ACME Corp External Pen',{exact:true}).waitFor();
 assert.equal(await p.locator('.bot-current-task').count(),0);
 assert.equal(await p.locator('#bots .bot-label').textContent(),'Tester');
 const remove=badge.getByRole('button',{name:'Remove task label: ACME Corp External Pen'});await badge.hover();await p.waitForTimeout(160);assert.equal(await remove.evaluate(n=>getComputedStyle(n).opacity),'1');
 for(const theme of ['dark','light']){await p.evaluate(t=>{document.documentElement.dataset.theme=t;document.body.dataset.theme=t;},theme);await p.screenshot({path:path.join(out,engine+'-'+theme+'.png'),clip:{x:0,y:0,width:1200,height:220}});}
 await p.setViewportSize({width:390,height:844});assert(await badge.isHidden());
 await p.locator('#chat-actions').click();await p.getByText('Remove task label',{exact:true}).waitFor();await p.keyboard.press('Escape');
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.setViewportSize({width:1200,height:740});await remove.focus();await p.waitForFunction(()=>getComputedStyle(document.querySelector('.current-task-remove')).opacity==='1');
 await remove.click();await badge.waitFor({state:'hidden'});assert.equal(writes.length,1);assert.equal(await p.locator('.bot-current-task').count(),0);
 const editor=p.locator('#prompt');await editor.fill('/task Review notes');await p.locator('#send').click();await badge.getByText('Review notes',{exact:true}).waitFor();assert.equal(await editor.evaluate(n=>n.value),'');
 assert.deepEqual(errors,[]);console.log('Header/sidebar task labels, hover and keyboard removal, exact revision and live clearing passed');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

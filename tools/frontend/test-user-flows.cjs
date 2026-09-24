const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const ui=path.resolve(__dirname,'../../ui');
const artifactDir=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');
fs.mkdirSync(artifactDir,{recursive:true});
const origin=process.env.KINDRED_TEST_SERVER||'http://127.0.0.1:47961',token='fixture-session';
(async()=>{
const engine=process.env.WEBKIT?'webkit':process.env.KINDRED_TEST_BROWSER==='edge'?'edge':'chromium';
const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{...(process.env.KINDRED_TEST_BROWSER==='edge'?{channel:'msedge'}:{}),headless:true});
const context=await browser.newContext({viewport:{width:1320,height:860}}),p=await context.newPage();p.setDefaultTimeout(12000);
const errors=[],unexpected=[],writes=[],popups=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
context.on('page',tab=>{if(tab!==p)popups.push(tab);});
await context.route('https://connect.composio.dev/**',r=>r.fulfill({contentType:'text/html',body:'<title>Sign-in fixture</title><p>Authentication provider fixture. No real sign-in.</p>'}));
const files={'/':'index.html','/app.js':'app.js','/workspace-import.js':'workspace-import.js','/profiles.js':'profiles.js','/commands.js':'commands.js','/style.css':'style.css','/characters.js':'characters.js','/avatar-data.js':'avatar-data.js','/updates.js':'updates.js','/openai-black.svg':'openai-black.svg','/openai-white.svg':'openai-white.svg','/fixture-vendor.js':'vendor.js'};
for(const name of ['InterVariable.woff2','InterVariable-Italic.woff2','LiberationMono-Regular.ttf','LiberationMono-Bold.ttf','LiberationMono-Italic.ttf','LiberationMono-BoldItalic.ttf'])files['/fonts/'+name]='fonts/'+name;
for(const name of fs.readdirSync(ui))if(/\.(js|css|svg)$/.test(name)&&name!=='vendor.js')files['/'+name]=name;
await p.route(origin+'/**',async r=>{
 const path=new URL(r.request().url()).pathname;
 if(process.env.KINDRED_TEST_SERVER && files[path] && path!=='/fixture-vendor.js')return r.continue();
 if(path==='/identity/meta')return r.fulfill({json:{profiles:false}});
 if(files[path])return r.fulfill({body:fs.readFileSync(ui+'/'+files[path]),contentType:path==='/'?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.woff2')?'font/woff2':path.endsWith('.ttf')?'font/ttf':'text/javascript'});
 if(path==='/vendor.js')return r.fulfill({contentType:'text/javascript',body:`export {marked,DOMPurify,hljs} from '/fixture-vendor.js';export class RFB extends EventTarget {constructor(host,url){super();this.canvas=document.createElement('canvas');this.canvas.width=1280;this.canvas.height=800;this.canvas.tabIndex=0;this.canvas.style.cssText='width:100%;height:100%;object-fit:contain;';host.append(this.canvas);const c=this.canvas.getContext('2d');c.fillStyle='#1c1c1c';c.fillRect(0,0,1280,800);c.fillStyle='#ddd';c.font='28px sans-serif';c.fillText('Sign-in page · computer fixture',70,90);setTimeout(()=>this.dispatchEvent(new Event('connect')),1600);}disconnect(){this.canvas.remove();this.dispatchEvent(new Event('disconnect'));}}`});
 if(path==='/favicon.svg')return r.fulfill({status:204});
 if(!path.startsWith('/api/'))unexpected.push(path);
 return r.fulfill({status:404,json:{error:'Missing fixture '+path}});
});
const profile={shape:'round',color:'#2475ff',eyes:'curious',animated:true,pinned:false,archived:false,label:'Assistant',description:'A thoughtful helper for everyday work.'};
let bots=[{id:'piper',name:'Piper',provider:'codex',model:'test',reasoning_effort:'high',instructions:'Help the user',memory:'',approval_mode:'ask',profile:{...profile}},{id:'juniper',name:'Juniper',provider:'openrouter',model:'test',reasoning_effort:'',instructions:'Help the user',memory:'',approval_mode:'ask',profile:{...profile,shape:'triangle',color:'#2ec767',label:'Personal'}}];
const now=Math.floor(Date.now()/1000);
let runs=[{id:'run-human',bot_id:'piper',chat_id:'dm-piper',prompt:'Help me prepare my weekly overview.',status:'awaiting_user',output:'',error:'',created:now,depth:0},{id:'run-approval',bot_id:'juniper',chat_id:'dm-juniper',prompt:'Create a weekly review routine.',status:'awaiting_approval',output:'',error:'',created:now,depth:0}];
let human={id:'human-1',run_id:'run-human',bot_id:'piper',title:'Sign in',instructions:'I’ve opened the sign-in page. Take over to sign in, then press Done with subtask and I’ll continue your overview.',status:'pending',outcome:'',created:now};
let approval={id:'approval-1',run_id:'run-approval',tool:'routine_create',args:{name:'Weekly overview',interval_seconds:604800,prompt:'Prepare a weekly overview'},status:'pending'};
let takeovers={},connects=0,checkCalls=0,toolsAccounts=[],accounts=[{id:'ca_default',name:'default',toolkit:'gmail',status:'ACTIVE',permission:'read',checked_at:now},{id:'ca_personal',name:'personal',toolkit:'gmail',status:'ACTIVE',permission:'ask',checked_at:now},{id:'ca_household',name:'household',toolkit:'gmail',status:'INITIATED',permission:'read',checked_at:0}];
const gmail=()=>({id:'gmail',name:'Gmail',description:'Search, read, draft, and manage email.',tools_count:31,accounts:structuredClone(accounts)});
await p.route(origin+'/api/**',async r=>{
 const u=new URL(r.request().url()),path=u.pathname.slice(4),method=r.request().method(),body=method==='GET'?null:r.request().postDataJSON();
 const ok=data=>r.fulfill({json:data});if(method!=='GET')writes.push({path,body});
 if(path==='/settings/timezone/initialize')return ok({timezone:'America/New_York',initialized:true});
 if(path==='/settings')return ok({name:'You',theme:'dark',identity:'',approval_mode:'ask',reduced_motion:false});
 if(path==='/connections')return ok({apps:[]});
 if(path==='/providers')return ok({providers:[]});
 if(path==='/attention')return ok({bots:{},chats:{}});
 if(path==='/commands')return ok([]);
 if(path==='/bots')return ok(bots);
 if(path.startsWith('/bots/')){bots=bots.map(b=>b.id===body.id?body:b);return ok(body);}
 if(path==='/status')return ok({version:'0.11.1',vm:'kindred-computer',screen_bot_id:u.searchParams.get('bot_id'),takeover:!!takeovers[u.searchParams.get('bot_id')],computer_recovering_seconds:0,max_parallel_runs:4});
 if(path==='/runs')return ok(runs);
 if(path.startsWith('/runs/')&&path.endsWith('/cancel'))return ok({ok:true});
 if(path.startsWith('/runs/')){const run=runs.find(x=>x.id===path.split('/')[2]);return ok({run,events:[{seq:1,kind:'assistant',created:now,body:{text:run.bot_id==='piper'?'I need you to sign in before I can continue.':'I can keep a weekly overview ready for you.'}}],approvals:run.id==='run-approval'?[approval]:[]});}
 if(path==='/user-tasks')return ok([human]);
 if(path==='/user-tasks/human-1/complete'){assert.equal(body.bot_id,'piper');assert.equal(body.run_id,'run-human');human={...human,status:'resumed',outcome:body.outcome};runs[0]={...runs[0],status:'completed',output:'The same task continued after you returned control.'};takeovers.piper=false;return ok({ok:true,status:'ready'});}
 if(path==='/approvals')return ok(approval.status==='pending'?[approval]:[]);
 if(path==='/approvals/approval-1'){approval.status=body.approved?'approved':'denied';runs[1]={...runs[1],status:'completed',output:'Your permission was recorded.'};return ok({ok:true});}
 if(path==='/routines')return ok([]);
 if(path==='/skills')return ok([]);
 if(path==='/activity')return ok(Object.fromEntries(runs.map(run=>[run.bot_id,{action:run.status==='completed'?'idle':'waiting',label:run.status==='awaiting_user'?'Waiting for you':run.status==='awaiting_approval'?'Waiting for your okay':'Ready',status:run.status,created:now}])));
 if(path==='/chats')return ok(bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false,pinned:false})));
 if(path.startsWith('/chats/')){const id=path.split('/')[2],bot=id.slice(3),run=runs.find(r=>r.bot_id===bot);const messages=[{seq:1,sender:'user',text:run.prompt,created:now,kind:'message',run_id:run.id}];if(run.status==='completed')messages.push({seq:2,sender:bot,text:run.output,created:now,kind:'result',run_id:run.id});return ok({chat:{id,name:bot,members:[bot]},messages});}
 if(path==='/takeover'){takeovers[body.bot_id]=body.enabled;return ok({enabled:body.enabled});}
 if(path==='/computer/session')return ok({ticket:'fixture',control:!!takeovers[body.bot_id]});
 if(path==='/computer/resources')return ok({sampled_at:now,uptime_seconds:3600,cpu_percent:4,cpus:4,memory_used:2000000000,memory_total:6000000000,disk_used:5000000000,disk_total:24000000000});
 if(path==='/computer')return ok({image:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#1c1c1c"/></svg>')});
 if(path==='/composio')return ok({configured:true,apps:[gmail()]});
 if(path==='/marketplace')return ok({items:[gmail(),{id:'googlecalendar',name:'Google Calendar',description:'Search events and schedule meetings.',accounts:[]},{id:'googledrive',name:'Google Drive',description:'Search, read, create, and share files.',accounts:[]},{id:'github',name:'GitHub',description:'Work with repositories, issues, and pull requests.',accounts:[]}],next_cursor:null});
 if(path==='/marketplace/gmail/tools'){toolsAccounts.push(u.searchParams.get('account_id'));return ok({items:[{name:'Get profile',description:'Read the selected account profile.',requires_approval:false}],next_cursor:null});}
 if(path.startsWith('/composio/gmail/')){const action=path.split('/').pop();
   if(action==='connect'){connects++;assert.equal(body.name,'Side project');assert.equal(body.permission,'read');accounts.push({id:'ca_side',name:body.name,toolkit:'gmail',status:'INITIATED',permission:body.permission});await new Promise(res=>setTimeout(res,350));return ok({account_id:'ca_side',redirect_url:'https://connect.composio.dev/link/fixture'});}
   if(action==='check'){checkCalls++;const a=accounts.find(a=>a.id===body.account_id);if(a.id==='ca_side')a.status='ACTIVE';return ok(a);}
   if(action==='rename'){accounts.find(a=>a.id===body.account_id).name=body.name;return ok({ok:true});}
   if(action==='disconnect'){accounts=accounts.filter(a=>a.id!==body.account_id);return ok({ok:true});}
   if(action==='authenticate')return ok({account_id:body.account_id,redirect_url:'https://connect.composio.dev/link/fixture'});
 }
 unexpected.push(method+' '+path);return r.fulfill({status:400,json:{error:'Missing fixture '+path}});
});
await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
await p.goto(origin);try{await p.locator('.human-task').waitFor();}catch(e){console.error(JSON.stringify({errors,unexpected,body:await p.locator('body').innerText()}));throw e;}
assert.equal(await p.locator('#bots .character').first().evaluate(n=>n.getBoundingClientRect().width),44);
await p.screenshot({path:`${artifactDir}/kindred-${engine}-conversation.png`});
await p.locator('.human-task').getByRole('button',{name:'Take over',exact:true}).click();
await p.locator('#done-subtask').waitFor();assert(takeovers.piper);assert.equal(writes.filter(w=>w.path.endsWith('/cancel')).length,0);
const staticBot=p.locator('#desktop-loading .character');await staticBot.waitFor();
assert.equal(await staticBot.locator('svg').count(),1);assert.equal(await staticBot.evaluate(n=>n.getAnimations({subtree:true}).length),0);assert.equal(await p.locator('#desktop-loading .working-glimmer').textContent(),'Connecting');
await p.getByText('You have control',{exact:true}).waitFor();assert(!/NaN|Invalid Date/.test(await p.locator('body').innerText()));await p.screenshot({path:`${artifactDir}/kindred-${engine}-takeover.png`});
await p.locator('#done-subtask').evaluate(n=>{n.click();n.click();});
await p.getByText('Watching live',{exact:true}).waitFor();assert(!takeovers.piper);assert.equal(writes.filter(w=>w.path.includes('/complete')).length,1);
await p.locator('#computer-close').click();await p.locator('.human-task .task-badge').getByText('Done',{exact:true}).waitFor();
await p.locator('#bots').getByRole('button',{name:'Juniper',exact:true}).click();await p.locator('.approval').waitFor();
assert.equal(await p.locator('.approval .task-details').evaluate(n=>n.open),false);
await p.locator('.approval').getByText('Show the details',{exact:true}).click();assert((await p.locator('.approval pre').textContent()).includes('604800'));
await p.locator('.approval').getByRole('button',{name:'Allow once',exact:true}).click();await p.getByText('Allowed once',{exact:true}).waitFor();
await p.locator('#marketplace-button').click();await p.locator('[data-app-id=gmail]').getByRole('button',{name:'Added',exact:true}).click();
await p.locator('.account-row').nth(2).waitFor();assert.equal(await p.locator('.account-row').count(),3);
await p.waitForTimeout(260);await p.screenshot({path:`${artifactDir}/kindred-${engine}-accounts.png`});
await p.locator('[data-account-id=ca_household]').getByRole('button',{name:'Authenticate',exact:true}).click();
await p.getByRole('link',{name:'Open sign-in again',exact:true}).waitFor();assert.equal(connects,0);
assert.equal(writes.filter(w=>w.path.endsWith('/authenticate')).at(-1).body.account_id,'ca_household');
await p.locator('.connector-dialog .dialog-header').getByRole('button',{name:'Close',exact:true}).click();
await p.getByRole('button',{name:'Rename personal',exact:true}).click();await p.locator('.rename-account-dialog').getByLabel('Account name',{exact:true}).fill('Work');await p.locator('.rename-account-dialog').getByRole('button',{name:'Save',exact:true}).click();await p.getByRole('button',{name:'Rename Work',exact:true}).waitFor();
await p.getByText('Explore available tools',{exact:true}).click();await p.getByLabel('Tools for account').selectOption('ca_personal');await p.getByText('Get profile',{exact:true}).waitFor();assert.equal(toolsAccounts.at(-1),'ca_personal');
await p.getByRole('button',{name:'Add another account',exact:true}).click();await p.locator('.connector-dialog').getByLabel('Account name',{exact:true}).fill('Side project');
assert.deepEqual(await p.locator('.connector-dialog').getByLabel('Access',{exact:true}).locator('option').allTextContents(),['Read-only','Read and write']);
assert(await p.locator('.connector-dialog').getByText(/Full access skips prompts/).isVisible());
await p.getByRole('button',{name:'Continue to sign in',exact:true}).evaluate(n=>{n.click();n.click();});await p.getByRole('link',{name:'Open sign-in again',exact:true}).waitFor();assert.equal(connects,1);
await popups.at(-1).waitForURL('https://connect.composio.dev/link/fixture');assert.equal(await popups.at(-1).title(),'Sign-in fixture');
await p.getByRole('button',{name:'Check connection',exact:true}).click();await p.locator('.connector-dialog').getByRole('button',{name:'Done',exact:true}).click();await p.getByRole('button',{name:'Rename Side project',exact:true}).waitFor();assert.equal(await p.locator('.account-row').count(),4);
await p.getByRole('button',{name:'Options for Work',exact:true}).click();await p.locator('[data-account-id=ca_personal]').getByRole('button',{name:'Disconnect',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.account-row').length===3);assert(accounts.some(a=>a.id==='ca_default'));assert(!accounts.some(a=>a.id==='ca_personal'));
for(const width of [1320,800,390]){await p.setViewportSize({width,height:860});await p.waitForTimeout(250);assert(await p.locator('.app-detail-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1));}
await p.screenshot({path:`${artifactDir}/kindred-${engine}-mobile-accounts.png`});
await p.setViewportSize({width:1320,height:860});await p.locator('.app-detail-dialog').getByRole('button',{name:'Marketplace',exact:true}).click();await p.waitForTimeout(260);await p.screenshot({path:`${artifactDir}/kindred-${engine}-marketplace.png`});
await p.locator('#marketplace-dialog .dialog-header').getByRole('button',{name:'Close',exact:true}).click();await p.locator('#bot-details').click();await p.locator('.avatar-customize').hover();await p.locator('.avatar-popover').waitFor({state:'visible'});
assert.equal(await p.locator('.quick-colors .color-option').count(),14);assert.equal(await p.locator('.quick-colors').getByRole('button',{name:'Grey',exact:true}).count(),1);
await p.locator('.quick-colors').getByRole('button',{name:'Black / white',exact:true}).click();
await p.waitForFunction(()=>document.querySelector('.avatar-customize .adaptive-white'));
for(const [theme,fill]of [['dark','rgb(255, 255, 255)'],['light','rgb(0, 0, 0)']]){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(260);assert.equal(await p.locator('.avatar-customize .character-body > path').first().evaluate(n=>getComputedStyle(n).fill),fill);await p.screenshot({path:`${artifactDir}/kindred-${engine}-${theme}.png`});}
assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
console.log(JSON.stringify({passed:true,engine,checks:['human takeover without cancelling','static connecting mascot','done resumes exact run once','persistent permission receipt','three named Gmail accounts','authenticate reopens existing account without another grant','rename single account','explicit tool account selector','name before popup authentication','one connect for repeated submit','disconnect only selected account','account dialog fits three widths','two neutral colors','adaptive black and white']}));
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

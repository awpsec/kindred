process.env.KINDRED_TEST_SECURITY_HEADERS='1';
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const SOURCE=4*1024*1024,STATE=2*1024*1024;
function dashboard(){
 const rows=Array.from({length:26000},(_,i)=>({id:i,team:'Synthetic operations '+i,status:i%2?'Review':'Ready',notes:'Schedule, backlog, forecast, delivery and quality checks for this team.'}));
 let s="import React from 'react';const catalog="+JSON.stringify(rows)+";";
 for(let i=0;i<180;i++)s+=`function Panel${i}(){return <section><h2>Team ${i}</h2><p>{catalog[${i}].notes}</p><meter min="0" max="100" value="${i%100}"/><button>Review team ${i}</button></section>}\n`;
 s+="export default function App(){const [state,setState]=React.useState(null);React.useEffect(()=>{(typeof kindredArtifact!=='undefined'?kindredArtifact.ready:Promise.resolve({records:[]})).then(setState)},[]);return <main><h1>Operations capacity dashboard</h1><p id='records'>{state?.records.length} saved records</p><button id='save' onClick={async()=>{try{await kindredArtifact.save({...state,checked:true});document.getElementById('result').textContent='Saved'}catch(e){document.getElementById('result').textContent=e.message}}}>Save dashboard</button><p id='result'></p><div>";
 for(let i=0;i<180;i++)s+=`<Panel${i}/>`;
 s+='</div></main>}';return s;
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1300,height:900}});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(t=>{if(window.top===window)sessionStorage.setItem('kindred-token',t);},token);
 await page.goto(origin);await page.locator('#app').waitFor({state:'visible'});
 const source=dashboard(),records=Array.from({length:14000},(_,i)=>({id:i,title:'Task '+i,owner:'Team '+i%180,notes:'Follow up review, timeline, delivery, risks and dependency checks',done:false}));
 const state={records};assert(Buffer.byteLength(source)>256*1024);assert(Buffer.byteLength(JSON.stringify(state))>1024*1024);
 let v={id:'capacity',title:'Operations capacity dashboard',path:'/artifacts/capacity',language:'jsx',kind:'app',source,state,revision:1,updated:Math.floor(Date.now()/1000),archived:false},writes=0;
 await page.route(origin+'/api/workspace-artifacts/capacity',r=>{assert.equal(r.request().headers().authorization,'Bearer '+token);if(r.request().method()==='PATCH'){const p=r.request().postDataJSON();assert.equal(p.expected_revision,v.revision);assert(Buffer.byteLength(JSON.stringify(p.state))<=STATE);writes++;v={...v,...p,revision:v.revision+1};}return r.fulfill({json:v});});
 const preview=await page.evaluate(async source=>{try{await(await import('/artifacts.js')).artifactDocument(source,'jsx');return 'accepted';}catch(e){return e.message;}},source);
 if(process.env.KINDRED_CAPACITY_BASELINE){assert.match(preview,/256 KB/);console.log(JSON.stringify({baselineRejected:true,sourceBytes:Buffer.byteLength(source),stateBytes:Buffer.byteLength(JSON.stringify(state)),reason:preview}));return;}
 assert.equal(preview,'accepted');
 const start=Date.now();await page.evaluate(async()=>{const {openWorkspaceArtifact}=await import('/workspace-artifacts.js');const api=async(p,m='GET',b)=>{const r=await fetch('/api'+p,{method:m,headers:{Authorization:'Bearer '+sessionStorage.getItem('kindred-token'),'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return r.json();};window.capacityOptions={api,markdown:s=>document.createTextNode(s),baseUrl:location.origin};await openWorkspaceArtifact(await api('/workspace-artifacts/capacity'),capacityOptions);});
 const frame=page.frameLocator('.workspace-artifact iframe');await frame.locator('#records').filter({hasText:'14000 saved records'}).waitFor();assert.equal(await frame.locator('section').count(),180);await frame.locator('#save').click();await frame.locator('#result').filter({hasText:'Saved'}).waitFor();assert.equal(writes,1);assert.equal(v.state.checked,true);
 const exactSaved=await frame.locator('body').evaluate(async (_,limit)=>{const state=await kindredArtifact.ready;const next={...state,checked:true,extra:''};next.extra='x'.repeat(limit-new TextEncoder().encode(JSON.stringify(next)).length);await kindredArtifact.save(next);return new TextEncoder().encode(JSON.stringify(next)).length;},STATE);assert.equal(exactSaved,STATE);assert.equal(writes,2);
 // Reject UTF8 state before any PATCH, preserving current revision/state.
 const rejection=await frame.locator('body').evaluate(async()=>{try{await kindredArtifact.save({text:'é'.repeat(1024*1024)});return 'accepted';}catch(e){return e.message;}});assert.match(rejection,/2 MB/);assert.equal(writes,2);assert.equal(v.revision,3);
 // Exact source boundary with multibyte text; one byte beyond rejected.
 const boundaries=await page.evaluate(async({SOURCE})=>{const {artifactDocument}=await import('/artifacts.js');const prefix='<main>UTF8</main>';const remaining=SOURCE-new TextEncoder().encode(prefix).length;const s=prefix+'é'.repeat(Math.floor(remaining/2))+'x'.repeat(remaining%2);const result={bytes:new TextEncoder().encode(s).length};await artifactDocument(s,'html');try{await artifactDocument(s+'x','html');}catch(e){result.error=e.message;}return result;},{SOURCE});assert.equal(boundaries.bytes,SOURCE);assert.match(boundaries.error,/4 MB/);
 await page.reload();await page.locator('#app').waitFor({state:'visible'});await page.evaluate(async()=>{const {openWorkspaceArtifact}=await import('/workspace-artifacts.js');const api=async p=>(await fetch('/api'+p,{headers:{Authorization:'Bearer '+sessionStorage.getItem('kindred-token')}})).json();await openWorkspaceArtifact(await api('/workspace-artifacts/capacity'),{api,markdown:s=>document.createTextNode(s),baseUrl:location.origin});});await page.frameLocator('.workspace-artifact iframe').locator('#records').filter({hasText:'14000 saved records'}).waitFor();assert.equal(v.state.checked,true);
 const chatText='```jsx\n'+source+'\n```';await page.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:[{seq:1,kind:'result',sender:'piper',text:chatText,created:1789050000}],page:{has_before:false,has_after:false}}}));await page.reload();await page.locator('#app').waitFor({state:'visible'});await page.frameLocator('.inline-shard iframe').getByRole('heading',{name:'Operations capacity dashboard'}).waitFor();assert.equal(await page.frameLocator('.inline-shard iframe').locator('section').count(),180);
 const sandbox=await page.locator('.inline-shard iframe').getAttribute('sandbox');assert.equal(sandbox,'allow-scripts');assert.deepEqual(errors,[]);
 const folder=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/artifact-capacity';fs.mkdirSync(folder,{recursive:true});await page.screenshot({path:path.join(folder,'dashboard.png')});
 const result={engine:process.env.WEBKIT?'webkit':'chromium',sourceBytes:Buffer.byteLength(source),stateBytes:Buffer.byteLength(JSON.stringify(state)),panels:180,records:14000,writes,reopened:true,sandbox,elapsedMs:Date.now()-start,boundaries,errors};fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e.stack);process.exitCode=1});

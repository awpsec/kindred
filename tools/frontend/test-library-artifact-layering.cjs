// Open an actual workbook through the bot Library, then check painted/hit-tested
// ownership. A covered element is still :visible, so visibility alone misses this.
process.env.KINDRED_TEST_SECURITY_HEADERS='1';
const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-library-artifact-layering';fs.mkdirSync(out,{recursive:true});
 const bytes=fs.readFileSync(path.join(__dirname,'fixtures/document-originals/styled-multi-sheet.xlsx')),results=[];
 try{for(const platform of (process.env.KINDRED_TEST_PLATFORM?[process.env.KINDRED_TEST_PLATFORM]:['linux','windows','macos','browser']))for(const width of (process.env.KINDRED_TEST_WIDTH?[Number(process.env.KINDRED_TEST_WIDTH)]:[1320,1024])){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({token,platform})=>{if(window!==top)return;sessionStorage.setItem('kindred-token',token);const interval=window.setInterval;window.setInterval=(f,ms,...a)=>ms===2500?0:interval(f,ms,...a);if(platform!=='browser'){window.__KINDRED_DESKTOP={platform};window.__KINDRED_MAC_OVERLAY=platform==='macos';window.__KINDRED_FILE_DELIVERY=true;window.__KINDRED_ARTIFACT_FRAME=true;window.__TAURI__={core:{invoke:async()=>null}};}}, {token,platform});
  const now=Math.floor(Date.now()/1000),artifact={id:'workbook',title:'Kore synthetic findings check',kind:'sheet',language:'file',path:'/artifacts/workbook',chat_id:'dm-piper',created_by:'bot',bot_id:'piper',source:'',state:{},revision:1,updated:now,created:now,archived:false,file:{id:'workbook-file',name:'Findings.xlsx',extension:'xlsx',size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),run_id:'run-screenshot',bot_id:'piper'}};
  const messages=[{seq:1,sender:'user',kind:'message',text:'Save the findings workbook.',created:now-10},{seq:2,sender:'piper',kind:'artifact',text:'The workbook is ready.',workspace_artifact:artifact,run_id:'run-screenshot',created:now}];
  await page.route(origin+'/api/chats/dm-piper**',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages,page:{has_before:false,has_after:false}}}));
  await page.route(origin+'/api/workspace-artifacts**',r=>{const parts=new URL(r.request().url()).pathname.split('/').slice(3);if(!parts[0])return r.fulfill({json:[artifact]});if(parts[1]==='file')return r.fulfill({body:bytes,contentType:'application/octet-stream'});if(parts[1]==='preview')return r.fulfill({status:400,json:{error:'Page layout unavailable'}});return r.fulfill({json:artifact});});
  await page.goto(origin);await page.locator('#bot-details').click();const heading=page.locator('#details-panel>.bot-center-heading');await heading.waitFor();await heading.locator('[data-tab=library]').click();
  const open=page.locator('.bot-library-open').getByText(artifact.title,{exact:true});await open.waitFor();await page.waitForTimeout(400);
  await page.evaluate(()=>{window.originalLibrary=document.querySelector('#bot-center-library');});
  const before=await heading.boundingBox();assert(before&&before.width>0,'Bot pane is genuinely open before navigation');
  await open.click();await page.locator('.artifact-studio .document-grid').waitFor();await page.waitForTimeout(350);
  const ownership=await page.evaluate(rect=>{
   const workspace=document.querySelector('.artifact-studio'),siblings=[...workspace.parentElement.children].filter(n=>n!==workspace).map(n=>[n,n.inert]);
   // Inert disables hit testing without hiding paint. Probe paint order with
   // inert cleared synchronously, then restore it before any input/frame runs.
   try{for(const [n]of siblings)n.inert=false;return [.2,.5,.8].flatMap(x=>[.2,.5,.8].map(y=>{const px=rect.x+rect.width*x,py=rect.y+rect.height*y,front=document.elementFromPoint(px,py);return {x:px,y:py,artifactOwns:workspace.contains(front),front:front?.className?.baseVal??front?.className};}));}
   finally{for(const [n,inert]of siblings)n.inert=inert;}
  },before);
  const paneState=await heading.evaluate(n=>{const chain=[];for(let p=n;p;p=p.parentElement){const s=getComputedStyle(p);chain.push({node:p.id||p.className,z:s.zIndex,position:s.position,opacity:s.opacity,transform:s.transform,animation:s.animationName,isolation:s.isolation,contain:s.contain,willChange:s.willChange,hidden:p.hidden,inert:p.inert});}return chain;});const sample={platform,engine,width,ownership,paneState};results.push(sample);fs.writeFileSync(path.join(out,engine+'-observed.json'),JSON.stringify(results,null,2));
  if(width===1320&&platform==='linux')await page.screenshot({path:path.join(out,engine+'-library-workbook.png')});
  assert(await page.locator('#details-panel').evaluate(n=>n.inert),'Paint probe restores the underlying pane interaction gate');
  assert(ownership.every(p=>p.artifactOwns),'Bot header must not paint over or intercept the artifact: '+JSON.stringify(sample));
  assert.equal(await page.locator('.document-sheets button').count(),2,'Workbook tabs remain available');
  await page.getByRole('button',{name:'Back to chat',exact:true}).click();await page.locator('.artifact-studio').waitFor({state:'detached'});
  assert(await page.evaluate(()=>window.originalLibrary===document.querySelector('#bot-center-library')),'Returning preserves the bot Library');assert(await heading.isVisible());assert.equal(await heading.locator('[data-tab=library]').getAttribute('aria-selected'),'true');
  await heading.locator('.avatar-customize').click();const popover=heading.locator('.avatar-popover');await popover.waitFor();
  assert(await popover.evaluate(n=>{const r=n.querySelector('.quick-shapes').getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'Bot customization stays above its own pane content');
  await heading.locator('.avatar-customize').click();assert.deepEqual(errors,[]);await page.close();
 }
 fs.writeFileSync(path.join(out,engine+'-verification.json'),JSON.stringify({passed:true,engine,results},null,2));console.log(JSON.stringify({passed:true,engine,cases:results.length,artifactOwnsSurface:true,backPreservesLibrary:true,avatarPickerOnTop:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1;});

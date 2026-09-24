process.env.KINDRED_TEST_SECURITY_HEADERS='1';
const {server,token}=require('./fixtures/desktop.cjs'),{chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const context=await browser.newContext(),origin='http://127.0.0.1:'+server.address().port;
  let doc={id:'shared',title:'Shared report',folder:'Reports',kind:'document',language:'markdown',source:'# Human introduction',state:{approved:true},revision:1,path:'/artifacts/shared',updated:Date.now()/1000};
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await context.route(origin+'/api/workspace-artifacts**',async r=>{const id=new URL(r.request().url()).pathname.split('/')[3];if(!id)return r.fulfill({json:[doc]});if(r.request().method()==='PATCH'){const b=r.request().postDataJSON();if(b.expected_revision!==doc.revision)return r.fulfill({status:409,json:{error:'Artifact changed. Reload and merge your edits before saving'}});doc={...doc,...b,revision:doc.revision+1,updated:Date.now()/1000};}await r.fulfill({json:doc});});
  const pages=[];
  for(let i=0;i<2;i++){
   const p=await context.newPage();p.setDefaultTimeout(20000);await p.goto(origin);await p.locator('#composer').waitFor();
   await p.evaluate(async()=>{const {artifactStudio}=await import('/workspace-artifacts.js');const api=async(path,method='GET',body)=>{const r=await fetch('/api'+path,{method,headers:{Authorization:'Bearer '+sessionStorage.getItem('kindred-token'),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};window.studio=artifactStudio({api,markdown:text=>{const n=document.createElement('div');n.textContent=text;return n;},baseUrl:location.origin,onExit:()=>{}});document.querySelector('#app').append(studio.root);await studio.open('shared');});pages.push(p);
  }
  const [a,b]=pages;
  for(const p of pages)await p.getByRole('button',{name:'Edit document',exact:true}).click();
  await a.getByLabel('Document',{exact:true}).fill('# Human introduction\nAuthor contribution');
  await b.getByLabel('Document',{exact:true}).fill('# Human introduction\nReviewer contribution');
  await a.getByRole('button',{name:'Save changes',exact:true}).click();await a.locator('.artifact-save-status').filter({hasText:'Saving'}).waitFor({state:'hidden'});
  await b.getByRole('button',{name:'Save changes',exact:true}).click();await b.locator('.artifact-save-status').filter({hasText:'Artifact changed'}).waitFor();assert.match(await b.getByLabel('Document',{exact:true}).inputValue(),/Reviewer contribution/);assert.match(doc.source,/Author contribution/);assert.doesNotMatch(doc.source,/Reviewer contribution/);
  b.once('dialog',d=>d.accept());await b.getByRole('button',{name:'Load latest',exact:true}).click();await b.getByLabel('Document',{exact:true}).fill(doc.source+'\nReviewer contribution');
  await b.getByRole('button',{name:'Save changes',exact:true}).click();await b.locator('.artifact-save-status').filter({hasText:'Saving'}).waitFor({state:'hidden'});assert.match(doc.source,/Author contribution\nReviewer contribution/);assert.deepEqual(doc.state,{approved:true});
  // Renaming or moving via the menu while editing must not invalidate our own draft.
  await b.getByLabel('Document',{exact:true}).fill(doc.source+'\nHuman final correction');
  if(await b.getByRole('button',{name:'Show and pin artifact library',exact:true}).isVisible())await b.getByRole('button',{name:'Show and pin artifact library',exact:true}).click();
  await b.locator('.artifact-studio-library-item').click({button:'right'});await b.getByRole('menuitem',{name:'Move to folder',exact:true}).click();await b.getByRole('dialog',{name:'Move to folder'}).getByLabel('Folder',{exact:true}).fill('Reviewed');await b.getByRole('button',{name:'Move',exact:true}).click();await b.getByRole('dialog',{name:'Move to folder'}).waitFor({state:'detached'});
  await b.getByRole('button',{name:'Save changes',exact:true}).click();await b.locator('.artifact-save-status').filter({hasText:'Saving'}).waitFor({state:'hidden'});
  assert.match(doc.source,/Human final correction/);assert.equal(doc.folder,'Reviewed');
  for(const p of pages)await p.getByRole('button',{name:'Finish editing',exact:true}).click();
  await a.locator('.artifact-studio-preview').filter({hasText:'Human final correction'}).waitFor();assert.match(await a.locator('.artifact-studio-preview').innerText(),/Author contribution/);
  await b.getByRole('button',{name:'Edit document',exact:true}).click();await b.getByLabel('Document',{exact:true}).fill(doc.source+'\nPending human draft');
  doc={...doc,revision:doc.revision+1,source:doc.source+'\nNew remote correction'};
  if(await b.getByRole('button',{name:'Show and pin artifact library',exact:true}).isVisible())await b.getByRole('button',{name:'Show and pin artifact library',exact:true}).click();await b.locator('.artifact-studio-library-item').click({button:'right'});await b.getByRole('menuitem',{name:'Move to folder',exact:true}).click();await b.getByRole('dialog',{name:'Move to folder'}).getByLabel('Folder',{exact:true}).fill('Final review');await b.getByRole('button',{name:'Move',exact:true}).click();await b.getByRole('dialog',{name:'Move to folder'}).waitFor({state:'detached'});
  await b.getByRole('button',{name:'Save changes',exact:true}).click();await b.locator('.artifact-save-status').filter({hasText:'Artifact changed'}).waitFor();assert.match(doc.source,/New remote correction/);assert.doesNotMatch(doc.source,/Pending human draft/);assert.match(await b.getByLabel('Document',{exact:true}).inputValue(),/Pending human draft/);
  console.log('PASS two editors, stale save preserves draft, reread/merge, shared human state, metadata edits alongside source draft, live reader refresh');
  await context.unrouteAll({behavior:'ignoreErrors'});
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

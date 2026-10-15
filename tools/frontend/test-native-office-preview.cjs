// Native saved documents and sheets must use the same Office viewers as originals.
process.env.KINDRED_TEST_SECURITY_HEADERS='1';
const {server,token}=require('./fixtures/desktop.cjs');
const {createFiles}=require('./test-document-previews.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {zipSync,unzipSync,strFromU8,strToU8}=require('fflate');
const ExcelJS=require('exceljs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const engine=process.env.WEBKIT?'webkit':'chromium';
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/native-office-preview');
(async()=>{
 const files=await createFiles();files['review.docx']=fs.readFileSync(path.join(__dirname,'fixtures/document-originals/original-v1.docx'));fs.mkdirSync(out,{recursive:true});
 const word=text=>{const parts=unzipSync(files['review.docx']);parts['word/document.xml']=strToU8(strFromU8(parts['word/document.xml']).replace('Original Word revision one',text));return Buffer.from(zipSync(parts,{mtime:new Date(2020,0,1)}));};
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await(process.env.WEBKIT?webkit:chromium).launch(),receipts=[];let activePage;
 try{for(const width of [1000,390]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600,acceptDownloads:true}),page=await context.newPage();activePage=page;page.setDefaultTimeout(20000);const errors=[],requests=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  const base={kind:'document',language:'markdown',source:'# Native review',state:{},revision:1,folder:'Client Reports',updated:Math.floor(Date.now()/1000)};
  const records={native:{...base,id:'native',title:'Client application assessment — management findings and recommendations',path:'/artifacts/native'},rich:{...base,id:'rich',title:'Rich document',language:'html',source:'<!--kindred-document-v1--><html><body><main><h1>Rich report</h1></main></body></html>',path:'/artifacts/rich'},sheet:{...base,id:'sheet',title:'Engagement workbook',kind:'sheet',language:'html',source:'<!--kindred-sheet-v1-->',state:{rows:[['Item','Owner'],['Review','Alex']]},path:'/artifacts/sheet'},original:{...base,id:'original',title:'Original document',language:'file',source:'',file:{name:'original.docx',extension:'docx',size:files['review.docx'].length},path:'/artifacts/original'}};
  let held=null,holdPreview=false;
  const bytes=async v=>{if(v.id==='original')return files['review.docx'];if(v.kind==='sheet'){const book=new ExcelJS.Workbook();book.addWorksheet('Overview').addRows(v.state.rows);book.addWorksheet('Next month').addRows([['Month','Work'],['November','Plan']]);return Buffer.from(await book.xlsx.writeBuffer());}return word(v.id==='rich'?'Rich native report':v.revision===1?'Native report revision one':'Saved native revision '+v.revision);};
  await context.route(origin+'/native-office-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="/style.css"></head><body><main id="mount" style="height:100dvh;display:flex;flex-direction:column"></main></body></html>'}));
  await context.route(origin+'/api/workspace-artifacts**',async r=>{
   assert.equal(r.request().headers().authorization,'Bearer '+token);const parts=new URL(r.request().url()).pathname.split('/').slice(3);requests.push(parts.join('/'));
   if(!parts[0])return r.fulfill({json:Object.values(records)});const v=records[parts[0]];assert(v);
   if(parts[1]==='preview'){if(holdPreview){holdPreview=false;held=()=>r.fulfill({status:400,json:{error:'Page layout unavailable'}}).catch(()=>{});return;}return r.fulfill({status:400,json:{error:'Page layout unavailable'}});}
   if(parts[1]==='file')return r.fulfill({body:await bytes(v),contentType:'application/octet-stream'});
   if(parts[1]==='export')return r.fulfill({json:{filename:'review.docx',content_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',data_base64:(await bytes(v)).toString('base64')}});
   if(r.request().method()==='PATCH'){const patch=r.request().postDataJSON();assert.equal(patch.expected_revision,v.revision);writes.push(patch);Object.assign(v,patch,{revision:v.revision+1});}
   return r.fulfill({json:v});
  });
  await page.goto(origin+'/native-office-test');await page.evaluate(async({token,touch})=>{
   sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-artifact-library-pinned','true');if(touch){window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';}
   window.abortedPreviews=[];const api=async(path,method='GET',body,options={})=>{options.signal?.addEventListener('abort',()=>abortedPreviews.push(path),{once:true});const response=await fetch('/api'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:options.signal});if(!response.ok)throw Error((await response.json()).error);return options.responseType==='blob'?response.blob():response.json();};
   const {artifactStudio}=await import('/workspace-artifacts.js');window.studio=artifactStudio({api,markdown:()=>{throw Error('Native Office document fell back to Markdown');},baseUrl:location.origin,onExit:()=>{}});document.querySelector('#mount').append(studio.root);await studio.open('native');
  },{token,touch:width<600});
  await page.locator('.document-word').getByText('Native report revision one',{exact:true}).waitFor();assert(requests.includes('native/preview/1')&&requests.includes('native/file/1'));assert.equal(await page.locator('.workspace-artifact-stage iframe').count(),0);
  const paper=await page.locator('.document-word').evaluate(n=>{const paper=n.shadowRoot.querySelector('section.docx');return {paper:getComputedStyle(paper).backgroundColor,text:getComputedStyle(paper.querySelector('p')).color};});assert.deepEqual(paper,{paper:'rgb(255, 255, 255)',text:'rgb(0, 0, 0)'});
  await page.waitForFunction(()=>document.querySelector('.document-zoom-value')?.textContent.endsWith('%'));
  assert(await page.locator('.document-word').evaluate(n=>{const paper=n.shadowRoot.querySelector('section.docx').getBoundingClientRect();return paper.height<=n.clientHeight+1&&paper.width<=n.clientWidth+1;}),'DOCX fallback fits an entire page');
  const initialZoom=await page.locator('.document-zoom-value').innerText();
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForFunction(v=>document.querySelector('.document-zoom-value').textContent!==v,initialZoom);
  await page.locator('.document-word').focus();await page.keyboard.press('Control+0');await page.waitForFunction(()=>[...document.querySelectorAll('.document-zoom button')].some(n=>n.textContent==='Fit page'&&n.getAttribute('aria-pressed')==='true'));assert(await page.locator('.document-word').evaluate(n=>n.shadowRoot.querySelector('section.docx').getBoundingClientRect().width<=n.clientWidth+1));
  await page.screenshot({path:path.join(out,`${engine}-${width}-native-word.png`)});
  if(width<600)await page.getByRole('button',{name:'Show artifact library',exact:true}).click();
  const rows=page.locator('.artifact-studio-library-item');await rows.first().waitFor({state:'visible'});
  const geometry=await rows.evaluateAll(nodes=>nodes.map(n=>{const row=n.getBoundingClientRect(),title=n.querySelector('.artifact-studio-library-title').getBoundingClientRect(),identity=n.querySelector('.artifact-library-identity').getBoundingClientRect();return {top:row.top,bottom:row.bottom,height:row.height,titleBottom:title.bottom,identityTop:identity.top,identityBottom:identity.bottom};}));
  for(const [i,g]of geometry.entries()){assert(g.height>=48);assert(g.titleBottom<=g.identityTop+1,'title and identity cannot overlap');assert(g.identityBottom<=g.bottom+1,'identity stays inside its row');if(i)assert(geometry[i-1].bottom<=g.top+1,'adjacent rows cannot overlap');}
  await page.screenshot({path:path.join(out,`${engine}-${width}-library.png`)});if(width<600)await page.getByRole('button',{name:'Close artifact library',exact:true}).click();
  await page.getByRole('button',{name:'Edit document',exact:true}).click();await page.getByRole('textbox',{name:'Document content',exact:true}).fill('Edited saved report');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.artifact-save-status')?.textContent==='');assert.equal(records.native.revision,2);assert.match(records.native.source,/Edited saved report/);assert.equal(writes.at(-1).expected_revision,1);
  await page.getByRole('button',{name:'Finish editing',exact:true}).click();await page.locator('.document-word').getByText('Saved native revision 2',{exact:true}).waitFor();assert(requests.includes('native/preview/2')&&requests.includes('native/file/2'));
  const downloaded=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download',exact:true}).click()]).then(v=>v[0]);assert.deepEqual(fs.readFileSync(await downloaded.path()),await bytes(records.native),'download exports latest saved revision');assert(requests.includes('native/export'));
  // A late conversion must not replace a different artifact after navigation.
  records.native.revision=3;holdPreview=true;await page.getByRole('button',{name:'Refresh document',exact:true}).click();await page.waitForFunction(()=>!!document.querySelector('.artifact-document-pending'));
  for(let n=0;!held&&n<100;n++)await new Promise(r=>setTimeout(r,20));assert(held);await page.evaluate(()=>studio.open('sheet'));await page.getByRole('region',{name:'Overview cells',exact:true}).getByText('Alex',{exact:true}).waitFor();await page.waitForFunction(()=>abortedPreviews.some(p=>p.endsWith('/native/preview/3')));await held();assert.equal(await page.locator('.document-word').count(),0);assert.equal(await page.locator('.workspace-artifact-stage iframe').count(),0);assert(requests.includes('sheet/file/1'));assert(!requests.includes('sheet/preview/1'));
  await page.getByRole('button',{name:'Next month',exact:true}).click();await page.getByRole('region',{name:'Next month cells',exact:true}).getByText('November',{exact:true}).waitFor();await page.screenshot({path:path.join(out,`${engine}-${width}-native-sheet.png`)});
  await page.evaluate(()=>studio.open('rich'));await page.locator('.document-word').getByText('Rich native report',{exact:true}).waitFor();assert(requests.includes('rich/file/1'));assert.equal(await page.locator('.workspace-artifact-stage iframe').count(),0);
  await page.evaluate(()=>studio.open('original'));await page.locator('.document-word').getByText('Original Word revision one',{exact:true}).waitFor();assert(requests.includes('original/file/1'));assert.equal(await page.getByRole('button',{name:'Edit document',exact:true}).count(),0);
  const original=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download original',exact:true}).click()]).then(v=>v[0]);assert.deepEqual(fs.readFileSync(await original.path()),files['review.docx']);assert(!requests.includes('original/export'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'document does not overflow viewport');assert.deepEqual(errors,[]);receipts.push({width,geometry,requests,edits:writes.length,stalePreviewAborted:true});await context.close();
 }
 fs.writeFileSync(path.join(out,`${engine}-native-office-results.json`),JSON.stringify({passed:true,engine,receipts},null,2));console.log(JSON.stringify({passed:true,engine,contexts:receipts.length}));
 }catch(e){if(activePage&&!activePage.isClosed())await activePage.screenshot({path:path.join(out,`${engine}-native-office-failure.png`)}).catch(()=>{});throw e;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

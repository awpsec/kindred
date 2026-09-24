const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const page=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;page.setDefaultTimeout(20000);
 await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 let loads=0,releaseFrame;await page.route('**/artifact-frame.html*',async route=>{loads++;if(loads===2)await new Promise(r=>releaseFrame=r);await route.continue();});
 await page.goto(origin);await page.locator('#app').waitFor({state:'visible'});
 await page.evaluate(async()=>{const {artifactStudio}=await import('/workspace-artifacts.js');window.record={id:'refresh-doc',title:'Refresh report',kind:'app',language:'html',source:'<h1>Original report</h1>',path:'/artifacts/refresh-doc',state:{},revision:1,updated:Date.now()/1000};window.hold=false;window.fail=false;window.studio=artifactStudio({api:async path=>{if(path==='/workspace-artifacts')return [record];if(path==='/workspace-artifact-folders')return [];if(fail)throw Error('Refresh failed');if(hold)await new Promise(r=>window.releaseRead=r);return {...record};},markdown:text=>{const n=document.createElement('div');n.textContent=text;return n;},onNavigate:()=>{},onExit:()=>{},baseUrl:location.origin});document.querySelector('#app').append(studio.root);await studio.open(record.id);});
 const visible=()=>page.locator('.artifact-studio-preview iframe:not(.artifact-frame-pending)');
 await visible().waitFor({state:'visible'});await page.frameLocator('.artifact-studio-preview iframe:not(.artifact-frame-pending)').getByText('Original report').waitFor();
 await visible().evaluate(n=>n.dataset.previous='yes');
 await page.evaluate(()=>{hold=true;record={...record,revision:2,source:'<h1>Updated report</h1>'};});
 await page.getByRole('button',{name:'Refresh document',exact:true}).click();await page.waitForFunction(()=>!!window.releaseRead);
 assert(await page.locator('iframe[data-previous]').isVisible());assert(await page.getByRole('status',{name:'Loading artifact'}).isVisible());assert(await page.getByRole('button',{name:'Refresh document',exact:true}).isDisabled());
 await page.evaluate(()=>{hold=false;releaseRead();});await page.locator('.artifact-frame-pending').waitFor({state:'attached'});
 assert(await page.locator('iframe[data-previous]').isVisible());assert.equal(await page.locator('.artifact-frame-pending').isVisible(),false);
 while(!releaseFrame)await new Promise(r=>setTimeout(r,10));releaseFrame();
 await page.frameLocator('.artifact-studio-preview iframe:not(.artifact-frame-pending)').getByText('Updated report').waitFor();await page.waitForFunction(()=>!document.querySelector('.artifact-studio-preview').hasAttribute('aria-busy'));
 assert.equal(await page.locator('iframe[data-previous]').count(),0);assert.equal(await page.locator('.artifact-studio-preview iframe').count(),1);assert(await page.getByRole('button',{name:'Refresh document',exact:true}).isEnabled());
 await page.evaluate(()=>fail=true);await page.getByRole('button',{name:'Refresh document',exact:true}).click();await page.getByRole('alert').filter({hasText:'Refresh failed'}).waitFor();assert(await visible().isVisible());assert.equal(await page.locator('.artifact-loading').count(),0);assert(await page.locator('.workspace-artifact-stage').evaluate(n=>!n.inert));
 await page.evaluate(()=>{fail=false;record={...record,revision:3,source:'<script>throw new Error("Broken update")</script>'};});await page.getByRole('button',{name:'Refresh document',exact:true}).click();await page.locator('.artifact-render-error').filter({hasText:'This page encountered an error'}).waitFor();assert(await visible().isVisible());assert.equal(await page.locator('.artifact-frame-pending').count(),0);assert.equal(await page.locator('.artifact-loading').count(),0);
 // Hidden/background webviews may stop animation frames. A loaded document
 // must not be discarded merely because its paint callback is throttled.
 await page.evaluate(()=>{record={...record,revision:4,source:'<h1>Ready while animation frames are suspended</h1><script>window.requestAnimationFrame=()=>0;</script>'};});
 await page.getByRole('button',{name:'Refresh document',exact:true}).click();
 await page.frameLocator('.artifact-studio-preview iframe:not(.artifact-frame-pending)').getByText('Ready while animation frames are suspended').waitFor({timeout:5000});
 assert.equal(await page.locator('.artifact-render-error').count(),0);
 console.log('PASS artifact refresh retains old content through API and frame loading, swaps ready content, and preserves it on failure');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});

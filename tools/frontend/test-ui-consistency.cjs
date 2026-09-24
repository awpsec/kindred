const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const folder=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/ui-consistency');
fs.mkdirSync(folder,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 try{
  const p=await browser.newPage({viewport:{width:1320,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {openSettings,importSkills,notice,renderChat,state,renderSidebar};'}));
  await p.route(origin+'/api/composio',r=>r.fulfill({json:{configured:false,apps:[]}}));
  await p.goto(origin);await p.locator('#prompt').waitFor();await p.evaluate(async()=>window.fixture=await import('/app.js'));
  for(const width of [320,390,768,1320]){
   await p.setViewportSize({width,height:900});
   for(const size of [100,150]){
    await p.evaluate(size=>{KindredReadingSize.set(size);document.documentElement.dataset.theme=size===150?'light':'dark';},size);
    await p.evaluate(async()=>{await fixture.openSettings('skills');await Promise.all(document.querySelector('#settings-content').getAnimations().map(a=>a.finished.catch(()=>{})));});
    const workspace=p.locator('.workspace-import-entry');
    const layout=await workspace.evaluate(n=>{
     const copy=n.querySelector('p').getBoundingClientRect(),button=n.querySelector('button').getBoundingClientRect(),root=n.getBoundingClientRect();
     return {fits:button.right<=root.right+1&&copy.right<=root.right+1,separated:copy.right+8<=button.left||copy.bottom+8<=button.top,copyWidth:copy.width,rootWidth:root.width};
    });
    assert(layout.fits&&layout.separated,JSON.stringify({width,size,layout}));
    if(width<=390)assert(layout.copyWidth>layout.rootWidth*.8,'Narrow workspace description must use the available width');
    await p.screenshot({path:path.join(folder,`${engine}-skills-${width}-${size}.png`)});
    await p.evaluate(async()=>{await fixture.openSettings('connections');await Promise.all(document.querySelector('#settings-content').getAnimations().map(a=>a.finished.catch(()=>{})));});
    const clipped=await p.locator('.ai-account-summary').evaluateAll(rows=>rows.filter(n=>{
     const bounds=n.getBoundingClientRect();return [...n.children].some(child=>{const r=child.getBoundingClientRect();return r.right>bounds.right+1||r.left<bounds.left||child.scrollWidth>child.clientWidth+1;});
    }).map(n=>n.textContent));
    assert.deepEqual(clipped,[],`Provider names, statuses and chevrons must fit (${width}/${size})`);
    await p.screenshot({path:path.join(folder,`${engine}-connections-${width}-${size}.png`)});
    await p.evaluate(()=>document.querySelector('#settings-dialog').close());
    await p.evaluate(()=>fixture.importSkills());const dialog=p.getByRole('dialog',{name:'Import commands and skills',exact:true});
    await dialog.locator('.dialog-actions').scrollIntoViewIfNeeded();
    const actions=await dialog.locator('.dialog-actions').evaluate(n=>{
     const [a,b]=[...n.children].map(n=>n.getBoundingClientRect());const d=n.closest('dialog').getBoundingClientRect();
     return {gap:a.bottom<=b.top?b.top-a.bottom:b.left-a.right,fits:a.left>=d.left&&b.right<=d.right};
    });
    assert(actions.gap>=8&&actions.fits,JSON.stringify({width,size,actions}));
    await p.screenshot({path:path.join(folder,`${engine}-import-${width}-${size}.png`)});
    await dialog.getByRole('button',{name:'Close',exact:true}).last().click();
   }
   const frames=await p.evaluate(async()=>{
    fixture.notice('Saved changes.');const toast=document.querySelector('#notice'),frames=[];
    const start=performance.now();while(performance.now()-start<300){const r=toast.getBoundingClientRect();frames.push({center:r.left+r.width/2,expected:innerWidth/2});await new Promise(requestAnimationFrame);}
    return frames;
   });
   assert(frames.every(f=>Math.abs(f.center-f.expected)<1),'Notification must remain horizontally centered during entry');
  }
  await p.evaluate(()=>fixture.openSettings('general'));
  const summary=p.locator('.settings-about').first().locator('summary');await summary.focus();await p.keyboard.press('Enter');
  assert(await summary.evaluate(n=>n.parentElement.open));
  assert.equal(await summary.evaluate(n=>getComputedStyle(n).listStyleType),'none');
  await p.keyboard.press('Space');assert.equal(await summary.evaluate(n=>n.parentElement.open),false);
  await p.evaluate(()=>document.querySelector('#settings-dialog').close());
  for(const mode of ['app','system']){
   if(mode==='app')await p.evaluate(()=>document.documentElement.dataset.motion='off');else await p.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await p.evaluate(()=>{const n=document.querySelector('#notice');n.hidden=true;void n.offsetHeight;fixture.notice('Saved.');return n.getAnimations().length;}),0);
   await p.evaluate(()=>delete document.documentElement.dataset.motion);await p.emulateMedia({reducedMotion:'no-preference'});
  }
  await p.evaluate(()=>document.querySelector('#settings-dialog').close());
  await p.setViewportSize({width:1100,height:800});
  for(const size of [100,115,150]){
   await p.evaluate(size=>{KindredReadingSize.set(size);fixture.state.bots[0].name='Atlas';fixture.state.bots[0].profile.label='Tester';fixture.renderSidebar();},size);
   const spacing=await p.locator('.bot-title-row').first().evaluate(n=>{const name=n.querySelector('strong').getBoundingClientRect(),role=n.querySelector('.bot-label').getBoundingClientRect();return {gap:role.left-name.right,sameLine:Math.abs(role.top-name.top)<8};});
   assert(spacing.sameLine&&Math.abs(spacing.gap-5)<1,JSON.stringify({size,spacing}));
  }
  // File popovers must track their button during scrolling and window resizing.
  await p.evaluate(async()=>{const {fileCard}=await import('/artifacts.js');const card=fileCard({id:'menu-fixture',name:'Notes.txt'},{getBlob:async()=>new Blob(['Notes']),notice:()=>{}});const area=document.querySelector('#content');area.replaceChildren(card);area.style.paddingTop='300px';const spacer=document.createElement('div');spacer.style.height='1200px';area.append(spacer);area.scrollTop=0;});
  await p.getByRole('button',{name:'More file actions'}).click();
  for(const width of [1100,800]){
   await p.setViewportSize({width,height:800});await p.locator('#content').evaluate(n=>n.scrollTop=120);await p.waitForTimeout(100);
   const placement=await p.locator('.deliverable-menu').evaluate(n=>{const menu=n.getBoundingClientRect(),anchor=document.querySelector('.deliverable-more').getBoundingClientRect();return{gap:menu.top-anchor.bottom,fits:menu.left>=8&&menu.right<=innerWidth-8&&menu.bottom<=innerHeight-8};});
   assert(placement.fits&&Math.abs(placement.gap-6)<2,JSON.stringify(placement));
  }
  await p.locator('#content').evaluate(n=>n.scrollTop=800);await p.waitForTimeout(100);assert.equal(await p.locator('.deliverable-menu').evaluate(n=>n.matches(':popover-open')),false,'An offscreen trigger must not leave an orphan menu');
  await p.locator('#content').evaluate(n=>n.scrollTop=0);await p.getByRole('button',{name:'More file actions'}).click();await p.keyboard.press('Escape');assert.equal(await p.locator('.deliverable-menu').evaluate(n=>n.matches(':popover-open')),false);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,widths:[320,390,768,1320],textSizes:[100,150],themes:['dark','light'],notificationAnchoring:true,providerLayout:true,importSpacing:true,disclosureKeyboard:true,reducedMotion:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

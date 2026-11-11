process.env.KINDRED_TEST_SECURITY_HEADERS='1';
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const p=await context.newPage();p.setDefaultTimeout(15000);
  let settingsWrites=0;p.on('request',r=>{if(r.url().endsWith('/api/settings')&&r.method()==='PUT')settingsWrites++;});
  await p.goto(origin);await p.locator('#prompt').fill('Keep this draft while changing fonts.');
  const originalScale=await p.evaluate(()=>KindredReadingSize.get());
  await p.locator('#identity-button').click();await p.locator('#identity-menu').getByRole('menuitem',{name:'Settings',exact:true}).click();
  const chooser=p.getByRole('combobox',{name:'Interface font',exact:true});await chooser.waitFor();
  assert.equal(await chooser.inputValue(),'inter');
  const other=await context.newPage();await other.goto(origin);await other.waitForFunction(()=>window.KindredInterfaceFont);
  for(const [value,family] of [['dm-sans','DM Sans'],['manrope','Manrope'],['inter','Inter']]){
   await chooser.selectOption(value);
   await other.waitForFunction(v=>KindredInterfaceFont.get()===v,value);
   const result=await p.evaluate(async family=>{
    const faces=await document.fonts.load(`400 16px "${family}"`);await document.fonts.load(`700 16px "${family}"`);
    const code=document.createElement('code');document.body.append(code);
    const doc=document.createElement('div');doc.className='artifact-document-surface';doc.innerHTML='<div class="tiptap">Document text</div>';document.body.append(doc);
    const sheet=document.createElement('div');sheet.className='artifact-sheet-grid';sheet.innerHTML='<input value="Cell">';document.body.append(sheet);
    const result={body:getComputedStyle(document.body).fontFamily,composer:getComputedStyle(document.querySelector('#prompt')).fontFamily,code:getComputedStyle(code).fontFamily,doc:getComputedStyle(doc.firstChild).fontFamily,sheet:getComputedStyle(sheet.firstChild).fontFamily,loaded:faces.length>0&&faces.every(f=>f.status==='loaded'),size:KindredReadingSize.get()};
    code.remove();doc.remove();sheet.remove();return result;
   },family);
   assert(result.loaded);assert(result.body.startsWith(family)||result.body.startsWith('"'+family+'"'),JSON.stringify(result));
   assert.match(result.composer,new RegExp(family));assert.match(result.code,/Liberation Mono/);assert.match(result.doc,/^Inter/);assert.match(result.sheet,/^Inter/);assert.equal(result.size,originalScale);
   assert.equal(await p.locator('#prompt').innerText(),'Keep this draft while changing fonts.');
   const theme=p.getByRole('combobox',{name:'Theme',exact:true});await theme.click();
   const menu=p.getByRole('listbox');await menu.waitFor();
   assert.match(await menu.evaluate(n=>getComputedStyle(n).fontFamily),new RegExp(family),'Opened dropdown must use the chosen interface font');
   await theme.press('Escape');

  }
  await chooser.selectOption('dm-sans');await p.locator('#settings-close').click();
  await p.locator('#bot-details').click();
  for(const width of [1180,390,320]){
   await p.setViewportSize({width,height:900});
   for(const scale of [100,150]){
    await p.evaluate(size=>KindredReadingSize.set(size),scale);
    const typography=await p.locator('#details-panel .bot-center-heading').evaluate(n=>{
     const name=n.querySelector('.bot-center-name'),tab=n.querySelector('.bot-center-tab'),bounds=n.getBoundingClientRect();
     return {name:parseFloat(getComputedStyle(name).fontSize),tab:parseFloat(getComputedStyle(tab).fontSize),family:getComputedStyle(tab).fontFamily,fits:[...n.querySelectorAll('.bot-center-tab')].every(t=>{const r=t.getBoundingClientRect();return r.left>=bounds.left&&r.right<=bounds.right&&t.scrollWidth<=t.clientWidth+1;})};
    });
    assert.equal(typography.name,16*scale/100);assert.equal(typography.tab,13*scale/100);assert.match(typography.family,/DM Sans/);assert(typography.fits,JSON.stringify({width,scale,typography}));
   }
  }
  await p.evaluate(size=>KindredReadingSize.set(size),originalScale);await p.setViewportSize({width:1280,height:900});await p.reload();await p.waitForFunction(()=>window.KindredInterfaceFont);
  assert.equal(await p.evaluate(()=>KindredInterfaceFont.get()),'dm-sans');
  await p.evaluate(()=>KindredInterfaceFont.set('untrusted-font'));assert.equal(await p.evaluate(()=>KindredInterfaceFont.get()),'dm-sans');
  await p.evaluate(()=>localStorage.setItem('kindred-interface-font','invalid'));await p.reload();await p.waitForFunction(()=>window.KindredInterfaceFont);assert.equal(await p.evaluate(()=>KindredInterfaceFont.get()),'inter');
  await p.evaluate(()=>KindredInterfaceFont.set('manrope'));await other.waitForFunction(()=>KindredInterfaceFont.get()==='manrope');
  await p.evaluate(()=>localStorage.clear());await other.waitForFunction(()=>KindredInterfaceFont.get()==='inter');
  assert.equal(settingsWrites,0,'font preference must not write account settings');await context.close();
  for(const platform of ['ios','android']){
   const ctx=await browser.newContext({viewport:{width:390,height:844}});await ctx.addInitScript(({platform,token})=>{
    sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-interface-font','manrope');
    window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM=platform;window.__KINDRED_SYSTEM_TEXT_SCALE=1.7;
   },{platform,token});const mobile=await ctx.newPage();await mobile.goto(origin);await mobile.locator('#prompt').waitFor();
   assert.equal(await mobile.evaluate(()=>KindredInterfaceFont.get()),'system');
   await mobile.evaluate(()=>{KindredInterfaceFont.set('dm-sans');window.dispatchEvent(new StorageEvent('storage',{key:'kindred-interface-font',newValue:'dm-sans'}));});
   assert.equal(await mobile.evaluate(()=>document.documentElement.dataset.interfaceFont),'system');
   const family=await mobile.locator('#prompt').evaluate(n=>getComputedStyle(n).fontFamily);assert.match(family,/system-ui/);assert.doesNotMatch(family,/Inter|Manrope|DM Sans/);
   await mobile.locator('#bot-details').evaluate(n=>n.click());
   if(platform==='ios'){
    await mobile.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:2.1}})));
    const name=mobile.locator('#details-panel .bot-center-name');await name.waitFor();
    assert(Math.abs(await name.evaluate(n=>parseFloat(getComputedStyle(n).fontSize))-33.6)<.01);
    await mobile.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:1.7}})));
   }
   await mobile.locator('#settings-button').evaluate(n=>n.click());await mobile.locator('.general-settings-form').waitFor();assert.equal(await mobile.getByRole('combobox',{name:'Interface font',exact:true}).count(),0);
   if(platform==='ios')assert.equal(await mobile.evaluate(()=>KindredReadingSize.get()),170);
   await ctx.close();
  }
  console.log('PASS selected dropdown fonts, scaled pane labels and narrow tabs, iOS pane text updates, live fonts, offline faces, draft preservation, local persistence, storage sync, no account writes, mobile system families, stable document/code fonts');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

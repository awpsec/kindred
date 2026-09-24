const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/motion-polish');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:!process.env.KINDRED_HEADED});
 try{
  for(const platform of ['windows','linux','macos']){
   const context=await browser.newContext({viewport:{width:1320,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
   await context.addInitScript(({token,platform})=>{
    sessionStorage.setItem('kindred-token',token);window.__KINDRED_DESKTOP={platform};
    window.__TAURI__={core:{invoke:async command=>command==='notification_status'?{enabled:true,error:''}:null}};
   },{token,platform});
   await page.route(origin+'/app.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,applyGeneral,showPane,hidePane,setComputerExpanded,openSettings};'}));
   await page.goto(origin);await page.locator('#prompt').waitFor();
   await page.evaluate(async()=>{window.fixture=await import('/app.js');});
   const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   // Reversing a close continues from the current visual position without a jump.
   const reversal=await page.evaluate(async()=>{
    const panel=document.querySelector('#details-panel'),{showPane,hidePane}=fixture;
    showPane(panel);await new Promise(r=>setTimeout(r,280));hidePane(panel);await new Promise(r=>setTimeout(r,60));
    const before=panel.getBoundingClientRect().x,opacity=Number(getComputedStyle(panel).opacity);showPane(panel);
    return {jump:Math.abs(before-panel.getBoundingClientRect().x),fade:Math.abs(opacity-Number(getComputedStyle(panel).opacity)),inert:panel.inert};
   });assert(reversal.jump<2&&reversal.fade<.05&&!reversal.inert,JSON.stringify(reversal));
   await page.waitForTimeout(420);assert(await page.locator('#details-panel').isVisible());
   // A paused or externally canceled webview animation must not trap input forever.
   for(const mode of ['pause','cancel']){
    await page.evaluate(mode=>{const p=document.querySelector('#details-panel');fixture.showPane(p);fixture.hidePane(p);p.getAnimations().forEach(a=>a[mode]());},mode);
    // Allow a busy renderer to service its timer; an unbounded paused effect still fails.
    await page.locator('#details-panel').waitFor({state:'hidden',timeout:2000});
   }
   // Moving focus out of a closing pane preserves a usable keyboard target.
   await page.evaluate(()=>{const p=document.querySelector('#details-panel');fixture.showPane(p);document.querySelector('#details-close').focus();fixture.hidePane(p);});
   assert(await page.locator('#details-panel').evaluate(n=>n.inert&&!n.contains(document.activeElement)));
   await page.waitForTimeout(350);
   // Preference changes settle dimensions and remove temporary screen scaffolding.
   for(const preference of ['system','app','background']){
    await page.evaluate(()=>{const p=document.querySelector('#computer-panel');p.hidden=false;p.inert=false;fixture.setComputerExpanded(!p.classList.contains('expanded'));});
    if(preference==='system')await page.emulateMedia({reducedMotion:'reduce'});
    else await page.evaluate(preference=>{
     if(preference==='app'){fixture.state.general.reduced_motion=true;fixture.applyGeneral();}
     else {Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}
    },preference);
    await settle();
    assert.equal(await page.locator('#computer-panel').evaluate(n=>n.style.cssText),'');
    assert.equal(await page.locator('#desktop').evaluate(n=>n.style.cssText),'');
    assert.equal(await page.locator('#computer-panel').evaluate(n=>n.getAnimations().length),0);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));fixture.state.general.reduced_motion=false;fixture.applyGeneral();});
   }
   await page.evaluate(()=>fixture.hidePane(document.querySelector('#computer-panel')));await page.waitForTimeout(350);
   // Cached General controls are interactive before a slow refresh and never fade later.
   let release,started=false;
   await page.route(origin+'/api/settings',async route=>{started=true;await new Promise(r=>release=r);await route.continue();});
   await page.locator('#settings-button').click();await page.locator('.general-settings-form').waitFor();
   await page.waitForFunction(()=>document.querySelector('#settings-content').getAnimations().length===0);
   assert(started);
   await page.getByLabel('Text size',{exact:true}).focus();
   await page.evaluate(()=>{window.lateAnimations=[];const content=document.querySelector('#settings-content'),animate=content.animate.bind(content);content.animate=(...args)=>{lateAnimations.push(args);return animate(...args);};});
   release();await page.locator('.settings-refresh-state').waitFor({state:'hidden'});
   assert.equal(await page.evaluate(()=>lateAnimations.length),0);
   assert(await page.locator('.general-settings-form').evaluate(n=>n.contains(document.activeElement)));
   await page.unroute(origin+'/api/settings');
   const nav=page.getByRole('button',{name:'Skills',exact:true});await nav.focus();await nav.press('Enter');
   assert(await nav.evaluate(n=>n===document.activeElement&&n.getAttribute('aria-current')==='page'));
   await page.getByRole('button',{name:'General',exact:true}).click();await page.locator('.general-settings-form').waitFor();await page.waitForTimeout(250);
   // Returning to the same tab must not let its older request repaint newer data.
   if(platform==='linux'){
    let releaseOld,skillRequests=0;
    await page.route(origin+'/api/skills',async route=>{
     const old=++skillRequests===1;if(old)await new Promise(resolve=>releaseOld=resolve);
     await route.fulfill({json:[{name:old?'Old workflow':'Current workflow',description:'Fixture',body:''}]});
    });
    await nav.click();await page.waitForFunction(()=>document.querySelector('#settings-content [role="status"]')?.textContent==='Loading…');
    // Wait for the first request to reach the interceptor before changing tabs.
    for(let i=0;i<100&&!releaseOld;i++)await page.waitForTimeout(20);assert(releaseOld);
    await page.getByRole('button',{name:'General',exact:true}).click();await nav.click();
    await page.getByText('Current workflow',{exact:true}).waitFor();releaseOld();await page.waitForTimeout(250);
    assert.equal(await page.getByText('Old workflow',{exact:true}).count(),0);
    assert(await page.getByText('Current workflow',{exact:true}).isVisible());
    await page.unroute(origin+'/api/skills');await page.getByRole('button',{name:'General',exact:true}).click();await page.locator('.general-settings-form').waitFor();await page.waitForTimeout(250);
   }
   // A long picker must never scroll its containing Settings page.
   await page.evaluate(()=>{
    const select=document.createElement('select');select.setAttribute('aria-label','Fixture options');
    for(let i=0;i<80;i++)select.add(new Option('Option '+i,String(i)));select.selectedIndex=79;
    const wrap=document.createElement('p');wrap.append(select);document.querySelector('#settings-content').append(wrap);wrap.scrollIntoView({block:'end'});
   });await settle();
   await page.getByLabel('Fixture options').focus();
   const beforeScroll=await page.locator('#settings-content').evaluate(n=>n.scrollTop);
   await page.getByLabel('Fixture options').press('Enter');await page.keyboard.press('Home');await page.keyboard.press('End');
   const picker=await page.evaluate(()=>{
    const menu=document.querySelector('.themed-select-menu'),row=menu.querySelector('.is-active'),r=row.getBoundingClientRect(),m=menu.getBoundingClientRect();
    return {scroll:document.querySelector('#settings-content').scrollTop,visible:r.top>=m.top&&r.bottom<=m.bottom};
   });assert(Math.abs(picker.scroll-beforeScroll)<=1&&picker.visible,JSON.stringify({picker,beforeScroll}));
   await page.keyboard.press('Escape');assert(await page.locator('#settings-dialog').isVisible());
   await page.keyboard.press('Escape');await page.locator('#settings-dialog').waitFor({state:'hidden'});
   // A queued close event from the previous visit must not abort a quick reopen.
   await page.evaluate(async()=>{
    await fixture.openSettings('general');document.querySelector('#settings-dialog').close();void fixture.openSettings('general');
   });
   await page.waitForFunction(()=>{const input=document.querySelector('.general-settings-form input');return input&&!input.disabled;});
   await page.locator('#settings-close').click();await page.locator('#settings-dialog').waitFor({state:'hidden'});
   // Only one 1px press effect, with no transform that fights positioned controls.
   await page.locator('#new-bot').hover();await page.mouse.down();await page.waitForFunction(()=>getComputedStyle(document.querySelector('#new-bot')).translate==='0px 1px');
   const press=await page.locator('#new-bot').evaluate(n=>({transform:getComputedStyle(n).transform,translate:getComputedStyle(n).translate}));
   assert.equal(press.transform,'none');const pressedOffset=Number(press.translate.split(' ')[1]?.replace('px',''));assert(pressedOffset>=0&&pressedOffset<=1.001,JSON.stringify(press));await page.mouse.up();await page.keyboard.press('Escape');
   if(platform==='linux'){
    await page.evaluate(async()=>{
     const {character,setActivity}=await import('/characters.js');const wrap=document.createElement('div');wrap.id='motion-viewport';
     wrap.style.cssText='position:fixed;right:10px;top:100px;height:100px;width:100px;overflow:auto;z-index:100';
     const spacer=document.createElement('div');spacer.style.height='300px';wrap.append(spacer);
     const bot=character({shape:'round',color:'#2475ff',animated:true},48);bot.id='motion-avatar';wrap.append(bot);document.body.append(wrap);setActivity(bot,'working',{immediate:true});
    });await page.waitForTimeout(180);
    const pose=()=>page.locator('#motion-avatar').evaluate(n=>n._character.motion.getAttribute('transform'));
    const invisible=await pose();await page.waitForTimeout(150);assert.equal(await pose(),invisible,'Offscreen avatar kept animating');
    await page.locator('#motion-viewport').evaluate(n=>n.scrollTop=n.scrollHeight);await page.waitForFunction(()=>!document.querySelector('#motion-avatar').hasAttribute('data-motion-offscreen'));
    const visible=await pose();await page.waitForTimeout(150);assert.notEqual(await pose(),visible,'Visible avatar failed to resume');
    await page.emulateMedia({reducedMotion:'reduce'});await settle();const reduced=await pose();await page.waitForTimeout(150);assert.equal(await pose(),reduced);assert.equal(reduced,null);
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(150);assert.notEqual(await pose(),null);
    await page.evaluate(async()=>{const {setActivity}=await import('/characters.js');setActivity(document.querySelector('#motion-avatar'),'mail',{immediate:true});});
    const mailPose=()=>page.locator('#motion-avatar').evaluate(n=>n._character.body.getAttribute('transform'));
    await page.waitForTimeout(2000);const mail=await mailPose();await page.waitForTimeout(150);assert.notEqual(await mailPose(),mail,'Mail gesture failed to animate');
    await page.evaluate(()=>document.documentElement.dataset.motion='off');await settle();
    const quietMail=await mailPose();await page.waitForTimeout(150);assert.equal(await mailPose(),quietMail,'Mail gesture ignored reduced motion');
    assert(await page.locator('#motion-avatar').evaluate(n=>n._character.face.style.opacity==='1'));
    await page.evaluate(()=>document.documentElement.dataset.motion='on');
    await page.locator('#motion-viewport').evaluate(n=>n.remove());
   }
   await page.evaluate(()=>{window.settingsEvents=[];for(const type of ['focusin','scroll'])document.addEventListener(type,e=>{settingsEvents.push({type,target:e.target.id,focus:document.activeElement.id,top:document.querySelector('#settings-content').scrollTop});if(settingsEvents.length>12)settingsEvents.shift();},true);});
   for(const theme of ['dark','light'])for(const width of [1320,390]){
    await page.setViewportSize({width,height:900});await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;KindredReadingSize.set(150);},theme);
    if(!await page.locator('#settings-button').isVisible())await page.locator('#mobile-menu').click();
    await page.locator('#settings-button').click();await page.locator('.general-settings-form').waitFor();await page.waitForTimeout(250);
    assert(await page.locator('#settings-dialog').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1;}));
    await page.waitForFunction(()=>!document.querySelector('#settings-dialog').getAnimations({subtree:true}).some(a=>a.effect?.getTiming().iterations!==Infinity&&a.playState==='running'));await settle();
    const visit=await page.locator('#settings-content').evaluate(n=>({top:n.scrollTop,focus:document.activeElement.outerHTML.slice(0,300),events:window.settingsEvents}));
    assert.equal(visit.top,0,'Fresh Settings visit scrolled away from its heading: '+JSON.stringify(visit));
    await page.screenshot({path:path.join(artifacts,`${engine}-${platform}-${theme}-${width}.png`)});
    await page.locator('#settings-close').click();await page.locator('#settings-dialog').waitFor({state:'hidden'});
   }
   assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({passed:true,engine,platform,reversal:true,interruptedEffects:true,livePreferences:true,stableSettingsFocus:true,noLateFade:true,pickerScrollIsolated:true}));
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

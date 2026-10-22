// Run with KINDRED_IOS_LEGACY=0 and =1 to exercise both native adapters.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const fixture = path.join(__dirname, 'test-ios-bot-center-motion.cjs');
let source = fs.readFileSync(fixture, 'utf8');
source = source.replace("['slab','outer','inner']", "['outer']");
const start = source.indexOf('  for(const reduced of [false,true]){');
const end = source.indexOf(" }console.log(JSON.stringify({passed:true,legacy,reports}));");
assert(start >= 0 && end > start, 'native fixture boundaries');
source = source.slice(0, start) + `
  const settled=()=>!document.querySelector('.pane-layout-frame,.pane-layout-reservation,.ios-pane-closing')&&!document.querySelector('#details-panel').hidden&&document.querySelector('#details-panel').getAnimations().length===0;
  const library=async()=>{
   const panel=await page.locator('#computer-panel').evaluate(n=>!n.hidden);
   if(!panel){await page.locator('#show-computer').evaluate(n=>n.click());await page.waitForFunction(()=>!document.querySelector('#computer-panel').hidden&&!document.querySelector('.ios-pane-closing,.pane-layout-frame'));}
   await page.waitForFunction(()=>window.__duoFixtureRFB&&__duoFixtureRFB.disconnects===0&&!document.querySelector('#desktop-loading'));
   await page.evaluate(()=>window.tabComputer=__duoFixtureRFB);
   await page.locator('#computer-panel [data-tab=library]').evaluate(n=>n.click());await page.waitForFunction(settled);
   assert(await page.evaluate(()=>tabComputer===__duoFixtureRFB),'tab switch retains the current connection');
  };
  await library();
  const fallback=await page.evaluate(()=>{
   const file=document.querySelector('.bot-library-open'),opener=document.querySelector('#bot-details');
   window.fileKeys=0;window.fileClicks=0;
   file.addEventListener('keydown',()=>fileKeys++);
   file.addEventListener('click',e=>{fileClicks++;e.preventDefault();e.stopImmediatePropagation();});
   file.focus();if(document.activeElement!==file)throw Error('file focus premise');
   opener.focus({preventScroll:true});if(document.activeElement!==file)throw Error('unavailable native opener premise');
   document.querySelector('#details-close').click();
   return {active:document.activeElement.tagName,inside:document.querySelector('#details-panel').contains(document.activeElement)};
  });
  assert(!fallback.inside,'closing content releases focus synchronously');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(()=>({keys:fileKeys,clicks:fileClicks})),{keys:0,clicks:0},'no hidden file keyboard activation');
  await page.keyboard.press('Tab');
  assert(await page.evaluate(()=>!document.activeElement.closest('[hidden],[inert]')),'Tab reaches available content');
  // Interrupt the fade: a fresh control in the reopened pane keeps focus even
  // when the previous transition deadline would have completed.
  await library();
  await page.locator('.bot-library-open').first().focus();
  await page.waitForTimeout(400);
  assert(await page.locator('.bot-library-open').first().evaluate(n=>document.activeElement===n),'reopen retains fresh focus');
  assert(await page.locator('#details-panel').evaluate(n=>!n.hidden&&!n.inert),'reopened pane stays interactive');
  // An available return target still receives focus; the fallback must not blur it.
  const available=await page.evaluate(()=>{
   const opener=document.querySelector('#bot-details');
   window.savedOpener={parent:opener.parentNode,next:opener.nextSibling,style:opener.getAttribute('style'),disabled:opener.disabled};
   document.body.append(opener);opener.disabled=false;opener.style.cssText='display:block!important;position:fixed;left:0;top:0;width:120px;height:40px;visibility:visible!important';
   document.querySelector('.bot-library-open').focus();document.querySelector('#details-close').click();
   return {focused:document.activeElement===opener,visible:opener.getClientRects().length>0};
  });
  assert(available.visible&&available.focused,'available opener receives and keeps focus');
  await page.evaluate(()=>{const opener=document.querySelector('#bot-details'),s=savedOpener;s.parent.insertBefore(opener,s.next);opener.disabled=s.disabled;if(s.style===null)opener.removeAttribute('style');else opener.setAttribute('style',s.style);});
  await library();
  // Closing a pane must not steal focus from an available control outside it.
  await page.evaluate(()=>{
   const outside=document.createElement('button');outside.id='outside-focus-control';outside.textContent='Outside';document.body.append(outside);outside.focus();
   document.querySelector('#details-close').click();
  });
  assert(await page.locator('#outside-focus-control').evaluate(n=>document.activeElement===n),'outside focus is untouched');
  await page.waitForFunction(()=>document.querySelector('#details-panel').hidden&&!document.querySelector('.ios-pane-closing,.pane-layout-frame'));
  assert.equal(await page.locator('#prompt').innerText(),'Retain my draft.');assert.deepEqual(errors,[]);
  reports.push({pose,fallback,available,reopen:true,outsideFocus:true,retainedConnectionAcrossTabs:true});await page.close();
` + source.slice(end);
const compiled = new Module(fixture, module);
compiled.filename = fixture;
compiled.paths = Module._nodeModulePaths(path.dirname(fixture));
compiled._compile(source, fixture);

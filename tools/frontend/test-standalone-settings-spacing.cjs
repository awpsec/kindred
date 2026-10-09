const {server}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/standalone-settings-spacing';fs.mkdirSync(out,{recursive:true});const errors=[];try{
 for(const state of ['ready','awaiting_restart','working','error']){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/local-spacing.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/style.css"></head><body><dialog class="settings-dialog server-admin-dialog"><section class="settings-main"><h2>Local server</h2><div class="server-admin-content"><div class="server-admin-page local-server-admin" id="root"></div></div></section></dialog></body></html>'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/local-spacing.html');
  await page.evaluate(async state=>{const {mountLocalServer}=await import('/standalone-access.js');window.calls=[];document.querySelector('dialog').showModal();mountLocalServer(document.querySelector('#root'),{nativeInvoke:async command=>{calls.push(command);return {status:state,stage:'Checking local server',message:'Fixture local server needs attention',local_server:{version:'0.85.12',desktop_version:'0.85.12',update_available:false}}},workingBots:()=>2,dialog:document.querySelector('dialog')});},state);
  await page.waitForFunction(()=>calls.length>0);await page.getByText('Troubleshooting',{exact:true}).click();
  const actions=page.locator('#root > .row-actions');assert.equal(await actions.isHidden(),['ready','error'].includes(state),'No empty action row when update is absent');
  assert.equal(await page.getByRole('button',{name:'Repair local server',exact:true}).isDisabled(),['working','awaiting_restart'].includes(state));
  for(const width of [1000,390])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:900});await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.motion='off';document.documentElement.style.setProperty('--text-scale','1.5');},theme);await page.evaluate(()=>document.fonts.ready);
   const geometry=await page.evaluate(()=>{const body=document.querySelector('.local-server-troubleshooting'),button=body.querySelector('button'),b=body.getBoundingClientRect(),r=button.getBoundingClientRect();return {indent:r.left-b.left,padding:getComputedStyle(body).paddingTop,fits:document.documentElement.scrollWidth<=innerWidth};});assert.equal(geometry.indent,20);assert.equal(geometry.padding,'10px');assert(geometry.fits);await page.screenshot({path:path.join(out,`${process.env.WEBKIT?'webkit':'chromium'}-local-${state}-${width}-${theme}-150.png`)});
  }
  assert.deepEqual(await page.evaluate(()=>[...new Set(calls)]),['standalone_status'],'Read-side layout never invokes maintenance');await page.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,states:4,frames:16,errors}));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

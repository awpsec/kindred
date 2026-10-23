// Design review captures from the real UI, using only local synthetic accounts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch(),out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve('test-results/appearance-preview');fs.mkdirSync(out,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1360,height:960},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('Page error:',e.message);});
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const now=Math.floor(Date.now()/1000);
  await page.route('**/api/runs',r=>r.fulfill({json:[]}));
  await page.route('**/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:[
   {seq:1,sender:'user',text:'Can you help me organize the ideas for the next project?',kind:'message',run_id:'',created:now-300},
   {seq:2,sender:'piper',text:'Absolutely. I can collect the notes, turn them into a clear outline, and bring you a first draft to review.',kind:'message',run_id:'',created:now-260},
   {seq:3,sender:'user',text:'Start with a short outline. Keep it simple and leave space for us to explore.',kind:'message',run_id:'',created:now-180},
   {seq:4,sender:'piper',text:'I’d start with three questions:\n\n- What do we want to make easier?\n- Who are we making it for?\n- What would a useful first version look like?\n\nWe can build the rest around those answers.',kind:'message',run_id:'',created:now-120}
  ]}}));
  console.log('Opening fixture');await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.locator('#bots').getByRole('button',{name:'Piper',exact:true}).waitFor();console.log('Opening settings');await page.locator('#settings-button').evaluate(n=>n.click());
  const accent=page.locator('select[aria-label="Accent color"]');await accent.waitFor();
  const theme=page.locator('.general-settings-form select').filter({has:page.locator('option[value="dark"]')});
  for(const mode of ['dark','light']){
   console.log('Capturing '+mode);await theme.selectOption(mode);await page.waitForTimeout(650);
   assert.equal(await page.locator('html').getAttribute('data-theme'),mode);
   const filter=await page.locator('.settings-header-art').evaluate(n=>getComputedStyle(n).filter);assert.equal(filter,mode==='dark'?'grayscale(1) brightness(2)':'none');
   await page.locator('#settings-dialog').screenshot({path:path.join(out,'general-'+mode+'.png')});
   await accent.click();await page.getByRole('listbox',{name:'Accent color'}).waitFor();
   assert.equal(await page.locator('.themed-select-option .accent-swatch').count(),6);
   await page.locator('#settings-dialog').screenshot({path:path.join(out,'accent-menu-'+mode+'.png')});
   await page.getByRole('listbox',{name:'Accent color'}).getByRole('option',{name:'Blue',exact:true}).click();await page.waitForTimeout(650);
   assert.equal(await page.locator('html').getAttribute('data-accent'),'blue');
   await page.locator('#settings-close').click();await page.waitForTimeout(250);
   await page.locator('#prompt').fill('That sounds good. Let’s work through the first question.');
   await page.screenshot({path:path.join(out,'chat-blue-'+mode+'.png')});
   await page.locator('#bot-details').click();await page.locator('#details-panel .bot-center-actions').getByRole('button',{name:'Bot settings',exact:true}).click();await page.locator('.bot-edit-form').waitFor();await page.waitForTimeout(250);
   const botForm=page.locator('.bot-edit-form');assert.equal(await botForm.getByRole('textbox',{name:'Name',exact:true}).count(),1);assert.equal(await botForm.getByRole('textbox',{name:'Role',exact:true}).count(),1);
   const initiative=botForm.getByRole('switch',{name:'Take initiative',exact:true});assert.equal(await initiative.count(),1);assert.equal(await initiative.isChecked(),false);
   const nameInput=botForm.getByRole('textbox',{name:'Name',exact:true});await nameInput.focus();assert.equal(await nameInput.evaluate(n=>getComputedStyle(n).outlineStyle),'solid');
   await page.locator('#details-content').evaluate(n=>n.scrollTop=0);
   await page.screenshot({path:path.join(out,'bot-settings-'+mode+'.png')});
   await page.locator('#details-close').click();
   await page.locator('#settings-button').evaluate(n=>n.click());await accent.waitFor();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,screenshots:8,accessibleLabels:true,focusIndicator:true,initiativePresent:true,themes:['dark','light'],accentOptions:6,blueAccent:true,source:'Real app with local fixture content'}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

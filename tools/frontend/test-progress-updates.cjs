const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await (process.env.WEBKIT?webkit:chromium).launch({headless:true});
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/progress-updates');fs.mkdirSync(out,{recursive:true});
 try{
 const context=await browser.newContext({viewport:{width:1200,height:900},colorScheme:'dark'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let general={name:'You',theme:'system',approval_mode:'auto',timezone:'UTC',timezone_mode:'fixed',progress_updates:'balanced'};
 let bot={id:'piper',name:'Piper',provider:'codex',model:'test',reasoning_effort:'high',instructions:'Fixture',memory:'',approval_mode:'auto',profile:{shape:'round',color:'#2475ff',progress_updates:'inherit'}};
 await context.route(origin+'/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),body=req.method()==='PUT'?req.postDataJSON():null;
  if(url.pathname==='/api/settings'){if(body)general={...general,...body};return route.fulfill({json:general});}
  if(url.pathname==='/api/bots')return route.fulfill({json:[bot]});
  if(url.pathname==='/api/bots/piper/identity'&&body){bot={...bot,name:body.name,profile:{...bot.profile,...body}};return route.fulfill({json:bot});}
  return route.continue();
 });
 await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await page.goto(origin);await page.locator('#heading').filter({hasText:'Piper'}).waitFor();
 await page.locator('#settings-button').click();
 const tiles=page.locator('.progress-choices');await tiles.scrollIntoViewIfNeeded();
 assert(await page.getByRole('radio',{name:'Balanced',exact:true}).isChecked());
 for(const mode of ['Calm','Frequent','Balanced']){
  await page.getByRole('radio',{name:mode,exact:true}).check({force:true});
  await page.waitForFunction(mode=>document.querySelector('.progress-choice-description').textContent.includes(mode==='Calm'?'Mostly quiet':mode==='Frequent'?'More frequent':'milestones'),mode);
  for(let i=0;i<100&&general.progress_updates!==mode.toLowerCase();i++)await page.waitForTimeout(30);
  assert.equal(general.progress_updates,mode.toLowerCase());
 }
 await tiles.screenshot({path:out+'/'+engine+'-dark.png'});
 await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 await tiles.screenshot({path:out+'/'+engine+'-light.png'});
 await page.setViewportSize({width:390,height:844});await tiles.scrollIntoViewIfNeeded();
 const bounds=await tiles.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=390);
 for(const tile of await page.locator('.progress-choice').all())assert(await tile.evaluate(n=>n.scrollHeight<=n.clientHeight+2),'thumbnail overflow');
 await tiles.screenshot({path:out+'/'+engine+'-mobile.png'});
 await page.setViewportSize({width:1200,height:900});await page.evaluate(()=>document.querySelector('#settings-dialog').close());
 await page.locator('#bot-details').click();
 const select=page.locator('.bot-identity-form').getByRole('combobox',{name:'Progress updates',exact:true});
 assert.equal(await select.inputValue(),'inherit');await select.selectOption('calm');
 for(let i=0;i<100&&bot.profile.progress_updates!=='calm';i++)await page.waitForTimeout(30);
 assert.equal(bot.profile.progress_updates,'calm');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,engine,visualModes:true,accountPersistence:true,perBotOverride:true,mobile:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

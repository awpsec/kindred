const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve('test-results/avatar-pointer'),engine=process.env.WEBKIT?'webkit':'chromium';fs.mkdirSync(out,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1320,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await page.route('**/api/bots',async route=>{const response=await route.fetch(),bots=await response.json();for(const bot of bots)bot.profile={...bot.profile,avatar:{version:1,body:'clover',expression:'neutral',palette:'blue',custom_color:null}};await route.fulfill({json:bots});});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#bot-details').waitFor();
  for(const width of [1320,900,390]){
   await page.setViewportSize({width,height:900});await page.waitForTimeout(300);
   const centers=await page.evaluate(()=>{
    const slot=document.querySelector('#header-avatar').getBoundingClientRect(),avatar=document.querySelector('#header-avatar>.character').getBoundingClientRect(),name=document.querySelector('#heading').getBoundingClientRect();
    return{slot:slot.y+slot.height/2,avatar:avatar.y+avatar.height/2,name:name.y+name.height/2};
   });
   assert(Math.abs(centers.avatar-centers.slot)<.75,'avatar centers in its slot at '+width);
   assert(Math.abs(centers.avatar-centers.name)<1,'avatar aligns with name at '+width);
  }
  await page.setViewportSize({width:1320,height:900});await page.waitForTimeout(4200);
  const row=page.locator('#bots .bot-link').first(),avatar=row.locator('.character').first();
  await avatar.evaluate(b=>{window.pointerCalls=[];const look=b._artwork.lookAt;b._artwork.lookAt=p=>{pointerCalls.push(p);look(p);};});
  const geometry=()=>avatar.evaluate(b=>[...b.querySelectorAll('[id$="-body"] path')].map(p=>p.getAttribute('d')||p.getAttribute('points')));
  assert.equal(await avatar.getAttribute('data-avatar-body'),'clover');
  const baseline=await geometry();assert(baseline.length>0,'body geometry exists');await row.screenshot({path:path.join(out,engine+'-sidebar-rest.png')});
  const b=await avatar.boundingBox(),x=b.x+b.width/2+b.width,y=b.y+b.height/2;
  await page.mouse.move(x,y);await page.waitForTimeout(900);
  const point=await page.evaluate(()=>pointerCalls.filter(Array.isArray).at(-1));assert(Math.abs(point[0]-.5)<.01,'sidebar uses authored two-avatar-width gaze reach');
  assert.notDeepEqual(await geometry(),baseline,'hover turns body, not only eye masks');await row.screenshot({path:path.join(out,engine+'-sidebar-follow.png')});
  await page.mouse.move(800,700);await page.waitForTimeout(1800);
  assert.equal(await avatar.evaluate(b=>b._avatarHost.active()),false,'leaving row settles animation');
  const settled=await geometry();await page.waitForTimeout(300);assert.deepEqual(await geometry(),settled,'rest stays static');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);const reduced=await avatar.innerHTML();await page.mouse.move(x,y);await page.waitForTimeout(400);assert.equal(await avatar.innerHTML(),reduced,'reduced motion stays static');
  await page.screenshot({path:path.join(out,engine+'-aligned-header.png')});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({engine,alignedWidths:[1320,900,390],authoredReach:true,bodyTurns:true,leaveSettles:true,reducedMotion:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');
fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const bots=[{id:'raven',name:'Raven',provider:'codex',profile:{shape:'capsule',color:'#8854e8'}},{id:'sandor',name:'Sandor',provider:'codex',profile:{shape:'cloud',color:'#ffffff'}}];
  const chat={id:'bot-conversation',name:'Raven, Sandor',members:bots.map(bot=>bot.id),bot_only:true,archived:false};
  const now=Math.floor(Date.now()/1000),messages=[
   {seq:1,sender:'raven',kind:'handoff',created:now,text:'@Sandor I checked the support channel and the shared inbox. The latest message is a routine test; no action was requested. The channel has no other urgent requests. I have left the original message untouched so you can review it if needed.'},
   {seq:2,sender:'sandor',kind:'message',created:now+1,text:'Thanks. Treat it as a routine test; no follow-up is needed.'},
   {seq:3,sender:'sandor',kind:'message',created:now+2,text:'I will keep an eye on the next update.'},
  ];
  await context.addInitScript(value=>sessionStorage.setItem('kindred-token',value),token);
  await context.route(origin+'/api/**',route=>{
   const name=new URL(route.request().url()).pathname,send=json=>route.fulfill({json});
   if(name==='/api/settings')return send({theme:'dark',reduced_motion:true});
   if(name==='/api/bots')return send(bots);
   if(name==='/api/chats')return send([chat]);
   if(name==='/api/chats/'+chat.id)return send({chat,messages});
   if(name==='/api/runs')return send([]);
   if(name==='/api/activity')return send({});
   return route.continue();
  });
  await page.goto(origin);
  await page.locator('.bot-chat-section summary').click();
  await page.locator('.bot-chat-list .bot-link').click();
  await page.locator('[data-message="3"] .message-bubble').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(artifacts,`group-spacing-${engine}-desktop.png`)});
  async function check(expectedAvatars){
   const layout=await page.locator('#content').evaluate(content=>({
    width:content.clientWidth,full:content.scrollWidth,
    messages:[...content.querySelectorAll('.group-message')].map(group=>{
     const bubble=group.querySelector('.message-bubble'),viewport=bubble.querySelector('.message-text-viewport'),avatar=group.querySelector('.message-avatar');
     const b=bubble.getBoundingClientRect(),v=viewport.getBoundingClientRect(),a=avatar?.getBoundingClientRect(),s=getComputedStyle(bubble),c=content.getBoundingClientRect();
     return {seq:Number(group.dataset.message),avatar:!!avatar,position:avatar&&getComputedStyle(avatar).position,
      avatarInGutter:!a||(a.left>=c.left&&a.right<=b.left-6),bottomAligned:!a||Math.abs(a.bottom-b.bottom)<1,
      excessHeight:b.height-v.height-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom)-parseFloat(s.borderTopWidth)-parseFloat(s.borderBottomWidth),
      fits:b.left>=c.left&&b.right<=c.right,contentFits:viewport.scrollWidth<=viewport.clientWidth+1};
    })
   }));
   assert(layout.full<=layout.width+1,'Group conversation must not scroll sideways: '+JSON.stringify(layout));
   assert.deepEqual(layout.messages.filter(message=>message.avatar).map(message=>message.seq),expectedAvatars,'One avatar at the end of each sender sequence');
   for(const message of layout.messages){
    if(message.avatar)assert.equal(message.position,'absolute','The avatar must not add a blank line to the bubble');
    assert(message.avatarInGutter&&message.bottomAligned,'Avatar stays in its gutter: '+JSON.stringify(message));
    assert(Math.abs(message.excessHeight)<2,'Bubble hugs its text without a spare avatar row: '+JSON.stringify(message));
    assert(message.fits&&message.contentFits,'Wrapped message fits its chat: '+JSON.stringify(message));
   }
  }
  const sizes=[[1320,900,'desktop'],[900,700,'narrow-desktop'],[540,720,'duo'],[390,844,'phone']];
  for(const [width,height,label] of sizes){
   await page.setViewportSize({width,height});
   for(const theme of ['dark','light'])for(const scale of [1,1.3]){
    await page.evaluate(({theme,scale})=>{document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty('--text-scale',scale);},{theme,scale});
    await page.waitForTimeout(120);await check([1,3]);
    if(theme==='dark'&&scale===1)await page.screenshot({path:path.join(artifacts,`group-spacing-${engine}-${label}.png`)});
   }
  }
  messages.push({seq:4,sender:'sandor',kind:'message',created:now+3,text:'Another message moves my avatar to the end of this sequence.'});
  await page.locator('[data-message="4"]').waitFor();await check([1,4]);
  await page.reload();await page.locator('[data-message="4"]').waitFor();await check([1,4]);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,botOnly:true,compactBubbles:true,avatarGutter:true,sequenceArrivalAndReload:true,sizes:sizes.map(size=>size[2]),themes:2,textScales:2}));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});

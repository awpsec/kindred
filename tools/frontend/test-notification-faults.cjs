const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try {
  async function fixture(options={}) {
   const context=await browser.newContext(),p=await context.newPage(),items=[],errors=[];let avatarRelease,assetRequests=0;
   p.on('pageerror',e=>errors.push(e.message));
   await p.addInitScript(({token,options})=>{
    sessionStorage.setItem('kindred-token',token);window.notes=[];window.sounds=0;window.revoked=[];window.rejectTag='';window.resolveDecode=null;
    const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>String(fn).includes('pollBrowserNotifications')?0:interval(fn,ms,...args);
    const revoke=URL.revokeObjectURL;URL.revokeObjectURL=u=>{window.revoked.push(u);revoke(u);};
    window.Notification=class {static permission='granted';constructor(title,options){if(options.tag===window.rejectTag){window.rejectTag='';throw Error('Transient notification failure');}window.notes.push(options);}close(){}};
    window.AudioContext=class {state=options.blocked?'suspended':'running';destination={};constructor(){window.audio=this;}resume(){return this.state==='suspended'?Promise.reject(Error('Audio blocked')):Promise.resolve();}decodeAudioData(bytes){if(bytes.byteLength<1000)throw Error('Bad PCM');return options.delayedDecode?new Promise(r=>window.resolveDecode=()=>r({})):Promise.resolve({});}createBufferSource(){return {connect(){},disconnect(){},start(){window.sounds++;}};}};
   },{token,options});
   await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.__notifyQA={poll:pollBrowserNotifications,bot:()=>state.bots[0].id,muteBot:()=>state.bots[0].profile.notifications=false,busy:()=>browserNotificationBusy,cursor:()=>browserNotificationCursor};'}));
   await p.route(origin+'/audio/kindred-pop.wav',r=>{assetRequests++;return options.failFirstAudio&&assetRequests===1?r.fulfill({status:503,body:'Unavailable'}):r.continue();});
   await p.route(origin+'/api/notifications*',r=>{const after=new URL(r.request().url()).searchParams.get('after');return r.fulfill({json:{cursor:items.at(-1)?.id||0,items:after===null?[]:items.filter(i=>i.id>Number(after))}});});
   await p.route(origin+'/api/bots/*/avatar.png',async r=>{if(options.holdAvatar)await new Promise(resolve=>avatarRelease=resolve);return r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64')});});
   await p.goto(origin);await p.locator('#app').waitFor({state:'visible'});await p.waitForFunction(()=>!!window.__notifyQA);await p.mouse.click(8,8);
   const bot=await p.evaluate(()=>__notifyQA.bot());await p.waitForFunction(()=>!__notifyQA.busy());await p.evaluate(()=>__notifyQA.poll());await p.waitForFunction(()=>!__notifyQA.busy());
   return {p,context,errors,items,add:id=>items.push({id,bot_id:bot,title:'Piper',body:'Finished',chat_id:'dm'}),flush:()=>p.evaluate(()=>__notifyQA.poll()),releaseAvatar:()=>avatarRelease?.(),avatarPending:()=>!!avatarRelease,assets:()=>assetRequests};
  }
  const a=await fixture();try {
   [1,2,3].forEach(a.add);await a.flush();await a.p.waitForFunction(()=>sounds===1);assert.equal(await a.p.evaluate(()=>notes.length),3);assert.equal(a.assets(),1);
   await a.p.evaluate(()=>rejectTag='kindred-5');a.add(4);a.add(5);await a.flush();assert.equal(await a.p.evaluate(()=>__notifyQA.cursor()),4);const revoked=await a.p.evaluate(()=>window.revoked.length);assert(revoked>=1);
   await a.flush();assert.deepEqual(await a.p.evaluate(()=>notes.map(n=>n.tag)),[1,2,3,4,5].map(n=>'kindred-'+n));assert(await a.p.evaluate(()=>notes.every(n=>n.silent===true)));assert.deepEqual(a.errors,[]);
  }finally{await a.context.close();}
  const b=await fixture({failFirstAudio:true});try {
   b.add(1);await b.flush();await b.p.waitForTimeout(120);assert.equal(await b.p.evaluate(()=>notes.length),1);assert.equal(await b.p.evaluate(()=>sounds),0);
   b.add(2);await b.flush();await b.p.waitForFunction(()=>sounds===1);assert.equal(b.assets(),2);assert.equal(await b.p.evaluate(()=>notes.length),2);assert.deepEqual(b.errors,[]);
  }finally{await b.context.close();}
  const c=await fixture({delayedDecode:true});try {
   c.add(1);await c.flush();await c.p.waitForFunction(()=>!!resolveDecode);await c.p.evaluate(()=>{__notifyQA.muteBot();resolveDecode();});await c.p.waitForTimeout(100);assert.equal(await c.p.evaluate(()=>sounds),0);assert.equal(await c.p.evaluate(()=>notes.length),1);assert.deepEqual(c.errors,[]);
  }finally{await c.context.close();}
  const d=await fixture({holdAvatar:true});try {
   d.add(1);const pending=d.flush();for(let i=0;i<100&&!d.avatarPending();i++)await d.p.waitForTimeout(10);assert(d.avatarPending());await d.p.evaluate(()=>Notification.permission='denied');d.releaseAvatar();await pending;
   assert.equal(await d.p.evaluate(()=>notes.length),0);assert.equal(await d.p.evaluate(()=>sounds),0);assert.equal(await d.p.evaluate(()=>__notifyQA.cursor()),1);assert.equal(await d.p.evaluate(()=>revoked.length),1);assert.deepEqual(d.errors,[]);
  }finally{await d.context.close();}
  const e=await fixture({blocked:true});try {e.add(1);await e.flush();assert.equal(await e.p.evaluate(()=>notes.length),1);assert.equal(e.assets(),0);assert.equal(await e.p.evaluate(()=>sounds),0);assert.deepEqual(e.errors,[]);}finally{await e.context.close();}
  const f=await fixture({holdAvatar:true});try {
   f.add(1);let timer;try{await Promise.race([f.flush(),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('A stalled portrait blocked notification delivery')),4500))]);}finally{clearTimeout(timer);f.releaseAvatar();}
   assert.equal(await f.p.evaluate(()=>notes.length),1);assert.equal(await f.p.evaluate(()=>notes[0].icon),'/favicon.svg');assert.equal(await f.p.evaluate(()=>__notifyQA.cursor()),1);assert.deepEqual(f.errors,[]);
  }finally{f.releaseAvatar();await f.context.close();}
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'edge',burstCoalescing:true,noDuplicateOnDeliveryRetry:true,failedSoundRecovers:true,muteDuringDecode:true,permissionRevokedDuringPortrait:true,blobCleanup:true,blockedAudioKeepsNotification:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

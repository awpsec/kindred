// Full production chat layout with a synthetic voice bridge. Actual browser
// microphone/capture remains covered by test-voice-capture-browser.cjs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/duo.cjs');
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(engine==='webkit'?webkit:chromium).launch({timeout:90000});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/voice/settings',r=>r.fulfill({json:{enabled:true,configured:true,voice:'willow',voices:[{id:'willow',name:'Willow'}]}}));
    await page.route('**/api/voice/start',r=>r.fulfill({json:{id:'floating-call',ticket:'b'.repeat(64)}}));
    await page.addInitScript(token=>{
      sessionStorage.setItem('kindred-token',token);window.voiceMessages=[];window.__KINDRED_IOS_VOICE={protocolVersion:1,documentID:'floating-document'};
      window.voiceEvent=value=>dispatchEvent(new CustomEvent('kindred-ios-voice',{detail:{id:'floating-call',documentID:'floating-document',...value}}));
      window.webkit={messageHandlers:{kindredVoice:{postMessage:m=>{voiceMessages.push(m);if(m.action==='start')queueMicrotask(()=>voiceEvent({type:'started',started_ms:Date.now()}));if(m.action==='end')queueMicrotask(()=>voiceEvent({type:'ended',saved:true}));if(m.action==='mute')queueMicrotask(()=>voiceEvent({type:'mute',muted:m.muted}));}}}};
    },token);
    await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-piper');await page.getByRole('button',{name:'Start voice call',exact:true}).waitFor();
    await page.evaluate(()=>{const e=document.querySelector('#content');e.scrollTo({top:e.scrollHeight,behavior:'instant'});});
    await page.getByRole('button',{name:'Start voice call',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.voice-call-state').textContent==='Piper is listening');
    await page.waitForFunction(()=>{const e=document.querySelector('#content');return e.scrollHeight-e.scrollTop-e.clientHeight<4});
    await page.locator('#prompt').fill('Typing is available during the call.');assert(await page.getByRole('button',{name:'Send message',exact:true}).isVisible());
    await page.evaluate(()=>{let n=0;const levels=[0,.012,.04,.11,.05,.02,.005,.06,.14,.02];window.levelTimer=setInterval(()=>{voiceEvent({type:'levels',input:levels[n%levels.length],output:levels[(n+4)%levels.length]});n++},100)});await page.waitForTimeout(3600);
    if(process.env.KINDRED_TEST_ARTIFACTS){fs.mkdirSync(process.env.KINDRED_TEST_ARTIFACTS,{recursive:true});for(const theme of ['dark','light']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.waitForTimeout(100);await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,'voice-floating-desktop-'+theme+'-'+engine+'.png')});}}
    await page.evaluate(()=>{clearInterval(levelTimer);voiceEvent({type:'mute',muted:true});});
    assert(await page.evaluate(()=>[...document.querySelectorAll('.voice-wave-input i')].every(e=>Number(e.dataset.level)===0)),'system mute clears mic history immediately');
    await page.getByRole('button',{name:'Unmute microphone',exact:true}).click();
    // Real pane navigation at narrow desktop widths must leave call controls
    // above the chat, reachable even when its wider waveform cannot fit.
    for(const width of [800,761,760,700]){
      await page.setViewportSize({width,height:760});await page.locator('#bot-details').click();await page.locator('#details-panel').waitFor({state:'visible'});await page.waitForTimeout(300);
      const hit=await page.locator('.voice-end').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,right:r.right,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}});
      const full=await page.evaluate(()=>{const p=document.querySelector('#details-panel').getBoundingClientRect(),c=document.querySelector('.conversation').getBoundingClientRect();return p.width>=c.width-.5&&p.x<=c.x+.5});
      if(full)assert.equal(await page.evaluate(()=>voiceMessages.filter(m=>m.action==='end').length),0,'full-screen details navigation must not end the call');
      else assert(hit.hit&&hit.x>=0&&hit.right<=width,'End call must remain reachable beside the details pane at '+width);
      if(process.env.KINDRED_TEST_ARTIFACTS&&width===800)await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,'voice-floating-desktop-pane-'+engine+'.png')});
      await page.getByRole('button',{name:'Close bot center',exact:true}).click();await page.locator('#details-panel').waitFor({state:'hidden'});await page.waitForTimeout(60);assert(await page.locator('.voice-end').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'End is reachable after returning from details');
    }
    await page.evaluate(()=>{const e=document.querySelector('#content');e.scrollTo({top:e.scrollHeight,behavior:'instant'});});await page.getByRole('button',{name:'End call',exact:true}).click();await page.locator('.voice-call-tray').waitFor({state:'hidden'});
    await page.waitForFunction(()=>{const e=document.querySelector('#content');return e.scrollHeight-e.scrollTop-e.clientHeight<4});assert.equal(await page.locator('#prompt').evaluate(e=>e.value),'Typing is available during the call.');
    await page.locator('#prompt').fill('');await page.setViewportSize({width:1100,height:760});await page.waitForTimeout(180);
    const anchor=await page.evaluate(()=>{const e=document.querySelector('#content');e.scrollTo({top:Math.max(0,e.scrollHeight-e.clientHeight-400),behavior:'instant'});const row=[...e.querySelectorAll('.message-row')].find(n=>n.getBoundingClientRect().top>=e.getBoundingClientRect().top+130);row.dataset.voiceAnchor='true';return row.getBoundingClientRect().top;});
    await page.getByRole('button',{name:'Start voice call',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.voice-call-state').textContent==='Piper is listening');
    assert(Math.abs(await page.locator('[data-voice-anchor]').evaluate(e=>e.getBoundingClientRect().top)-anchor)<3,'starting a call preserves a mid-history reading anchor');
    await page.getByRole('button',{name:'End call',exact:true}).click();await page.locator('.voice-call-tray').waitFor({state:'hidden'});
    assert(Math.abs(await page.locator('[data-voice-anchor]').evaluate(e=>e.getBoundingClientRect().top)-anchor)<3,'ending a call preserves a mid-history reading anchor');
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,bottomAnchored:true,historyAnchored:true,typingAvailable:true,paneControlsReachable:true,systemMuteImmediate:true}));
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});

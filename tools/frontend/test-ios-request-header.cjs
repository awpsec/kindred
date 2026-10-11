// Designer probe: iOS conversation type, real app render, before/after, Dynamic Type sweep. Browser fixture only.
const {webkit,chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE);
const {server,token}=require('./fixtures/desktop.cjs');const fs=require('fs'),path=require('path');
const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-ios-header';fs.mkdirSync(out,{recursive:true});
const LABEL=process.env.LABEL||'header';const assert=require('node:assert/strict');
let browser;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium';browser=await({webkit,chromium})[engine].launch();const results=[],pageErrors=[];
 const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
 const run={id:'r1',bot_id:'piper',chat_id:chat.id,status:'completed',created:now-300,prompt:'Review the report.',output:'',error:'',progress_started:now-300};
 const run2={id:'r2',bot_id:'piper',chat_id:chat.id,status:'completed',created:now-60,prompt:'Book it.',output:'',error:''};
 const long='The report is ready. I checked the **supporting evidence** and marked two items for review.\n\nThe second section covers the payment schedule, which now lines up with the vendor terms you shared last week.';
 const q1={id:'q1',bot_id:'piper',run_id:'r2',question:'Which calendar should I use for the review meeting next Tuesday?',context:'You have two calendars connected. The work calendar already has a hold at 3 PM.\n\n'+'Details about each calendar and the people who can see events on it. '.repeat(7),options:['Work calendar (shared with the team)','Personal calendar','Ask me again closer to the date'],status:'pending',selected:null,created:now-30};
 const q2={id:'q2',bot_id:'piper',run_id:'r2',question:'Send the summary now?',context:'Short context.',options:['Yes','Later'],status:'pending',selected:null,created:now-20};
 const messages=[{seq:1,sender:'user',kind:'message',text:run.prompt,created:now-305},
  ...[2,3,4].map((seq,i)=>({seq,sender:'piper',kind:'assistant',run_id:run.id,created:now-290+i*40,text:['Comparing the report with the source.','First findings match.','Two items need a closer check.'][i],progress:{mode:'summaries',phase:'commentary',run_id:run.id,group_id:'g1'}})),
  {seq:5,sender:'piper',kind:'result',run_id:run.id,created:now-150,text:long},
  {seq:6,sender:'user',kind:'message',text:'Great, book the review with the team please.',created:now-70},
  {seq:7,sender:'piper',kind:'question',question:q1,run_id:'r2',text:q1.question,created:now-30},
  {seq:8,sender:'piper',kind:'question',question:q2,run_id:'r2',text:q2.question,created:now-20}];
 const sizes=[['xS',14],['L',17],['XL',19],['XXXL',23],['AX1',28],['AX3',40],['AX5',53]];
 for(const [w,h] of [[390,844],[375,667],[320,568]])for(const theme of ['light','dark']){
  const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:engine==='chromium'?true:undefined,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);const errors=[];let phase='load';p.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',w,theme,phase,e.message)});
  await p.addInitScript(t=>{window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';window.__KINDRED_SYSTEM_TEXT_SCALE=1;sessionStorage.setItem('kindred-token',t);},token);
  await p.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});
   if(n==='/api/settings')return send({name:'You',theme,reduced_motion:true,approval_mode:'ask'});
   if(n==='/api/runs')return send([run2,run]);if(n==='/api/runs/r1')return send({run,events:[],attachments:[],approvals:[]});
   if(n==='/api/runs/r2')return send({run:run2,events:[{seq:1,kind:'question_wait',body:{id:'q1'},created:now-30},{seq:2,kind:'question_wait',body:{id:'q2'},created:now-20}],attachments:[],approvals:[]});
   if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/activity')return send({});return r.continue();});
  await p.goto(origin);await p.locator('[data-question-id="q1"]').waitFor();await p.locator('.summary-progress-disclosure').waitFor();
  await p.evaluate(()=>document.documentElement.dataset.motion='off');
  await p.locator('#prompt').fill('Draft reply that stays put while text size changes.');
  for(const [cat,pt] of sizes){
   const scale=pt/17;phase=cat;
   await p.evaluate(s=>window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:s}})),scale);
   await p.waitForTimeout(250);
   const m=await p.evaluate(()=>{
    const tray=document.querySelector('.request-tray'),heading=tray.querySelector('.request-tray-heading'),option=tray.querySelector('.question-option');
    const r=n=>{const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,width:b.width,height:b.height}};
    const cs=getComputedStyle(heading),bounds=r(heading),lineHeight=parseFloat(cs.lineHeight);
    const brokenWords=[];const walk=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT);
    for(let node;node=walk.nextNode();){for(const match of node.textContent.matchAll(/\p{L}+/gu)){const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);const tops=[...range.getClientRects()].filter(x=>x.width>0).map(x=>Math.round(x.top));if(new Set(tops).size>1)brokenWords.push(match[0]);}}
    const bubble=document.querySelector('.message-row:not(.summary-progress-update)>.message-bubble');
    return {title:bounds,lines:Math.round(bounds.height/lineHeight),brokenWords,option:r(option),tray:r(tray),bar:r(tray.querySelector('.request-tray-bar')),headingFont:parseFloat(cs.fontSize),optionFont:parseFloat(getComputedStyle(option).fontSize),messageFont:parseFloat(getComputedStyle(bubble).fontSize),promptFont:parseFloat(getComputedStyle(document.querySelector('#prompt')).fontSize),progressFont:parseFloat(getComputedStyle(document.querySelector('.summary-progress-heading')).fontSize),draft:document.querySelector('#prompt').value||document.querySelector('#prompt').innerText,overflow:document.documentElement.scrollWidth>innerWidth};
   });
   results.push({engine,w,h,theme,cat,scale,...m});
   fs.writeFileSync(path.join(out,`${LABEL}-${engine}-results.json`),JSON.stringify(results,null,2));
   await p.screenshot({path:path.join(out,`${LABEL}-${engine}-${w}-${theme}-${cat}.png`)});
   assert.equal(m.overflow,false);assert.deepEqual(m.brokenWords,[],`${w}/${cat}: title breaks inside a word`);
   assert.ok(Math.abs(m.headingFont-16*scale)<.03);assert.ok(Math.abs(m.optionFont-16*scale)<.03);assert.ok(Math.abs(m.promptFont-16*scale)<.03);
   assert.ok(Math.abs(m.progressFont-13*scale)<.03);
   assert.equal(m.draft,'Draft reply that stays put while text size changes.');
   if(cat==='L'){if(w>=375){assert.ok(m.lines<=3,`${w}: title takes ${m.lines} lines`);assert.ok(m.option.bottom<=m.tray.bottom-10,`${w}: first option clipped`);}else assert.ok(m.option.top<m.tray.bottom-10,'320: no option starts in view');}
  }
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:1}})));
  phase='response';await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await p.locator('.request-tray .question-custom').click();await p.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));await p.locator('.question-response textarea').fill('Editable answer');
  for(const scale of [1,2.1]){await p.evaluate(s=>window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:s}})),scale);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await p.locator('.question-response textarea').inputValue(),'Editable answer');}
  pageErrors.push(...errors.map(message=>({w,theme,message})));await ctx.close();
 }
 for(const platform of ['desktop','android']){
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:platform==='android'});const p=await ctx.newPage();
  await p.addInitScript(({platform,token})=>{sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-text-size','100');if(platform==='android'){window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='android';}},{platform,token});
  await p.goto(origin);await p.waitForFunction(()=>window.KindredReadingSize);
  await p.evaluate(()=>{const sample=document.createElement('div');sample.id='header-sample';sample.innerHTML='<div class="request-tray-header"><h3 class="request-tray-heading">Choose a calendar</h3><div class="request-tray-bar">1 / 2</div></div>';document.body.append(sample)});
  const m=await p.evaluate(()=>{const header=document.querySelector('#header-sample .request-tray-header'),title=header.querySelector('h3');return {wrap:getComputedStyle(header).flexWrap,basis:getComputedStyle(title).flexBasis,font:parseFloat(getComputedStyle(title).fontSize),system:document.documentElement.hasAttribute('data-system-text-size')}});
  assert.equal(m.system,false);assert.equal(m.wrap,'nowrap');assert.equal(m.basis,'0%');assert.equal(m.font,13);results.push({platform,...m});await ctx.close();
 }
 fs.writeFileSync(path.join(out,`${LABEL}-${engine}-results.json`),JSON.stringify(results,null,2));
 fs.writeFileSync(path.join(out,`${LABEL}-${engine}-page-errors.json`),JSON.stringify(pageErrors,null,2));
 console.log('HEADER_GEOMETRY_CHECKS_COMPLETED',engine,results.length);
 assert.deepEqual(pageErrors,[],'All collected page errors remain failures');
 console.log('PASS header default/AX wrapping, option visibility, live scale, draft/response preservation',engine,results.length);await browser.close();server.close();
})().catch(async e=>{console.error(e);process.exitCode=1;if(browser)await browser.close();server.close()});

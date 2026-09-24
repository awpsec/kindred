// Linux typography, scaling and plain-text editing regression checks.
// API data and native calls are fixtures; no provider or backend is contacted.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/linux-layout');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 const results=[],failures=[],errors=[];
 try{
 for(const density of [1,1.25,1.5,2]){
  const context=await browser.newContext({viewport:{width:1100,height:760},deviceScaleFactor:density});
  await context.addInitScript(({token})=>{sessionStorage.setItem('kindred-token',token);window.__KINDRED_DESKTOP={platform:'linux'};window.__KINDRED_NATIVE_FRAME=true;window.__TAURI__={core:{invoke:async()=>null}};},{token});
  const p=await context.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>r.request().url().startsWith(origin)||r.request().url().startsWith('blob:')?r.continue():r.abort());
  await context.route(/\/api\/chats\/dm-piper(?:\?.*)?$/,r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:[
   {seq:1,sender:'user',kind:'message',text:'Check spacing, font weights, and wrapping. Café naïve — fi fl.',created:100},
   {seq:2,sender:'piper',kind:'result',text:'Ordinary body text with **intentional bold** and *intentional italic*.\n\n- First item\n- Second item\n\n| Item | Result |\n| --- | --- |\n| Linux | Ready |\n\n`'+('long_path_segment_'.repeat(12))+'`',created:101}
  ],page:{has_before:false,has_after:false}}}));
  await p.goto(origin);await p.locator('#prompt').waitFor({state:'visible'});
  const fonts=await p.evaluate(async()=>{await document.fonts.ready;return Promise.all(['400 16px Inter','550 16px Inter','650 16px Inter','italic 400 16px Inter'].map(async font=>(await document.fonts.load(font)).map(f=>f.status)));});
  assert(fonts.every(f=>f.length&&f.every(s=>s==='loaded')),'Bundled regular, intermediate and italic faces must load');
  assert.equal(await p.locator('.message-row.assistant strong').evaluate(n=>getComputedStyle(n).fontWeight),'700');
  assert.equal(await p.locator('.message-row.assistant em').evaluate(n=>getComputedStyle(n).fontStyle),'italic');
  assert.equal(await p.locator('.message-row.assistant .message-bubble').evaluate(n=>getComputedStyle(n).fontWeight),'400');
  for(const [width,height] of [[1320,860],[1100,760],[800,650],[640,480]])for(const size of [100,115,125,150]){
   await p.setViewportSize({width,height});
   await p.evaluate(size=>{KindredReadingSize.set(size);document.documentElement.dataset.motion='off';},size);
   const editor=p.locator('#prompt');await editor.fill('Agjpqy — café naïve fi fl\nSecond line with deliberate  double spaces\nThird line: a_b /tmp/example 🙂');
   await p.waitForTimeout(80);
   const measured=await p.evaluate(()=>{
    const n=document.querySelector('#prompt'),s=getComputedStyle(n),r=n.getBoundingClientRect(),send=document.querySelector('#send').getBoundingClientRect(),c=document.querySelector('#composer').getBoundingClientRect();
    return {font:s.fontFamily,weight:s.fontWeight,fontSize:parseFloat(s.fontSize),line:parseFloat(s.lineHeight),text:n.value,overflow:document.documentElement.scrollWidth>innerWidth,editorOverflow:n.scrollWidth>n.clientWidth+1,inside:r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,sendInside:send.x>=c.x&&send.right<=c.right&&send.bottom<=innerHeight,dpr:devicePixelRatio};
   });
   const row={density,width,height,size,...measured};results.push(row);
   assert.equal(measured.text,'Agjpqy — café naïve fi fl\nSecond line with deliberate  double spaces\nThird line: a_b /tmp/example 🙂');
   const name=await p.locator('.bot-title-row strong').first().evaluate(n=>({visible:!!n.getClientRects().length,clipped:n.scrollWidth>n.clientWidth+1}));
   if(name.visible&&name.clipped)failures.push({density,width,height,size,botNameClipped:true});
   if(measured.line<measured.fontSize*1.4||measured.overflow||measured.editorOverflow||!measured.inside||!measured.sendInside||measured.weight!=='400')failures.push(row);
   if(density===1&&[100,150].includes(size)&&[1100,640].includes(width))await p.screenshot({path:path.join(out,`${engine}-${width}-${size}-dark.png`)});
  }
  // Browser rich-text shortcuts must not silently change a plain-text draft.
  await p.setViewportSize({width:1100,height:760});await p.evaluate(()=>KindredReadingSize.set(115));
  const editor=p.locator('#prompt');await editor.fill('Ordinary text');await editor.press('ControlOrMeta+a');await editor.press('ControlOrMeta+b');await editor.press('ControlOrMeta+i');await editor.press('ControlOrMeta+u');
  const bold=await editor.evaluate(n=>({html:n.innerHTML,weights:[...n.querySelectorAll('*')].map(e=>getComputedStyle(e).fontWeight),richText:!!n.querySelector('b,strong,i,em,u'),text:n.value}));
  if(bold.richText||bold.weights.some(w=>Number(w)>400))failures.push({density,unexpectedRichText:bold});
  await editor.fill('Restored normal draft');
  await p.locator('#settings-button').click();await p.locator('.settings-dialog').waitFor({state:'visible'});
  const tabs=await p.locator('.settings-nav button').allTextContents();
  for(const [width,height] of [[1100,760],[800,650],[640,480]])for(const size of [100,150]){
   await p.setViewportSize({width,height});await p.evaluate(size=>{KindredReadingSize.set(size);document.documentElement.dataset.theme=size===150?'light':'dark';},size);
   for(let i=0;i<tabs.length;i++){
    await p.locator('.settings-nav button').nth(i).click();await p.waitForTimeout(60);
    const bounds=await p.locator('.settings-dialog').evaluate(n=>{const r=n.getBoundingClientRect();return {inside:r.x>=-1&&r.y>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overflow:document.documentElement.scrollWidth>innerWidth};});
    if(!bounds.inside||bounds.overflow)failures.push({density,width,height,size,tab:tabs[i],...bounds});
   }
   if(density===1)await p.screenshot({path:path.join(out,`${engine}-settings-${width}-${size}.png`)});
  }
  await context.close();
 }
 }finally{await browser.close();fs.writeFileSync(path.join(out,engine+'-results.json'),JSON.stringify({results,failures,errors},null,2));}
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[],`${failures.length} Linux layout/editing regressions; see ${out}`);
 console.log(JSON.stringify({passed:true,engine,layouts:results.length,densities:4,readingSizes:4,settings:true,plainText:true}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());

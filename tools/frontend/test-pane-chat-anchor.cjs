const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try {
  for(const native of [false,true])for(const reduced of [false,true]){
   const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:reduced?'reduce':'no-preference'});
   page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({token,native})=>{sessionStorage.setItem('kindred-token',token);if(native)window.__KINDRED_MOBILE_PLATFORM='ios';},{token,native});
   await page.route(origin+'/vendor.js',r=>r.fulfill({contentType:'text/javascript',body:`export * from './vendor.js?real';export class RFB extends EventTarget {constructor(host){super();this.host=host;this.canvas=document.createElement('canvas');host.append(this.canvas);setTimeout(()=>this.dispatchEvent(new Event('connect')),10);}disconnect(){this.canvas.remove();}set scaleViewport(v){}set viewOnly(v){}set resizeSession(v){}set background(v){}}`}));
   await page.route(origin+'/vendor.js?real',r=>r.fulfill({contentType:'text/javascript',body:require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../../ui/vendor.js'))}));
   await page.route(origin+'/api/computer/session',r=>r.fulfill({json:{ticket:'fixture'}}));
   await page.route(origin+'/api/computer/screen-state*',r=>r.fulfill({json:{state:'ready'}}));
   await page.route(origin+'/api/computer/resources',r=>r.fulfill({status:404,json:{error:'none'}}));
   const messages=Array.from({length:55},(_,i)=>({seq:i+1,sender:i%3?'piper':'user',kind:'message',text:`Message ${i+1}. `+'A conversation with enough wrapping text to change height as the computer pane opens. '.repeat(3+(i%4)),created:1700000000+i}));
   await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {setComputerExpanded};'}));
   await page.route(origin+'/api/runs',r=>r.fulfill({json:[]}));
   await page.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',members:['piper']},messages,page:{has_before:false,has_after:false}}}));
   await page.goto(origin);await page.locator('#content [data-message="55"]').waitFor();await page.locator('#chat-loading').waitFor({state:'detached'});await page.waitForTimeout(400);
   const gap=()=>page.locator('#content').evaluate(n=>n.scrollHeight-n.clientHeight-n.scrollTop);
   assert(await gap()<2,'starts at latest');
   for(const action of [()=>page.locator('#bot-details').click(),()=>page.getByRole('button',{name:'Close bot center',exact:true}).click()]){
    await action();await page.waitForTimeout(450);assert(await gap()<2,`pane must retain bottom (reduced=${reduced}, gap=${await gap()})`);
   }
   // Switching pane content and expanding/collapsing the computer also retain latest.
   await page.locator('#bot-details').click();await page.getByRole('tab',{name:'Computer',exact:true}).click();await page.locator('#desktop canvas').last().waitFor();await page.waitForTimeout(450);
   assert(await gap()<2,'computer tab retains bottom');
   for(const expanded of [true,false]){await page.evaluate(async v=>(await import('/app.js')).setComputerExpanded(v),expanded);await page.waitForTimeout(450);assert(await gap()<2,'computer expansion retains bottom');}
   await page.getByRole('button',{name:'Close bot center',exact:true}).click();await page.waitForTimeout(450);assert(await gap()<2,'computer close retains bottom');
   // Consecutive reversals must settle the newest layout without losing follow.
   await page.locator('#bot-details').click();await page.getByRole('button',{name:'Close bot center',exact:true}).click();await page.locator('#bot-details').click();await page.waitForTimeout(450);assert(await gap()<2,'rapid pane reversal retains bottom');await page.getByRole('button',{name:'Close bot center',exact:true}).click();await page.waitForTimeout(450);
   // A reader above the bottom keeps the same visible message and offset.
   await page.locator('#content').evaluate(n=>n.scrollTop-=1600);await page.waitForTimeout(100);
   const anchor=()=>page.locator('#content').evaluate(n=>{const top=n.getBoundingClientRect().top;const row=[...n.children].find(r=>r.dataset.message&&r.getBoundingClientRect().bottom>top+1);return {key:row.dataset.message,offset:row.getBoundingClientRect().top-top};});
   const before=await anchor();
   for(const action of [()=>page.locator('#bot-details').click(),()=>page.getByRole('button',{name:'Close bot center',exact:true}).click()]){
    await action();await page.waitForTimeout(450);const after=await anchor();assert.equal(after.key,before.key,'pane preserves visible message');assert(Math.abs(after.offset-before.offset)<2,'pane preserves reader offset');
   }
   // Deliberate scrolling during a transition must win over automatic following.
   await page.locator('.jump-latest').click();await page.waitForTimeout(150);
   await page.locator('#bot-details').click();await page.mouse.move(500,350);await page.mouse.wheel(0,-450);await page.waitForTimeout(500);
   assert(await gap()>100,'reader can leave bottom during pane motion');
   assert.deepEqual(errors,[]);console.log(JSON.stringify({engine:process.env.WEBKIT?'webkit':'chromium',native,reduced,bottom:true,readerAnchor:true,userGesture:true}));await page.close();
  }
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

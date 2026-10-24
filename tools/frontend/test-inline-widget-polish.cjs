process.env.KINDRED_TEST_SECURITY_HEADERS='1';
const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const demos=require('./fixtures/inline-widgets.cjs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const page=await browser.newPage({viewport:{width:1100,height:850},hasTouch:true}),origin='http://127.0.0.1:'+server.address().port;
  await page.addInitScript(t=>{if(window===top)sessionStorage.setItem('kindred-token',t);},token);await page.goto(origin);await page.locator('#app').waitFor({state:'visible'});
  await page.evaluate(()=>{const host=document.createElement('div');host.id='widget-test';Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'9999',overflow:'auto',padding:'16px',background:'var(--bg)'});document.body.append(host);});
  const mount=async(source,language='html')=>{await page.evaluate(async({source,language})=>{const {inlineShard}=await import('/artifacts.js');document.querySelector('#widget-test').replaceChildren(inlineShard(source,language));},{source,language});};
  const ready=()=>page.locator('#widget-test .inline-shard[data-state=ready]').waitFor();
  const frame=()=>page.frameLocator('#widget-test iframe');
  // Only explicitly marked, completed widgets run. Ordinary code is inert.
  await page.evaluate(async()=>{const {enhanceMarkdown}=await import('/artifacts.js'),host=document.querySelector('#widget-test');for(const lang of ['html','jsx','react']){const root=document.createElement('div'),pre=document.createElement('pre'),code=document.createElement('code');code.className='language-'+lang;code.textContent='<script>parent.postMessage({kind:"escaped"},"*")</script>';pre.append(code);root.append(pre);host.append(root);enhanceMarkdown(root,{sourceText:'```'+lang+'\n'+code.textContent+'\n```'});}});
  assert.equal(await page.locator('#widget-test iframe').count(),0);assert.equal(await page.locator('#widget-test .markdown-code').count(),3);
  await page.route('**/fonts/LiberationMono-Regular.ttf',async r=>{await new Promise(resolve=>setTimeout(resolve,350));await r.continue();});
  await mount(demos.comparison.source);await page.locator('.inline-shard[data-state=loading]').waitFor();await page.evaluate(()=>document.documentElement.dataset.theme='light');await ready();await page.waitForTimeout(100);assert.equal(await frame().locator('body').evaluate(e=>getComputedStyle(e).color),await page.locator('body').evaluate(e=>getComputedStyle(e).color));await page.unroute('**/fonts/LiberationMono-Regular.ttf');await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.waitForTimeout(100);await frame().getByRole('button',{name:/Team/}).click();await frame().locator('#choice').getByText('Team · Room to work together.',{exact:true}).waitFor();
  const original=page.frames().find(f=>f.parentFrame());
  await page.locator('#widget-test').getByRole('button',{name:'Source',exact:true}).click();assert.equal(await page.locator('.shard-source pre').textContent(),demos.comparison.source);assert.equal(await page.locator('.shard-source script').count(),0);await page.getByText('Temporary view.',{exact:false}).waitFor();await page.locator('#widget-test').getByRole('button',{name:'Source',exact:true}).click();
  await page.locator('#widget-test').getByRole('button',{name:'Expand',exact:true}).click();await page.locator('#widget-test').getByRole('button',{name:'Collapse',exact:true}).click();assert.equal(page.frames().find(f=>f.parentFrame()),original);await frame().locator('#choice').getByText('Team · Room to work together.',{exact:true}).waitFor();
  const oldColor=await frame().locator('body').evaluate(e=>getComputedStyle(e).color);
  await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.style.setProperty('--font-sans','Georgia, serif');document.documentElement.style.setProperty('--text-scale','1.2');});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await frame().locator('body').evaluate(async(e,color)=>{for(let i=0;i<50&&getComputedStyle(e).color!==color;i++)await new Promise(r=>setTimeout(r,20));},await page.locator('body').evaluate(e=>getComputedStyle(e).color));
  assert.notEqual(await frame().locator('body').evaluate(e=>getComputedStyle(e).color),oldColor);assert.match(await frame().locator('body').evaluate(e=>getComputedStyle(e).fontFamily),/Georgia/);await frame().locator('#choice').getByText('Team · Room to work together.',{exact:true}).waitFor();
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await frame().locator('button').first().focus();await page.keyboard.press('Tab');await page.keyboard.press('Enter');await frame().locator('#choice').getByText('Team · Room to work together.',{exact:true}).waitFor();
  // Forged messages from the parent or another frame cannot change the widget.
  const previous=await page.locator('.shard-frame').evaluate(e=>e.style.height);
  await page.evaluate(()=>window.postMessage({kind:'kindred-shard-error',message:'FORGED'},'*'));await page.waitForTimeout(60);assert.equal(await page.locator('.inline-shard').getAttribute('data-state'),'ready');assert.equal(await page.locator('.shard-frame').evaluate(e=>e.style.height),previous);
  await original.evaluate(()=>{window.dispatchEvent(new MessageEvent('message',{source:window,data:{kind:'kindred-shard-theme',theme:{fg:'rgb(255, 0, 0)'}}}));});assert.notEqual(await frame().locator('body').evaluate(e=>getComputedStyle(e).color),'rgb(255, 0, 0)');
  for(const value of [-1,NaN,Infinity]){await original.evaluate(value=>parent.postMessage({kind:'kindred-shard-size',height:value},'*'),value);await page.waitForTimeout(30);assert.equal(await page.locator('.shard-frame').evaluate(e=>e.style.height),previous);}
  await original.evaluate(()=>parent.postMessage({kind:'kindred-shard-size',height:1e9},'*'));await page.waitForTimeout(60);assert.equal(await page.locator('.shard-frame').evaluate(e=>e.style.height),previous);
  await page.locator('#widget-test').getByRole('button',{name:'Expand',exact:true}).click();assert.ok(await page.locator('.shard-frame').evaluate(e=>e.clientHeight)<=638);
  // Fixed-height content stays bounded; explicit expansion exposes more without remounting.
  await mount('<div style="height:1400px"><button onclick="this.textContent=\'Kept\'">Keep state</button><p style="padding-top:1200px">Last line</p></div>');await ready();await frame().getByRole('button',{name:'Keep state'}).click();await page.waitForTimeout(100);assert.equal(await page.locator('.shard-frame').evaluate(e=>e.clientHeight),320);await page.waitForTimeout(200);assert.equal(await page.locator('.shard-frame').evaluate(e=>e.clientHeight),320);await page.getByRole('button',{name:'Expand',exact:true}).click();await frame().getByText('Last line').scrollIntoViewIfNeeded();await frame().getByRole('button',{name:'Kept'}).waitFor();
  // HTML runtime errors, JSX module errors, and React render errors are recoverable.
  for(const [source,language] of [['<script>throw new Error("HTML failure")</script>','html'],['import Missing from "unsupported"; export default function App(){return <p/>}','jsx'],['export default function App(){throw new Error("Render failure")}','jsx']]){
   await mount(source,language);await page.locator('.inline-shard[data-state=error]').waitFor();await page.getByRole('button',{name:'Retry',exact:true}).waitFor();await page.getByRole('button',{name:'Source',exact:true}).click();assert.equal(await page.locator('.shard-source pre').textContent(),source);
  }
  // Aborted frame loading times out; Retry creates a working fresh frame.
  await page.route('**/artifact-frame.html',r=>r.abort());await mount('<button>Recovered</button>');await page.locator('.inline-shard[data-state=error]').waitFor({timeout:15000});await page.unroute('**/artifact-frame.html');await page.getByRole('button',{name:'Retry',exact:true}).click();await ready();await frame().getByRole('button',{name:'Recovered'}).waitFor();
  for(const width of [390,540,720]){
   await page.setViewportSize({width,height:800});await mount(demos.diagram.source);await ready();await frame().getByRole('button',{name:'Review',exact:true}).tap();await frame().locator('#detail').getByText('The bot prepares the work and asks when a decision needs you.',{exact:true}).waitFor();
   assert.ok(await page.locator('.inline-shard').evaluate(e=>e.getBoundingClientRect().right)<=width);assert.ok(await frame().locator('body').evaluate(e=>e.scrollWidth<=innerWidth));assert.ok(await frame().getByRole('button',{name:'Review',exact:true}).evaluate(e=>e.getBoundingClientRect().height)>=44);
   await mount(demos.calculator.source,'jsx');await ready();await page.waitForTimeout(100);const bounds=await frame().locator('output').evaluate(e=>({bottom:e.getBoundingClientRect().bottom,height:innerHeight}));assert.ok(bounds.bottom<=bounds.height,'Calculator result must fit in its initial compact frame');await frame().getByRole('spinbutton',{name:'Hours each'}).fill('6');await frame().getByRole('spinbutton',{name:'People'}).fill('5');await frame().locator('output').getByText('30',{exact:false}).waitFor();assert.ok(await frame().locator('body').evaluate(e=>e.scrollWidth<=innerWidth));
  }
  // Reduced motion is inherited by the browser media query inside the frame.
  await page.emulateMedia({reducedMotion:'reduce'});await mount('<button style="animation:spin 2s infinite;transition:all 2s">Quiet</button><style>@keyframes spin{to{transform:rotate(360deg)}}</style>');await ready();assert.equal(await frame().locator('button').evaluate(e=>getComputedStyle(e).animationName),'none');
  assert.equal(await page.locator('.shard-frame').getAttribute('sandbox'),'allow-scripts');console.log('PASS explicit execution, temporary state, source safety, theme/font updates, keyboard/touch, bounded sizing, forged messages, runtime errors, retry, phone/Duo pane widths, reduced motion');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

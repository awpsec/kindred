const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:960,height:650},deviceScaleFactor:1}),out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-chart-inspection';fs.mkdirSync(out,{recursive:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/chart-preview',r=>r.fulfill({contentType:'text/html',body:'<html data-theme="dark"><head><link rel="stylesheet" href="/style.css"></head><body style="display:block;padding:24px;margin:0"><main id="preview" style="max-width:880px;margin:auto"></main></body></html>'}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/chart-preview');
 await page.evaluate(async()=>{const {visualPanel}=await import('/visual-panels.js');const values=[[0,5,3,4,2,7,9,6,8],[0,12,34,18,23,29,17,9,16],[0,7,6,0,-3,-6,-17,-14,-13],[0,-4,3,-8,1,6,11,8,12]];
 document.querySelector('#preview').append(visualPanel({id:'hover',kind:'chart',title:'Four stocks, one clear comparison',description:'Hover anywhere on a day to compare every series. Illustrative data for this interaction preview.',source:'Preview data — not market prices',as_of:'Demo',x_type:'time',x_label:'September 2026',y_label:'Change (%)',chart_type:'line',series:['Northstar','Evergreen','Atlas','Orbit'].map((name,i)=>({name,points:values[i].map((y,j)=>({x:Date.UTC(2026,8,10+j,12),y,...(j===8?{label:'Sep 18 close'}:{})}))}))}));});
 const card=page.locator('[data-visual-panel="hover"]'),svg=card.locator('.visual-chart>svg');await card.waitFor();
 const hover=async(t)=>{const b=await svg.boundingBox();await page.mouse.move(b.x+b.width*(62+(640-62-22)*t)/640,b.y+b.height*.35);};
 await hover(.5);assert.equal(await card.locator('.chart-tooltip-row').count(),4);assert.equal(await card.locator('.chart-tooltip-date').textContent(),'Sep 14, 26');assert.equal(await card.locator('.chart-inspection').getAttribute('visibility'),'visible');
 assert.deepEqual(await card.locator('.chart-tooltip-row strong').allTextContents(),['2','23','-3','1']);
 for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await hover(.5);await card.screenshot({path:out+'/chart-'+theme+'.png'});}
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 for(let i=0;i<16;i++){await hover(i/15);await card.screenshot({path:out+'/frame-'+String(i).padStart(2,'0')+'.png'});}
 await page.mouse.move(0,0);assert.equal(await card.locator('.chart-tooltip').getAttribute('data-empty'),'true');
 await card.locator('.chart-point').first().focus();assert.equal(await card.locator('.chart-tooltip-row').count(),4);await page.keyboard.press('ArrowRight');assert.equal(await card.locator('.chart-tooltip-date').textContent(),'Sep 11, 26');
 await card.getByRole('button',{name:'Evergreen',exact:true}).click();await hover(.5);assert.equal(await card.locator('.chart-tooltip-row').count(),3);
 for(const width of [960,420]){await page.setViewportSize({width,height:650});await hover(1);
 assert(await card.evaluate(n=>n.scrollWidth<=n.clientWidth+1),JSON.stringify(await card.evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth,children:[...n.querySelectorAll('*')].filter(c=>c.getBoundingClientRect().right>n.getBoundingClientRect().right).map(c=>({cls:c.getAttribute('class'),right:c.getBoundingClientRect().right}))}))));
 const bounds=await card.evaluate(n=>{const c=n.getBoundingClientRect(),texts=[...n.querySelectorAll('.chart-tick')].map(t=>t.getBoundingClientRect()),tip=n.querySelector('.chart-tooltip').getBoundingClientRect();return {ok:[...texts,tip].every(b=>b.left>=c.left&&b.right<=c.right)};});assert(bounds.ok,'Chart label or tooltip escaped card');}
 assert.deepEqual(errors,[]);console.log('Shared hover, sparse endpoint label, keyboard, series filtering, light/dark and narrow layouts pass.');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});

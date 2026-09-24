const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:900,height:650}}),out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-cursor-preview';fs.mkdirSync(out,{recursive:true});
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const enc=await page.evaluate(async()=>{const {RFB}=await import('/vendor.js');const old=RFB.messages.clientEncodings;const result=[];try{RFB.messages.clientEncodings=(_s,enc)=>result.push(enc);for(const watch of [true,false])RFB.prototype._sendEncodings.call({_fbDepth:24,_viewOnly:watch,_qualityLevel:6,_compressionLevel:2,_sock:{}});}finally{RFB.messages.clientEncodings=old;}return result;});
 assert(!enc[0].includes(-239),'Watch mode requested a local cursor');assert(enc[1].includes(-239),'Interactive cursor lost');
 await page.evaluate(async()=>{
  document.body.innerHTML='<main style="padding:24px;max-width:760px;margin:auto"><h2 style="font-size:18px">Piper’s computer</h2><p style="color:#aaa">Watching live · cursor and click feedback preview</p><div id="preview" class="desktop-canvas" style="width:720px;height:450px;background:#151515;display:flex;align-items:center;justify-content:center;border-radius:12px;overflow:hidden"><canvas width="1280" height="800" style="width:640px;height:400px"></canvas></div></main>';
  document.documentElement.dataset.theme='dark';document.body.style.background='#080808';
  const host=document.querySelector('#preview'),c=host.querySelector('canvas'),x=c.getContext('2d');
  x.fillStyle='#e8edf3';x.fillRect(0,0,1280,800);x.fillStyle='#f9fafc';x.fillRect(0,0,1280,72);x.fillStyle='#667085';x.font='22px sans-serif';x.fillText('Workspace  /  Notes',32,44);
  x.fillStyle='#fff';x.fillRect(150,130,980,540);x.fillStyle='#253044';x.font='bold 32px sans-serif';x.fillText('Weekly notes',210,205);x.font='24px sans-serif';x.fillStyle='#687385';x.fillText('Organize ideas and keep track of the next step.',210,260);x.fillStyle='#365fe0';x.fillRect(210,315,170,55);x.fillStyle='white';x.fillText('New note',238,350);
  // Fixture cursor represents pixels provided by a remote VNC stream.
  x.save();x.translate(300,345);x.beginPath();x.moveTo(0,0);x.lineTo(0,34);x.lineTo(9,25);x.lineTo(16,40);x.lineTo(22,37);x.lineTo(15,23);x.lineTo(29,23);x.closePath();x.fillStyle='white';x.strokeStyle='#151515';x.lineWidth=3;x.fill();x.stroke();x.restore();
  window.pointerStatus={takeover:false,computer_pointer:null};const{computerClickIndicator}=await import('/computer-pointer.js');window.stopPointer=computerClickIndicator(host,()=>window.pointerStatus,()=> 'piper');
 });
 const click=async(id,extra={})=>page.evaluate(({id,extra})=>{window.pointerStatus={takeover:false,computer_pointer:{id,bot_id:'piper',x:300,y:345,created:Date.now()/1000,...extra}};},{id,extra});
 await click('click-1');await page.locator('.computer-click-indicator').waitFor({state:'visible'});
 const geometry=await page.locator('.computer-click-indicator').evaluate(n=>({left:parseFloat(n.style.left),top:parseFloat(n.style.top)}));assert.equal(geometry.left,190);assert.equal(geometry.top,197.5);
 await page.screenshot({path:out+'/cursor.png'});
 for(let i=0;i<12;i++){await page.screenshot({path:out+'/frame-'+String(i).padStart(2,'0')+'.png'});await page.waitForTimeout(60);}
 await page.waitForTimeout(900);assert(!await page.locator('.computer-click-indicator').isVisible());
 await click('old',{created:Date.now()/1000-30});await page.waitForTimeout(180);assert(!await page.locator('.computer-click-indicator').isVisible());
 await click('wrong-bot',{bot_id:'other'});await page.waitForTimeout(180);assert(!await page.locator('.computer-click-indicator').isVisible());
 await click('takeover');await page.evaluate(()=>window.pointerStatus.takeover=true);await page.waitForTimeout(180);assert(!await page.locator('.computer-click-indicator').isVisible());
 await page.emulateMedia({reducedMotion:'reduce'});await click('reduced');await page.waitForTimeout(180);assert.equal(await page.locator('.computer-click-indicator').evaluate(n=>getComputedStyle(n).animationName),'none');
 await page.evaluate(()=>window.stopPointer());assert.equal(await page.locator('.computer-click-indicator').count(),0);
 console.log('Watch/interactive cursor negotiation, letterbox mapping, click expiry, bot isolation, takeover and reduced motion passed.');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});

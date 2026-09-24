process.env.KINDRED_TEST_SECURITY_HEADERS='1';
const {server,token}=require('./fixtures/desktop.cjs'),{chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const page=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;let escapes=0;
  await page.addInitScript(t=>{if(top===window)sessionStorage.setItem('kindred-token',t);},token);
  await page.route(origin+'/fixture/escape',r=>{escapes++;return r.fulfill({body:'unexpected'});});
  const response=await page.goto(origin);assert(response.headers()['content-security-policy'].split(';').some(s=>s.trim()==="script-src 'self'"));
  await page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.inlineEscaped=true';document.body.append(script);});assert.equal(await page.evaluate(()=>window.inlineEscaped),undefined);
  const result=await page.evaluate(async origin=>{
   const {artifactDocument,loadArtifactFrame}=await import('/artifacts.js');
   const source=`<h1>Isolated artifact</h1><script>(async()=>{const result={};try{parent.document.body;result.parent=true;}catch{result.parent=false;}try{localStorage.getItem('anything');result.storage=true;}catch{result.storage=false;}try{await fetch(${JSON.stringify(origin+'/fixture/escape')});result.network=true;}catch{result.network=false;}parent.postMessage({kind:'policy-result',result},'*');})();<\/script>`;
   const doc=await artifactDocument(source,'html'),frame=document.createElement('iframe');
   // Omit the HTML sandbox attribute deliberately: the response must enforce it.
   return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No policy result')),12000);const receive=e=>{if(e.source!==frame.contentWindow||e.data?.kind!=='policy-result')return;clearTimeout(timer);removeEventListener('message',receive);resolve({...e.data.result,origin:e.origin});};addEventListener('message',receive);loadArtifactFrame(frame,doc);document.body.append(frame);});
  },origin);
  assert.deepEqual(result,{parent:false,storage:false,network:false,origin:'null'});assert.equal(escapes,0);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',rootInlineScriptsBlocked:true,responseSandbox:true,noParentAccess:true,noStorage:true,noNetwork:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

const {chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{
 const p=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;
 await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {checkComputerStartup};'}));
 await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
 const result=await p.evaluate(async()=>{
  const {checkComputerStartup}=await import('/app.js');
  let now=0,calls=0;const reports=[];
  const options={now:()=>now,sleep:async ms=>{now+=ms;},timeout:15000,active:()=>true,report:(...args)=>reports.push(args)};
  await checkComputerStartup({...options,probe:async()=>{if(++calls<3)throw new Error('Connection refused');return{uptime_seconds:12};}});
  const recovery={calls,reports:[...reports]};reports.length=0;now=0;
  await checkComputerStartup({...options,probe:async()=>{throw new Error('SSH connection refused');}});
  const failure=[...reports];reports.length=0;now=0;
  let active=true;
  await checkComputerStartup({...options,active:()=>active,probe:async()=>{active=false;return{uptime_seconds:1};}});
  const cancelled=[...reports];reports.length=0;now=0;
  await checkComputerStartup({...options,probe:async()=>({})});
  return{recovery,failure,cancelled,incomplete:reports};
 });
 assert.equal(result.recovery.calls,3);assert.deepEqual(result.recovery.reports,[['Computer is responding.',false]]);
 assert.equal(result.failure.length,1);assert.equal(result.failure[0][1],true);assert.match(result.failure[0][0],/SSH connection refused/);
 assert.deepEqual(result.cancelled,[]);assert.equal(result.incomplete[0][1],true);assert.match(result.incomplete[0][0],/incomplete health response/);
 console.log('Startup: delayed guest, persistent failure, stale response cancellation and invalid health response passed');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exit(1)});

const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const context=await browser.newContext(),p=await context.newPage(),errors=[],requests=[];p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false};
  const run={id:'stopped',chat_id:chat.id,bot_id:'piper',prompt:'A long original request. '.repeat(500),status:'failed',error:'Connection lost',output:'',created:now};
  let resumed=false;
  await context.addInitScript(token=>sessionStorage.setItem('kindred-token',token),token);
  await context.route(origin+'/api/**',route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/runs/stopped/continue'){requests.push(req.postDataJSON());resumed=true;return send({run_id:'next'});}
   if(name==='/runs')return send(resumed?[run,{...run,id:'next',status:'queued',error:''}]:[run]);
   if(name==='/chats')return send([chat]);
   if(name==='/runs/stopped'||name==='/runs/next')return send({run:name.endsWith('next')?{...run,id:'next',status:'queued',error:''}:run,events:[],attachments:[],approvals:[]});
   if(name==='/chats/'+chat.id){const continued=resumed?{continued_by:'next'}:{};return send({chat,messages:[
    {seq:1,sender:'user',kind:'message',text:'Please finish my report.\n\n'+'Background context for the report.\n\n'.repeat(30),created:now,run_id:''},
    {seq:2,sender:'piper',kind:'assistant',text:'Provider disconnected',run_id:run.id,created:now,status_notice:{label:'Provider error',text:'Provider disconnected',...continued}},
    {seq:3,sender:'piper',kind:'result',text:run.error,run_id:run.id,created:now,status_notice:{label:'Task failed',text:run.error,...continued}},
    ...(resumed?[{seq:4,sender:'user',kind:'continuation',text:'Continuing task',run_id:'next',created:now},{seq:5,sender:'piper',kind:'connector_artifact',text:'Called Gmail',run_id:'next',created:now,connector_artifact:{id:'lookup',bot_id:'piper',kind:'task',connection:'Gmail',connector:'gmail',source:'Claude',tool:'search_threads',title:'Search threads',status:'completed',read_only:true,input:{},records:[],revision:1}},{seq:6,sender:'piper',kind:'assistant',text:'I will pick up where the previous attempt stopped.',run_id:'next',created:now}]:[])
   ]});}
   return route.continue();
  });
  await p.route(origin+'/app.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {jumpToMessage,renderChat};'}));
  await p.goto(origin);await p.getByRole('button',{name:'Continue task',exact:true}).click();
  await p.getByRole('button',{name:'Continue',exact:true}).click();
  await p.locator('.connector-message[data-message="5"]').waitFor();
  assert.deepEqual(requests,[{}]);
  assert.equal(await p.locator('.task-recovery-history,.task-continuation').count(),0);
  assert.equal(await p.locator('#content').getByText('Provider disconnected',{exact:true}).count(),0);
  assert.equal(await p.locator('#content').getByText('Connection lost',{exact:true}).count(),0);
  assert.equal(await p.getByRole('button',{name:'Continue task',exact:true}).count(),0);
  assert.equal(await p.locator('#notice.continuation-confirmation').count(),0);
  await p.reload();await p.locator('.connector-message[data-message="5"]').waitFor();
  assert.equal(await p.locator('.task-recovery-history,.task-continuation').count(),0);
  assert.equal(await p.locator('#content').getByText('Connection lost',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);await context.close();console.log((process.env.WEBKIT?'webkit':'chromium')+': quiet continuation, preserved successor activity, no stale failures, reload and request payload passed');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

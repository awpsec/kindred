// Real Windows text notification and native-to-web conversation activation.
const {chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn,spawnSync,execFileSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,limit=300){for(let i=0;i<limit;i++){try{const v=await fn();if(v)return v;}catch{}await sleep(100);}throw Error('Native notification fixture timed out');}
(async()=>{
 const source=process.env.KINDRED_NATIVE_EXE,avatar=fs.readFileSync(process.env.KINDRED_NATIVE_AVATAR);assert(source&&avatar);
 const repo=path.resolve(__dirname,'../..'),root=fs.mkdtempSync(path.join(repo,'test-results/native-notification-')),profile=crypto.randomUUID(),botId=crypto.randomUUID();
 const folder=path.join(root,'versions','0.48.21');fs.mkdirSync(folder,{recursive:true});const exe=path.join(folder,'Kindred.exe');fs.copyFileSync(source,exe);fs.copyFileSync(path.join(repo,'dist/WebView2Loader.dll'),path.join(folder,'WebView2Loader.dll'));
 const registry='HKCU\\Software\\Classes\\AppUserModelId\\dev.kindred.personal';
 const priorIcon=execFileSync('reg.exe',['query',registry,'/v','IconUri'],{encoding:'utf8',windowsHide:true}).match(/REG_SZ\s+(.+)/)?.[1]?.trim();
 const defaultHandler=server.listeners('request')[0];server.removeAllListeners('request');
 let notified=false,baseline=false,downloads=0,origin,browser,child;const events=[];
 const bot={id:botId,name:'QA77 Atlas notification',provider:'codex',model:'test',profile:{shape:'round',color:'#2475ff',eyes:'curious',notifications:true}};
 const current={id:'dm-'+botId,name:bot.name,members:[botId],archived:false},destination={id:'qa-notification-destination',name:'QA notification destination',members:[botId],archived:false};
 const item={id:1,run_id:'native-qa-result',bot_id:botId,chat_id:destination.id,title:'Marvin',body:'I finished checking the shared task. Click here to open our conversation.',avatar_key:crypto.createHash('sha256').update(avatar).digest('hex')};
 server.on('request',async(req,res)=>{
  const u=new URL(req.url,'http://localhost'),p=u.pathname;
  const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(p==='/health')return send({status:'ok'});
  if(p.startsWith('/identity/')){
   if(p==='/identity/meta')return send({profiles:true,registration:true,first_user:false});
   if(req.headers.authorization!=='Bearer '+token)return send({error:'Sign in again'},401);
   if(p==='/identity/profiles')return send({active:profile,account_id:'notification-fixture',username:'QA',legacy:false,profiles:[{id:profile,name:'Notification QA',active:true,unread:0}],directory:[]});
   if(p==='/identity/switch')return send({token,profile_id:profile});
   return send({});
  }
  if(p==='/api/notifications'){if(!u.searchParams.has('after'))baseline=true;return send({cursor:notified?1:0,items:notified&&u.searchParams.has('after')&&Number(u.searchParams.get('after'))<1?[item]:[]});}
  if(p==='/api/bots/'+botId+'/avatar.png'){assert.equal(req.headers.authorization,'Bearer '+token);downloads++;res.writeHead(200,{'Content-Type':'image/png'});return res.end(avatar);}
  if(p==='/api/bots')return send([bot]);if(p==='/api/chats')return send([current,destination]);if(p==='/api/runs')return send([]);if(p==='/api/activity')return send({});
  if(p==='/api/chats/'+current.id)return send({chat:current,messages:[]});
  if(p==='/api/chats/'+destination.id)return send({chat:destination,messages:[{seq:1,sender:'user',kind:'message',text:'Native notification opened this conversation.',created:Math.floor(Date.now()/1000)}]});
  return defaultHandler(req,res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 const key=crypto.createHash('sha256').update(origin+'\n'+profile).digest('hex');
 fs.writeFileSync(path.join(root,'profiles.json'),JSON.stringify({entries:[{key,server:origin,profile_id:profile,name:'Notification QA',account:'notification-fixture',token,legacy:false}],last:key}));
 const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 try{
  const env={...process.env,APPDATA:path.join(root,'appdata'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port};
  for(const name of ['KINDRED_ACCESS_TOKEN','KINDRED_SERVER_URL','KINDRED_PROFILE_SCOPE','KINDRED_PROFILE_ID','KINDRED_LEGACY_LOCAL_ACCESS','KINDRED_UPDATE_SESSION'])delete env[name];
  child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env});
  await until(async()=>{const r=await fetch('http://127.0.0.1:'+port+'/json/list');return(await r.json()).some(p=>p.url.startsWith(origin));});
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const p=await until(()=>browser.contexts()[0].pages().find(p=>p.url().startsWith(origin)));p.setDefaultTimeout(15000);p.on('pageerror',e=>events.push(e.message));await p.locator('#app').waitFor({state:'visible'});await until(()=>baseline);
  await p.evaluate(()=>{document.title='Kindred notification QA';return window.__TAURI__.core.invoke('window_action',{action:'minimize'});});
  const state={root,port,pid:child.pid,origin,title:item.title,body:item.body,avatar_sha256:crypto.createHash('sha256').update(avatar).digest('hex')};fs.writeFileSync(process.env.KINDRED_NATIVE_READY,JSON.stringify(state,null,2));console.log(JSON.stringify({ready:true,...state}));
  // The coordinator writes this fixture-owned flag after observing the Windows shell.
  await until(()=>fs.existsSync(path.join(root,'send-toast')),2400);notified=true;
  await sleep(4000);console.log(JSON.stringify({notificationStatus:await p.evaluate(()=>window.__TAURI__.core.invoke('notification_status'))}));
  await p.getByText('Native notification opened this conversation.',{exact:true}).waitFor({timeout:240000});
  const status=await p.evaluate(()=>window.__TAURI__.core.invoke('notification_status'));assert.equal(status.error,'');assert.deepEqual(events,[]);
  await p.screenshot({path:path.join(root,'notification-click-destination.png')});
  assert.equal(downloads,0);
  const result={passed:true,nativeWindowsToast:true,windowsTextOnly:true,noPortraitDownloads:true,clickedToastOpensExactConversation:true,fromMinimizedWindow:true,downloads,root};
  fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{
  if(browser)await browser.close().catch(()=>{});
  if(child&&child.exitCode===null)spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  if(priorIcon)spawnSync('reg.exe',['add',registry,'/v','IconUri','/t','REG_SZ','/d',priorIcon,'/f'],{windowsHide:true,stdio:'ignore'});
  server.closeAllConnections();await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

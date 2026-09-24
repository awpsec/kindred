// Real Windows moves and relaunches in a disposable installation. No user app is touched.
const {chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){try{const v=await fn();if(v)return v;}catch{}await sleep(100);}throw Error('Window state timed out');}
(async()=>{
 const root=fs.mkdtempSync(path.resolve(__dirname,'../../test-results/native-window-state-')),version=path.join(root,'versions','fixture');fs.mkdirSync(version,{recursive:true});
 const source=process.env.KINDRED_NATIVE_EXE;assert(source);const exe=path.join(version,'Kindred-WindowFixture.exe');fs.copyFileSync(source,exe);fs.copyFileSync(path.join(path.dirname(source),'WebView2Loader.dll'),path.join(version,'WebView2Loader.dll'));
 const server=http.createServer((req,res)=>{if(req.url==='/health'){res.setHeader('Content-Type','application/json');res.end('{"status":"ok"}');return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Kindred</title><form id="connect-form"></form><main id="app"></main><p>Window restoration fixture</p>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const helper=path.resolve(__dirname,'../window-fixture.py');let child,browser,port,windowTitle='Kindred';
 function native(action,...args){const result=spawnSync('python',['-X','utf8',helper,action,...(action==='screens'||action.startsWith('registry-')?[]:[String(child.pid)]),...args.map(String)],{encoding:'utf8',windowsHide:true,env:{...process.env,KINDRED_FIXTURE_WINDOW_TITLE:windowTitle}});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}
 const registration=native('registry-read');
 const screens=native('screens'),target=screens.find(m=>!m.primary)||screens[0];
 async function launch(){const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));port=reserve.address().port;await new Promise(r=>reserve.close(r));
  const env={...process.env,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port};for(const key of ['KINDRED_ACCESS_TOKEN','KINDRED_SERVER_URL','KINDRED_PROFILE_SCOPE','KINDRED_PROFILE_ID','KINDRED_LEGACY_LOCAL_ACCESS'])delete env[key];
  child=spawn(exe,[origin],{windowsHide:true,stdio:'ignore',env});await until(async()=>{const r=await fetch('http://127.0.0.1:'+port+'/json/list');return(await r.json()).some(p=>p.url.startsWith(origin));});browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);await until(()=>native('state').width>0);await sleep(400);
 }
 async function close(){native('close');await until(()=>child.exitCode!==null);await Promise.race([browser.close().catch(()=>{}),sleep(1000)]);browser=null;}
 const stateFile=path.join(root,'window-state','main.json'),read=()=>JSON.parse(fs.readFileSync(stateFile));
 try{
  await launch();const expected={x:target.x+70,y:target.y+65,width:Math.min(1100,target.width-100),height:Math.min(760,target.height-100)};
  native('move',expected.x,expected.y,expected.width,expected.height);await sleep(400);const moved=native('state');
  const main=browser.contexts()[0].pages().find(p=>p.url().startsWith(origin));const openHome=()=>main.evaluate(()=>window.__TAURI__.core.invoke('open_profile_home'));
  await openHome();windowTitle='Kindred · Accounts';await until(()=>native('state').width>0);native('move',expected.x+100,expected.y+50,560,620);await sleep(250);const homeBounds=native('state');native('close');await sleep(300);await openHome();await until(()=>native('state').x===homeBounds.x);assert.deepEqual(native('state'),homeBounds,'Accounts window restores its own placement');native('close');await sleep(250);windowTitle='Kindred';
  await close();const normal=read();assert(!normal.maximized);assert.equal(normal.x,moved.x);assert.equal(normal.y,moved.y);
  await launch();const restored=native('state');assert.deepEqual(restored,moved,'Relaunch restores exact physical bounds on the selected monitor');
  native('maximize');await until(()=>native('state').maximized);await sleep(300);await close();const max=read();assert(max.maximized);assert.equal(max.x,normal.x);assert.equal(max.width,normal.width,'Maximize must keep the normal width');
  await launch();assert(native('state').maximized);native('minimize');await until(()=>native('state').minimized);await close();assert.deepEqual(read(),max,'Minimized close must preserve the maximized and normal state');
  await launch();assert(native('state').maximized);native('restore');await sleep(400);assert.deepEqual(native('state'),moved,'Unmaximize returns to the saved normal bounds');await close();
  const absent={...read(),monitor:'disconnected-fixture-display',x:100000,y:-100000,width:50000,height:50000,maximized:false};fs.writeFileSync(stateFile,JSON.stringify(absent));await launch();const fitted=native('state');assert(screens.some(s=>fitted.x>=s.x&&fitted.y>=s.y&&fitted.x+fitted.width<=s.x+s.width+2&&fitted.y+fitted.height<=s.y+s.height+2),'Off-screen saved placement fits an available monitor');await close();
  console.log(JSON.stringify({passed:true,realNativeWindows:true,monitorCount:screens.length,selectedMonitor:target.name,exactPositionAndSize:true,accountsWindowRestored:true,maximizedRestored:true,minimiowneroesNotOverwrite:true,disconnectedMonitorRecovered:true,root}));
 }finally{if(child?.exitCode===null)spawnSync('taskkill.exe',['/PID',String(child.pid),'/F','/T'],{windowsHide:true,stdio:'ignore'});if(browser)await Promise.race([browser.close().catch(()=>{}),sleep(1000)]);native('registry-restore',JSON.stringify(registration));server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

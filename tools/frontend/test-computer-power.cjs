const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const page=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;let power='shut off',ready=false,resourceCalls=0,actions=[];
 let maintenance={enabled:true,phase:'idle',requested:false,error:'',detail:''};
 await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {refreshResources};'}));
 await page.route(origin+'/api/**',r=>{const req=r.request(),url=new URL(req.url()),send=json=>r.fulfill({json});
  if(url.pathname==='/api/computer/state')return send({state:power});
  if(url.pathname==='/api/computer/resources'){resourceCalls++;return ready?send({cpu_percent:1,cpus:4,memory_used:1,memory_total:8e9,disk_used:1,disk_total:30e9,uptime_seconds:42,sampled_at:1}):r.fulfill({status:400,json:{error:'SSH connection refused'}});}
  if(url.pathname==='/api/computer')return r.fulfill({status:400,json:{error:'Screen not ready'}});
  if(url.pathname==='/api/status')return send({version:'fixture',vm:'Fixture VM',takeover:false,maintenance});
  if(url.pathname==='/api/computer/maintenance'){if(req.method()==='POST')maintenance={...maintenance,requested:true};return send(maintenance);}
  if(url.pathname.startsWith('/api/vm/')){actions.push(url.pathname);power='running';return send({state:power});}
  return r.continue();
 });
 await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await page.goto(origin);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#settings-dialog').getByRole('button',{name:'Bot Computer',exact:true}).click();
 await page.getByText('Computer is off. Choose Start computer to turn it on.',{exact:true}).waitFor();assert.equal(resourceCalls,0);assert.deepEqual(actions,[]);
 assert(await page.getByRole('button',{name:'Reboot computer',exact:true}).isDisabled());assert(!(await page.getByRole('button',{name:'Start computer',exact:true}).isDisabled()));
 await page.getByRole('button',{name:'Update now',exact:true}).click();await page.getByText('Update queued. Computer is off; choose Start computer to install it.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Start computer',exact:true}).click();await page.getByText('Computer is running. Waiting for the guest connection…',{exact:true}).waitFor();
 assert.deepEqual(actions,['/api/vm/start']);assert(await page.getByRole('button',{name:'Start computer',exact:true}).isDisabled());
 ready=true;await page.evaluate(async()=>{const {refreshResources}=await import('/app.js');await refreshResources();});await page.getByText('Computer is running.',{exact:true}).waitFor();
 await page.getByText('Computer is on · Screen starting or unavailable · Open computer',{exact:true}).waitFor();
 assert(await page.getByRole('button',{name:'Reboot computer',exact:true}).isEnabled());
 power='paused';ready=false;await page.evaluate(async()=>{const {refreshResources}=await import('/app.js');await refreshResources();});await page.getByText('Computer is paused. Resume it from the server before reconnecting.',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Start computer',exact:true}).isDisabled());
 console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',off:true,queuedUpdateWhileOff:true,starting:true,runningWithUnavailableScreen:true,noImplicitPowerAction:true}));
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});

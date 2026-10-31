const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');
fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
  const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:940}}),p=await context.newPage();
    p.setDefaultTimeout(10000);const errors=[],writes=[];
    p.on('pageerror',e=>errors.push(e.message));p.on('dialog',async d=>{errors.push('Unexpected browser dialog');await d.dismiss();});
    let routines=['details','settings','computer','retry'].map(id=>({id,bot_id:'piper',name:'Review '+id,prompt:'Check project status.',interval_seconds:3600,enabled:true}));
    let monitors=[{id:'mail',bot_id:'piper',account_id:'work',name:'Important inbox',instructions:'Check important mail.',mode:'fast',enabled:false,status:'paused',error:''}];
    let failDelete=false,deleteWait=null;
    await context.addInitScript(t=>{
      sessionStorage.setItem('kindred-token',t);
      // An embedded webview can decline browser confirmations without showing UI.
      // Deleting a routine must work without relying on that facility.
      window.confirmCalls=0;window.confirm=()=>{window.confirmCalls++;return false;};
    },token);
    await context.route(origin+'/api/routines**',async route=>{
      const req=route.request(),id=new URL(req.url()).pathname.split('/')[3];
      if(req.method()==='DELETE'){
        writes.push({method:'DELETE',id,kind:'schedule'});
        if(deleteWait)await deleteWait;
        if(failDelete)return route.fulfill({status:503,json:{error:'Could not reach the server. Try again.'}});
        assert(routines.some(r=>r.id===id));routines=routines.filter(r=>r.id!==id);return route.fulfill({json:{removed:true,history_preserved:true}});
      }
      assert.equal(req.method(),'GET');return route.fulfill({json:[...routines,...monitors.map(m=>({id:m.id,bot_id:m.bot_id,name:m.name,enabled:m.enabled,trigger:'activity',monitor:m}))]});
    });
    await context.route(origin+'/api/inbox-monitors**',async route=>{
      const req=route.request(),parts=new URL(req.url()).pathname.split('/'),id=parts[3];
      if(req.method()==='GET')return route.fulfill({json:{items:monitors,provider_sources:[]}});
      writes.push({method:req.method(),id,kind:'monitor'});
      const monitor=monitors.find(m=>m.id===id);assert(monitor);
      if(parts[4]==='pause'){monitor.enabled=false;monitor.status='paused';return route.fulfill({json:{paused:true}});}
      assert.equal(req.method(),'DELETE');assert(!monitor.enabled);monitors=monitors.filter(m=>m.id!==id);return route.fulfill({json:{removed:true}});
    });
    await context.route(origin+'/api/composio',r=>r.fulfill({json:{configured:true,apps:[{id:'gmail',accounts:[{id:'work',name:'Work',status:'ACTIVE'}]}]}}));
    await context.route(origin+'/api/slack-monitoring',r=>r.fulfill({json:{connections:[],items:[]}}));
    await context.route(origin+'/vendor.js',r=>r.fulfill({contentType:'text/javascript',body:`export * from './vendor.js?real';export class RFB extends EventTarget {constructor(host){super();this.host=host;const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=900;canvas.style.cssText='width:100%;height:100%;background:#20334a';host.append(canvas);setTimeout(()=>this.dispatchEvent(new Event('connect')),10);}disconnect(){this.host.remove();}set scaleViewport(v){}set viewOnly(v){}set resizeSession(v){}set background(v){}}`}));
    await context.route(origin+'/vendor.js?real',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/vendor.js'))}));
    await context.route(origin+'/api/computer/screen-state*',r=>r.fulfill({json:{state:'ready'}}));
    await context.route(origin+'/api/computer/session',r=>r.fulfill({json:{ticket:'fixture',control:false}}));
    await p.goto(origin);await p.locator('#bot-details').click();
    const detail=id=>p.locator('#details-content [data-routine-id="'+id+'"]');
    const dialog=p.locator('.routine-delete-dialog');
    const requestDelete=async row=>{await row.locator('[data-routine-action="delete"]').click();await dialog.waitFor();};
    const acceptDelete=async()=>{await dialog.getByRole('button',{name:'Delete routine',exact:true}).click();await dialog.waitFor({state:'detached'});};
    // Cancelling, Escape, and the close button must leave the routine untouched.
    for(const cancel of ['Cancel','Escape','Close']){
      await requestDelete(detail('details'));
      assert.equal(await p.locator('.routine-delete-dialog').count(),1);
      await dialog.getByText('Chat and task history will remain.',{exact:false}).waitFor();
      if(cancel==='Escape')await p.keyboard.press('Escape');else await dialog.getByRole('button',{name:cancel,exact:true}).click();
      await dialog.waitFor({state:'detached'});assert.equal(writes.length,0);
      await p.waitForFunction(()=>!document.querySelector('#details-content [data-routine-id="details"] [data-routine-action="delete"]').disabled);
    }
    // Only one request may be sent while a deletion is in flight.
    let release;deleteWait=new Promise(r=>release=r);await requestDelete(detail('details'));await acceptDelete();
    await p.waitForFunction(()=>document.querySelector('#details-content [data-routine-id="details"]').getAttribute('aria-busy')==='true');
    await detail('details').locator('[data-routine-action="delete"]').evaluate(b=>b.click());
    assert.equal(writes.length,1);release();deleteWait=null;await detail('details').waitFor({state:'detached'});
    // A server error must leave the row actionable for a retry.
    failDelete=true;await requestDelete(detail('retry'));await acceptDelete();
    await detail('retry').getByText('Could not reach the server. Try again.',{exact:true}).waitFor();
    await p.waitForFunction(()=>!document.querySelector('#details-content [data-routine-id="retry"] [data-routine-action="delete"]').disabled);
    failDelete=false;await requestDelete(detail('retry'));await acceptDelete();await detail('retry').waitFor({state:'detached'});
    // The confirmation must appear above Settings, including narrow phone layouts.
    await p.locator('#identity-button').click();await p.locator('#identity-menu').getByRole('menuitem',{name:'Settings',exact:true}).click();await p.locator('[data-settings-page="routines"]').click();
    const settings=p.locator('#settings-content [data-routine-id="settings"]');
    await p.setViewportSize({width:390,height:844});await requestDelete(settings);
    assert(await p.locator('#settings-dialog').isVisible());
    assert(await dialog.evaluate(d=>{const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
    assert(await dialog.getByRole('button',{name:'Delete routine',exact:true}).evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
    await p.screenshot({path:path.join(artifacts,engine+'-routine-delete-phone.png')});
    await acceptDelete();await settings.waitFor({state:'detached'});
    // Paused inbox monitors use the same reliable confirmation from Settings.
    const monitor=p.locator('#settings-content [data-monitor-id="mail"]');await monitor.locator('summary').first().click();
    await monitor.getByRole('button',{name:'Remove',exact:true}).click();await dialog.waitFor();await acceptDelete();await monitor.waitFor({state:'detached'});
    await p.setViewportSize({width:1280,height:940});await p.locator('#settings-close').click();
    // The computer-pane delete button uses the same flow, and survives refresh.
    await p.locator('#details-panel').getByRole('tab',{name:'Computer',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#desktop-mode').textContent==='Watching live');await p.locator('.desktop-preview-open').click();const computer=p.locator('#computer-routines [data-routine-id="computer"]');
    await requestDelete(computer);await p.screenshot({path:path.join(artifacts,engine+'-routine-delete-desktop.png')});
    await acceptDelete();await computer.waitFor({state:'detached'});
    await p.reload();await p.locator('#bot-details').click();await p.locator('.bot-detail-routines').getByText('No routines yet.',{exact:true}).waitFor();
    assert.equal(await p.evaluate(()=>window.confirmCalls),0);assert.deepEqual(errors,[]);assert.equal(routines.length,0);assert.equal(monitors.length,0);
    assert.equal(writes.filter(w=>w.kind==='schedule').length,5);assert.equal(writes.filter(w=>w.kind==='monitor'&&w.method==='DELETE').length,1);
    console.log(JSON.stringify({engine,confirmationWithoutBrowserDialogs:true,cancelEscapeClose:true,duplicateSuppression:true,retryAfterError:true,botSettingsComputerSurfaces:true,pausedMonitor:true,phoneLayout:true,reload:true,writes:writes.length}));
    await context.close();
  }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

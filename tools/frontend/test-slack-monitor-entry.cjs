const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');
fs.mkdirSync(artifacts,{recursive:true});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
  const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
  const bots=['Piper','Atlas','New teammate','Archived teammate'].map((name,i)=>({
    id:['piper','orion','empty','archived'][i],name,provider:'codex',model:'test',instructions:'',memory:'',
    profile:{shape:'round',color:'#2475ff',archived:i===3,notifications:true},
  }));
  const chats=bots.map(bot=>({id:'dm-'+bot.id,name:bot.name,members:[bot.id],archived:!!bot.profile.archived}));
  const connections=[{id:'helpdesk',name:'Helpdesk',team_name:'Example team',user_name:'helpdesk',status:'connected'}];
  const items=[
    {id:'piper-watch',bot_id:'piper',account_id:'helpdesk',instructions:'Help with urgent requests.',enabled:true,rules:[
      {event:'mentions',scope:'all_channels'},
      {event:'all_messages',scope:'channel',channel_id:'C123',channel_name:'urgent-requests'},
    ]},
    {id:'atlas-watch',bot_id:'orion',account_id:'helpdesk',instructions:'Review support messages.',enabled:false,rules:[
      {event:'all_messages',scope:'direct_messages'},
    ]},
  ];
  const errors=[];
  let slackReads=0,unrelatedReads=0,deferNext=null,rejectNext=false;
  try{
    const context=await browser.newContext({viewport:{width:1280,height:940},reducedMotion:'reduce'});
    await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
    await context.route(origin+'/**',async route=>{
      const url=new URL(route.request().url()),send=json=>route.fulfill({json});
      if(url.pathname==='/identity/meta')return send({profiles:false});
      if(url.pathname==='/api/bots')return send(bots);
      if(url.pathname==='/api/chats')return send(chats);
      if(url.pathname==='/api/runs')return send([]);
      if(url.pathname==='/api/activity')return send({});
      if(url.pathname.startsWith('/api/chats/'))return send({chat:chats.find(c=>c.id===url.pathname.slice(11)),messages:[]});
      if(url.pathname==='/api/settings')return send({theme:'dark',reduced_motion:true,notifications:'all'});
      if(url.pathname==='/api/routines')return send([]);
      if(['/api/inbox-monitors','/api/composio'].includes(url.pathname)){
        unrelatedReads++;return route.fulfill({status:503,json:{error:'Unrelated Gmail service unavailable'}});
      }
      if(url.pathname==='/api/slack-monitoring'){
        slackReads++;const pending=deferNext;deferNext=null;if(pending)await pending;
        if(rejectNext){rejectNext=false;return route.fulfill({status:503,json:{error:'Temporary Slack status error'}});}
        return send({connections,items});
      }
      if(url.pathname.endsWith('/channels'))return send({items:[{id:'C123',name:'urgent-requests'}],next_cursor:''});
      return route.continue();
    });
    const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.locator('#bot-details').click();
    await page.locator('#details-content').getByRole('button',{name:'Slack monitoring',exact:true}).waitFor();
    await page.screenshot({path:path.join(artifacts,`slack-${engine}-bot-entry.png`)});
    const baseline=unrelatedReads;
    await page.locator('#details-content').getByRole('button',{name:'Slack monitoring',exact:true}).click();
    const section=page.getByRole('region',{name:'Slack monitoring'}),filter=page.getByLabel('Show monitors for',{exact:true});
    const rows=section.locator('.slack-monitor-row');
    await rows.locator('.slack-rule-overview').waitFor();
    assert.equal(await filter.inputValue(),'piper');assert.equal(await rows.count(),1);
    assert.equal(await rows.getAttribute('data-slack-monitor-id'),'piper-watch');
    assert.match(await rows.innerText(),/Mentions → All channels.*All messages → #urgent-requests/s);
    assert.equal(unrelatedReads,baseline,'Slack opens without depending on Gmail or Composio');
    assert.equal(await filter.locator('option[value="archived"]').count(),0);
    await page.screenshot({path:path.join(artifacts,`slack-${engine}-bot-monitors.png`)});

    // The teammate entry preassigns new rules; switching scope exposes the other saved monitors.
    await filter.selectOption('empty');await section.getByText('No Slack monitors for this bot yet.',{exact:true}).waitFor();
    await section.getByRole('button',{name:'Add monitor',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'Slack monitoring',exact:true});
    assert.equal(await editor.getByLabel('Bot',{exact:true}).inputValue(),'empty');
    assert(await editor.getByLabel('Bot',{exact:true}).isDisabled());
    await editor.getByRole('button',{name:'Close',exact:true}).click();
    await filter.selectOption('orion');await rows.locator('.monitor-status').getByText('Paused',{exact:true}).waitFor();
    assert.equal(await rows.count(),1);assert.equal(await rows.getAttribute('data-slack-monitor-id'),'atlas-watch');
    await page.locator('#settings-nav').getByRole('button',{name:'Slack monitoring',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.slack-monitor-row').length===2);
    assert.equal(await filter.inputValue(),'');

    // The same path works for a different bot, with no state left over from the first.
    await page.locator('#settings-close').click();
    await page.locator('#bots').getByRole('button',{name:'Atlas',exact:true}).click();
    await page.locator('#details-content').getByRole('button',{name:'Slack monitoring',exact:true}).click();
    await rows.locator('.monitor-status').getByText('Paused',{exact:true}).waitFor();
    assert.equal(await filter.inputValue(),'orion');assert.equal(await rows.count(),1);

    // A slower previous selection must not replace the currently selected teammate.
    let release;deferNext=new Promise(resolve=>release=resolve);let before=slackReads;
    await filter.selectOption('piper');await assertEventually(()=>slackReads>before);
    await filter.selectOption('empty');await section.getByText('No Slack monitors for this bot yet.',{exact:true}).waitFor();
    release();await page.waitForTimeout(150);
    assert.equal(await filter.inputValue(),'empty');assert.equal(await rows.count(),0);assert.equal(await section.count(),1);

    // Navigating away while Slack loads must leave the new settings page alone.
    deferNext=new Promise(resolve=>release=resolve);before=slackReads;
    await filter.selectOption('piper');await assertEventually(()=>slackReads>before);
    await page.locator('#settings-nav').getByRole('button',{name:'General',exact:true}).click();
    await page.locator('#settings-content').getByText('Appearance',{exact:true}).waitFor();
    release();await page.waitForTimeout(150);assert.equal(await section.count(),0);
    assert.equal(await page.locator('#settings-title').innerText(),'General');

    // Slack's own failure stays retryable; it is independent from the broken Gmail endpoints.
    rejectNext=true;await page.locator('#settings-nav').getByRole('button',{name:'Slack monitoring',exact:true}).click();
    await section.getByRole('button',{name:'Retry',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.slack-monitor-row').length===2);
    assert.equal(await section.count(),1);
    await filter.focus();const retained=await filter.elementHandle();before=slackReads;
    await assertEventually(()=>slackReads>before,18000);
    assert(await retained.evaluate(el=>el.isConnected&&el===document.activeElement),'Status refresh keeps keyboard focus on the bot filter');

    for(const [width,height,label] of [[390,844,'phone'],[540,720,'duo']]){
      await page.setViewportSize({width,height});
      await page.evaluate(()=>document.documentElement.style.setProperty('--text-scale','1.2'));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert(await rows.evaluateAll(elements=>elements.every(el=>el.scrollWidth<=el.clientWidth+1)));
      await page.screenshot({path:path.join(artifacts,`slack-${engine}-${label}-overview.png`)});
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({engine,passed:true,botEntry:true,botScoped:true,allBots:true,gmailFailureIndependent:true,lateNavigationGuard:true,retry:true,focusRetained:true,responsive:true}));
    await context.close();
  }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})();

async function assertEventually(check,timeout=12000){
  const end=Date.now()+timeout;
  while(!check()){if(Date.now()>end)assert.fail('Timed out waiting for expected request');await new Promise(resolve=>setTimeout(resolve,40));}
}

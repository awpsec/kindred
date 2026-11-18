const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium,webkit} = require(process.env.KINDRED_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname,'../..');
const work = '55d7a3d6-c36c-42b3-a4b7-44f4c395de78';

async function check(mobile,duo) {
  const {server,token,profileID} = require(mobile?'./fixtures/duo.cjs':'./fixtures/desktop.cjs');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await (mobile?webkit:chromium).launch();
  try {
    const page=await browser.newPage({viewport:mobile?{width:390,height:800}:{width:1200,height:900},hasTouch:mobile,isMobile:mobile});
    page.setDefaultTimeout(10000);
    const errors=[],modelAccounts=[],writes=[],claudeCalls=[],codexCalls=[];
    let workLimitsUnavailable=false;
    const service='37cbfb37-57f1-4b2b-ac57-eebd152d9fe3';
    page.on('pageerror',e=>errors.push(e.message));
    const ui=name=>fs.readFileSync(path.join(root,'mobile/ios/KindredCompanion/Web',name),'utf8');
    await page.addInitScript(({token,mobile,duo,profileID,css,js})=>{
      sessionStorage.setItem('kindred-token',token);
      if(!mobile)return;
      Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,
        __KINDRED_NATIVE_SESSION_BOOTSTRAP:true,__KINDRED_IOS_LAYOUT:{topInset:duo?24:59,bottomInset:34,isSlab:true,isDuo:duo,isDuoInner:false,usesNativeRail:duo,railSide:duo?'right':'none',rightInset:duo?84:0,isPortrait:true,viewportHeight:800}});
      window.webkit={messageHandlers:{kindredAccounts:{postMessage(){}},kindredNavigation:{postMessage(){}},kindredSession:{postMessage(){}}}};
      document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
    },{token,mobile,duo,profileID,css:mobile?ui('MobileLayout.css'):'',js:mobile?ui('MobileLayout.js'):''});
    const slots=[{id:'',nickname:'Personal',tokens:12,reported_requests:1},{id:work,nickname:'Work',tokens:31,reported_requests:2}];
    const claudeSlots=[{...slots[0]}];
    await page.route('**/api/providers/claude-code/accounts',r=>{
      const body=r.request().postDataJSON(),row={id:service,nickname:body.nickname};
      if(body.id)claudeSlots.find(a=>a.id===body.id).nickname=body.nickname;else claudeSlots.push(row);
      return r.fulfill({json:row});
    });
    await page.route('**/api/providers',r=>r.fulfill({json:{providers:[{id:'codex',name:'Codex',kind:'subscription',accounts:slots},
      {id:'claude-code',name:'Claude Code',kind:'subscription',accounts:claudeSlots}]}}));
    await page.route('**/api/codex/**',r=>{
      const url=new URL(r.request().url()),id=url.searchParams.get('account_id')||'';
      codexCalls.push([url.pathname,id]);
      if(workLimitsUnavailable && id===work && url.pathname.endsWith('/usage'))return r.fulfill({status:503,json:{error:'Temporarily unavailable'}});
      if(url.pathname.endsWith('/login'))return r.fulfill({json:{userCode:'TEST',verificationUrl:'https://example.test/activate'}});
      if(url.pathname.endsWith('/models')){modelAccounts.push(id);return r.fulfill({json:{data:[{model:'test',displayName:'Test model',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'high'}]}]}});}
      return r.fulfill({json:{account:{type:'chatgpt',email:id?'work@example.test':'personal@example.test'},limits:{rateLimits:{primary:{usedPercent:id?100:10,windowDurationMins:300}}}}});
    });
    await page.route('**/api/composio',r=>r.fulfill({json:{configured:false,apps:[]}}));
    await page.route('**/api/provider-cli/**',r=>{
      const action=new URL(r.request().url()).pathname.split('/').at(-1);
      claudeCalls.push([action,r.request().postDataJSON()?.account_id]);
      return r.fulfill({json:action==='login'?{state:'connected',connected:true}:{connected:true,windows:[],data:[{model:'sonnet',displayName:'Sonnet'}]}});
    });
    await page.route('**/api/bots/piper',r=>{const bot=r.request().postDataJSON();writes.push(bot);return r.fulfill({json:bot});});
    await page.route('**/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'ui/app.js'),'utf8')+'\nexport {openSettings,newBot};'}));
    await page.goto(origin+'/#kindred-chat=dm-piper');await page.locator('#prompt').waitFor();
    if(!mobile){
      await page.locator('#identity-button').click();
      await page.getByRole('menuitem',{name:'Usage',exact:true}).hover();
      await page.locator('.provider-usage-list').getByRole('button',{name:'Codex',exact:true}).hover();
      const detail=page.locator('.provider-usage-detail:not([hidden])');
      for(const [nickname,remaining] of [['Personal',90],['Work',0]]){
        const row=detail.locator('.usage-account').filter({has:page.getByText(nickname,{exact:true})});
        await row.getByText('5h · '+remaining+'% left',{exact:true}).waitFor();
      }
      await page.keyboard.press('Escape');
      workLimitsUnavailable=true;
      await page.locator('#identity-button').click();
      await page.getByRole('menuitem',{name:'Usage',exact:true}).hover();
      await page.locator('.provider-usage-list').getByRole('button',{name:'Codex',exact:true}).hover();
      await detail.getByText('5h · 90% left',{exact:true}).waitFor();
      await detail.getByText('Limits unavailable',{exact:false}).first().waitFor();
      await detail.getByText('In Kindred · 31 tokens recorded',{exact:true}).waitFor();
      workLimitsUnavailable=false;
      assert.equal(await detail.locator('button, a').count(),0);
      await page.keyboard.press('Escape');
    }
    await page.evaluate(async()=>{const app=await import('/app.js');await app.openSettings('connections');});
    const codex=page.locator('.ai-account[data-provider=codex]');
    await codex.locator(':scope>summary').click();
    const personal=codex.locator('.subscription-account').nth(0),team=codex.locator('.subscription-account').nth(1);
    await personal.getByText('5h · 90% left',{exact:true}).waitFor();
    await team.getByText('5h · 0% left',{exact:true}).waitFor();
    assert(await codex.getByText('OpenAI API',{exact:true}).isVisible());
    await team.locator('summary').click();await team.getByText('In Kindred · 31 tokens recorded').waitFor();
    await team.getByRole('button',{name:'Sign in',exact:true}).click();
    await team.getByText('TEST',{exact:true}).waitFor();
    assert(codexCalls.some(([path,id])=>path.endsWith('/login') && id===work));
    const claude=page.locator('.ai-account[data-provider="claude-code"]');
    await claude.locator(':scope>summary').click();
    await claude.getByRole('button',{name:'Add account',exact:true}).click();
    await claude.getByLabel('Nickname').fill('Service');
    await claude.locator('form').getByRole('button',{name:'Add account',exact:true}).click();
    const serviceRow=claude.locator('.subscription-account').filter({has:page.locator('summary strong',{hasText:'Service'})});
    await serviceRow.getByRole('button',{name:'Sign in',exact:true}).click();
    await serviceRow.getByText('Claude is connected.',{exact:true}).waitFor();
    assert(claudeCalls.some(([action,id])=>action==='login' && id===service));
    await serviceRow.getByRole('button',{name:'Rename'}).click();
    await serviceRow.getByLabel('Nickname').fill('Team');
    await serviceRow.getByRole('button',{name:'Save',exact:true}).click();
    await claude.getByText('Team',{exact:true}).waitFor();
    await page.evaluate(()=>document.querySelector('#settings-dialog').close());
    if(duo) {
      // Connections returns to the native chat list. Start from the bot chat
      // to exercise both of the cover toolbar's normal navigation actions.
      await page.goto(origin+'/#kindred-chat=dm-piper');await page.reload();
      await page.waitForFunction(()=>document.documentElement.dataset.iosDuo==='true' && document.querySelector('#heading')?.textContent==='Piper');
      await page.evaluate(()=>window.__kindredDuoActions.perform('botDetails'));
      await page.locator('#details-panel').waitFor();
      await page.evaluate(()=>window.__kindredDuoActions.perform('botSettings'));
    } else {
      await page.locator('#bot-details').click();
      await page.locator('#details-panel').getByRole('button',{name:'Bot settings',exact:true}).click();
    }
    const model=page.locator('[data-bot-settings-group=model]');
    await model.locator('summary').click();
    const trigger=model.getByRole('button',{name:'Choose provider and account'});
    await trigger.click();
    const menu=model.locator('.provider-picker-menu'),provider=menu.getByRole('button',{name:'Codex',exact:true});
    if(mobile) await provider.tap(); else await provider.hover();
    assert.deepEqual(await menu.locator('.provider-picker-list').nth(1).locator('.provider-picker-choice').allTextContents(),['Personal','Work']);
    const select=menu.getByRole('button',{name:'Work',exact:true});
    if(mobile)await select.tap();else await select.click();
    await page.waitForFunction(()=>document.querySelector('.bot-edit-form .preference-status')?.textContent==='Saved');
    assert.equal(writes.at(-1).profile.provider_account_id,work);
    assert.equal(writes.at(-1).provider,'codex');
    assert.equal(modelAccounts.at(-1),work);
    assert.match(await trigger.innerText(),/Codex · Work/);
    await page.evaluate(async()=>{const app=await import('/app.js');await app.newBot();});
    const form=page.locator('#bot-form');
    await form.getByRole('button',{name:'Choose provider and account'}).click();
    const claudeChoice=form.locator('.provider-picker-menu').getByRole('button',{name:'Claude Code',exact:true});
    if(mobile)await claudeChoice.tap();else await claudeChoice.hover();
    await form.locator('.provider-picker-menu').getByRole('button',{name:'Team',exact:true}).click();
    await form.locator('[name=model]').selectOption('sonnet');
    await form.locator('[name=name]').fill('Service bot');
    const created=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/bots' && r.method()==='POST');
    await page.route('**/api/bots',r=>r.request().method()==='POST'?r.fulfill({json:{...r.request().postDataJSON(),id:'service-bot'}}):r.continue());
    await form.getByRole('button',{name:'Create bot',exact:true}).click();
    const payload=(await created).postDataJSON();
    assert.equal(payload.provider,'claude-code');
    assert.equal(payload.profile.provider_account_id,service);
    assert(claudeCalls.some(([action,id])=>action==='models' && id===service));
    assert.deepEqual(errors,[]);
    console.log(duo?'Closed Duo layout / touch WebKit passed':mobile?'iOS layout / touch WebKit passed':'Desktop Chromium passed');
  } finally {
    await browser.close();
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
}
check(process.argv.includes('--mobile') || process.argv.includes('--duo'),process.argv.includes('--duo')).catch(error=>{console.error(error);process.exitCode=1;});

const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../ui/docker-network.js'),'utf8');
(async()=>{
  const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
  const passed=[];
  try {
    const scenarios=process.env.KINDRED_NETWORK_RESET_SCENARIOS?.split(',')||['reset-local','reset-tailnet','save-normalized','bridge-reset','reset-restart','conflict','close'];
    for(const scenario of scenarios) {
      const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',r=>r.fulfill({contentType:r.request().url().endsWith('.js')?'text/javascript':'text/html',body:r.request().url().endsWith('.js')?source:'<dialog open><section id="host"></section></dialog>'}));
      await page.goto('http://192.168.1.2/');
      await page.evaluate(async scenario=>{
        const defaults={access:scenario==='bridge-reset'?'bridge':scenario==='reset-tailnet'?'tailnet':'local',tailnet_address:scenario==='reset-tailnet'?'100.64.1.2':'',public_url:location.origin,allowed_origins:[],confirmed_http_origins:[]};
        if(scenario==='save-normalized')defaults.public_url='https://normalized.example';
        const current=scenario==='reset-restart'?{...defaults,access:'all'}:defaults;
        window.defaults=structuredClone(defaults);window.writes=[];window.reloads=0;window.polls=0;window.confirms=0;window.confirm=()=>{confirms++;return false};
        window.fetch=async()=>{polls++;return new Response(JSON.stringify({docker_network:{revision:'restarted'}}));};
        const api=async(path,body)=>{
          if(!body)return {mode:scenario==='bridge-reset'?'bridge':'host',revision:'initial',settings:structuredClone(current),defaults:structuredClone(defaults),pending:null};
          writes.push(body);
          if(scenario==='close')await new Promise(resolve=>window.releaseSave=resolve);
          if(scenario==='conflict'){const e=new Error('Network settings changed. Reload them before saving again.');e.status=409;throw e;}
          return {revision:scenario==='reset-restart'?'restarted':'initial',settings:structuredClone(defaults),restarting:scenario==='reset-restart'};
        };
        window.network=await(await import('/docker-network.js')).mountDockerNetwork(document.querySelector('#host'),{api,dialog:document.querySelector('dialog'),reload:()=>{reloads++;}});
      },scenario);
      const access=page.getByLabel('Connection access'),url=page.getByLabel('Primary server URL'),tailnet=page.getByLabel('This host’s Tailscale IP address');
      if(scenario==='save-normalized') {
        await url.fill('https://NORMALIZED.example/');await page.getByRole('button',{name:'Save and restart',exact:true}).click();
      } else if(scenario==='reset-restart') {
        await page.getByRole('button',{name:'Reset to Compose settings',exact:true}).click();
      } else {
        if(scenario!=='bridge-reset')await access.selectOption(scenario==='reset-local'?'tailnet':'all');
        await url.fill('https://unsaved.example');
        assert.equal(await page.evaluate(()=>network.canLeave()),false);
        await page.getByRole('button',{name:scenario==='conflict'||scenario==='close'?'Save and restart':'Reset to Compose settings',exact:true}).click();
      }
      if(scenario==='reset-restart') {
        await page.waitForFunction(()=>reloads===1);assert.equal(await page.evaluate(()=>writes[0].reset),true);assert.equal(await page.getByRole('button',{name:'Save and restart',exact:true}).isDisabled(),true);
      } else if(scenario==='conflict') {
        await page.getByRole('status').filter({hasText:'Reload them before saving again.'}).waitFor();assert.equal(await url.inputValue(),'https://unsaved.example');assert.equal(await page.evaluate(()=>network.canLeave()),false);assert.equal(await page.locator('fieldset').isEnabled(),true);
      } else if(scenario==='close') {
        await page.waitForFunction(()=>!!window.releaseSave);await page.evaluate(()=>{document.querySelector('dialog').close();releaseSave();});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>reloads+polls),0);
      } else {
        await page.getByRole('status').filter({hasText:'Networking settings are up to date.'}).waitFor();
        const expected=await page.evaluate(()=>defaults);
        if(scenario==='bridge-reset')assert.equal(await access.count(),0);
        else {
          assert.equal(await access.inputValue(),expected.access);assert.equal(await tailnet.inputValue(),expected.tailnet_address);
          assert.equal(await tailnet.isVisible(),expected.access==='tailnet');assert.equal(await tailnet.evaluate(n=>n.required),expected.access==='tailnet');
        }
        assert.equal(await url.inputValue(),expected.public_url);assert.equal(await page.getByLabel('Additional allowed URLs · one per line').inputValue(),'');
        const confirms=await page.evaluate(()=>confirms);assert.equal(await page.evaluate(()=>network.canLeave()),true);assert.equal(await page.evaluate(()=>confirms),confirms);
        assert.equal(await page.evaluate(()=>writes.length),1);assert.equal(await page.locator('fieldset').isEnabled(),true);
        // A fresh explicit Save must use the reconciled values, not the old draft.
        await page.getByRole('button',{name:'Save and restart',exact:true}).click();await page.waitForFunction(()=>writes.length===2);
        assert.deepEqual(await page.evaluate(()=>writes[1].settings),expected);assert.equal(await page.evaluate(()=>writes[1].reset),false);
      }
      assert.deepEqual(errors,[]);passed.push(scenario);console.log(JSON.stringify({engine,scenario,passed:true}));await page.close();
    }
    console.log(JSON.stringify({engine,passed}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

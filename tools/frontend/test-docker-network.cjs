const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../ui/docker-network.js'),'utf8');
(async()=>{
  const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
  const results=[];
  try {
    for(const scenario of ['save','removed-origin','fast-rollback','lost-response','validation','bridge','close']) {
      const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>route.fulfill({contentType:route.request().url().endsWith('.js')?'text/javascript':'text/html',body:route.request().url().endsWith('.js')?source:'<dialog open><section id="host"></section></dialog>'}));
      await page.goto('http://192.168.1.2/');
      await page.evaluate(async scenario=>{
        const settings={access:scenario==='bridge'?'bridge':'local',tailnet_address:'',public_url:location.origin,allowed_origins:[],confirmed_http_origins:[]};
        const initial={mode:scenario==='bridge'?'bridge':'host',revision:'initial',settings,defaults:settings,pending:null};
        window.writes=[];window.reloads=0;window.polls=0;let request=null;
        window.fetch=async()=>{window.polls++;return new Response(JSON.stringify({docker_network:{revision:scenario==='fast-rollback'?'initial':request?.request_id||'initial'}}));};
        const api=async(path,body)=>{
          if(body){window.writes.push(body);request=body;if(scenario==='validation'){const e=new Error('The selected address is unavailable');e.status=400;throw e;}
            if(scenario==='lost-response')throw new TypeError('Failed to fetch');
            return {revision:body.request_id,settings:body.settings,restarting:true};}
          if(request&&scenario==='lost-response')return {...initial,pending:{revision:request.request_id,settings:request.settings}};
          return structuredClone(initial);
        };
        window.network=await(await import('/docker-network.js')).mountDockerNetwork(document.querySelector('#host'),{api,dialog:document.querySelector('dialog'),reload:()=>{window.reloads++;}});
      },scenario);
      assert.equal(await page.evaluate(()=>isSecureContext),false);
      await page.getByText('Advanced network settings',{exact:true}).click();
      if(scenario==='bridge') {
        assert.equal(await page.locator('select').count(),0);await page.getByText(/Docker publishes this server/).waitFor();
      } else {
        await page.getByLabel('Connection access').selectOption('all');
        if(scenario==='removed-origin')await page.getByLabel('Primary server URL').fill('https://new.example');
        await page.getByRole('button',{name:'Save and restart',exact:true}).click();
        const writes=await page.evaluate(()=>window.writes);assert.equal(writes.length,1);assert.match(writes[0].request_id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
        if(scenario==='validation') {await page.getByRole('status').filter({hasText:'The selected address is unavailable'}).waitFor();assert.equal(await page.getByRole('button',{name:'Save and restart',exact:true}).isEnabled(),true);}
        else if(scenario==='removed-origin'){await page.getByRole('link',{name:'Open https://new.example'}).waitFor();assert.equal(await page.evaluate(()=>window.polls),0);}
        else if(scenario==='fast-rollback')await page.getByRole('status').filter({hasText:'previous settings were restored'}).waitFor();
        else if(scenario==='close'){await page.evaluate(()=>document.querySelector('dialog').close());await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>window.reloads),0);}
        else await page.waitForFunction(()=>window.reloads===1);
      }
      assert.deepEqual(errors,[]);results.push(scenario);await page.close();
    }
    console.log(JSON.stringify({engine:process.env.WEBKIT?'webkit':'chromium',passed:results}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

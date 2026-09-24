const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:980}}),p=await context.newPage(),errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  let connected=false,attempt='fixture-1',phase='idle',badURL=false;
  const state=()=>({state:phase,attempt,connected:phase==='connected',message:phase==='waiting'?'Finish signing in in your browser.':phase==='connected'?'Claude is connected for this profile’s bots.':phase==='cancelled'?'Sign-in cancelled.':'Claude is verifying your sign-in…',...(phase==='waiting'?{url:(badURL?'https://evil.example':'https://claude.com')+'/cai/oauth/authorize?client_id=fixture&response_type=code&state=fixture&code_challenge=fixture'}:{})});
  await context.route('https://claude.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Official browser flow fixture</h1><p>Return to Kindred with your code.</p>'}));
  await context.route('https://evil.example/**',()=>{throw Error('Unexpected provider URL was opened');});
  await context.route(origin+'/api/**',async route=>{
   const request=route.request(),name=new URL(request.url()).pathname.slice(4),body=request.method()==='GET'?null:request.postDataJSON(),send=json=>route.fulfill({json});
   if(name==='/providers')return send({providers:[{id:'claude-code',name:'Claude Code',kind:'subscription'}]});
   if(name==='/composio')return send({configured:false,apps:[]});
   if(name==='/provider-cli/claude-code/account')return send({installed:true,connected,message:connected?'Claude subscription connected for this profile.':'Sign in with Claude in your browser to connect this profile’s bots.'});
   if(name==='/provider-cli/claude-code/login'){assert.deepEqual(body,{});writes.push({name,body});phase='waiting';await new Promise(r=>setTimeout(r,100));return send(state());}
   if(name==='/provider-cli/claude-code/login-status')return send(state());
   if(name==='/provider-cli/claude-code/login-complete'){writes.push({name,body});assert.equal(body.attempt,attempt);assert.equal(body.code,'fixture-return-code');phase='verifying';return send(state());}
   if(name==='/provider-cli/claude-code/login-cancel'){writes.push({name,body});phase='cancelled';return send(state());}
   if(name==='/providers/claude-code/models')return send({models:[],data:[]});
   if(name==='/providers/claude-code/usage')return send({bots:[],scope:'Fixture'});
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#settings-button').click();await p.locator('#settings-dialog').getByRole('button',{name:'Connections',exact:true}).click();
  const card=p.locator('.ai-account').filter({has:p.locator('.ai-account-summary strong',{hasText:'Claude Code'})});try{await card.locator(':scope > summary').click();}catch(e){console.log(JSON.stringify({errors,body:(await p.locator('body').innerText()).slice(-3500)}));throw e;}
  const firstPopup=context.waitForEvent('page');await card.getByRole('button',{name:'Sign in',exact:true}).click();let popup=await firstPopup;await popup.waitForURL('https://claude.com/**');await popup.getByRole('heading',{name:'Official browser flow fixture'}).waitFor();
  await card.getByLabel('Claude authorization code',{exact:true}).waitFor();assert.equal(await card.getByRole('button',{name:'Open bot computer'}).count(),0);assert(!writes.some(w=>w.body.bot_id));
  await p.screenshot({path:path.join(artifacts,engine+'-claude-browser-login.png')});
  const input=card.getByLabel('Claude authorization code',{exact:true});await input.fill('fixture-return-code');await input.press('Enter');await card.getByText('Claude is verifying your sign-in…',{exact:true}).waitFor();assert.equal(await input.inputValue(),'');assert(await card.getByRole('button',{name:'Finish sign-in',exact:true}).isDisabled());
  assert(!(await p.evaluate(()=>JSON.stringify([localStorage,sessionStorage]))).includes('fixture-return-code'));
  connected=true;phase='connected';await card.getByText('Claude subscription connected for this profile.',{exact:true}).waitFor();await p.waitForFunction(()=>!document.querySelector('.claude-login-code:not([hidden])'));if(!popup.isClosed())await popup.close();
  connected=false;attempt='fixture-2';const secondPopup=context.waitForEvent('page');await card.getByRole('button',{name:'Sign in',exact:true}).click();popup=await secondPopup;await popup.waitForURL('https://claude.com/**');await card.getByRole('button',{name:'Cancel sign-in',exact:true}).click();await card.getByText('Sign-in cancelled.',{exact:true}).waitFor();if(!popup.isClosed())await popup.close();assert.equal(writes.filter(w=>w.name.endsWith('/login-complete')).length,1);
  badURL=true;attempt='fixture-3';const rejectedPopup=context.waitForEvent('page');await card.getByRole('button',{name:'Sign in',exact:true}).click();popup=await rejectedPopup;await p.getByText('Claude returned an unexpected sign-in address.',{exact:true}).first().waitFor();if(!popup.isClosed())await popup.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,localOAuthPopup:true,noBotDisplayRequired:true,returnCodeCleared:true,verifiedCompletion:true,cancel:true,unexpectedURLRejected:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

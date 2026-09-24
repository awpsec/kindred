const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');

(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
  let checks=0,releaseCheck,releaseLogin,connected=false;
  const delayedCheck=new Promise(resolve=>{releaseCheck=resolve;}),delayedLogin=new Promise(resolve=>{releaseLogin=resolve;});
  const preparing={installed:false,connected:false,preparing:true,setup:'installing',message:'Your bot computer is installing its software.'};
  await context.route(origin+'/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/providers')return route.fulfill({json:{providers:[{id:'codex',name:'Codex',kind:'subscription'}]}});
   if(path==='/api/codex/account'){
    if(++checks===2)await delayedCheck;
    return route.fulfill({json:connected?{account:{type:'chatgpt',email:'fixture@example.test'}}:preparing});
   }
   if(path==='/api/codex/login'){
    await delayedLogin;
    return route.fulfill({json:{userCode:'TEST-CODE',verificationUrl:'https://auth.openai.com/codex/device'}});
   }
   if(path==='/api/composio')return route.fulfill({json:{configured:false,apps:[]}});
   return route.continue();
  });
  await context.addInitScript(value=>{
   sessionStorage.setItem('kindred-token',value);
   window.__KINDRED_EXTERNAL_LINKS=true;window.openedLinks=[];window.copiedCodes=[];
   window.__TAURI__={core:{invoke:async(command,args)=>{
    if(command!=='open_external_url')throw Error('Unexpected command: '+command);
    if(window.failBrowserOpen)throw 'Your browser could not start. Copy the link and open it in your browser.';
    window.openedLinks.push(args.url);
   }}};
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copiedCodes.push(text)}});
  },token);
  await page.goto(origin);await page.locator('#settings-button').click();
  await page.locator('#settings-dialog').getByRole('button',{name:'Connections',exact:true}).click();
  const row=page.locator('.ai-account').filter({has:page.locator('summary strong',{hasText:'Codex'})});
  await row.locator('summary').click();
  await row.getByText(preparing.message,{exact:true}).waitFor();
  assert((await row.locator('summary').textContent()).includes('Setting up'));
  // A slow account check can finish after the user starts sign-in. It must not
  // replace setup progress or the device-code instructions with stale status.
  await row.getByRole('button',{name:'Check connection',exact:true}).click();
  await row.getByRole('button',{name:'Sign in',exact:true}).click();
  await row.getByText('Starting your computer. First setup can take several minutes…',{exact:true}).waitFor();
  const checked=page.waitForResponse(response=>response.url().endsWith('/api/codex/account'));
  releaseCheck();await checked;await page.waitForTimeout(150);
  assert(await row.getByText('Starting your computer. First setup can take several minutes…',{exact:true}).isVisible());
  assert(await row.getByRole('button',{name:'Sign out',exact:true}).isDisabled());
  releaseLogin();await row.getByText('Enter this code: TEST-CODE',{exact:true}).waitFor();
  assert(await row.getByText('Complete the official sign-in, then check connection.',{exact:true}).isVisible());
  const copy=row.getByRole('button',{name:'Copy activation code',exact:true}),link=row.getByRole('link',{name:'Open OpenAI sign-in',exact:true});
  await copy.click();await page.getByText('Activation code copied.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.copiedCodes),['TEST-CODE']);
  const popupPages=[];context.on('page',p=>popupPages.push(p));
  await link.click();await page.waitForFunction(()=>window.openedLinks.length===1);
  assert.deepEqual(await page.evaluate(()=>window.openedLinks),['https://auth.openai.com/codex/device']);
  assert.equal(page.url(),origin+'/');assert.equal(popupPages.length,0);
  await link.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>window.openedLinks.length===2);
  await page.evaluate(()=>window.failBrowserOpen=true);await link.click();
  await page.getByText('Your browser could not start. Copy the link and open it in your browser.',{exact:true}).waitFor();
  // A webview without Clipboard API support must retain a working user-gesture
  // fallback, with the code selected inside the open settings dialog.
  await page.evaluate(()=>{
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});
   document.execCommand=command=>{if(command!=='copy')return false;window.copiedCodes.push(document.activeElement.value);return true;};
  });
  await copy.click();assert.deepEqual(await page.evaluate(()=>window.copiedCodes),['TEST-CODE','TEST-CODE']);
  assert.equal(await page.locator('.clipboard-copy').count(),0);
  await page.evaluate(()=>document.execCommand=()=>false);await copy.click();
  await page.getByText('Could not copy. Select the activation code and copy it manually.',{exact:true}).waitFor();
  // Browser-only and older desktop clients still use the real anchor URL.
  await page.evaluate(()=>window.__KINDRED_EXTERNAL_LINKS=false);
  await context.route('https://auth.openai.com/**',route=>route.fulfill({body:'Sign-in fixture'}));
  const popupPromise=context.waitForEvent('page');await link.click();const popup=await popupPromise;
  await popup.waitForURL('https://auth.openai.com/codex/device');await popup.close();
  assert.equal(await page.evaluate(()=>window.openedLinks.length),2);
  connected=true;await row.getByRole('button',{name:'Check connection',exact:true}).click();
  await row.getByText('fixture@example.test',{exact:true}).waitFor();
  assert.equal(await row.locator('.login-info').count(),1);
  assert.deepEqual(errors,[]);
  await context.close();
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',setupMessage:true,staleCheckIgnored:true,deviceCode:true,copyCode:true,clipboardFallback:true,externalBrowserIPC:true,keyboardLink:true,openerFailureVisible:true,browserFallback:true,connected:true}));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exit(1);});

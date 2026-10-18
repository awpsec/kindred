const assert=require('node:assert/strict');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await webkit.launch(),origin='http://127.0.0.1:'+server.address().port;
 try {
  for(const platform of ['ios','browser','android']) {
   const context=await browser.newContext({viewport:{width:402,height:780},hasTouch:true});
   await context.addInitScript(({platform,token})=>{
    sessionStorage.setItem('kindred-token',token);window.menuRequests=[];
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied=text}});
    if(platform==='ios') {
     window.__KINDRED_MOBILE=true;window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;
     window.webkit={messageHandlers:{kindredAccounts:{postMessage:value=>window.menuRequests.push(value)},kindredSession:{postMessage:()=>{}}}};
    } else if(platform==='android') {window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='android';window.kindredNative={postMessage:()=>{}};}
   },{platform,token});
   const page=await context.newPage(),errors=[],reactions=[];
   page.on('pageerror',error=>errors.push(error.message));
   const messages=[{seq:1,sender:'piper',text:'A mobile message to react to, reply to, or copy.',kind:'message',created:1700000000,reactions:[]},{seq:2,sender:'user',text:'Thanks, Piper.',kind:'message',created:1700000015,reactions:[]}];
   await page.route(/\/api\/chats\/dm-piper(?:\?.*)?$/,route=>route.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages,page:{has_before:false,has_after:false}}}));
   await page.route('**/api/chats/dm-piper/messages/*/reaction',route=>{
    const body=route.request().postDataJSON();reactions.push(body);
    messages[0].reactions=body.emoji?[{user:true,emoji:body.emoji}]:[];
    return route.fulfill({json:{ok:true}});
   });
   await page.goto(origin+'/#kindred-chat=dm-piper');
   const group=page.locator('[data-message="1"]'),bubble=group.locator('.message-row>.message-bubble');
   await bubble.waitFor({state:'visible'});
   await page.waitForFunction(()=>document.documentElement.hasAttribute('data-kindred-mobile-messages'));
   assert(await group.locator('.message-actions').isHidden(),platform+': toolbar stays hidden');
   await page.waitForFunction(()=>document.querySelector('[data-message="1"]>.mobile-message-time'));
   assert.equal(await group.locator('.mobile-message-time').getAttribute('datetime'),new Date(1700000000*1000).toISOString());
   assert.equal(await group.locator('.mobile-message-time').evaluate(node=>getComputedStyle(node).opacity),'0');
   const touch=async(type,x,y,count=1)=>bubble.evaluate((node,{type,x,y,count})=>{
    const event=new Event(type,{bubbles:true,cancelable:true});
    Object.defineProperty(event,'touches',{value:count?[{identifier:1,clientX:x,clientY:y}]:[]});
    node.dispatchEvent(event);return event.defaultPrevented;
   },{type,x,y,count});
   await touch('touchstart',180,300);
   assert.equal(await touch('touchmove',150,335),false,'vertical scroll must remain native');
   assert.equal(await group.locator('.mobile-message-time').evaluate(node=>getComputedStyle(node).opacity),'0');
   await touch('touchend',150,335,0);
   await touch('touchstart',220,300);
   assert.equal(await touch('touchmove',140,302),true,'leftward drag claims only horizontal motion');
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-message="1"]>.mobile-message-time')).opacity==='1');
   assert.equal(await group.locator('.mobile-message-time').evaluate(node=>getComputedStyle(node).opacity),'1');
   assert.equal(await page.locator('[data-message="2"]>.mobile-message-time').evaluate(node=>getComputedStyle(node).opacity),'1','the gesture reveals all message times');
   await touch('touchend',140,302,0);
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-message="1"]>.mobile-message-time')).opacity==='0');
   assert.equal(await group.locator('.mobile-message-time').evaluate(node=>getComputedStyle(node).opacity),'0');
   const describe=async()=>{
    await bubble.dispatchEvent('pointerdown',{button:0,pointerType:'touch'});
    const key=await group.getAttribute('data-mobile-message-key');
    return page.evaluate(key=>window.__kindredMobileMessages.describe(key),key);
   };
   if(platform==='ios') {
    const model=await describe();
    assert.deepEqual(model.items.map(item=>item.title),['React','Reply','Copy message']);
    assert.equal(model.items[0].children.length,16);assert.equal(reactions.length,0);
    assert((await page.evaluate(()=>window.menuRequests)).some(item=>item.action==='message-target'&&item.rect.length===4));
    assert.equal(await page.locator('body>.message-action-menu').count(),0,'describing the native menu leaves no themed duplicate');
    const oldCopy=model.items[2].id;await describe();
    await page.evaluate(id=>window.__kindredMobileMessages.perform(id),oldCopy);
    assert.equal(await page.evaluate(()=>window.copied),undefined,'expired actions are rejected');
    const copy=await describe();await page.evaluate(id=>window.__kindredMobileMessages.perform(id),copy.items[2].id);
    assert.equal(await page.evaluate(()=>window.copied),messages[0].text);
    const react=await describe();const heart=react.items[0].children.find(item=>item.title==='❤️ Heart');
    await page.evaluate(id=>window.__kindredMobileMessages.perform(id),heart.id);
    await group.getByRole('button',{name:/Remove your ❤️/}).waitFor({state:'visible'});
    assert.deepEqual(reactions,[{emoji:'❤️'}]);
    const selected=await describe();assert(selected.items[0].children.find(item=>item.title==='❤️ Heart').selected);
    await page.evaluate(id=>window.__kindredMobileMessages.perform(id),selected.items[1].id);
   } else {
    await touch('touchstart',200,300);await page.waitForTimeout(550);await touch('touchend',200,300,0);
    const menu=page.getByRole('menu',{name:'Message options',exact:true});await menu.waitFor({state:'visible'});
    assert.equal(await menu.getByRole('menuitemradio').count(),16,platform+': the press menu includes all reactions');
    await menu.getByRole('menuitem',{name:'Copy message',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.copied),messages[0].text);
    await bubble.dispatchEvent('contextmenu');
    await menu.getByRole('menuitemradio',{name:'❤️ Heart',exact:true}).click();
    await group.getByRole('button',{name:/Remove your ❤️/}).waitFor({state:'visible'});
    assert.deepEqual(reactions,[{emoji:'❤️'}]);
    await bubble.dispatchEvent('contextmenu');await menu.getByRole('menuitem',{name:'Reply',exact:true}).click();
   }
   await page.locator('#composer-reply').waitFor({state:'visible'});
   assert.equal(await page.locator('.composer-reply-text').innerText(),messages[0].text);
   assert(await page.locator('#prompt').evaluate(node=>node===document.activeElement));
   assert.deepEqual(errors.filter(error=>!error.startsWith('ResizeObserver loop')),[]);
   await context.close();
  }
  console.log('Mobile messages: native menu data and expired actions, emoji/reply/copy, mobile press menus, hold/swipe timestamps and vertical scroll passed on iOS, touch browsers and Android.');
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});

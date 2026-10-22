// Exercise the installed iOS adapter when a deployed server owns an older
// message bridge. All messages, account actions, and copy effects are local.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const resources=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
const modern=fs.readFileSync(path.resolve(__dirname,'../../ui/mobile-messages.js'),'utf8');
const start=modern.indexOf('        // UIKit lifts only the visible bubble');
const end=modern.indexOf('\n      }\n    }, true);',start);
assert(start>=0&&end>start,'the legacy bridge fixture needs its clipping replacement updated');
const legacy=modern.slice(0,start)+`        const rect=group.querySelector('.message-row').getBoundingClientRect();
        post({action:'message-target',key:keyFor(group),rect:[rect.x,rect.y,rect.width,rect.height]});`+modern.slice(end);

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,browser=await webkit.launch(),reports=[];
  const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-ios-message-preview';fs.mkdirSync(out,{recursive:true});
  try {
    for(const width of [466,867]) for (const rail of [false,true]) {
      const height=720,inner=width>=867,page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];
      page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
      await page.route(origin+'/mobile-messages.js',route=>route.fulfill({contentType:'text/javascript',body:legacy}));
      await page.addInitScript(({token,profileID,css,js,modern,width,height,inner,rail})=>{
        sessionStorage.setItem('kindred-token',token);
        Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});
        window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:0,leftInset:0,rightInset:0,isDuo:true,isDuoInner:inner,usesNativeRail:rail,isSlab:!inner,isPortrait:!inner,viewportHeight:height};
        window.__KINDRED_NATIVE_GEOMETRY={width,height,windowWidth:width+(inner?78:0),windowHeight:height+40,safeArea:{top:0,right:0,bottom:0,left:0},reservedRegions:inner?[{kind:'division',active:false,x:width/2,y:0,width:28,height}]:[]};
        window.accountRequests=[];window.webkit={messageHandlers:{kindredAccounts:{postMessage:value=>accountRequests.push(value)},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.previewCopied=value;}}});
        document.addEventListener('DOMContentLoaded',()=>{
          const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);
          const owned=window.__kindredMobileMessages;window.previewHadOlderBridge=!!owned;
          (0,eval)(modern);window.previewRetainedOlderBridge=window.__kindredMobileMessages===owned;
        },{once:true});
      },{token,profileID,width,height,inner,rail,modern,css:fs.readFileSync(path.join(resources,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(resources,'MobileLayout.js'),'utf8')});
      await page.goto(origin+'/#kindred-chat=dm-vivienne');
      await page.locator('#prompt').waitFor({state:'visible'});
      await page.locator('#content .message-group[data-message="72"]').waitFor({state:'visible'});
      await page.waitForFunction(()=>document.documentElement.hasAttribute('data-kindred-mobile-messages')&&!document.querySelector('#app').dataset.mobileResizing);
      assert(await page.evaluate(()=>previewHadOlderBridge&&previewRetainedOlderBridge),'the bundled modern bridge must early-return without replacing the older server’s opaque action map');
      await page.evaluate(()=>{
        const group=window.previewGroup=document.querySelector('#content .message-group[data-message="72"]');
        const bubble=window.previewBubble=group.querySelector('.message-bubble');
        bubble.style.cssText+=';height:'+(innerHeight+400)+'px;width:84%;max-width:84%;';
        const spacer=document.createElement('div');spacer.style.height=innerHeight+'px';document.querySelector('#content').append(spacer);
        const header=document.querySelector('.conversation-header'),tag=document.querySelector('.bot-heading');
        tag.style.position='absolute';tag.style.top=header.getBoundingClientRect().height+12+'px';
        document.querySelector('#content').scrollTop+=bubble.getBoundingClientRect().top+96;
        const latest=document.querySelector('.jump-latest');latest.hidden=false;
        latest.style.cssText+=';position:fixed;inset:auto auto 150px '+(bubble.getBoundingClientRect().left+8)+'px;width:max-content;height:36px;min-height:36px;animation:none;';
      });
      for(const theme of ['light','dark'])for(const side of ['above','below']) {
        await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
        const result=await page.evaluate(async side=>{
          const bubble=previewBubble,group=previewGroup,header=document.querySelector('.conversation-header'),tag=document.querySelector('.bot-heading'),composer=document.querySelector('#composer-area'),pill=document.querySelector('.jump-latest');
          const r=bubble.getBoundingClientRect(),row=group.querySelector('.message-row').getBoundingClientRect(),view=group.closest('.conversation-history').getBoundingClientRect(),h=header.getBoundingClientRect(),t=tag.getBoundingClientRect(),c=composer.getBoundingClientRect(),p=pill.getBoundingClientRect();
          const top=Math.max(0,r.top,view.top,h.bottom,t.bottom),bottom=Math.min(innerHeight,r.bottom,view.bottom,c.top);
          const y=side==='above'?(top+p.top)/2:(p.bottom+bottom)/2,x=r.left+Math.min(24,r.width/4),count=accountRequests.length;
          bubble.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'touch',clientX:x,clientY:y}));
          await new Promise(resolve=>queueMicrotask(resolve));
          const posts=accountRequests.slice(count).filter(value=>value.action==='message-target'||value.action==='message-target-clear');
          return {posts,key:group.dataset.mobileMessageKey,bubble:{x:r.x,y:r.y,width:r.width,height:r.height},row:{x:row.x,y:row.y,width:row.width,height:row.height},view:{x:view.x,y:view.y,width:view.width,height:view.height},headerBottom:h.bottom,tagBottom:t.bottom,composerTop:c.top,pill:{top:p.top,bottom:p.bottom},expected:[Math.max(0,r.left,view.left),side==='above'?top:Math.max(top,p.bottom),Math.min(innerWidth,r.right,view.right)-Math.max(0,r.left,view.left),(side==='above'?Math.min(bottom,p.top):bottom)-(side==='above'?top:Math.max(top,p.bottom))]};
        },side);
        assert(result.bubble.y<0&&result.bubble.y+result.bubble.height>result.composerTop,'the fixture bubble crosses the header and composer');
        if (rail&&!inner) assert.equal(result.tagBottom,0,'the closed native rail removes the HTML bot tag');
        else assert(result.tagBottom>result.headerBottom,'the bot tag exercises its own obstruction below the header');
        assert(result.posts.length>=2,'the older full-row post must be followed by the bundled corrective post');
        const initial=result.posts[0],last=result.posts.at(-1);
        assert.equal(initial.action,'message-target',JSON.stringify({width,theme,side,result}));assert.deepEqual(initial.rect,[result.row.x,result.row.y,result.row.width,result.row.height],'the routed legacy script publishes its original full-row rectangle');
        assert.equal(last.action,'message-target',JSON.stringify({width,theme,side,result}));assert(result.expected[2]>0&&result.expected[3]>0,'there is a visible bubble segment on the pressed side of the latest pill');
        assert.equal(last.key,result.key);assert.equal(last.key,initial.key,'the native shim preserves the server’s opaque key');
        last.rect.forEach((value,index)=>assert(Math.abs(value-result.expected[index])<1,'the last native preview target is exactly the visible bubble segment'));
        assert(last.rect[1]>=Math.max(result.headerBottom,result.tagBottom));
        assert(last.rect[1]+last.rect[3]<=result.composerTop);
        assert(side==='above'?last.rect[1]+last.rect[3]<=result.pill.top:last.rect[1]>=result.pill.bottom,'the lift preview excludes the latest-message pill');
        reports.push({width,rail,theme,side,keyPreserved:true,legacyRect:initial.rect,nativeRect:last.rect});
      }
      const model=await page.evaluate(()=>__kindredMobileMessages.describe(previewGroup.dataset.mobileMessageKey));
      assert(model.items.some(item=>item.title==='Reply'));assert(model.items.some(item=>item.title==='Copy message'));
      await page.evaluate(id=>__kindredMobileMessages.perform(id),model.items.find(item=>item.title==='Copy message').id);
      await page.waitForFunction(()=>window.previewCopied==='Ready for outer display, book, tabletop, and flat display tests.');
      const reply=await page.evaluate(()=>__kindredMobileMessages.describe(previewGroup.dataset.mobileMessageKey).items.find(item=>item.title==='Reply').id);
      await page.evaluate(id=>__kindredMobileMessages.perform(id),reply);await page.locator('.composer-reply').waitFor({state:'visible'});
      assert.equal(await page.locator('body>.message-action-menu').count(),0,'the native description leaves no desktop menu behind');
      await page.screenshot({path:path.join(out,width+'-'+rail+'-clipped-preview.png')});
      const cleared=await page.evaluate(async()=>{
        const history=previewGroup.closest('.conversation-history');history.style.cssText+=';flex:0 0 0px;height:0;min-height:0;max-height:0;';
        const count=accountRequests.length;previewBubble.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'touch',clientX:100,clientY:200}));
        await new Promise(resolve=>queueMicrotask(resolve));
        return accountRequests.slice(count).filter(value=>value.action==='message-target'||value.action==='message-target-clear');
      });
      assert(cleared.some(value=>value.action==='message-target'),'the old bridge still attempts its unbounded target');
      assert.equal(cleared.at(-1)?.action,'message-target-clear','the native shim clears the stale target when no visible history region remains');
      assert.deepEqual(errors,[]);await page.close();
    }
    fs.writeFileSync(path.join(out,'targets.json'),JSON.stringify(reports,null,2));
    console.log(JSON.stringify({passed:true,engine:'webkit',cases:reports.length,legacyBridgeRetained:true,lastNativeTargetClipped:true,headerAndBotTagExcluded:true,composerAndLatestExcluded:true,emptyVisibleRegionClearsTarget:true,opaqueKeysAndCopyReplyPreserved:true}));
  }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

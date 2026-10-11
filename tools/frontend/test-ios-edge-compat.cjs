// Verify the bundled iOS correction with the deployed v1 installer and v2.
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,browser=await webkit.launch({headless:true});
  const resources=path.join(__dirname,'../../mobile/ios/KindredCompanion/Web');
  const mobile=fs.readFileSync(path.join(__dirname,'../../ui/mobile.js'),'utf8');
  const legacy=mobile.slice(0,mobile.indexOf('export function installMobileNavigation('))+
    fs.readFileSync(path.join(__dirname,'fixtures/mobile-navigation-v1.js'),'utf8');
  try {
    for(const version of [1,2]){
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      if(version===1)await page.route(origin+'/mobile.js',route=>route.fulfill({contentType:'text/javascript',body:legacy}));
      await page.addInitScript(({token,css,js})=>{
        sessionStorage.setItem('kindred-token',token);
        window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';
        window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;window.navigation=[];
        window.webkit={messageHandlers:{kindredNavigation:{postMessage:value=>navigation.push(value)},
          kindredAccounts:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
        document.addEventListener('DOMContentLoaded',()=>{
          const style=document.createElement('style');style.textContent=css;document.head.append(style);
          (0,eval)(js);
        },{once:true});
      },{token,css:fs.readFileSync(path.join(resources,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(resources,'MobileLayout.js'),'utf8')});
      await page.goto(origin);await page.waitForFunction(()=>navigation.at(-1)?.target==='chat-list');
      await page.locator('#prompt').fill('Retained legacy-server draft');
      const interrupted=await page.evaluate(()=>{
        const message={id:crypto.randomUUID(),revision:navigation.at(-1).revision,progress:.42,x:5,y:300};
        const began=__KINDRED_EDGE_BACK({...message,phase:'begin'});
        const ended=__KINDRED_EDGE_BACK({...message,phase:'finish',commit:true});
        const destination=document.querySelector('.sidebar');
        const animations=destination.getAnimations();
        for(const animation of animations)animation.pause();
        const invalidBegin=__KINDRED_EDGE_BACK({...message,phase:'begin',revision:-1});
        const held=destination.getAnimations().length;
        window.dispatchEvent(new Event('kindred-native-geometry'));
        return {began,ended,invalidBegin,held};
      });
      assert(interrupted.began&&interrupted.ended);assert.equal(interrupted.invalidBegin,false);
      assert.equal(interrupted.held,1,'rejected input must not cancel the accepted animation');
      await page.waitForFunction(()=>!document.querySelector('#app').classList.contains('ios-edge-preview')&&navigation.at(-1)?.target==='chat-list');
      assert.equal(await page.locator('.sidebar').evaluate(node=>node.getAnimations().length),0,'geometry invalidation cancels the held incoming animation');
      assert(!(await page.locator('#app').evaluate(node=>node.classList.contains('sidebar-open'))));
      for(const [commit,reduced] of [[false,false],[false,true],[true,false]]){
        const proof=await page.evaluate(({commit,reduced})=>{
          document.documentElement.dataset.motion=reduced?'off':'on';
          const id=crypto.randomUUID(),message={id,revision:navigation.at(-1).revision,progress:.42,x:5,y:300};
          const source=document.querySelector('.conversation'),destination=document.querySelector('.sidebar');
          const x=()=>{const transform=getComputedStyle(destination).transform;return transform==='none'?0:new DOMMatrixReadOnly(transform).m41;};
          const began=__KINDRED_EDGE_BACK({...message,phase:'begin'}),updated=__KINDRED_EDGE_BACK({...message,phase:'update'}),start=x();
          const ended=__KINDRED_EDGE_BACK({...message,phase:commit?'finish':'cancel',commit});
          const animations=[...source.getAnimations(),...destination.getAnimations()];
          for(const animation of animations){animation.pause();animation.currentTime=Number(animation.effect.getTiming().duration)*.9;}
          const nearEnd=x(),destinationAnimations=destination.getAnimations().length;
          for(const animation of animations)animation.finish();
          return {began,updated,ended,start,nearEnd,end:x(),width:document.querySelector('#app').clientWidth,destinationAnimations};
        },{commit,reduced});
        assert(proof.began&&proof.updated&&proof.ended,JSON.stringify({version,commit,reduced,...proof}));
        assert.equal(proof.destinationAnimations,reduced?0:1,'only one owner may animate the incoming pane');
        if(reduced)assert.equal(proof.end,0);
        else if(commit){assert(proof.nearEnd>proof.start+Math.abs(proof.start)*.5);assert(Math.abs(proof.end)<1);}
        else{assert(proof.nearEnd<proof.start-5);assert(Math.abs(proof.end+proof.width*.3)<1);}
        await page.waitForFunction(()=>!document.querySelector('#app').classList.contains('ios-edge-preview'));
        assert.equal(await page.locator('.sidebar').evaluate(node=>node.getAnimations().length),0);
        assert.equal(await page.locator('#prompt').evaluate(node=>node.value),'Retained legacy-server draft');
      }
      assert(await page.locator('#app').evaluate(node=>node.classList.contains('sidebar-open')));
      assert.deepEqual(errors,[]);await page.close();
    }
    console.log(JSON.stringify({passed:true,engine:'webkit',legacyServer:true,currentServer:true,pairedIncomingMotion:true,reduceMotion:true,noDuplicateAnimation:true,draftRetained:true}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exit(1);});

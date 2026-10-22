// Real progress rendering with the iOS bundle, plus historical nested tracker
// markup. The test server contains only local canned accounts and messages.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const resources=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-ios-progress-layout';

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,browser=await webkit.launch(),reports=[];
  fs.mkdirSync(out,{recursive:true});
  try {
    const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
    const run={id:'ios-long-job',bot_id:'piper',chat_id:chat.id,status:'running',created:now-480,progress_started:now-240,prompt:'Review the project and verify the mobile result.',task_title:'Verify mobile layout',output:'',error:''};
    const progress={mode:'summaries',phase:'commentary',run_id:run.id,group_id:'ios-long-job',task_title:run.task_title};
    const messages=[
      {seq:1,sender:'user',kind:'message',text:run.prompt,created:now-245},
      {seq:2,sender:'piper',kind:'task_progress',text:'',run_id:run.id,created:now-240,progress:{...progress,presentation:{mode:'staged',stages:['Inspect layout','Verify behavior'],current_stage:1,promoted:true}}},
      ...[
        'I found the current layout. I am checking how it fits the outer display.',
        'The layout now keeps the reading position and the draft while opening the inner display.',
        'I am verifying the final result with larger text and the keyboard visible.',
      ].map((text,index)=>({seq:index+3,sender:'piper',kind:'assistant',text,run_id:run.id,created:now-230+index*50,progress})),
    ];
    for(const width of [320,466,867,1280]) {
      const height=width>=867?720:780,isInner=width>=867,errors=[];
      const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
      const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
      await context.addInitScript(({token,css,js,width,height,isInner})=>{
        sessionStorage.setItem('kindred-token',token);
        Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:'ios-progress-fixture',__KINDRED_NATIVE_SESSION_BOOTSTRAP:true,__KINDRED_SYSTEM_TEXT_SCALE:1});
        window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:0,leftInset:0,rightInset:0,isDuo:true,isDuoInner:isInner,isSlab:!isInner,isPortrait:!isInner,viewportHeight:height};
        window.__KINDRED_NATIVE_GEOMETRY={width,height,windowWidth:width+(isInner?78:0),windowHeight:height+40,safeArea:{top:0,right:0,bottom:0,left:0},reservedRegions:isInner?[{kind:'division',active:false,x:width/2,y:0,width:28,height}]:[]};
        window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
        document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
      },{token,width,height,isInner,css:fs.readFileSync(process.env.KINDRED_TEST_IOS_LAYOUT_CSS||path.join(resources,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(resources,'MobileLayout.js'),'utf8')});
      await page.route(origin+'/api/**',route=>{
        const name=new URL(route.request().url()).pathname,send=json=>route.fulfill({json});
        if(name==='/api/settings')return send({name:'You',theme:'dark',reduced_motion:true,approval_mode:'auto',timezone:'UTC',timezone_mode:'fixed'});
        if(name==='/api/chats')return send([chat]);
        if(name==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});
        if(name==='/api/runs')return send([run]);
        if(name==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});
        if(name==='/api/activity')return send({});
        return route.continue();
      });
      await page.goto(origin+'/#kindred-chat=dm-piper');
      await page.locator('.task-commentary').last().waitFor({state:'visible'});
      await page.waitForFunction(()=>document.documentElement.hasAttribute('data-kindred-ios')&&!document.querySelector('#app').dataset.mobileResizing);
      // Older server versions put each narration row inside the tracker body.
      // Keep that compatibility surface under the same real inherited styles.
      await page.evaluate(()=>{
        const body=document.querySelector('.summary-progress-body');
        const legacy=document.createElement('div');legacy.id='legacy-progress-fixture';
        for(let i=0;i<2;i++){
          const row=document.createElement('div');row.className='summary-progress-update message-row assistant';
          row.innerHTML='<div class="message-bubble markdown"><p>Historical progress narration stays compact and readable. <span class="progress-update-time" data-pinned="false"><button class="progress-update-time-toggle" aria-pressed="false">'+(i+1)+'m</button><time class="progress-update-clock">(9:37 PM)</time></span></p></div>';
          row.querySelector('button').onclick=event=>{const stamp=event.currentTarget.parentElement,pinned=stamp.dataset.pinned!=='true';stamp.dataset.pinned=String(pinned);event.currentTarget.setAttribute('aria-pressed',String(pinned));};legacy.append(row);
        }
        body.append(legacy);
      });
      for(const scale of [1,1.5,2,3.1176470588235294])for(const theme of ['light','dark']) {
        await page.evaluate(({scale,theme})=>{
          window.__KINDRED_SYSTEM_TEXT_SCALE=scale;window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale}}));document.documentElement.dataset.theme=theme;
        },{scale,theme});
        await page.waitForFunction(()=>!document.querySelector('#app').dataset.mobileResizing);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const metrics=await page.locator('.task-commentary,#legacy-progress-fixture>.summary-progress-update').evaluateAll(rows=>rows.map(row=>{
          const bubble=row.querySelector('.message-bubble'),stamp=bubble.querySelector('.progress-update-time'),toggle=stamp.querySelector('button'),p=bubble.querySelector('p'),r=row.getBoundingClientRect(),b=bubble.getBoundingClientRect(),t=toggle.getBoundingClientRect(),s=stamp.getBoundingClientRect();
          const text=document.createRange();text.selectNodeContents(p);text.setEndBefore(stamp);const lines=[...text.getClientRects()].filter(rect=>rect.width>0&&rect.height>0);
          return {legacy:row.classList.contains('summary-progress-update'),row:{x:r.x,y:r.y,width:r.width,height:r.height},bubble:{x:b.x,y:b.y,width:b.width,height:b.height},target:{width:t.width,height:t.height},stamp:{y:s.y,height:s.height},line:parseFloat(getComputedStyle(bubble).lineHeight),font:parseFloat(getComputedStyle(bubble).fontSize),textTop:Math.min(...lines.map(r=>r.top)),textBottom:Math.max(...lines.map(r=>r.bottom)),margin:parseFloat(getComputedStyle(row).marginBottom),scrollWidth:bubble.scrollWidth,clientWidth:bubble.clientWidth};
        }));
        fs.writeFileSync(path.join(out,'latest-metrics.json'),JSON.stringify({width,scale,theme,metrics},null,2));
        for(const metric of metrics) {
          assert(Math.abs(metric.font-14*scale)<.1,'progress narration follows Dynamic Type once');
          assert(metric.target.width>=44&&metric.target.height>=44,'elapsed time retains its full touch target');
          assert(metric.scrollWidth<=metric.clientWidth+1,'progress text and clock fit the available chat width');
          const readingTop=Math.min(metric.textTop,metric.stamp.y),readingBottom=Math.max(metric.textBottom,metric.stamp.y+metric.stamp.height);
          assert(metric.row.height<=readingBottom-readingTop+Math.max(24,metric.line/2),`progress rows must not reserve desktop-sized blank space around their text and inline time: ${JSON.stringify({width,scale,theme,metric})}`);
          assert(metric.margin<=8,'progress rows use a small reading gap');
        }
        const current=metrics.filter(m=>!m.legacy);
        for(let i=1;i<current.length;i++)assert(current[i].textTop-Math.max(current[i-1].textBottom,current[i-1].stamp.y+current[i-1].stamp.height)<=20,`consecutive narration updates cannot have a large empty gap: ${JSON.stringify({width,scale,theme,previous:current[i-1],next:current[i]})}`);
        const toggle=page.locator('.task-commentary .progress-update-time-toggle').first(),row=page.locator('.task-commentary').first();
        await toggle.scrollIntoViewIfNeeded();
        const before=await row.boundingBox(),clock=toggle.locator('..').locator('time'),reserved=await clock.boundingBox();
        await toggle.tap();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
        const after=await row.boundingBox(),revealed=await clock.boundingBox();
        assert.deepEqual({width:after.width,height:after.height},{width:before.width,height:before.height},'revealing a clock must not reflow progress');
        const relative=(rect,parent)=>({x:rect.x-parent.x,y:rect.y-parent.y,width:rect.width,height:rect.height});
        assert.deepEqual(relative(revealed,after),relative(reserved,before),'the clock keeps its reserved inline geometry even when iOS scrolls its focused target into view');
        assert.equal(await row.locator('.message-text-viewport').evaluate(node=>node.scrollTop),0,'focusing an inline time target must not scroll narration inside its text viewport');
        await toggle.tap();assert.equal(await toggle.getAttribute('aria-pressed'),'false');
        reports.push({width,scale,theme,rows:metrics.map(m=>({legacy:m.legacy,height:m.row.height,font:m.font}))});
        if(scale===1||scale>3)await page.screenshot({path:path.join(out,`${width}-${scale.toFixed(2)}-${theme}.png`)});
      }
      assert.deepEqual(errors,[]);await context.close();
    }
    fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(reports,null,2));
    console.log(JSON.stringify({passed:true,engine:'webkit',cases:reports.length,actualProgressRenderer:true,legacyNestedRows:true,compactSpacing:true,dynamicType:true,timestampsKeep44ptTargets:true,timestampRevealDoesNotReflow:true}));
  }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

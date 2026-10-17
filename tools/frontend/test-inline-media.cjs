const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'test-artifacts/inline-media';fs.mkdirSync(out,{recursive:true});
 const files={shot:fs.readFileSync(path.join(__dirname,'fixtures/media/screenshot.png')),loop:fs.readFileSync(path.join(__dirname,'fixtures/media/loop.gif')),movie:fs.readFileSync(path.join(__dirname,'fixtures/media/recording.mp4'))};
 let page,cases=0;
 try{for(const width of [1100,390]){
  page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(12000);const errors=[],fetches=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(token=>{sessionStorage.setItem('kindred-token',token);const make=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.mediaUrls=new Set();URL.createObjectURL=b=>{const u=make(b);mediaUrls.add(u);return u};URL.revokeObjectURL=u=>{mediaUrls.delete(u);revoke(u)}},token);
  const chat={id:'dm-piper',name:'Piper',members:['piper']},created=Math.floor(Date.now()/1000),run={id:'run-screenshot',bot_id:'piper',chat_id:chat.id,status:'completed',created,output:'Media for review.',prompt:'Share the evidence.'};
  const attachments=[{id:'shot',kind:'file',name:'screen.PNG',size:files.shot.length},{id:'loop',kind:'file',name:'state.gif',size:files.loop.length},{id:'movie',kind:'file',name:'walkthrough.mp4',size:files.movie.length},{id:'doc',kind:'file',name:'Report.docx',size:300},{id:'bad',kind:'file',name:'broken.png'},{id:'svg',kind:'file',name:'graphic.svg'}];
  const messages=[{seq:1,sender:'user',kind:'message',text:run.prompt,created},{seq:2,sender:'piper',kind:'result',text:run.output,run_id:run.id,attachments,created}];
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.refreshMediaTest=()=>renderChat(true,"sync");'}));
  await page.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});
   if(n==='/api/chats')return send([chat]);if(n==='/api/runs')return send([run]);if(n==='/api/runs/'+run.id)return send({run,events:[],attachments,approvals:[]});
   if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});
   if(n.startsWith('/api/deliverables/')){assert.equal(r.request().headers().authorization,'Bearer '+token);assert(!r.request().url().includes(token));fetches.push(n);return r.fulfill({contentType:'application/octet-stream',body:files[n.split('/').pop()]||Buffer.from('invalid image')});}
   return r.continue();
  });
  await page.goto(origin);
  assert.deepEqual(await page.evaluate(async()=>{const {chatMediaType}=await import('/chat-media.js');return ['screen.PNG','loop.GIF','clip.MP4','graphic.svg','page.html','report.docx'].map(name=>!!chatMediaType({name}));}),[true,true,true,false,false,false]);
  await page.locator('.chat-media').first().waitFor();assert.equal(await page.locator('.deliverable-card').count(),2,'documents and SVG retain file cards');assert.equal(await page.locator('.chat-media').count(),4);
  const photo=page.locator('.chat-media[data-media-kind=image]').filter({has:page.getByRole('button',{name:'Open image: screen.PNG',exact:true})});
  await photo.scrollIntoViewIfNeeded();await photo.locator('img').waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="Open image: screen.PNG"] img')?.naturalWidth===640);
  assert((await photo.boundingBox()).width>250);await photo.getByRole('button',{name:'Open image: screen.PNG',exact:true}).click();const dialog=page.locator('.chat-media-dialog');await dialog.locator('img').waitFor();await page.waitForFunction(()=>document.querySelector('.chat-media-dialog img')?.naturalWidth===640);
  await dialog.getByRole('button',{name:'Zoom in',exact:true}).click();assert.equal(await dialog.locator('.chat-media-zoom').innerText(),'125%');
  const urls=await page.evaluate(()=>[...mediaUrls]);messages.push({seq:3,sender:'piper',kind:'message',text:'Another progress update.',created:created+1});await page.evaluate(()=>refreshMediaTest());assert.equal(await dialog.count(),1,'chat repaint keeps viewer open');assert.equal(await dialog.locator('.chat-media-zoom').innerText(),'125%');assert(urls.some(u=>u===undefined)===false);
  await page.screenshot({path:path.join(out,engine+'-'+width+'-viewer.png')});await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});cases++;
  const gif=page.locator('[data-media-kind=gif]');await gif.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-media-kind=gif] .chat-media-surface')?.dataset.playing==='true');
  await page.evaluate(()=>document.querySelector('#content').scrollTop=0);await photo.scrollIntoViewIfNeeded();
  // Explicitly move the media outside the scroll viewport to verify unloading,
  // independent of desktop/mobile chat layout and scroll anchoring.
  await gif.evaluate(n=>n.style.marginTop='2000px');await page.waitForFunction(()=>{const n=document.querySelector('[data-media-kind=gif]');return n.querySelector('canvas')&&!n.querySelector('canvas').hidden&&!n.querySelector('img').hasAttribute('src')});
  await gif.evaluate(n=>n.style.marginTop='');await gif.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-media-kind=gif] img')?.hasAttribute('src'));
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>!document.querySelector('[data-media-kind=gif] img').hasAttribute('src'));
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await gif.getByRole('button',{name:'Open image: state.gif',exact:true}).click();await dialog.locator('img').waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-media-kind=gif] img').hasAttribute('src'));
  await dialog.getByRole('button',{name:'Pause animation',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.chat-media-dialog img').hasAttribute('src'));
  await page.keyboard.press('Escape');
  await page.evaluate(()=>document.documentElement.dataset.motion='off');await page.waitForFunction(()=>!document.querySelector('[data-media-kind=gif] img').hasAttribute('src'));await page.evaluate(()=>delete document.documentElement.dataset.motion);cases++;
  const movie=page.locator('[data-media-kind=video]');await movie.scrollIntoViewIfNeeded();await movie.locator('video').waitFor();assert(await movie.locator('video').evaluate(v=>v.paused&&!v.autoplay&&!v.controls));await movie.getByRole('button',{name:'Open video: walkthrough.mp4',exact:true}).click();await dialog.locator('video').waitFor();await page.waitForFunction(()=>document.querySelector('.chat-media-dialog video')?.readyState>=2);
  assert(await dialog.locator('video').evaluate(v=>v.paused&&v.controls&&!v.autoplay));await dialog.locator('video').evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('.chat-media-dialog video').currentTime>.1);await dialog.locator('video').evaluate(v=>{v.pause();v.currentTime=1;});await page.waitForFunction(()=>document.querySelector('.chat-media-dialog video').currentTime>=.9);
  await page.evaluate(()=>refreshMediaTest());assert(await dialog.locator('video').evaluate(v=>v.currentTime>=.9));await dialog.getByRole('button',{name:'Close',exact:true}).click();cases++;
  const bad=page.getByRole('button',{name:'Open image: broken.png',exact:true});await bad.scrollIntoViewIfNeeded();await page.locator('.chat-media').filter({has:bad}).getByText('Preview unavailable.',{exact:false}).waitFor();
  await photo.scrollIntoViewIfNeeded();await photo.getByRole('button',{name:'Open image: screen.PNG',exact:true}).click();await dialog.locator('img').waitFor();await page.mouse.click(width-2,2);await dialog.waitFor({state:'detached'});
  await page.evaluate(async()=>{const m=await import('/chat-media.js');document.querySelector('#content').replaceChildren();m.collectChatMedia();m.resetChatMedia();});await page.waitForFunction(()=>mediaUrls.size===0);assert.deepEqual(errors,[]);assert(fetches.includes('/api/deliverables/movie'));cases++;await page.close();
 }
 console.log(JSON.stringify({engine,passed:true,cases}));
 }catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});

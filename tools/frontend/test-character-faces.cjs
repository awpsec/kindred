const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await context.route(origin+'/api/runs**',r=>r.fulfill({json:[]}));
  await context.route(origin+'/api/chats/dm-piper**',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper'],archived:false},messages:[]}}));
  await p.goto(origin);await p.locator('#content .empty h1').waitFor();
  await p.locator('#bot-details').click();await p.locator('.avatar-customize').hover();
  const picker=p.locator('.avatar-popover');
  assert.deepEqual(await picker.locator('.shape-option').evaluateAll(nodes=>nodes.slice(0,2).map(n=>n.title)),['round','pebble']);
  await picker.getByRole('button',{name:'triangle',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#content .empty .character')?._character.p.shape==='triangle');
  for(const [name,color] of [['Honey','#ffbe16'],['Rose','#f24d93'],['Teal','#14bfc7']]){
   await picker.getByRole('button',{name,exact:true}).click();
   await p.waitForFunction(color=>document.querySelector('#content .empty .character')?._character.p.color===color,color);
   assert.equal(await p.locator('#content .empty h1').textContent(),"Hey, I'm Piper.");
   assert.equal(await p.locator('#content .empty .character').evaluate(n=>n.style.getPropertyValue('--bot-fill')),color);
  }
  await p.screenshot({path:path.join(artifacts,engine+'-welcome-live-avatar.png')});
  const geometry=await p.evaluate(async()=>{
   const mod=await import('/characters.js'),failures=[];let checks=0;
   for(const shape of mod.shapes)for(const eyes of ['curious','wide','happy','sleepy']){
    const box=mod.character({shape,eyes},100);document.body.append(box);const c=box._character;c.gazeSeed=0;c.eyes.style.animation='none';
    for(const activity of ['idle','working']){
     mod.setActivity(box,activity,{immediate:true,startedAt:0});
     for(let time=0;time<=23000;time+=500){
      // The face intentionally passes behind the silhouette during a full turn.
      if(activity==='working'&&time>=9000&&time<=10500)continue;
      mod.renderCharacterMotion(box,time);
      for(const eye of c.eyes.children){
       const matrix=c.path.getCTM().inverse().multiply(eye.getCTM());
       const length=eye.getTotalLength();
       for(let i=0;i<20;i++){
        const point=eye.getPointAtLength(length*i/20),q=new DOMPoint(point.x,point.y).matrixTransform(matrix);
        const margin=eyes==='happy'?3:1.5;
        for(const [dx,dy] of [[0,0],[margin,0],[-margin,0],[0,margin],[0,-margin]]){
         checks++;
         if(!c.path.isPointInFill(new DOMPoint(q.x+dx,q.y+dy))&&failures.length<8)failures.push({shape,eyes,activity,time,x:q.x,y:q.y});
        }
       }
      }
     }
     const before=c.eyes.getBoundingClientRect();c.eyes.style.transform='scaleY(.08)';
     const blink=c.eyes.getBoundingClientRect();c.eyes.style.transform='';
     if(Math.abs((before.top+before.bottom-blink.top-blink.bottom)/2)>1)failures.push({shape,eyes,activity,blink:'Face moved vertically while blinking'});
    }
    box.remove();
   }
   return {checks,failures};
  });
  assert.deepEqual(geometry.failures,[],JSON.stringify(geometry.failures));
  // Circular artwork must remain circular through breathing and a complete turn.
  const silhouette=await p.evaluate(async()=>{
   const mod=await import('/characters.js'),box=mod.character({shape:'round'},100);document.body.append(box);
   const c=box._character;let maxRadiusSpread=0;
   for(const activity of ['idle','working']){
    mod.setActivity(box,activity,{immediate:true,startedAt:0});
    const breathing=c.body.getAnimations();for(const a of breathing)a.pause();
    for(let time=0;time<=18000;time+=300){
     for(const a of breathing)a.currentTime=time;mod.renderCharacterMotion(box,time);
     const matrix=c.path.getCTM(),center=new DOMPoint(50,52).matrixTransform(matrix),length=c.path.getTotalLength(),radii=[];
     for(let i=0;i<72;i++){const q=c.path.getPointAtLength(length*i/72).matrixTransform(matrix);radii.push(Math.hypot(q.x-center.x,q.y-center.y));}
     maxRadiusSpread=Math.max(maxRadiusSpread,Math.max(...radii)-Math.min(...radii));
    }
   }
   box.remove();const pebble=mod.character({shape:'pebble'},100);document.body.append(pebble);
   const bounds=pebble._character.path.getBBox(),ratio=bounds.width/bounds.height;pebble.remove();
   return {maxRadiusSpread,pebbleRatio:ratio};
  });
  assert(silhouette.maxRadiusSpread<.05,JSON.stringify(silhouette));
  assert(silhouette.pebbleRatio>1.05&&silhouette.pebbleRatio<1.16,JSON.stringify(silhouette));
  const expressions=await p.evaluate(async()=>{
   const mod=await import('/characters.js'),box=mod.character({},84);document.body.append(box);box._character.gazeSeed=0;
   const pose=time=>{mod.renderCharacterMotion(box,time);return [...box.querySelectorAll('[data-eye]')].map(n=>{const b=n.getBBox();return {width:b.width,height:b.height,d:n.getAttribute('d')};});};
   const calm=pose(0),wide=pose(4000),squint=pose(10000),question=pose(17000);
   box.dataset.botId='same-bot';const twin=mod.character({},44);twin.dataset.botId='same-bot';document.body.append(twin);
   mod.renderCharacterMotion(box,12345);mod.renderCharacterMotion(twin,12345);
   const synced=box.querySelector('[data-eye]').getAttribute('d')===twin.querySelector('[data-eye]').getAttribute('d');
   document.documentElement.dataset.motion='off';const reducedA=pose(0),reducedB=pose(17000);delete document.documentElement.dataset.motion;
   box.remove();twin.remove();return {calm,wide,squint,question,synced,reducedA,reducedB};
  });
  assert(expressions.calm.every(e=>e.width>=7&&e.height>=14),'Resting pills stay legible at chat and sidebar sizes');
  // Fuller resting pills still open noticeably into round eyes.
  assert(expressions.wide[0].width>expressions.calm[0].width*1.5);
  assert(expressions.wide[0].width/expressions.wide[0].height>.85);
  assert(expressions.squint[0].height<expressions.calm[0].height*.4);
  assert(expressions.squint[0].width/expressions.squint[0].height>2);
  assert(expressions.question[1].height>expressions.question[0].height*1.5);
  assert(expressions.synced);assert.deepEqual(expressions.reducedA,expressions.reducedB);
  assert.deepEqual(errors,[]);
  await p.goto(origin+'/fixture/site');
  await p.addStyleTag({url:origin+'/style.css'});
  await p.evaluate(async()=>{
   const mod=await import('/characters.js');document.body.replaceChildren();document.documentElement.dataset.theme='dark';
   const sheet=document.createElement('div');sheet.id='face-sheet';sheet.style.cssText='padding:32px;background:#101110;width:820px;color:#ddd;font:14px system-ui;display:grid;grid-template-columns:100px repeat(4,1fr);gap:10px;align-items:center';
   sheet.append(document.createElement('span'));for(const label of ['Look left','Center','Look down','Look right']){const n=document.createElement('span');n.textContent=label;sheet.append(n);}
   for(const shape of mod.shapes){const label=document.createElement('span');label.textContent=shape;sheet.append(label);for(const time of [4500,0,7500,11000]){const cell=document.createElement('div');cell.style.cssText='display:flex;align-items:center;gap:12px';for(const size of [44,84]){const box=mod.character({shape,color:'#ff9638'},size);box._character.gazeSeed=0;cell.append(box);sheet.append(cell);document.body.append(sheet);mod.renderCharacterMotion(box,time);box.classList.remove('animated');} } }
   // Freeze the rendered poses for a deterministic visual comparison.
   document.documentElement.dataset.motion='off';
   for(const box of sheet.querySelectorAll('.character'))box._character=null;
  });
  await p.locator('#face-sheet').screenshot({path:path.join(artifacts,engine+'-face-shapes.png')});
  for(const theme of ['dark','light']){
   await p.evaluate(async theme=>{
    const mod=await import('/characters.js');document.body.replaceChildren();document.documentElement.dataset.theme=theme;delete document.documentElement.dataset.motion;
    const sheet=document.createElement('div');sheet.id='expression-sheet';sheet.style.cssText='padding:30px;background:var(--bg);color:var(--fg);width:900px;font:14px system-ui;display:grid;grid-template-columns:90px repeat(4,1fr);gap:10px;align-items:center';document.body.append(sheet);
    sheet.append(document.createElement('span'));for(const title of ['Resting','Wide eyes','Squint','Questioning']){const label=document.createElement('span');label.textContent=title;sheet.append(label);}
    for(const shape of mod.shapes){const label=document.createElement('span');label.textContent=shape;sheet.append(label);for(const time of [0,4000,10000,17000]){const cell=document.createElement('div');cell.style.cssText='display:flex;align-items:center;gap:16px';sheet.append(cell);for(const size of [32,84]){const box=mod.character({shape,color:'#ff9638'},size);box._character.gazeSeed=0;cell.append(box);mod.renderCharacterMotion(box,time);box.classList.remove('animated');box._character=null;}}}
    document.documentElement.dataset.motion='off';
   },theme);
   await p.locator('#expression-sheet').screenshot({path:path.join(artifacts,engine+'-eye-expressions-'+theme+'.png')});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,liveWelcomeShapeAndColors:true,...geometry,...silhouette}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());

const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/fixture/site');await page.addStyleTag({url:origin+'/style.css'});
  await page.evaluate(async()=>{
   document.body.replaceChildren();document.body.style.cssText='display:flex;flex-wrap:wrap;gap:12px;padding:24px';
   window.m=await import('/characters.js');window.boxes=m.shapes.flatMap(shape=>[24,36,84].map(size=>{const b=m.character({shape},size);document.body.append(b);return b;}));
   window.delay=ms=>new Promise(r=>setTimeout(r,ms));
   window.area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0];},0))/2;
  });await page.waitForTimeout(200);
  const morphs=await page.evaluate(async()=>{
   let least=1;
   for(const action of ['terminal','hammer','saw','write','working']){
    const starts=boxes.map(b=>area(b._character.points));boxes.forEach(b=>m.setActivity(b,action));
    await delay(250);
    boxes.forEach((b,i)=>{least=Math.min(least,area(b._character.points)/starts[i]);});
    await delay(400);
    // Software WebKit can miss frames under load; timing is covered by the
    // fake-clock turn test. Here wait for the final geometry, with a deadline.
    const deadline=performance.now()+1500;
    while(boxes.some(b=>b.classList.contains('morphing')||b._character.transition||b._character.bodySettle)&&performance.now()<deadline)await delay(25);
    if(boxes.some(b=>b.classList.contains('morphing')||b._character.transition||b._character.bodySettle))throw Error('Unsettled '+action);
    if(boxes.some(b=>Number(b._character.face.style.opacity)<.99))throw Error('Invisible face after '+action);
   }
   return {least};
  });assert(morphs.least>.25,'Morphs must not collapse into slivers: '+JSON.stringify(morphs));
  const rapid=await page.evaluate(async()=>{
   const b=boxes[0];m.setActivity(b,'hammer');await delay(170);const old=b._character.points.map(p=>p.slice());
   m.setActivity(b,'terminal');const jump=Math.max(...old.flatMap((p,i)=>p.map((v,j)=>Math.abs(v-b._character.points[i][j]))));
   for(const a of ['mail','write','saw','working']){await delay(55);m.setActivity(b,a);}
   // Settling is time-based; allow for long frames on a loaded software renderer.
   const until=performance.now()+2000;await delay(650);while(b._character.transition&&performance.now()<until)await delay(50);
   return {jump,action:b.dataset.action,transition:!!b._character.transition,face:Number(b._character.face.style.opacity)};
  });assert(rapid.jump<.001);assert.equal(rapid.action,'working');assert.equal(rapid.transition,false);assert.equal(rapid.face,1);
  const turns=await page.evaluate(()=>{
   const b=boxes[0],c=b._character;c.gazeSeed=0;m.setActivity(b,'idle',{immediate:true});m.setActivity(b,'working',{immediate:true,startedAt:0});
   const pose=t=>{m.renderCharacterMotion(b,t);return [...c.eyes.children].map(e=>({opacity:Number(e.style.opacity),transform:[...['a','b','c','d','e','f']].map(k=>e.transform.baseVal.consolidate().matrix[k])}));};
   const front=pose(1000),back=pose(2325),edge=pose(1980),end=pose(4799),start=pose(4801);
   const seam=Math.max(...end.flatMap((eye,i)=>{return eye.transform.map((v,j)=>Math.abs(v-start[i].transform[j]));}));
   return {front,back,edge,end,start,seam};
  });assert(turns.front.every(e=>e.opacity>.9));assert(turns.back.every(e=>e.opacity===0));assert(turns.edge.some(e=>e.opacity<.8));assert(turns.seam<.15,'Working loop must join without a pose jump');
  // Resting eyes follow the owner's reference: high and right on the body,
  // leaning into its curve, the far eye narrower, and full pills at every size.
  const look=await page.evaluate(async()=>{
   const eyes=b=>[...b._character.eyes.children].map(e=>{
    const t=e.transform.baseVal.consolidate().matrix,box=e.getBBox();
    return {w:Math.hypot(t.a,t.b)*box.width,h:Math.hypot(t.c,t.d)*box.height,x:t.e,y:t.f,lean:Math.atan2(t.c,t.d)*180/Math.PI,opacity:Number(e.style.opacity)};
   });
   const at=(b,time)=>{b._character.gazeSeed=0;m.setActivity(b,'idle',{immediate:true});m.renderCharacterMotion(b,time);return eyes(b);};
   const round=boxes[2],home=at(round,0),tiny=boxes[0];at(tiny,0);
   const tinyHeight=Math.min(...[...tiny._character.eyes.children].map(e=>e.getBoundingClientRect().height));
   const glances=[];
   for(const b of boxes.filter((_,i)=>i%3===2))for(const time of [21500,7500,44000])for(const e of at(b,time))if(e.opacity>.9)glances.push({shape:b.dataset.shape,time,aspect:e.h/e.w});
   // Solid bodies turn with flat-colour side walls; their face hides on the back.
   const square=boxes[8],c=square._character;m.setActivity(square,'working',{immediate:true,startedAt:0});
   m.renderCharacterMotion(square,1000);const rest={walls:c.solid.style.display,turn:c.turn.getAttribute('transform')};
   m.renderCharacterMotion(square,2039);const edge={walls:c.solid.style.display,width:c.solid.getBBox().width};
   m.renderCharacterMotion(square,2325);const back=Number(c.faceClip.style.opacity);
   m.renderCharacterMotion(square,2039);m.setActivity(square,'idle');await delay(450);
   for(const until=performance.now()+2000;c.transition&&performance.now()<until;)await delay(50);
   const after={walls:c.solid.style.display,turn:c.turn.getAttribute('transform'),spin:c.spin};
   // Every other way out of a turn also leaves no side surface or transform.
   const settled=()=>({walls:c.solid.style.display,turn:c.turn.getAttribute('transform'),clip:c.faceClip.style.opacity});
   const midTurn=()=>{m.setActivity(square,'working',{immediate:true,startedAt:Date.now()-2039});m.renderCharacterMotion(square);};
   const exits={};midTurn();const during=settled();
   midTurn();m.setActivity(square,'hammer');await delay(700);
   for(const until=performance.now()+2000;c.transition&&performance.now()<until;)await delay(50);exits.tool=settled();
   midTurn();document.documentElement.dataset.motion='off';m.renderCharacterMotion(square);exits.reduced=settled();delete document.documentElement.dataset.motion;
   midTurn();m.setActivity(square,'drill',{immediate:true});exits.immediate=settled();
   midTurn();Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
   m.setActivity(square,'saw');exits.hidden=settled();delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));
   midTurn();m.arriveCharacter(square);exits.arrival=settled();await delay(1300);
   midTurn();m.departCharacter(square);await delay(1950);exits.departure=settled();
   const stretched=at(round,7750),calm=at(round,24750);
   var stretch={taller:stretched.every((e,i)=>e.h>calm[i].h*1.2),narrower:stretched.every((e,i)=>e.w<calm[i].w)};
   const worry=boxes[5];m.setActivity(worry,'worry',{immediate:true});m.renderCharacterMotion(worry);
   const browBox=worry._character.brows.getBBox(),eyeBox=worry._character.eyes.getBBox();
   const brows={above:browBox.y+browBox.height<=eyeBox.y+2,over:browBox.x<eyeBox.x+eyeBox.width&&browBox.x+browBox.width>eyeBox.x};
   return {home,tinyHeight,glances,rest,edge,back,after,exits,brows,during,stretch};
  });
  // Each body turns as its own solid, not a uniform extrusion of its outline.
  const solids=await page.evaluate(()=>{
   const at=f=>{let lo=0,hi=1;for(let i=0;i<40;i++){const x=(lo+hi)/2;if(x*x*(3-2*x)<f)lo=x;else hi=x;}return 1500+1650*(lo+hi)/2;};
   const out={};
   for(const shape of m.shapes){
    const b=m.character({shape},84);document.body.append(b);const c=b._character;m.setActivity(b,'working',{immediate:true,startedAt:0});
    const idleD=c.path.getAttribute('d'),poses={};
    for(const [name,f] of [['front',0],['diagonal',1/8],['side',1/4]]){
     m.renderCharacterMotion(b,f?at(f):1000);
     const walls=c.solid.style.display!=='none',outline=walls?c.solid.getBBox():c.path.getBBox();
     const apex=c.turn.transform.baseVal.numberOfItems?c.turn.transform.baseVal.consolidate().matrix:null;
     poses[name]={walls,width:outline.width,height:outline.height,sameOutline:c.path.getAttribute('d')===idleD,
      shaded:!!b.querySelector('.character-shade,.character-solid-shade,.character-facets'),
      sameFill:!walls||getComputedStyle(c.solid).fill===getComputedStyle(c.path).fill,
      apexX:apex?apex.a*50+apex.c*9.3+apex.e:50,
      topWidth:walls&&shape==='triangle'?(()=>{const probe=[];for(let x=0;x<=100;x+=.5)if(c.solid.isPointInFill(new DOMPoint(x,outline.y+8)))probe.push(x);return probe.length?probe[probe.length-1]-probe[0]:0;})():null};
    }
    b.remove();out[shape]=poses;
   }
   return out;
  });
  const ratio=(shape,pose)=>solids[shape][pose].width/solids[shape].front.width;
  for(const shape of ['round','drop'])assert(solids[shape].side.sameOutline&&!solids[shape].side.walls,shape+' is a surface of revolution: '+JSON.stringify(solids[shape]));
  for(const [shape,depth] of [['pebble',.74],['cloud',.8]])assert(!solids[shape].side.walls&&Math.abs(ratio(shape,'side')-depth)<.06,shape+' narrows smoothly to its depth: '+JSON.stringify(solids[shape]));
  const pill=solids.capsule.side;
  assert(!pill.walls&&Math.abs(pill.width/pill.height-1)<.04,'An end-on pill is a circle: '+JSON.stringify(solids.capsule));
  assert(solids.capsule.front.width/solids.capsule.front.height>1.6,'A front-on pill is long: '+JSON.stringify(solids.capsule));
  // A cube shows its diagonal but stays compact: never a stretched flat card.
  const diagonal=solids.square.diagonal;
  assert(diagonal.walls&&ratio('square','diagonal')>1.04&&ratio('square','diagonal')<1.14,'A turning cube widens only slightly: '+JSON.stringify(solids.square));
  assert(diagonal.width/diagonal.height<1.3,'A turning cube is not elongated: '+JSON.stringify(diagonal));
  for(const shape of ['square','triangle','hexagon'])for(const pose of Object.values(solids[shape])){
   assert(!pose.shaded&&pose.sameFill,'Turning bodies remain unshaded: '+JSON.stringify({shape,pose}));
  }
  assert(solids.square.side.walls&&Math.abs(solids.square.side.width-solids.square.front.width)<3,'A cube is as deep as it is wide: '+JSON.stringify(solids.square));
  const ballPoses=solids.hexagon;
  assert(ballPoses.front.sameOutline,'The faceted ball is the flat hexagon at rest: '+JSON.stringify(ballPoses.front));
  for(const pose of ['diagonal','side'])assert(!ballPoses[pose].walls&&ratio('hexagon',pose)>.94,'The six-sided bot keeps its volume through the turn: '+JSON.stringify(ballPoses));
  // A mid-turn tool handoff reshapes the rendered outline continuously rather than holding the ball.
  const handoff=await page.evaluate(async()=>{
   const b=m.character({shape:'hexagon'},84);document.body.append(b);const c=b._character;await delay(100);
   m.setActivity(b,'working',{immediate:true,startedAt:Date.now()-2039});
   let prev=null,last=0,maxJump=0,excess=0;const t0=performance.now();
   await new Promise(done=>{let switched=false;const f=()=>{const now=performance.now()-t0;if(!switched&&now>100){switched=true;m.setActivity(b,'hammer');}
    // Judge change per frame against that frame's duration: a snap is a large
    // change in one short frame, while slow renderers merely take longer steps.
    const box=c.path.getBBox(),v=[box.x,box.y,box.width,box.height];
    if(prev){const jump=Math.max(...v.map((x,i)=>Math.abs(x-prev[i])));maxJump=Math.max(maxJump,jump);excess=Math.max(excess,jump-Math.max(2,.12*(now-last)));}
    prev=v;last=now;
    if(now<1100||c.transition)requestAnimationFrame(f);else done();};requestAnimationFrame(f);});
   const result={maxJump,excess};b.remove();return result;
  });
  assert(handoff.excess<=0,'Ball to tool handoff reshapes without a snap: '+JSON.stringify(handoff));
  for(const pose of ['diagonal','side']){
   const pyramid=solids.triangle[pose];
   assert(pyramid.walls&&Math.abs(pyramid.apexX-50)<.01,'Pyramid faces converge on one apex: '+JSON.stringify(solids.triangle));
   assert(pyramid.topWidth<pyramid.width*.25,'A pyramid keeps its point: '+JSON.stringify(solids.triangle));
  }
  const [near,far]=look.home;
  assert(look.home.every(e=>e.x>52&&e.y<44),'Resting eyes sit high and right: '+JSON.stringify(look.home));
  assert(look.home.every(e=>e.lean>12&&e.lean<40),'Resting eyes lean into the curve: '+JSON.stringify(look.home));
  assert(far.w/near.w>.55&&far.w/near.w<.95,'The far eye is foreshortened: '+JSON.stringify(look.home));
  assert(look.home.every(e=>e.h>=.17*84),'Resting pills are readable: '+JSON.stringify(look.home));
  assert(look.tinyHeight>=3,'24px eyes stay legible: '+look.tinyHeight);
  assert(look.glances.length>=40&&look.glances.every(g=>g.aspect>=1.5),'Glances keep full pills: '+JSON.stringify(look.glances.filter(g=>g.aspect<1.5)));
  assert.deepEqual(look.rest,{walls:'none',turn:null});
  assert(look.edge.walls===''&&look.edge.width>=28,'Edge-on solids keep their depth: '+JSON.stringify(look.edge));
  assert.equal(look.back,0);assert.deepEqual(look.after,{walls:'none',turn:null,spin:0});
  assert.equal(look.during.walls,'','Exit checks start mid-turn');assert.notEqual(look.during.turn,null);
  for(const [exit,state] of Object.entries(look.exits))assert.deepEqual(state,{walls:'none',turn:null,clip:''},'Turn left residue after '+exit);
  assert.deepEqual(look.brows,{above:true,over:true},'Worried brows follow the projected eyes');
  assert.deepEqual(look.stretch,{taller:true,narrower:true},'The long-pill stretch is distinct');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  assert(await page.evaluate(()=>{boxes.forEach(b=>m.setActivity(b,'drill'));return boxes.every(b=>!b._character.transition&&!b.classList.contains('morphing'));}));
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches);
  const cleanup=await page.evaluate(async()=>{
   boxes.forEach(b=>m.setActivity(b,'terminal'));await delay(80);document.documentElement.dataset.motion='off';await delay(40);
   const reduced=boxes.every(b=>!b._character.transition&&!b.classList.contains('morphing'));delete document.documentElement.dataset.motion;await delay(50);
   boxes.forEach(b=>m.setActivity(b,'saw'));await delay(80);
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
   const hidden=boxes.every(b=>!b._character.transition&&!b.classList.contains('morphing'));delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));
   const b=boxes[0];m.setActivity(b,'hammer');b.remove();await delay(50);return {reduced,hidden,detached:!b._character.transition};
  });assert.deepEqual(cleanup,{reduced:true,hidden:true,detached:true});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?"webkit":"chromium",morphs,rapid,cleanup,resting:look.home,tinyHeight:look.tinyHeight,glances:look.glances.length,edge:look.edge,solids}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

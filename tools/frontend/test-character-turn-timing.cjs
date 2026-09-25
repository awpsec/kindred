// Working-turn pacing: frames are driven by Playwright's fake clock, so every
// sample is deterministic. The turn must never race (the old gain ramp spun a
// full turn in 450 ms), jump after a pause, or reverse; an unfinished turn
// finishes at its own pace without holding back the next state.
// KINDRED_CHARACTER_SOURCE=<file> serves another characters.js, e.g. to show
// these checks failing on an earlier revision.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
const TAU=Math.PI*2,NATURAL=1.5*TAU/1.65,LIMIT=NATURAL*1.05;
const wrap=d=>((d+Math.PI)%TAU+TAU)%TAU-Math.PI;
const speeds=samples=>samples.slice(1).map((s,i)=>Math.abs(wrap(s.spin-samples[i].spin))/Math.max(.001,(s.t-samples[i].t)/1000));
const maxSpeed=samples=>Math.max(0,...speeds(samples));
const maxStep=samples=>Math.max(0,...samples.slice(1).map((s,i)=>Math.abs(wrap(s.spin-samples[i].spin))));
const turning=s=>{const a=((s.spin%TAU)+TAU)%TAU;return a>.01&&a<TAU-.01;};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:900,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(process.env.KINDRED_CHARACTER_SOURCE)await page.route(origin+'/characters.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.KINDRED_CHARACTER_SOURCE,'utf8')}));
  await page.clock.install({time:Date.parse('2026-09-25T12:00:00Z')});
  await page.goto(origin+'/fixture/site');await page.addStyleTag({url:origin+'/style.css'});
  // Time moves only when a check advances it.
  await page.clock.pauseAt(Date.parse('2026-09-25T12:00:10Z'));
  await page.evaluate(async()=>{
   document.body.replaceChildren();document.body.style.cssText='display:flex;flex-wrap:wrap;gap:12px;padding:24px';
   window.m=await import('/characters.js');
   window.make=(shape='round',botId)=>{const b=m.character({shape},84);if(botId)b.dataset.botId=botId;b._character.gazeSeed=0;document.body.append(b);return b;};
   window.hide=hidden=>{if(hidden)Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});else delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));};
   // Samples every visible animation frame, after the characters have drawn it.
   window.record=boxes=>{
    const out=boxes.map(()=>[]);let on=true;
    const f=()=>{if(!on)return;const t=Date.now();if(!document.hidden)boxes.forEach((b,i)=>{const c=b._character;out[i].push({t,spin:c.spin,transition:!!c.transition,morphing:b.classList.contains('morphing'),action:b.dataset.action,opacity:b.style.opacity===''?1:Number(b.style.opacity),walls:c.solid.style.display,turn:c.turn.getAttribute('transform')});});requestAnimationFrame(f);};
    requestAnimationFrame(f);window.stop=()=>{on=false;boxes.forEach(b=>b.remove());return out;};
   };
  });
  // Boxes must be seen by the intersection observer before frames render them.
  // Polled on real time: the page's own timers and frames are faked.
  const visible=async()=>{for(let i=0;i<200;i++){if(await page.evaluate(()=>[...document.querySelectorAll('.character')].every(b=>b._character?.motionVisible)))return;await new Promise(r=>setTimeout(r,20));}throw Error('Characters never became visible');};
  const collect=async ms=>{await page.clock.runFor(ms);return page.evaluate(()=>stop());};
  const results={};

  // 1. Entering working at a post-turn phase from a tool: the old code spun a
  // full turn in 450 ms as the gain ramped. Now it waits for the next turn,
  // which stays on the shared timeline, so a late-created twin agrees exactly.
  for(const shape of ['round','square','capsule','triangle']){
   await page.evaluate(shape=>{
    const b=make(shape,'bot-'+shape),startedAt=Date.now()-3500;m.setActivity(b,'hammer',{immediate:true});
    window.pending={b,startedAt};
   },shape);
   await visible();
   const t0=await page.evaluate(()=>{const {b,startedAt}=pending;m.setActivity(b,'working',{startedAt});
    const twin=make(b.dataset.shape,b.dataset.botId);m.setActivity(twin,'working',{immediate:true,startedAt});twin._character.motionVisible=true;twin._character.motionSeen=true;
    record([b,twin]);return Date.now();});
   const [a,twin]=await collect(7000);
   const first=a.find(turning);
   assert(maxSpeed(a)<=LIMIT,`${shape}: animated entry must not race: ${maxSpeed(a).toFixed(2)} rad/s (natural ${NATURAL.toFixed(2)})`);
   assert(first,`${shape}: the next turn still plays`);
   assert(Math.abs(first.t-t0-2850)<=40,`${shape}: waits for the next timeline turn, not a restart: ${first.t-t0} ms`);
   assert(a.some(s=>Math.abs(s.spin-Math.PI)<.4),`${shape}: the turn runs through its back`);
   const shared=a.map((s,i)=>turning(s)?Math.abs(wrap(s.spin-twin[i].spin)):0);
   assert(Math.max(...shared)<1e-6,`${shape}: sidebar and chat copies turn together`);
   results['entry-'+shape]={maxSpeed:+maxSpeed(a).toFixed(3),firstTurnMs:first.t-t0};
  }
  // (A turn first reads as turning ~50 ms after it starts.)
  // Entering mid-turn waits for the whole next turn instead of joining partway.
  {
   await page.evaluate(()=>{const b=make('square');m.setActivity(b,'hammer',{immediate:true});window.pending=b;});await visible();
   const t0=await page.evaluate(()=>{m.setActivity(pending,'working',{startedAt:Date.now()-2300});record([pending]);return Date.now();});
   const [a]=await collect(6000),first=a.find(turning);
   assert(maxSpeed(a)<=LIMIT&&first&&Math.abs(first.t-t0-4050)<=40,'Mid-turn entry waits for the next turn: '+JSON.stringify({speed:maxSpeed(a),first:first&&first.t-t0}));
   results.midTurnEntry={maxSpeed:+maxSpeed(a).toFixed(3),firstTurnMs:first.t-t0};
  }

  // 2. Leaving mid-turn: the turn completes forward at its natural pace while
  // the tool's own pose and loop begin on time.
  {
   await page.evaluate(()=>{const b=make('square');m.setActivity(b,'working',{immediate:true,startedAt:Date.now()-2039});window.pending=b;});await visible();
   await page.clock.runFor(32);
   const start=await page.evaluate(()=>{const b=pending,from=b._character.spin;m.setActivity(b,'hammer');record([b]);return {from,action:b.dataset.action,t:Date.now()};});
   const [a]=await collect(2000),live=a.filter(s=>s.transition);
   const back=live.slice(1).some((s,i)=>s.spin<live[i].spin-1e-9),done=a.find(s=>!s.transition),morphed=a.find(s=>!s.morphing);
   assert.equal(start.action,'hammer','The new state is shown at once');
   assert(!back&&maxSpeed(live)<=LIMIT,'An interrupted turn finishes forward at natural speed: '+maxSpeed(live));
   assert(morphed.t-start.t<=560,'The tool loop is not held back by the turn: '+(morphed.t-start.t));
   const expected=(1-.327)*1650;
   assert(done&&Math.abs(done.t-start.t-expected)<=80&&done.spin===0&&done.walls==='none'&&done.turn===null,'The turn settles on its own schedule: '+JSON.stringify({done,expected}));
   results.exitForward={from:+start.from.toFixed(3),maxSpeed:+maxSpeed(live).toFixed(3),toolLoopMs:morphed.t-start.t,settledMs:done.t-start.t};
  }
  // A turn that has only just begun eases back rather than whipping round.
  {
   await page.evaluate(()=>{const b=make('square');m.setActivity(b,'working',{immediate:true,startedAt:Date.now()-1600});window.pending=b;});await visible();
   await page.clock.runFor(16);
   const from=await page.evaluate(()=>{const b=pending,from=b._character.spin;m.setActivity(b,'idle');record([b]);return from;});
   const [a]=await collect(900),done=a.find(s=>!s.transition);
   assert(from>0&&from<TAU/12,'Precondition: the turn has just begun '+from);
   assert(a.every(s=>s.spin<=from+1e-9)&&done&&done.spin===0,'A barely begun turn eases back');
   results.exitBack={from:+from.toFixed(4),settledMs:done.t-a[0].t};
  }
  // Retargeting again while the turn is settling keeps the same pace.
  {
   await page.evaluate(()=>{const b=make('round');m.setActivity(b,'working',{immediate:true,startedAt:Date.now()-2200});window.pending=b;});await visible();
   await page.clock.runFor(16);
   await page.evaluate(()=>{m.setActivity(pending,'hammer');record([pending]);});
   await page.clock.runFor(200);await page.evaluate(()=>m.setActivity(pending,'terminal'));
   await page.clock.runFor(200);await page.evaluate(()=>m.setActivity(pending,'working'));
   const [a]=await collect(6000);
   assert(maxSpeed(a)<=LIMIT,'Rapid retargets never race the turn: '+maxSpeed(a));
   results.retarget={maxSpeed:+maxSpeed(a).toFixed(3)};
  }

  // 3. A hidden tab resumes a turn from the pose it left.
  {
   await page.evaluate(()=>{const b=make('capsule');m.setActivity(b,'working',{immediate:true,startedAt:Date.now()-2200});window.pending=b;record([b]);});await visible();
   await page.clock.runFor(100);await page.evaluate(()=>hide(true));await page.clock.runFor(5000);await page.evaluate(()=>hide(false));
   const [a]=await collect(3000),gap=a.findIndex((s,i)=>i&&s.t-a[i-1].t>1000);
   assert(gap>0,'Frames paused while hidden');
   assert(Math.abs(wrap(a[gap].spin-a[gap-1].spin))<=NATURAL*.12&&maxSpeed(a.slice(gap))<=LIMIT,'Resume continues the turn: '+JSON.stringify({step:wrap(a[gap].spin-a[gap-1].spin),speed:maxSpeed(a.slice(gap)),around:a.slice(gap-1,gap+4).map(s=>[s.t-a[gap-1].t,+s.spin.toFixed(3)])}));
   results.resumeMidTurn={before:+a[gap-1].spin.toFixed(3),after:+a[gap].spin.toFixed(3)};
  }
  // Resuming at rest, while the timeline is mid-turn, waits for the next turn.
  {
   await page.evaluate(()=>{const b=make('square');m.setActivity(b,'working',{immediate:true,startedAt:Date.now()-500});window.pending=b;record([b]);});await visible();
   const t0=await page.evaluate(()=>Date.now());
   await page.clock.runFor(100);await page.evaluate(()=>hide(true));await page.clock.runFor(1500);await page.evaluate(()=>hide(false));
   const [a]=await collect(6000),after=a.filter(s=>s.t>t0+1600),held=after.filter(s=>s.t<t0+2650);
   assert(held.length&&held.every(s=>!turning(s)),'No jump into a turn already underway');
   assert(after.some(s=>Math.abs(s.spin-Math.PI)<.4)&&maxSpeed(a)<=LIMIT,'The next turn plays at natural speed');
   results.resumeAtRest={maxSpeed:+maxSpeed(a).toFixed(3)};
  }
  // A throttled or sleeping window (no visibility event) never fast-forwards.
  {
   await page.evaluate(()=>{const b=make('triangle');m.setActivity(b,'working',{immediate:true,startedAt:Date.now()-2100});window.pending=b;record([b]);});await visible();
   await page.clock.runFor(100);await page.clock.fastForward(3000);
   const [a]=await collect(3000);
   assert(maxStep(a)<=NATURAL*.02&&maxSpeed(a.filter((s,i)=>i&&s.t-a[i-1].t<100))<=LIMIT,'A frame gap does not jump the turn: '+maxStep(a));
   results.throttled={maxStep:+maxStep(a).toFixed(3)};
  }

  // 4. Departure: a turn underway finishes at its own pace as the body folds,
  // no new turn starts that could not finish, and nothing is left behind.
  {
   await page.evaluate(()=>{const b=make('square');m.setActivity(b,'working',{immediate:true,startedAt:Date.now()-2039});window.pending=b;});await visible();
   await page.clock.runFor(16);
   await page.evaluate(()=>{const b=pending;record([b]);m.departCharacter(b);window.departed=b;});
   await page.clock.runFor(2000);
   const residue=await page.evaluate(()=>({walls:departed._character.solid.style.display,turn:departed._character.turn.getAttribute('transform')}));
   const [a]=await page.evaluate(()=>stop()),shown=a.filter(s=>s.opacity>.05);
   assert(maxSpeed(shown)<=LIMIT,'Departure does not snap the turn home: '+maxSpeed(shown));
   assert.deepEqual(residue,{walls:'none',turn:null});
   results.departure={maxSpeed:+maxSpeed(shown).toFixed(3)};
  }
  {
   await page.evaluate(()=>{const b=make('square');m.setActivity(b,'working',{immediate:true,startedAt:Date.now()-1000});window.pending=b;});await visible();
   await page.clock.runFor(16);await page.evaluate(()=>{record([pending]);m.departCharacter(pending);});
   const [a]=await collect(2000);
   assert(a.every(s=>!turning(s)),'A turn that cannot finish before departure does not start');
  }

  // 5. Reduced motion holds still and switches states immediately.
  {
   await page.evaluate(()=>{document.documentElement.dataset.motion='off';const b=make('square');m.setActivity(b,'working',{immediate:true,startedAt:Date.now()-2200});window.pending=b;record([b]);});
   await page.clock.runFor(1000);
   const switched=await page.evaluate(()=>{m.setActivity(pending,'hammer');return !pending._character.transition&&!pending.classList.contains('morphing')&&pending._character.spin===0;});
   const [a]=await collect(500);await page.evaluate(()=>{delete document.documentElement.dataset.motion;});
   assert(a.every(s=>s.spin===0)&&switched,'Reduced motion never turns');
  }

  // 6. Pose sampling at explicit times is unchanged: immediate states show the
  // shared timeline directly, and the loop seam joins.
  const sampled=await page.evaluate(()=>{
   const b=make('round');m.setActivity(b,'working',{immediate:true,startedAt:0});
   const at=t=>(m.renderCharacterMotion(b,t),b._character.spin),out={rest:at(1000),mid:at(2325),end:at(4799),next:at(4801)};b.remove();return out;
  });
  assert(sampled.rest===0&&Math.abs(sampled.mid-Math.PI)<.05&&Math.abs(wrap(sampled.end-sampled.next))<.01,'Explicit pose sampling: '+JSON.stringify(sampled));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,natural:+NATURAL.toFixed(3),results}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

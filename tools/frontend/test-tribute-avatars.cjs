const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.goto(origin);await p.locator('#bot-details').waitFor();
  const checks=await p.evaluate(async()=>{
   const m=await import('/characters.js'),{tributeIdentity}=await import('/tributes.js');
   const profiles=[{name:'Oliver',shape:'pebble',color:'#ffbe16'},{name:'Vivienne',shape:'triangle',color:'#2ec767'}],result=[];
   for(const [i,profile] of profiles.entries()){
    const kind=i?'vivienne':'oliver';
    for(const patch of [{},{name:'  '+profile.name.toUpperCase()+'  '},{color:i?'#91C18F':'#DFC174'}])if(tributeIdentity({...profile,...patch})!==kind)throw Error('Matching name, shape and color');
    for(const patch of [{name:'Someone else'},{shape:'round'},{color:'#2475ff'}])if(tributeIdentity({...profile,...patch}))throw Error('All three trigger fields are required');
    const box=m.character(profile,100);document.body.append(box);box.dataset.botId='test-'+kind;
    const geometry=()=>[...box.querySelectorAll('path')].map(n=>n.getAttribute('d')).join('|');
    const initial=geometry();
    const states={rest:'rest',sleep:'rest',idle:'idle',success:'idle',waiting:'idle',worry:'idle',working:'working',think:'working',terminal:'working',hammer:'working',saw:'working',drill:'working',wrench:'working',read:'working',mail:'working',plane:'working',investigate:'working',write:'working',clock:'working'};
    for(const [action,expected] of Object.entries(states)){
     m.setActivity(box,action);
     for(const time of [0,450,9750,11000]){
      m.renderCharacterMotion(box,time);
      if(box.dataset.action!==expected||geometry()!==initial||box.classList.contains('morphing'))throw Error('Tribute entered tool animation: '+action);
     }
    }
    m.setActivity(box,'working');m.renderCharacterMotion(box,1200);const pose=box.innerHTML;
    m.setActivity(box,'terminal');m.renderCharacterMotion(box,1200);if(pose!==box.innerHTML)throw Error('Working phase restarted on tool switch');
    if(i===0){
     if(!box.querySelector('.freckle'))throw Error('Oliver lost his freckle');
     m.setActivity(box,'rest');if(box.querySelector('.tribute-rest-eyes').getAttribute('display')==='none')throw Error('Rest eyes');
     if(box.querySelector('.tribute-pant').getAttribute('display')!=='none')throw Error('Pant hidden at rest');
    }else{
     const pot=box.querySelector('[data-tribute-art]').lastElementChild;
     if(pot.closest('.tree'))throw Error('Pot moved with canopy');
     m.setActivity(box,'rest');m.renderCharacterMotion(box,0);const before=box.innerHTML;m.renderCharacterMotion(box,12000);if(box.innerHTML!==before)throw Error('Resting tree moved');
    }
    m.setActivity(box,'working');document.documentElement.dataset.motion='off';
    m.renderCharacterMotion(box,0);const still=box.innerHTML;m.renderCharacterMotion(box,9876);if(box.innerHTML!==still)throw Error('Reduced motion moved');
    m.revealCharacter(box);if(box.dataset.revealing)throw Error('Reduced motion reveal');delete document.documentElement.dataset.motion;
    m.arriveCharacter(box);const start=box._character.revealAt;
    m.renderCharacterMotion(box,start+100);if(box.querySelector('[data-tribute-original]').getAttribute('display')==='none')throw Error('Missing original shape');
    m.renderCharacterMotion(box,start+240);if(!box._character.reveal.getAttribute('transform').includes('scale(0.1)'))throw Error('Swap must occur at smallest point');
    if(box.querySelector('[data-tribute-art]').getAttribute('display')==='none')throw Error('Reveal did not swap to portrait');
    m.renderCharacterMotion(box,start+600);if(box.dataset.revealing||box._character.reveal.getAttribute('transform'))throw Error('Reveal failed to settle');
    m.arriveCharacter(box);if(box.dataset.revealing)throw Error('Repeated reveal');
    m.departCharacter(box);if(box.dataset.action!=='idle'||geometry()!==initial)throw Error('Generic departure altered tribute');
    box.remove();
    const staticBox=m.character({...profile,animated:false},44);document.body.append(staticBox);m.setActivity(staticBox,'working');m.renderCharacterMotion(staticBox,0);const a=staticBox.innerHTML;m.renderCharacterMotion(staticBox,2000);if(staticBox.innerHTML!==a)throw Error('Static avatar moved');staticBox.remove();
    result.push({kind,states:Object.keys(states).length});
   }
   const host=document.createElement('div');document.body.append(host);
   m.replaceCharacter(host,{...profiles[0],name:'Draft'},100);const discovered=m.replaceCharacter(host,profiles[0],100);
   if(!discovered.dataset.revealing)throw Error('Changing identity must reveal');
   if(m.replaceCharacter(host,profiles[0],100)!==discovered)throw Error('Unchanged preview restarted');
   if(m.replaceCharacter(host,{...profiles[0],name:'Other'},100).dataset.tribute)throw Error('Renaming away did not restore ordinary avatar');host.remove();
   return result;
  });
  // Exercise the actual create dialog: name + shape + color, in either order.
  await p.locator('#new-bot').click();await p.locator('#new-menu').getByRole('button',{name:'New bot',exact:true}).click();
  await p.locator('#bot-form input[name="name"]').fill('Oliver');
  await p.locator('#new-avatar-button').click();
  await p.locator('#shape-options button[title="pebble"]').click();
  await p.locator('#color-options button[title="Honey"]').click();
  await p.locator('#avatar-preview [data-tribute="oliver"]').waitFor();
  await p.locator('#save-avatar').click();
  await p.locator('#new-avatar-button [data-tribute="oliver"]').waitFor();
  await p.locator('#bot-form input[name="name"]').fill('Different');
  assert.equal(await p.locator('#new-avatar-button [data-tribute]').count(),0);
  await p.locator('#bot-form input[name="name"]').fill('Oliver');
  await p.locator('#new-avatar-button [data-tribute="oliver"]').waitFor();
  await p.waitForTimeout(650);
  await p.screenshot({path:path.join(artifacts,engine+'-tribute-create.png')});
  await p.locator('[data-close="bot-dialog"]').click();
  // Saved identity flows through ordinary API refreshes and the real picker.
  const saved=(await(await p.request.get(origin+'/api/bots')).json())[0];
  saved.name='Oliver';saved.profile={...saved.profile,shape:'round',color:'#ffbe16'};
  await p.request.put(origin+'/api/bots/piper',{data:saved});await p.reload();
  await p.locator('#bot-details').click();await p.locator('.avatar-customize').hover();
  await p.locator('.avatar-popover').getByRole('button',{name:'pebble',exact:true}).click();
  await p.locator('#bots .character[data-tribute="oliver"]').waitFor();
  await p.locator('.avatar-customize .character[data-tribute="oliver"]').waitFor();
  await p.reload();await p.locator('#bots .character[data-tribute="oliver"]').waitFor();
  assert.equal(await p.locator('#bots .character[data-revealing]').count(),0,'Reload must not replay the discovery');
  await p.locator('#bot-details').click();await p.locator('.avatar-customize').hover();
  await p.locator('.avatar-popover').getByRole('button',{name:'round',exact:true}).click();
  await p.waitForFunction(()=>!document.querySelector('#bots .character[data-tribute]'));
  assert.deepEqual(errors,[]);
  await p.goto(origin+'/fixture/site');await p.addStyleTag({url:origin+'/style.css'});
  await p.evaluate(async()=>{
   const m=await import('/characters.js');document.body.replaceChildren();
   document.body.style.cssText='height:auto;overflow:auto;display:block;padding:24px';
   const sheet=document.createElement('div');sheet.id='tribute-sheet';sheet.style.cssText='display:grid;grid-template-columns:repeat(3,220px);gap:28px;background:var(--bg);padding:24px;color:var(--fg);width:max-content';document.body.append(sheet);
   for(const name of ['Oliver','Vivienne'])for(const state of ['idle','rest','working']){
    const cell=document.createElement('div');cell.style.textAlign='center';const p={name,shape:name==='Oliver'?'pebble':'triangle',color:name==='Oliver'?'#ffbe16':'#2ec767'};
    const large=m.character(p,150);cell.append(large);m.setActivity(large,state);m.renderCharacterMotion(large,1120);
    const label=document.createElement('div');label.textContent=name+' · '+state;cell.append(label);const small=m.character(p,32);cell.append(small);m.setActivity(small,state);m.renderCharacterMotion(small,1120);sheet.append(cell);
    large._character=null;small._character=null;
   }
  });
  for(const theme of ['dark','light']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.locator('#tribute-sheet').screenshot({path:path.join(artifacts,engine+'-tribute-states-'+theme+'.png')});}
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,checks,createDialog:true,reveal:true,reducedMotion:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1)});

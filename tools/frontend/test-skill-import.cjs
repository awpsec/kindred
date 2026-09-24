const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,args:['--no-sandbox']});
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-import-')),folder=path.join(temp,'.claude'),skill=path.join(folder,'skills','vulntracker');
 fs.mkdirSync(path.join(skill,'scripts'),{recursive:true});fs.mkdirSync(path.join(folder,'commands'),{recursive:true});
 fs.writeFileSync(path.join(skill,'SKILL.md'),'---\nname: vulntracker\ndescription: Generate a tracker\n---\nRead $ARGUMENTS and run scripts/tracker.py.');fs.writeFileSync(path.join(skill,'scripts','tracker.py'),"print('fixture only')");fs.writeFileSync(path.join(folder,'commands','review.md'),'Review the supplied report.');fs.writeFileSync(path.join(folder,'CLAUDE.md'),'Not a slash command.');
 try {
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage();p.setDefaultTimeout(10000);const errors=[],imports=[],previews=[],sends=[],edits=[];p.on('pageerror',e=>errors.push(e.message));
  let skills=[],messages=[{seq:1,sender:'user',kind:'message',text:'/plain-this-is-not-a-command',created:1}];
  const commands=()=>[{name:'skills',description:'Open library',parameters:[],source:'built-in',action:'library',usage:'/skills'},...skills.map(s=>({name:s.command,skill_name:s.name,description:s.description,parameters:s.parameters,source:'Workspace import',action:'run',usage:'/'+s.command+' [arguments]'}))];
  await context.route(origin+'/**',async route=>{
   const req=route.request(),u=new URL(req.url()),name=u.pathname,method=req.method(),send=json=>route.fulfill({json});
   if(name==='/identity/meta')return send({profiles:false});if(name==='/api/composio')return send({accounts:[],toolkits:[]});
   if(name==='/api/commands')return send(commands());if(name==='/api/skills'){if(method==='POST'){const body=req.postDataJSON();edits.push(body);const skill=skills.find(s=>s.name===body.name);Object.assign(skill,body);skill.import.argument_index=body.argument_index??skill.import.argument_index;return send(skill);}return send(skills);}
   if(name==='/api/skills/import'){
    const body=req.postDataJSON(),pkg=body.package;assert(pkg.files[pkg.entry]);const hash=crypto.createHash('sha256').update(JSON.stringify(pkg)).digest('hex');
    const preview={name:body.name||pkg.name,command:body.command||pkg.name,body:Buffer.from(pkg.files[pkg.entry],'base64').toString(),description:'Imported workflow',files:Object.keys(pkg.files),import:{source:pkg.source,hash,files:Object.keys(pkg.files).length,bytes:1000,warnings:pkg.name==='vulntracker'?['Needs the normal bot tools to run its script.']:[],argument_hint:'[export] [client]',argument_index:0},existing:false};
    if(body.action==='preview'){previews.push(body);return send(preview);}
    assert.equal(body.expected_hash,hash);imports.push(body);skills.push({...preview,parameters:[{name:'export',required:true,rest:false},{name:'client',required:true,rest:false},{name:'arguments',required:false,rest:true}]});return send({...preview,status:'imported'});
   }
   if(name==='/api/chats/dm-piper/messages'&&method==='POST'){
    const body=req.postDataJSON();sends.push(body);messages.push({seq:messages.length+1,sender:'user',kind:'message',text:body.prompt,created:messages.length+1,command:{command:'vulntracker',source:'Workspace import',hash:'fixture'}});return send({runs:['import-run']});
   }
   if(name==='/api/chats/dm-piper')return send({chat:{id:'dm-piper',name:'Piper',members:['piper'],archived:false},messages,page:{has_before:false,has_after:false,first:1,last:messages.length}});
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#app').waitFor({state:'visible'});
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();assert.equal(await p.locator('.message-command-badge').count(),0);
  const editor=p.locator('#prompt');await editor.fill('/skills ');await editor.press('Enter');await p.getByRole('button',{name:'Import workflows',exact:true}).click();
  const dialog=p.locator('.skill-import-dialog');await dialog.locator('input[webkitdirectory]').setInputFiles(folder);
  await dialog.getByText('2 workflows ready to review.',{exact:false}).waitFor();assert.equal(previews.length,2);assert.equal(imports.length,0);
  const packageValue=previews.find(p=>p.package.name==='vulntracker').package;assert.deepEqual(Object.keys(packageValue.files).sort(),['SKILL.md','scripts/tracker.py']);assert(!previews.some(p=>p.package.entry==='CLAUDE.md'));
  const cards=dialog.locator('.skill-import-card');await cards.filter({hasText:'vulntracker'}).locator('summary').click();await p.screenshot({path:path.join(artifacts,'skill-import-'+engine+'-review.png')});
  await dialog.getByRole('button',{name:'Import selected',exact:true}).click();await dialog.getByText('2 selected workflows imported or already current.',{exact:false}).waitFor();assert.equal(imports.length,2);assert.equal(sends.length,0);
  await dialog.locator('.dialog-actions').getByRole('button',{name:'Close',exact:true}).click();
  // Imported indexing is explicit and editable; saving it keeps inferred parameters automatic.
  for(const value of ['1','0']){
   await p.locator('#settings-dialog .skill-row').filter({hasText:'vulntracker'}).getByRole('button',{name:'Edit vulntracker',exact:true}).click();
   const edit=p.locator('.skill-dialog');assert.equal(await edit.getByLabel('Positional arguments').inputValue(),value==='1'?'0':'1');
   assert.equal(await edit.getByLabel('Parameters',{exact:true}).inputValue(),'export client [arguments...]');
   await edit.getByLabel('Positional arguments').selectOption(value);await edit.getByRole('button',{name:'Save changes',exact:true}).click();await edit.waitFor({state:'hidden'});
   assert.equal(edits.at(-1).argument_index,Number(value));assert.equal(edits.at(-1).parameters,undefined);
  }
  await p.locator('#settings-close').click();
  await editor.click();await editor.press('ControlOrMeta+A');await editor.press('Backspace');await editor.pressSequentially('/vuln');const menu=p.locator('#command-options');await menu.getByRole('option').filter({hasText:'/vulntracker'}).waitFor();assert(await menu.getByText('Workspace import',{exact:true}).isVisible());await p.screenshot({path:path.join(artifacts,'skill-import-'+engine+'-menu.png')});
  await editor.press('Enter');await editor.fill('/vulntracker "scan export.nessus" Example');await editor.press('Enter');await p.locator('.message-command-badge').waitFor();assert.equal(await p.locator('.message-command-badge').textContent(),'/vulntracker');assert.equal(sends[0].prompt,'/vulntracker "scan export.nessus" Example');
  await p.screenshot({path:path.join(artifacts,'skill-import-'+engine+'-badge.png')});
  await p.setViewportSize({width:390,height:844});await editor.fill('/skills ');await editor.press('Enter');await p.getByRole('button',{name:'Import workflows',exact:true}).click();await p.locator('.skill-import-dialog').waitFor();await p.locator('.skill-import-dialog').evaluate(async n=>await Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{}))));let bounds=await p.locator('.skill-import-dialog').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391);await p.screenshot({path:path.join(artifacts,'skill-import-'+engine+'-mobile.png')});
  await p.evaluate(()=>document.documentElement.dataset.theme='light');await p.screenshot({path:path.join(artifacts,'skill-import-'+engine+'-light.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,folderDiscovery:true,supportingFiles:true,reviewBeforeImport:true,sharedCatalogue:true,autocomplete:true,receiptBadge:true,noFalseBadge:true,editableIndexing:true,namedInputs:true,errors}));
 } finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

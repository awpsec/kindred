const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true,args:process.env.WEBKIT?[]:['--no-sandbox']});
 try{
 const p=await browser.newPage({viewport:{width:1100,height:760}}),errors=[],uploads=[];p.on('pageerror',e=>errors.push(e.message));
 let settings={name:'Alex',identity:'',theme:'dark',approval_mode:'ask',separate_bot_chats:true};
 const bots=['Piper','Scratch','Atlas'].map((name,i)=>({id:'b'+i,name,provider:'codex',profile:{shape:'round',color:['#ffc900','#7956ff','#ff684d'][i]}}));
 const chats=[...bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false})),{id:'team-work',name:'Piper, Scratch',members:['b0','b1'],bot_only:true,archived:false},{id:'team-general',name:'Team General',members:['b0','b1','b2'],bot_only:false,archived:false}];
 await p.route(origin+'/api/**',async route=>{const req=route.request(),name=new URL(req.url()).pathname.slice(4),body=req.method()==='GET'?null:req.postDataJSON(),send=json=>route.fulfill({json});
 if(name==='/settings'){if(body)settings={...settings,...body};return send(settings);}
 if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);if(name==='/runs')return send([]);if(name==='/activity')return send({});
 if(name==='/uploads'){uploads.push(body);return send({id:'file-'+uploads.length,name:body.name,size:5});}
 if(name.startsWith('/uploads/'))return send({ok:true});
 const match=name.match(/^\/chats\/([^/]+)$/);if(match)return send({chat:chats.find(c=>c.id===match[1]),messages:[],page:{has_before:false,has_after:false}});
 return route.continue();});
 await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
 const section=p.locator('.bot-chat-section');await section.waitFor();assert.equal(await section.evaluate(n=>n.open),false);await section.locator('summary').click();await section.getByRole('button',{name:'#ochrane-scratch',exact:true}).click();
 assert.equal(await p.locator('.participant-stack-header .participant-user').count(),0);
 await p.locator('#bots').getByRole('button',{name:'#team-general',exact:true}).click();assert.equal(await p.locator('.participant-stack-header .participant-user').count(),1);
 const out=process.env.ARTIFACTS||'/tmp/kindred-chat-drop';fs.mkdirSync(out,{recursive:true});await p.screenshot({path:out+'/bot-conversations.png'});
 await p.evaluate(()=>{window.dropData=new DataTransfer();dropData.items.add(new File(['hello'],'project-notes.txt',{type:'text/plain'}));document.querySelector('#content').dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:dropData}));});
 await p.locator('#composer.file-drag-over').waitFor();await p.screenshot({path:out+'/drop-target.png'});
 const uploaded=p.waitForResponse(r=>r.url().endsWith('/api/uploads')&&r.request().method()==='POST');
 await p.evaluate(()=>document.querySelector('#content').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dropData})));
 await uploaded;await p.locator('.composer-file').waitFor();assert.equal(uploads[0].chat_id,'team-general');assert.equal(uploads[0].data,'aGVsbG8=');assert.equal(await p.locator('.file-drag-over').count(),0);
 await p.screenshot({path:out+'/attached.png'});
 await p.evaluate(()=>{const data=new DataTransfer();data.setData('text/plain','not a file');document.querySelector('#content').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));});assert.equal(uploads.length,1);
 await p.getByRole('button',{name:'Settings',exact:true}).click();await p.getByRole('switch',{name:'Separate bot conversations',exact:true}).uncheck();await p.waitForFunction(()=>!document.querySelector('.bot-chat-section'));assert.equal(settings.separate_bot_chats,false);
 assert.deepEqual(errors,[]);console.log('Drop upload queue, file bytes, chat scope, bot-only avatars, sidebar section and preference passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());

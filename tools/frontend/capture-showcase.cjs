// Capture the real UI with synthetic API responses. No accounts or services contacted.
const {chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path');
const out=path.resolve(__dirname,'../../docs/media');fs.mkdirSync(out,{recursive:true});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext({viewport:{width:1280,height:800}}),p=await context.newPage();
 const now=Math.floor(Date.now()/1000), names=['Piper','Milo','Nova'];
 const bots=names.map((name,i)=>({id:name.toLowerCase(),name,provider:'codex',model:'default',instructions:'Demo teammate',memory:'',approval_mode:'auto',profile:{shape:['round','square','triangle'][i],color:['#eeeeee','#2475ff','#ff9638'][i],eyes:'curious',label:['Coordinator','Research','Design'][i],animated:true}}));
 const chat={id:'team',name:'Launch planning',members:bots.map(b=>b.id),archived:false};
 const texts=[['user','Let’s prepare the launch brief. Piper, coordinate the team. Milo, check the research; Nova, build the report.'],['piper','I’ll bring the findings together here. Milo and Nova are working on their sections now.'],['milo','I’m running a command to summarize the sample feedback and check the totals for our brief.'],['nova','I’m writing the launch brief and organizing the findings into a report for your review.']];
 const messages=texts.map(([sender,text],i)=>({seq:i+1,sender,text,kind:sender==='user'?'message':'assistant',run_id:sender==='user'?'':'run-'+sender,created:now-180+i*30}));
 const runs=bots.map(b=>({id:'run-'+b.id,bot_id:b.id,chat_id:'team',prompt:texts[0][1],status:'running',output:'',error:'',created:now-20,depth:0}));
 await context.route(origin+'/api/**',r=>{const q=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});
 if(q==='/api/bots')return send(bots);if(q==='/api/chats')return send([chat]);if(q==='/api/chats/team')return send({chat,messages});
 if(q==='/api/runs')return send(runs);if(q.startsWith('/api/runs/'))return send({run:runs.find(x=>q.endsWith(x.id))||runs[0],events:[],attachments:[],approvals:[]});
 if(q==='/api/activity')return send(Object.fromEntries(bots.map((b,i)=>[b.id,{run_id:'run-'+b.id,status:'running',shape:['think','terminal','write'][i],label:['Thinking it through','Running a command','Putting it into words'][i],started_at:now-20,run_created_at:now-20,server_time:Math.floor(Date.now()/1000)}])));
 if(q==='/api/status')return send({version:'demo',screen_bot_id:'nova',takeover:false,vm_enabled:true});
 return r.continue();});
 await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('.work-line').first().waitFor();await p.getByText('#launch-planning',{exact:true}).click();await p.mouse.move(1100,40);await p.waitForTimeout(2000);
 await p.screenshot({path:path.join(out,'team-chat.png')});
 const frames=path.join(out,'frames');fs.mkdirSync(frames,{recursive:true});
 for(let i=0;i<48;i++){await p.screenshot({path:path.join(frames,`team-${String(i).padStart(3,'0')}.png`)});await p.waitForTimeout(65);}
 const vendor=`export * from './vendor.js?real';
 export class RFB extends EventTarget {constructor(host){super();this.host=host;this.canvas=document.createElement('canvas');this.canvas.width=1280;this.canvas.height=800;host.append(this.canvas);const c=this.canvas.getContext('2d');c.fillStyle='#171b22';c.fillRect(0,0,1280,800);c.fillStyle='#30343c';c.fillRect(0,0,1280,64);c.fillStyle='#bfc4cd';c.font='16px sans-serif';c.fillText('‹   ›       northstar.example / launch-brief',32,39);c.fillStyle='#f8f7f3';c.fillRect(100,98,1080,640);c.fillStyle='#24362f';c.font='bold 38px sans-serif';c.fillText('Northstar · Launch brief',154,174);c.fillStyle='#667069';c.font='20px sans-serif';c.fillText('DEMO WORKSPACE  /  Prepared by the team',154,215);c.fillStyle='#dce8df';c.fillRect(154,255,972,88);c.fillStyle='#274331';c.font='22px sans-serif';c.fillText('Ready for review: research, positioning and launch checklist',178,308);c.font='bold 25px sans-serif';c.fillText('What we learned',154,404);c.font='20px sans-serif';['01   Clear onboarding makes the biggest difference.','02   Teams want shared context across their tools.','03   A small, focused launch gives us better feedback.'].forEach((s,i)=>c.fillText(s,154,450+i*49));c.fillStyle='#e9e6de';c.fillRect(154,612,972,62);c.fillStyle='#6a706b';c.fillText('Next: review the brief together and refine the launch plan.',174,651);setTimeout(()=>this.dispatchEvent(new Event('connect')),350);}set background(v){}set scaleViewport(v){const b=this.host.getBoundingClientRect(),s=Math.min(b.width/1280,b.height/800)||.2;this.canvas.style.width=1280*s+'px';this.canvas.style.height=800*s+'px';}set viewOnly(v){}set resizeSession(v){}disconnect(){this.canvas.remove();this.dispatchEvent(new Event('disconnect'));}}
 `;
 await context.route(origin+'/vendor.js',r=>r.fulfill({body:vendor,contentType:'text/javascript'}));
 await context.route(origin+'/vendor.js?real',r=>r.fulfill({body:fs.readFileSync(path.resolve(__dirname,'../../ui/vendor.js')),contentType:'text/javascript'}));
 await context.route(origin+'/api/computer/resources',r=>r.fulfill({json:{cpu_percent:12,cpus:4,memory_used:2147483648,memory_total:8589934592,disk_used:10737418240,disk_total:68719476736,uptime_seconds:3600,sampled_at:now}}));
 await context.route(origin+'/api/computer/session',r=>r.fulfill({json:{ticket:'demo'}}));
 await p.reload();await p.locator('#show-computer').waitFor();await p.locator('#show-computer').click();await p.waitForTimeout(1800);await p.locator('#computer-expand').click();await p.waitForTimeout(700);await p.screenshot({path:path.join(out,'computer-use.png')});
 // A dedicated view of the same production character renderer, with demo labels.
 await p.goto(origin+'/fixture/site');await p.addStyleTag({url:origin+'/style.css'});
 await p.evaluate(async()=>{document.body.innerHTML='';document.body.style.cssText='margin:0;background:#0b0b0b;color:#eee;display:flex;align-items:center;justify-content:center;gap:100px;height:100vh;padding:0';const m=await import('/characters.js');for(const [name,shape,color,action,label] of [['Piper','round','#eeeeee','think','thinking it through'],['Milo','square','#2475ff','terminal','running a command'],['Nova','triangle','#ff9638','write','putting it into words']]){const col=document.createElement('div');col.style.cssText='display:grid;justify-items:center;gap:20px;font:18px Inter,sans-serif';const bot=m.character({shape,color,animated:true},100);col.append(bot);const text=document.createElement('div');text.textContent=name;col.append(text);const detail=document.createElement('div');detail.style.cssText='font-size:13px;color:#999';detail.textContent=label;col.append(detail);document.body.append(col);m.setActivity(bot,action);}});
 for(let i=0;i<48;i++){await p.screenshot({path:path.join(frames,`bots-${String(i).padStart(3,'0')}.png`)});await p.waitForTimeout(65);}
 console.log('Captured synthetic team chat and production bot animation frames.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

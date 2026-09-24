const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const ui=path.resolve(__dirname,'../../../ui');
function securityHeaders(req,res){
 const frame=new URL(req.url,'http://localhost').pathname==='/artifact-frame.html';
 if(!frame&&!process.env.KINDRED_TEST_SECURITY_HEADERS)return;
 res.setHeader('Content-Security-Policy',fs.readFileSync(path.join(ui,frame?'artifact-frame-policy.txt':'app-policy.txt'),'utf8').trim());
 res.setHeader('X-Frame-Options',frame?'SAMEORIGIN':'DENY');
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
}
let png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
const token='native-test-token-only',attachment='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
let profile={shape:'round',color:'#2475ff',eyes:'curious',label:'Assistant',description:'Native preview fixture',notifications:true,animated:true};
let bot={id:'piper',name:'Piper',provider:'codex',model:'test',reasoning_effort:'high',instructions:'Fixture',memory:'',approval_mode:'auto',profile};
const chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false};
const run={id:'run-screenshot',bot_id:'piper',chat_id:chat.id,prompt:'Show a screenshot in chat.',status:'completed',output:'Here is the screenshot.',error:'',created:Math.floor(Date.now()/1000),depth:0};
const attachments=[{id:attachment,title:'Website screenshot',size:png.length,created:run.created}];
let general={name:'You',theme:'dark',reduced_motion:false,approval_mode:'auto'},cursor=1,notifications=[],polls=[];
const server=http.createServer(async(req,res)=>{
 securityHeaders(req,res);
 const url=new URL(req.url,'http://localhost');const route=url.pathname;
 if(route==='/fixture/site'){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<html><style>body{margin:0;background:#f7f5ef;font:18px system-ui;color:#162e30;padding:40px}h1{font-size:38px}.block{height:110px;border-radius:20px;background:#16867c;margin-top:32px;color:white;padding:26px}</style><h1>A website screenshot</h1><p>A visible page captured for the chat attachment test.</p><div class=block>Example content<br>Local fixture only.</div></html>');}
 let input='';for await(const c of req)input+=c;let body={};try{body=JSON.parse(input||'{}');}catch{}
 const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 if(route==='/fixture/finish'&&req.method==='POST'){cursor++;notifications.push({id:cursor,run_id:run.id,bot_id:bot.id,chat_id:chat.id,title:'Kindred native test completed',body:'Minimized-window notification check.'});return send({cursor});}
 if(route==='/fixture/polls')return send(polls);
 if(route==='/api/notifications') {
  if(req.headers.authorization!=='Bearer '+token)return send({},401);
  polls.push({at:Date.now(),after:url.searchParams.get('after')});
  return send({cursor,items:url.searchParams.has('after')?notifications.filter(n=>n.id>Number(url.searchParams.get('after'))):[]});
 }
 if(route.startsWith('/api/attachments/')) {if(req.headers.authorization!=='Bearer '+token)return send({},401);res.writeHead(200,{'Content-Type':'image/png'});return res.end(png);}
 if(route==='/api/bots/piper'&&req.method==='PUT'){bot=body;return send(bot);}
 if(route==='/api/settings'&&req.method==='PUT'){general=body;return send(general);}
 const data={
  '/api/providers':{providers:[{id:'codex',name:'Codex',kind:'subscription'},{id:'openrouter',name:'OpenRouter',kind:'api',connected:false},{id:'claude-code',name:'Claude Code',kind:'subscription'},{id:'kimi-code',name:'Kimi Code',kind:'subscription'}]},
  '/api/local/devices':{devices:[]},
  '/api/dictation/models':{configured:false,models:[],require_zdr:true},
  '/api/attention':{bots:{},chats:{}},
  '/api/bots':[bot],'/api/chats':[chat],'/api/runs':[run],'/api/runs/run-screenshot':{run,events:[],attachments,approvals:[]},
  '/api/chats/dm-piper':{chat,messages:[{seq:1,sender:'user',text:run.prompt,kind:'message',run_id:'',created:run.created},{seq:2,sender:'piper',text:run.output,kind:'result',run_id:run.id,attachments,created:run.created}]},
  '/api/workspace-artifact-folders':[], '/api/status':{version:'0.12.1',screen_bot_id:'piper',takeover:false,vm_enabled:true},'/api/settings':general,'/api/connections':{apps:[],openrouter_configured:false},'/api/approvals':[],'/api/user-tasks':[],'/api/routines':[],'/api/activity':{piper:{status:'completed',shape:'success',label:'All done',finished_at:run.created}},'/api/codex/models':{data:[{model:'test',displayName:'Test model',isDefault:true,defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'high'}]}]},'/api/computer':{image:'data:image/png;base64,'+png.toString('base64')},'/api/skills':[],'/api/commands':[]
 };
 if(route in data)return send(data[route]);
 if(route==='/updates/stable.json')return send({},404);
 if(route==='/audio/kindred-pop.wav'){res.writeHead(200,{'Content-Type':'audio/wav'});return res.end(fs.readFileSync(path.join(ui,'audio/kindred-pop.wav')));}
 if(route.startsWith('/fonts/')&&!route.slice(7).includes('/')&&fs.existsSync(path.join(ui,route.slice(1)))){res.writeHead(200,{'Content-Type':route.endsWith('.ttf')?'font/ttf':'font/woff2'});return res.end(fs.readFileSync(path.join(ui,route.slice(1))));}
 if(['/fonts/InterVariable.woff2','/fonts/InterVariable-Italic.woff2'].includes(route)){
  res.writeHead(200,{'Content-Type':'font/woff2'});return res.end(fs.readFileSync(path.join(ui,route.slice(1))));
 }
 const file=route==='/'?'index.html':route.slice(1);
 if(!file.includes('/')&&/^[a-z0-9-]+\.(html|js|css|svg)$/.test(file)&&fs.existsSync(path.join(ui,file))) {
  res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.svg')?'image/svg+xml':'text/javascript','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(ui,file)));
 }
 send({error:'Missing fixture '+route},404);
});
module.exports={server,token,attachment,securityHeaders,setScreenshot:bytes=>{png=bytes;attachments[0].size=bytes.length;}};

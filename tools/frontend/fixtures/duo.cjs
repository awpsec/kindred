// Isolated native iPhone Duo QA server. There are no real accounts, bots, or
// computer sockets here. The shipped UI and native app use their normal paths.
// Run: node tools/frontend/fixtures/duo.cjs [--port 8765]
// Native sign-in: duo-test / fixture-only (token below is intentionally fake).
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {server,token,securityHeaders} = require('./desktop.cjs');
const ui = path.resolve(__dirname,'../../../ui');
const original = server.listeners('request')[0];
server.removeListener('request',original);

const fixedCreated = 1791302400;
const profileID = 'duo-fixture';
const accountID = '6f9619ff-8b86-4d11-b42d-00cf4fc964ff';
const credentials = {login:'duo-test',password:'fixture-only'};
const bots = [
  ['piper','Piper','cloud','#2475ff','Assistant'],
  ['vivienne','Vivienne','triangle','#0bc974','Personal'],
  ['izabella','Izabella','pill','#ff9900','Inbox'],
].map(([id,name,shape,color,label]) => ({id,name,provider:'codex',model:'test',reasoning_effort:'high',instructions:'Local Duo simulator fixture only.',memory:'',approval_mode:'auto',profile:{shape,color,eyes:'curious',label,description:'Native Duo fixture',notifications:true,animated:true}}));
const chats = bots.map(bot => ({id:'dm-'+bot.id,name:bot.name,members:[bot.id],archived:false}));
chats.push({id:'duo-team',name:'Duo team',members:['piper','vivienne'],archived:false});
const histories = new Map(chats.map(chat => [chat.id,Array.from({length:72},(_,i) => ({seq:i+1,sender:i%2?chat.members[0]:'user',text:i===71?'Ready for outer display, book, tabletop, and flat display tests.':`History ${i+1} · ${chat.name}\n\nThis retained message makes the reading position visible across folding, rotations, and keyboard changes. The app should keep the same conversation and draft while its available space changes.`,kind:'message',run_id:'',created:fixedCreated+i,history_order:String(i+1).padStart(6,'0')}))]));
let settings = {name:'Duo tester',identity:'Local test account only.',theme:'dark',reduced_motion:false,approval_mode:'auto',show_activity:false,separate_bot_chats:false,notifications:'none',timezone:'America/New_York',timezone_mode:'auto'};
let controlledBot = null,runCounter = 0,artifactCounter = 0;
const runs = [],requestIDs = new Set(),mutes = {};
const artifacts = [{id:'duo-document',path:'/artifacts/duo-document',key:'duo-document',title:'Duo test document',language:'markdown',source:'# Duo test document\n\nThis document stays open through outer and inner display changes.\n\n'+Array.from({length:20},(_,i)=>`## Section ${i+1}\n\nA scroll anchor should remain readable after folding and rotating.`).join('\n\n'),state:{},revision:1,chat_id:'dm-piper',creator_name:'Duo tester',created:fixedCreated,updated:fixedCreated,archived:false,type:'document'}];
const telemetry = {events:[],probes:[],loads:0,requests:{},lastProbe:null};
let eventSequence = 0;
function record(type,details={}) {
  telemetry.events.push({sequence:++eventSequence,type,...details});
  if(telemetry.events.length>10000)telemetry.events.shift();
}
function snapshot() {
  return {fixture:true,profileID,accountID,controlledBot,settings:{...settings},loads:telemetry.loads,requests:{...telemetry.requests},events:telemetry.events.slice(),lastProbe:telemetry.lastProbe,probes:telemetry.probes.slice(),messages:Object.fromEntries([...histories].map(([id,messages])=>[id,messages.length]))};
}
function status(botID='piper') {
  return {version:'0.85.10',screen_bot_id:botID,takeover:controlledBot===botID,vm_enabled:true,control_pauses:controlledBot?[{bot_id:controlledBot,name:bots.find(b=>b.id===controlledBot).name,control_id:'duo-pause-'+controlledBot,reason:'manual',queued:0}]:[]};
}
function page(chat,url) {
  const all = histories.get(chat.id),limit = Math.min(150,Math.max(1,Number(url.searchParams.get('limit'))||50));
  const before = Number(url.searchParams.get('before')),after = Number(url.searchParams.get('after'));
  const inclusive = url.searchParams.get('inclusive')==='true';
  let messages = all.filter(m=>(!before||m.seq<(inclusive?before+1:before))&&(!after||m.seq>(inclusive?after-1:after)));
  messages = after?messages.slice(0,limit):messages.slice(-limit);
  return {chat,messages,page:{has_before:!!messages.length&&all[0].seq<messages[0].seq,has_after:!!messages.length&&all.at(-1).seq>messages.at(-1).seq},pending_waits:[],commands:[],workers:[]};
}
async function readBody(req) {
  let bytes = 0,text = '';
  for await(const part of req) {bytes+=part.length;if(bytes>262144)throw new Error('Fixture request is too large');text+=part;}
  return text?JSON.parse(text):{};
}
function send(res,data,status=200) {
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));
}
function safeProbe(value,depth=0) {
  if(depth>6)return null;
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value==='string')return value.slice(0,500);
  if(Array.isArray(value))return value.slice(0,30).map(v=>safeProbe(v,depth+1));
  if(typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/(token|password|authorization|cookie|secret)/i.test(key)).slice(0,60).map(([key,v])=>[key.slice(0,64),safeProbe(v,depth+1)]));
  return null;
}

// Real noVNC keyboard mapping, with a local fake transport. Input capture and
// release safety still run in app.js. Every effect goes only to our telemetry.
const rfbFixture = `
class FixtureRFB extends EventTarget {
  constructor(host) {
    super();this.host=host;this.keys=[];this.keyEvents=[];this.pointer=[];this.disconnects=0;this._viewOnly=true;this._mouseButtonMask=0;this._mousePos={x:0,y:0};
    const canvas=this.canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;canvas.tabIndex=0;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#172432';ctx.fillRect(0,0,1600,1000);ctx.fillStyle='#edf6fb';ctx.font='42px sans-serif';ctx.fillText('Kindred Duo local fixture',70,100);ctx.font='28px sans-serif';ctx.fillText('No real remote computer or credentials',70,155);ctx.fillStyle='#2475ff';ctx.fillRect(660,430,260,140);ctx.fillStyle='#ffffff';ctx.fillText('Test input',715,510);host.append(canvas);
    this._display={scale:1,_viewportLoc:{w:1600,h:1000}};
    this._keyboard=new di(canvas);this._keyboard.onkeyevent=(keysym,code,down)=>{if(!this._viewOnly){this.keyEvents.push({keysym,code,down});this.trace('key',{keysym,code,down,source:'noVNC'});}};
    this.pointerEvent=e=>{if(this._viewOnly)return;const r=canvas.getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;this._mousePos={x,y};this._handleMouseButton(x,y,e.type==='pointerdown'?1:e.type==='pointerup'||e.type==='pointercancel'?0:this._mouseButtonMask);};
    for(const name of ['pointerdown','pointermove','pointerup','pointercancel'])canvas.addEventListener(name,this.pointerEvent);
    this.observer=new ResizeObserver(()=>this.fit());this.observer.observe(host);window.__duoFixtureRFB=this;this.trace('connect',{connection:'fixture'});
    setTimeout(()=>this.dispatchEvent(new Event('connect')),10);
  }
  trace(type,details){fetch('/fixture/telemetry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,...details})}).catch(()=>{});}
  fit(){const scale=Math.min(this.host.clientWidth/1600,this.host.clientHeight/1000);if(!(scale>0))return;this._display.scale=scale;this.canvas.style.width=1600*scale+'px';this.canvas.style.height=1000*scale+'px';}
  set scaleViewport(value){this.fit();}
  get viewOnly(){return this._viewOnly;}
  set viewOnly(value){this._viewOnly=!!value;if(this._viewOnly)this._keyboard.ungrab();else this._keyboard.grab();}
  _handleMouseButton(x,y,mask){const effect={x:x/this._display.scale,y:y/this._display.scale,mask};this._mouseButtonMask=mask;this.pointer.push(effect);this.trace('pointer',effect);}
  sendKey(keysym,code,down){if(this._viewOnly)return;const effect={keysym,code:code??null,down:down??null,source:down===undefined?'paste':'native'};this.keys.push(effect);this.trace('key',effect);}
  clipboardPasteFrom(text){if(!this._viewOnly)this.trace('clipboard',{length:String(text).length});}
  disconnect(){this.disconnects++;this._keyboard.ungrab();this.observer.disconnect();for(const name of ['pointerdown','pointermove','pointerup','pointercancel'])this.canvas.removeEventListener(name,this.pointerEvent);this.trace('disconnect',{disconnects:this.disconnects});this.host.remove();}
}
`;

// LAN HTTP intentionally lacks secure-context-only randomUUID in WebKit. This
// shim belongs to the test server, not the shipped app or its production UI.
const uuidScript = `
if(!window.__KINDRED_NATIVE_SESSION_BOOTSTRAP && window.crypto && typeof crypto.randomUUID!=='function')Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=>{
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}});
`;

// These probes are fixture-only and never shipped in the app. They expose
// layout/selection/reading evidence without tokens, cookies, or saved accounts.
const probeScript = `
(() => {
  const loadID=crypto.randomUUID?.()||'fixture-load-'+Date.now();
  const rect=id=>{const n=typeof id==='string'?document.getElementById(id)||document.querySelector(id):id;if(!n)return null;const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,hidden:n.hidden||getComputedStyle(n).display==='none',className:typeof n.className==='string'?n.className:null};};
  const selectionOffsets=editor=>{
    if(!editor)return null;
    if(Number.isFinite(editor.selectionStart))return {start:editor.selectionStart,end:editor.selectionEnd};
    const selection=getSelection();if(!selection?.rangeCount||!editor.contains(selection.anchorNode)||!editor.contains(selection.focusNode))return null;
    const offset=(node,at)=>{const range=document.createRange();range.selectNodeContents(editor);range.setEnd(node,at);return range.toString().length;};
    const anchor=offset(selection.anchorNode,selection.anchorOffset),focus=offset(selection.focusNode,selection.focusOffset);
    return {start:Math.min(anchor,focus),end:Math.max(anchor,focus),anchor,focus};
  };
  const snapshot=()=>{
    const area=document.getElementById('content'),prompt=document.getElementById('prompt'),top=area?.getBoundingClientRect().top||0;
    const anchor=[...(area?.querySelectorAll('[data-message]')||[])].find(n=>n.getBoundingClientRect().bottom>top+1);
    const app=document.getElementById('app'),computer=document.getElementById('computer-panel');
    return {loadID,at:performance.now(),route:document.querySelector('.artifact-studio')?'artifacts':computer&&!computer.hidden?'computer':app?.classList.contains('sidebar-open')?'chat-list':'chat',hash:location.hash,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,visualViewport:window.visualViewport?{width:visualViewport.width,height:visualViewport.height,offsetTop:visualViewport.offsetTop}:null,nativeGeometry:window.__KINDRED_NATIVE_GEOMETRY??null,systemTextScale:window.__KINDRED_SYSTEM_TEXT_SCALE??null,textScale:getComputedStyle(document.documentElement).getPropertyValue('--text-scale'),nativeLayout:window.__KINDRED_IOS_LAYOUT??null,theme:document.documentElement.dataset.theme,iosLayout:document.documentElement.dataset.iosLayout,iosComputer:document.documentElement.dataset.iosComputer,iosShort:document.documentElement.dataset.iosShort,appClass:app?.className,remoteResizing:app?.dataset.mobileResizing||null,heading:document.querySelector('.bot-heading')?.textContent,activeElement:document.activeElement?.id,draft:prompt?.value,selection:selectionOffsets(prompt),selectedText:getSelection()?.toString(),dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>({id:n.id,rect:rect(n),inputs:[...n.querySelectorAll('input,textarea')].map(n=>({id:n.id,type:n.type,value:n.type==='password'?null:n.value}))})),control:{label:document.getElementById('take-control')?.getAttribute('aria-label'),active:computer?.classList.contains('is-controlling'),disabled:document.getElementById('take-control')?.disabled},scroll:area?{top:area.scrollTop,height:area.scrollHeight,anchor:anchor?.dataset.message,offset:anchor?anchor.getBoundingClientRect().top-top:null}:null,rects:Object.fromEntries(['app','.sidebar','.conversation','content','composer-area','composer','prompt','header','computer-panel','desktop','desktop-paste','take-control','ios-computer-back','show-computer','mobile-menu','ios-accounts','ios-status-blur'].map(id=>[id,rect(id)])),rfb:window.__duoFixtureRFB?{disconnects:__duoFixtureRFB.disconnects,viewOnly:__duoFixtureRFB.viewOnly,keys:__duoFixtureRFB.keys.length,keyEvents:__duoFixtureRFB.keyEvents.length,pointer:__duoFixtureRFB.pointer.length,scale:__duoFixtureRFB._display.scale}:null};
  };
  let timer=0;
  function probe(){clearTimeout(timer);timer=setTimeout(()=>{fetch('/fixture/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot())}).catch(()=>{});},60);}
  window.__KINDRED_DUO_FIXTURE={snapshot,probe};
  for(const name of ['kindred-native-geometry','kindred-ios-layout','resize','pageshow','pagehide','focus','blur'])window.addEventListener(name,probe);
  for(const name of ['input','selectionchange','focusin','focusout','visibilitychange'])document.addEventListener(name,probe);
  window.addEventListener('error',e=>fetch('/fixture/telemetry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'error',message:String(e.message)})}).catch(()=>{}));
  window.addEventListener('unhandledrejection',e=>fetch('/fixture/telemetry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'error',message:String(e.reason?.message||e.reason)})}).catch(()=>{}));
  setInterval(probe,500);probe();
})();
`;

async function request(req,res) {
  const url = new URL(req.url,'http://localhost'),route = url.pathname,method=req.method;
  telemetry.requests[method+' '+route]=(telemetry.requests[method+' '+route]||0)+1;
  const handled = route.startsWith('/identity/')||route.startsWith('/fixture/state')||route==='/fixture/telemetry'||route==='/fixture/probe.js'||route==='/fixture/bootstrap.js'||route==='/'||route==='/index.html'||route==='/vendor.js'||route==='/api/bots'||route.startsWith('/api/bots/')||route==='/api/chats'||route.startsWith('/api/chats/')||route==='/api/settings'||route==='/api/status'||route==='/api/runs'||route.startsWith('/api/runs/')||route==='/api/takeover'||route.startsWith('/api/computer')||route.startsWith('/api/mobile/')||route==='/api/attention'||route==='/api/activity'||route.startsWith('/api/notification-mutes/')||route==='/api/workspace-artifacts'||route.startsWith('/api/workspace-artifacts/')||route==='/api/composio'||route==='/api/marketplace';
  if(!handled)return original(req,res);
  securityHeaders(req,res);
  const body = method==='GET'||method==='HEAD'?{}:await readBody(req);
  if(route==='/fixture/state') {
    if(method==='POST'){const probe=safeProbe(body);telemetry.lastProbe=probe;telemetry.probes.push(probe);if(telemetry.probes.length>2000)telemetry.probes.shift();return send(res,{ok:true});}
    if(method==='DELETE'){telemetry.events.length=0;telemetry.probes.length=0;return send(res,{ok:true});}
    return send(res,snapshot());
  }
  if(route==='/fixture/telemetry') {
    if(method!=='POST')return send(res,{error:'POST only'},405);
    if(!['key','pointer','clipboard','connect','disconnect','error','annotation'].includes(body.type))return send(res,{error:'Unknown fixture event'},400);
    const value=safeProbe(body),{type,...details}=value;record(type,details);return send(res,{ok:true});
  }
  if(route==='/fixture/probe.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end(probeScript);}
  if(route==='/fixture/bootstrap.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end(uuidScript);}
  if(route==='/'||route==='/index.html') {
    telemetry.loads++;record('load',{count:telemetry.loads});
    const html=fs.readFileSync(path.join(ui,'index.html'),'utf8').replace('<head>','<head><script src="/fixture/bootstrap.js"></script>').replace('</body>','<script src="/fixture/probe.js" defer></script></body>');
    res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});return res.end(html);
  }
  if(route==='/vendor.js') {
    const real=fs.readFileSync(path.join(ui,'vendor.js'),'utf8');
    if(!real.includes('et as RFB'))throw new Error('Fixture RFB export no longer matches vendor.js');
    res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end(rfbFixture+real.replace('et as RFB','FixtureRFB as RFB'));
  }
  if(route==='/identity/meta')return send(res,{profiles:true,server_chats:false,server_name:'Duo local fixture'});
  if(route==='/identity/login') {
    if(body.login!==credentials.login||body.password!==credentials.password)return send(res,{error:'Use the fixture sign-in duo-test / fixture-only'},401);
    record('sign-in',{profileID});return send(res,{token,profile_id:profileID});
  }
  if((route.startsWith('/identity/')||route.startsWith('/api/'))&&req.headers.authorization!=='Bearer '+token)return send(res,{error:'Fixture token required'},401);
  if(route==='/identity/profiles')return send(res,{account_id:accountID,username:'duo-test',active:profileID,profiles:[{id:profileID,name:'Duo fixture',active:true}],legacy:false});
  if(route==='/identity/logout')return send(res,{ok:true});
  if(route==='/identity/switch')return body.profile_id===profileID?send(res,{token,profile_id:profileID}):send(res,{error:'Unknown fixture profile'},404);
  if(route==='/api/bots')return send(res,bots);
  if(route.startsWith('/api/bots/')) {
    const index=bots.findIndex(bot=>bot.id===route.slice('/api/bots/'.length));if(index<0)return send(res,{error:'Unknown fixture bot'},404);
    if(method==='PUT')bots[index]={...bots[index],...body,id:bots[index].id};return send(res,bots[index]);
  }
  if(route==='/api/chats')return send(res,chats);
  const chatMatch=route.match(/^\/api\/chats\/([^/]+)(?:\/(messages|read)(?:\/([^/]+)(?:\/(reaction))?)?)?$/);
  if(chatMatch) {
    const [,id,action,seq,reaction]=chatMatch,chat=chats.find(c=>c.id===id);if(!chat)return send(res,{error:'Unknown fixture conversation'},404);
    if(action==='read')return send(res,{read_cursor:histories.get(id).at(-1).seq,cursor:histories.get(id).at(-1).seq,latest_message_seq:histories.get(id).at(-1).seq});
    if(action==='messages'&&reaction){record('reaction',{chatID:id,seq:Number(seq),emoji:String(body.emoji||'').slice(0,32)});return send(res,{ok:true});}
    if(action==='messages'&&method==='POST') {
      const requestID=String(body.request_id||'');
      if(requestID&&requestIDs.has(requestID))return send(res,{ok:true});
      if(requestID)requestIDs.add(requestID);
      const history=histories.get(id),next=history.at(-1).seq+1,prompt=String(body.prompt||'').slice(0,64000),runID='duo-run-'+(++runCounter);
      history.push({seq:next,sender:'user',text:prompt,kind:'message',created:fixedCreated+next,run_id:'',reply_to:body.reply_to??null},{seq:next+1,sender:chat.members[0],text:'Local fixture received: '+prompt,kind:'result',created:fixedCreated+next+1,run_id:runID});
      runs.push({id:runID,bot_id:chat.members[0],chat_id:id,prompt,status:'completed',output:'Local fixture received: '+prompt,error:'',created:fixedCreated+next,depth:0});record('send',{chatID:id,prompt,requestID});return send(res,{ok:true});
    }
    if(!action&&method==='GET')return send(res,page(chat,url));
    if(!action&&method==='PUT'){Object.assign(chat,body,{id});return send(res,chat);}
    return send(res,{error:'Unsupported fixture chat operation'},405);
  }
  if(route==='/api/settings'){if(method==='PUT'){settings={...settings,...body};record('settings',{theme:settings.theme,reduced_motion:settings.reduced_motion});}return send(res,settings);}
  if(route==='/api/status')return send(res,status(url.searchParams.get('bot_id')||'piper'));
  if(route==='/api/takeover'){controlledBot=body.enabled?(bots.some(b=>b.id===body.bot_id)?body.bot_id:'piper'):null;record('takeover',{enabled:!!controlledBot,botID:body.bot_id||'piper'});return send(res,{enabled:!!controlledBot,takeover:!!controlledBot});}
  if(route==='/api/computer/session'){record('computer-session',{botID:body.bot_id||'piper',control:!!body.control});return send(res,{ticket:'duo-local-fixture'});}
  if(route==='/api/computer/resources')return send(res,{cpu_percent:12,cpus:2,memory_used:1073741824,memory_total:4294967296,disk_used:10737418240,disk_total:34359738368,uptime_seconds:1200,sampled_at:fixedCreated});
  if(route==='/api/computer'){if(method==='POST')record('computer-http-input',safeProbe(body));return send(res,{image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='});}
  if(route.startsWith('/api/computer'))return send(res,{enabled:false,phase:'idle',apps:[]});
  if(route==='/api/runs')return send(res,runs);
  if(route.startsWith('/api/runs/')){const id=route.split('/')[3],run=runs.find(r=>r.id===id);if(!run)return send(res,{error:'Unknown fixture run'},404);return send(res,{run,events:[],attachments:[],approvals:[]});}
  if(route==='/api/attention')return send(res,{bots:{},chats:{},mutes});
  if(route==='/api/activity')return send(res,Object.fromEntries(bots.map(b=>[b.id,{status:'completed',shape:'success',label:'Ready for Duo tests',finished_at:fixedCreated}])));
  if(route.startsWith('/api/notification-mutes/')){if(method==='PUT')mutes[route.slice('/api/notification-mutes/'.length)]={seconds:body.seconds};return send(res,mutes);}
  if(route==='/api/mobile/push-status')return send(res,{available:false,configured:false,registered:false,reason:'local_fixture'});
  if(route.startsWith('/api/mobile/devices/'))return send(res,method==='DELETE'?{removed:true}:{registered:true,delivery_enabled:false});
  if(route==='/api/workspace-artifacts'){if(method==='POST'){const id='duo-created-'+(++artifactCounter);artifacts.unshift({...artifacts[0],...body,id,path:'/artifacts/'+id,revision:1});record('artifact-create',{id});return send(res,artifacts[0]);}return send(res,artifacts);}
  if(route.startsWith('/api/workspace-artifacts/')){const id=route.split('/')[3],item=artifacts.find(a=>a.id===id);if(!item)return send(res,{error:'Unknown fixture artifact'},404);if(method==='PATCH'){Object.assign(item,body,{id,revision:item.revision+1,updated:fixedCreated+item.revision});record('artifact-edit',{id,revision:item.revision});}return send(res,item);}
  if(route==='/api/composio')return send(res,{configured:false,apps:[]});
  if(route==='/api/marketplace')return send(res,{apps:[],items:[]});
  return send(res,{error:'Unsupported Duo fixture endpoint '+route},404);
}
server.on('request',(req,res)=>request(req,res).catch(error=>{if(!res.headersSent)send(res,{error:error.message},400);else res.end();}));
module.exports = {server,token,credentials,profileID,accountID,snapshot};
if(require.main===module) {
  const at=process.argv.indexOf('--port'),port=at<0?0:Number(process.argv[at+1]);
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Use --port with a number between 0 and 65535');
  server.listen(port,'0.0.0.0',()=>{
    const chosen=server.address().port,addresses=['127.0.0.1',...Object.values(os.networkInterfaces()).flat().filter(n=>n&&n.family==='IPv4'&&!n.internal).map(n=>n.address)];
    console.log(JSON.stringify({fixture:'duo',port:chosen,origins:[...new Set(addresses)].map(ip=>'http://'+ip+':'+chosen),credentials,statePath:'/fixture/state'}));
  });
}

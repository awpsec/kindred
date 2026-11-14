// Serve the exact checked-out shared UI over a disposable loopback TLS fixture.
'use strict';
const fs = require('node:fs'), path = require('node:path'), https = require('node:https');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const [cert, key] = process.argv.slice(2);
if (!cert || !key || process.argv.length !== 4) throw new Error('Expected certificate and private-key paths');
process.env.KINDRED_TEST_SECURITY_HEADERS = '1';
const fixture = require(path.join(root, 'tools/frontend/fixtures/desktop.cjs'));
const handlers = fixture.server.listeners('request');
if (handlers.length !== 1) throw new Error('Expected one original desktop fixture request handler');
const hashes = Object.fromEntries(fs.readdirSync(path.join(root, 'ui')).filter(name => /\.(js|css|html|txt)$/.test(name)).sort().map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'ui', name))).digest('hex')]));
let collaboration = 'none', cancellations = [];
const server = https.createServer({cert: fs.readFileSync(cert), key: fs.readFileSync(key)}, (req, res) => {
  const route = new URL(req.url, 'https://localhost:8765').pathname;
  // Synthetic fixture metadata only: omit query, headers, body and certificate data.
  res.once('finish', () => console.log(JSON.stringify({event: 'request-finished', method: req.method, path: route, status: res.statusCode})));
  if (req.url === '/fixture/ready') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({fixture: 'composer-uikit', origin: 'https://localhost:8765', ui_sha256: hashes}));
  }
  // Disposable native collaboration acceptance only; never production state.
  if (route === '/fixture/collaboration') {
    let input=''; req.on('data',chunk => input+=chunk); req.on('end',() => {
      if (req.method === 'POST') { const value=JSON.parse(input || '{}').mode; if (!['none','incoming','working','queued','completed'].includes(value)) {res.writeHead(400);return res.end();} collaboration=value; cancellations=[]; }
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify({mode:collaboration,cancellations}));
    }); return;
  }
  if (collaboration !== 'none') {
    const now=Date.now()/1000, active=collaboration !== 'completed';
    const bots=['piper','requester'].map((id,i)=>({id,name:i?'Requester':'Piper',provider:'codex',model:'test',profile:{shape:i?'triangle':'round',color:i?'#00c875':'#2475ff',label:'Assistant'},approval_mode:'auto'}));
    const chats=bots.map(bot=>({id:'dm-'+bot.id,name:bot.name,members:[bot.id],archived:false}));
    const run={id:'native-helper',bot_id:'piper',chat_id:'dm-piper',status:collaboration==='queued'?'queued':active?'running':'completed',created:now-30,prompt:'Check the notes',output:'',error:'',delegation:{requester_bot_id:'requester',source_chat_id:'dm-requester'}};
    const pending=active?[{bot_id:'piper',requester_bot_id:'requester',parent_run_id:'native-parent',run_id:run.id,status:'running'}]:[];
    let data;
    if(route==='/api/bots')data=bots;
    else if(route==='/api/chats')data=chats;
    else if(route==='/api/runs')data=collaboration==='incoming'?[]:[run];
    else if(route==='/api/activity')data={};
    else if(chats.some(chat=>route==='/api/chats/'+chat.id))data={chat:chats.find(chat=>route==='/api/chats/'+chat.id),messages:[],pending_waits:pending,page:{has_before:false,has_after:false}};
    else if(route==='/api/runs/native-helper')data={run,events:[],approvals:[]};
    else if(/^\/api\/runs\/(native-helper|native-parent)\/cancel$/.test(route) && req.method==='POST'){cancellations.push(route);collaboration='completed';data={};}
    if(data!==undefined){fixture.securityHeaders(req,res);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return;}
  }
  handlers[0](req, res);
});
server.on('tlsClientError', error => console.log(JSON.stringify({event: 'tls-client-error', code: error.code || 'unknown'})));
server.on('error', error => {console.error(error.message); process.exit(1);});
server.listen(8765, '127.0.0.1', () => console.log('Composer UIKit fixture ready on loopback TLS'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));

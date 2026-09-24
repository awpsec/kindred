// Synthetic API fixture for the real Linux clipboard/drop test. No live accounts.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),out=process.env.KINDRED_TEST_ARTIFACTS;if(!out)throw Error('Set KINDRED_TEST_ARTIFACTS to an isolated test directory');fs.mkdirSync(out,{recursive:true});
const {server}=require(root+'/tools/frontend/fixtures/desktop.cjs');const original=server.listeners('request')[0];server.removeAllListeners('request');let uploads=[],sends=[],snapshot={},phase='';
const probe=`<script type="module">
const errors=[];addEventListener('error',e=>errors.push(e.message));let lastPhase='';let events=[];document.addEventListener('paste',e=>events.push({kind:'paste',types:[...e.clipboardData.types]}));addEventListener('kindred-native-file-drop',e=>events.push(e.detail));
setInterval(async()=>{try{const p=document.querySelector('#prompt');const res=await fetch('/test-state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ready:!!p,dragOverlay:!!document.querySelector('.file-drag-over'),files:document.querySelectorAll('.composer-file').length,previews:[...document.querySelectorAll('.composer-file-preview')].map(i=>i.naturalWidth),notice:document.querySelector('#notice')?.textContent,errors,events,prompt:p?.value})});const {phase}=await res.json();if(phase!==lastPhase){lastPhase=phase;if(phase==='focus'){p.focus();p.value='Please inspect this screenshot.';p.dispatchEvent(new Event('input',{bubbles:true}));}if(phase==='send')document.querySelector('#send').click();if(phase==='clear'){for(const b of document.querySelectorAll('.composer-file .icon-button'))b.click();p.focus();}}}catch(e){errors.push(String(e));}},200);
</script>`;
server.on('request',async(req,res)=>{let route=new URL(req.url,'http://localhost').pathname;const send=value=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(value));};async function body(){let s='';for await(const c of req)s+=c;return JSON.parse(s||'{}');}
if(route==='/test-state'){if(req.method==='POST')snapshot=await body();return send({phase,snapshot,uploads,sends});}
if(route==='/test-phase'){phase=(await body()).phase;return send({ok:true});}
if(route==='/api/uploads'&&req.method==='POST'){const b=await body();const file={id:'image-'+(uploads.length+1),name:b.name,mime:'image/png',size:Buffer.from(b.data,'base64').length};uploads.push({...b,file});return send(file);}
if(route.startsWith('/api/uploads/')){const file=uploads.find(u=>u.file.id===route.split('/').pop());if(req.method==='DELETE')return send({ok:true});if(file){res.setHeader('content-type','image/png');return res.end(Buffer.from(file.data,'base64'));}}
if(route==='/api/chats/dm-piper/messages'){sends.push(await body());return send({runs:[]});}
if(route==='/'){res.setHeader('content-type','text/html');return res.end(fs.readFileSync(root+'/ui/index.html','utf8').replace('</body>',probe+'</body>'));}
if(route==='/identity/meta')return send({profiles:false});if(route==='/health')return send({ok:true});
return original(req,res);});server.listen(0,'127.0.0.1',()=>{fs.writeFileSync(out+'/url','http://127.0.0.1:'+server.address().port);console.log('ready');});

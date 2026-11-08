// Disposable HTTPS Duo fixture with the shipped noVNC client and real RFB
// wire events. No VM, owner accounts or paid provider is used.
// node native-computer.cjs /path/to/disposable-localhost-tls [port] [host]
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {server:duo}=require('./duo.cjs');
const {attachComputerStream}=require('./computer-stream.cjs');
const tls=process.argv[2],port=Number(process.argv[3]||8765),host=process.argv[4]||'localhost';
if(!tls)throw Error('Pass disposable localhost TLS directory');
const handler=duo.listeners('request')[0],ui=path.resolve(__dirname,'../../../ui');
let stream;
const server=https.createServer({key:fs.readFileSync(path.join(tls,'localhost.key')),cert:fs.readFileSync(path.join(tls,'localhost.crt'))},async(req,res)=>{
 const url=new URL(req.url,'https://localhost'),send=data=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try{
  if(url.pathname==='/vendor.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(ui,'vendor.js')));}
  if(url.pathname==='/fixture/computer-input')return send({realRfb:true,framebuffer:{width:1440,height:900},inputs:stream.inputs,connections:stream.connections});
  if(url.pathname==='/api/computer/session'){
   let text='';for await(const chunk of req)text+=chunk;
   const body=JSON.parse(text||'{}'),bot=body.bot_id||url.searchParams.get('bot_id')||'piper';
   return send({ticket:stream.ticket(bot)});
  }
  await handler(req,res);
 }catch(error){if(!res.headersSent)res.writeHead(500);res.end();console.error(error.message);}
});
stream=attachComputerStream(server,{width:1440,height:900});
server.listen(port,host,()=>console.log(JSON.stringify({ready:true,origin:'https://'+host+':'+port,realRfb:true,credentials:{login:'duo-test',password:'fixture-only'}})));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stream.close();server.close(()=>process.exit(0));});

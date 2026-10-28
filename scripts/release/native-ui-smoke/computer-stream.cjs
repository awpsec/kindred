// A small real RFB server. The shipped noVNC client performs its own handshake,
// decodes actual pixels and emits wire events; no production RFB is replaced.
const {WebSocketServer}=require('./loopback-ws.cjs');
exports.attachComputerStream=server=>{
 const sockets=new Set(),tickets=new Map(),connections=[],inputs=[];let serial=0;
 const wss=new WebSocketServer({noServer:true});
 server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url,'http://localhost'),bot=tickets.get(url.searchParams.get('ticket'));
  if(url.pathname!=='/vnc'||!bot){socket.destroy();return;}
  tickets.delete(url.searchParams.get('ticket'));
  wss.handleUpgrade(req,socket,head,ws=>{
   const entry={ws,bot,width:320,height:bot==='piper'?180:200,color:bot==='piper'?[18,184,198]:[255,156,60],format:{big:false,red:16,green:8,blue:0},ready:false,sent:false};sockets.add(entry);connections.push(bot);
   ws.on('close',()=>sockets.delete(entry));let stage=0,buffer=Buffer.alloc(0);
   const frame=color=>{
    if(ws.readyState!==1||!entry.ready)return;
    const packet=Buffer.alloc(16+entry.width*entry.height*4);packet.writeUInt16BE(1,2);packet.writeUInt16BE(entry.width,8);packet.writeUInt16BE(entry.height,10);
    const pixel=((color[0]<<entry.format.red)|(color[1]<<entry.format.green)|(color[2]<<entry.format.blue))>>>0;
    for(let i=16;i<packet.length;i+=4)entry.format.big?packet.writeUInt32BE(pixel,i):packet.writeUInt32LE(pixel,i);
    ws.send(packet);
   };entry.frame=frame;
   ws.send(Buffer.from('RFB 003.008\n'));
   ws.on('message',value=>{
    buffer=Buffer.concat([buffer,Buffer.from(value)]);
    while(buffer.length){
     if(stage===0){if(buffer.length<12)return;buffer=buffer.subarray(12);stage=1;ws.send(Buffer.from([1,1]));continue;}
     if(stage===1){if(buffer.length<1)return;buffer=buffer.subarray(1);stage=2;ws.send(Buffer.alloc(4));continue;}
     if(stage===2){
      if(buffer.length<1)return;buffer=buffer.subarray(1);stage=3;
      const name=Buffer.from(bot+' fixture'),init=Buffer.alloc(24+name.length);init.writeUInt16BE(entry.width,0);init.writeUInt16BE(entry.height,2);init[4]=32;init[5]=24;init[7]=1;
      for(const offset of [8,10,12])init.writeUInt16BE(255,offset);init[14]=16;init[15]=8;init.writeUInt32BE(name.length,20);name.copy(init,24);ws.send(init);entry.ready=true;continue;
     }
     const kind=buffer[0];let size;
     if(kind===0)size=20;
     else if(kind===2){if(buffer.length<4)return;size=4+buffer.readUInt16BE(2)*4;}
     else if(kind===3)size=10;
     else if(kind===4)size=8;
     else if(kind===5)size=6;
     else if(kind===6){if(buffer.length<8)return;size=8+buffer.readUInt32BE(4);}
     else {ws.close();return;}
     if(buffer.length<size)return;
     if(kind===0)entry.format={big:!!buffer[6],red:buffer[14],green:buffer[15],blue:buffer[16]};
     if([4,5,6].includes(kind))inputs.push({bot,kind});
     buffer=buffer.subarray(size);
     if(kind===3&&!entry.sent){entry.sent=true;frame(entry.color);}
    }
   });
  });
 });
 return {connections,inputs,ticket(bot){const ticket='computer-fixture-'+(++serial);tickets.set(ticket,bot);return ticket;},active:()=>[...sockets].map(x=>x.bot),push(bot,color){for(const entry of sockets)if(entry.bot===bot)entry.frame(color);},close(){for(const {ws}of sockets)ws.terminate();wss.close();}};
};

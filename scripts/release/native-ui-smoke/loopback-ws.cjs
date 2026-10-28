// Minimal bounded RFC6455 transport for the synthetic RFB fixture only.
const {EventEmitter}=require('node:events'),{createHash}=require('node:crypto');
const MAX=1024*1024;
function encode(payload,opcode=2){const b=Buffer.from(payload);if(b.length>MAX)throw Error('Fixture frame cap');const h=Buffer.alloc(b.length<126?2:b.length<65536?4:10);h[0]=0x80|opcode;if(b.length<126)h[1]=b.length;else if(b.length<65536){h[1]=126;h.writeUInt16BE(b.length,2);}else{h[1]=127;h.writeBigUInt64BE(BigInt(b.length),2);}return Buffer.concat([h,b]);}
function decode(buffer){if(buffer.length<2)return null;const a=buffer[0],b=buffer[1];if(!(a&128)||(a&112)||!(b&128))throw Error('Unsupported client frame');let length=b&127,offset=2;if(length===126){if(buffer.length<4)return null;length=buffer.readUInt16BE(2);offset=4;}else if(length===127){if(buffer.length<10)return null;const n=buffer.readBigUInt64BE(2);if(n>BigInt(MAX))throw Error('Fixture frame cap');length=Number(n);offset=10;}if(length>MAX)throw Error('Fixture frame cap');if(buffer.length<offset+4+length)return null;const mask=buffer.subarray(offset,offset+4),data=Buffer.from(buffer.subarray(offset+4,offset+4+length));for(let i=0;i<data.length;i++)data[i]^=mask[i%4];return {opcode:a&15,data,used:offset+4+length};}
class WebSocketServer {
 constructor(){this.clients=new Set();}
 handleUpgrade(req,socket,head,callback){
  if(req.headers.upgrade?.toLowerCase()!=='websocket'||req.headers['sec-websocket-version']!=='13'||!req.headers['sec-websocket-key']){socket.destroy();return;}
  const protocols=(req.headers['sec-websocket-protocol']||'').split(',').map(x=>x.trim());
  const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n'+(protocols.includes('binary')?'Sec-WebSocket-Protocol: binary\r\n':'')+'\r\n');
  const ws=new EventEmitter();ws.readyState=1;ws.send=b=>{if(ws.readyState===1)socket.write(encode(b));};ws.close=()=>{ws.readyState=3;socket.end(encode(Buffer.alloc(0),8));};ws.terminate=()=>{ws.readyState=3;socket.destroy();};this.clients.add(ws);
  let buffer=Buffer.alloc(0);const feed=b=>{try{buffer=Buffer.concat([buffer,b]);if(buffer.length>MAX+14)throw Error('Fixture buffer cap');for(;;){const f=decode(buffer);if(!f)break;buffer=buffer.subarray(f.used);if(f.opcode===8){ws.close();break;}if(f.opcode===9){socket.write(encode(f.data,10));continue;}if(![1,2].includes(f.opcode))throw Error('Unsupported opcode');ws.emit('message',f.data);}}catch{ws.terminate();}};
  socket.on('data',feed);socket.on('error',()=>ws.terminate());socket.on('close',()=>{ws.readyState=3;this.clients.delete(ws);ws.emit('close');});callback(ws);if(head.length)feed(head);
 }
 close(){for(const ws of this.clients)ws.terminate();}
}
module.exports={WebSocketServer,encode,decode};

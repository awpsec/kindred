const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {build}=require('esbuild'),http=require('http'),assert=require('node:assert/strict');
(async()=>{
 const {displayScalingPlugin}=await import('./display-scaling-plugin.mjs');
 const bundle=await build({absWorkingDir:__dirname,stdin:{contents:"export {default} from './node_modules/@novnc/novnc/core/display.js';",resolveDir:__dirname},plugins:[displayScalingPlugin],bundle:true,format:'esm',write:false});
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type',q.url==='/display.js'?'text/javascript':'text/html');r.end(q.url==='/display.js'?bundle.outputFiles[0].text:'<canvas></canvas>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){const b=await engine.launch({headless:true});try{for(const dpr of [1,1.25,2]){const p=await b.newPage({deviceScaleFactor:dpr,viewport:{width:1700,height:1100}});await p.goto('http://127.0.0.1:'+server.address().port);const result=await p.evaluate(async()=>{
 const {default:Display}=await import('/display.js');const c=document.querySelector('canvas'),d=new Display(c);d.resize(1280,800);d.fillRect(0,0,1280,800,[255,255,255]);d.flip();d.scale=1.3;
 const dims=[c.width,c.height];const point=[d.absX(650),d.absY(390)];
 d.fillRect(17,21,91,39,[20,60,100]);d.flip();d.fillRect(58,37,31,11,[220,180,30]);d.flip();
 const partial=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
 d._damage(0,0,1280,800);d.flip();const full=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
 let difference=0,maxDelta=0;for(let i=0;i<full.length;i++)if(full[i]!==partial[i]){difference++;maxDelta=Math.max(maxDelta,Math.abs(full[i]-partial[i]));}
 d.scale=1;const before=performance.now();for(let i=0;i<120;i++){d.fillRect(50+i,50,50,50,[i,100,100]);d.flip();}const normal=performance.now()-before;
 d.scale=1.3;const start=performance.now();for(let i=0;i<120;i++){d.fillRect(50+i,50,50,50,[i,100,100]);d.flip();}const scaled=performance.now()-start;
 d.scale=8;const maxPixels=c.width*c.height;d.scale=.25;const down=[c.width,c.height];d.scale=1.3;d.resize(1024,768);const resized=[c.width,c.height];
 return {dims,point,difference,maxDelta,normalMs:normal,scaledMs:scaled,maxPixels,down,resized};
 });assert.deepEqual(result.dims,[Math.floor(1664*dpr),Math.floor(1040*dpr)]);assert.deepEqual(result.point,[500,300]);assert(result.maxDelta<=1,'Dirty updates must match a full redraw within channel rounding');assert(result.maxPixels<=8000000);assert.deepEqual(result.down,[Math.floor(320*dpr),Math.floor(200*dpr)]);assert.deepEqual(result.resized,[Math.floor(1024*1.3*dpr),Math.floor(768*1.3*dpr)]);console.log(JSON.stringify({engine:name,dpr,...result}));await p.close();}}finally{await b.close();}}}finally{server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

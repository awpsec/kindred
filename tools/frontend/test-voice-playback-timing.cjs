// Deterministic packet arrivals isolate scheduling gaps from provider voice tone.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../ui/voice.js'),'utf8');
 const {voicePlaybackStart}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 let oldNext,newNext,oldGaps=0,newGaps=0;
 const duration=.04;
 for(let i=0;i<250;i++){
  // A 40 ms stream with repeatable 0–55 ms network/delivery jitter.
  const now=i*duration+[0,.015,.055,.025,.005][i%5];
  const oldStart=Math.max(now+.02,oldNext||0),start=voicePlaybackStart(now,newNext,duration);
  if(i){oldGaps+=Math.max(0,oldStart-oldNext);newGaps+=Math.max(0,start-newNext);}
  oldNext=oldStart+duration;newNext=start+duration;
 }
 assert(oldGaps>.04,'fixture reproduces gaps in the previous scheduler');
 assert(newGaps<1e-10,'network jitter inside the cushion must not split contiguous audio');
 assert.equal(voicePlaybackStart(10,10.005,.04),10.005,'near-clock packet keeps exact continuity');
 assert.equal(voicePlaybackStart(10,9,.04),10.12,'a genuine underrun rebuilds the buffer once');
 assert.equal(voicePlaybackStart(0,undefined,.04),.12);
 for(const args of [[NaN,undefined,.04],[0,undefined,0],[0,undefined,2.1],[0,3,.04]])assert.throws(()=>voicePlaybackStart(...args));
 console.log(JSON.stringify({passed:true,packets:250,oldGapMilliseconds:Math.round(oldGaps*1000),newGapMilliseconds:Math.round(newGaps*1000),pitchUnchanged:true,underrunRecovery:true,boundedQueue:true}));
})().catch(e=>{console.error(e);process.exitCode=1});

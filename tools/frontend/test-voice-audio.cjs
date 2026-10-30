// Exercise the capture processor across native device rates, rather than a mock
// microphone returning already-converted audio.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../../ui/voice-audio-worklet.js'),'utf8');
for(const sampleRate of [24000,44100,48000]){
  const frames=[];let Processor;
  const scope={sampleRate,AudioWorkletProcessor:class{constructor(){this.port={postMessage:buffer=>frames.push(new Int16Array(buffer))}}},registerProcessor:(_,value)=>Processor=value};
  vm.runInNewContext(source,scope);const capture=new Processor();
  for(let offset=0;offset<sampleRate;offset+=128){const input=new Float32Array(Math.min(128,sampleRate-offset)).fill(.5);assert.equal(capture.process([[input]]),true);}
  assert.equal(frames.length,25,`${sampleRate} input produces one second at 24 kHz`);
  assert(frames.every(frame=>frame.length===960&&frame.every(value=>value===16383)));
  frames.length=0;capture.port.onmessage({data:{muted:true}});
  for(let offset=0;offset<sampleRate;offset+=128)capture.process([[new Float32Array(Math.min(128,sampleRate-offset)).fill(1)]]);
  assert.equal(frames.length,25);assert(frames.every(frame=>frame.every(value=>value===0)));
  capture.port.onmessage({data:{muted:false}});frames.length=0;
  for(let offset=0;offset<sampleRate;offset+=128)capture.process([[new Float32Array(Math.min(128,sampleRate-offset)).fill(-2)]]);
  assert(frames.every(frame=>frame.every(value=>value===-32768)),'input clips safely without integer wrap');
  frames.length=0;capture.process([[new Float32Array(128).fill(.8)]]);
  capture.port.onmessage({data:{muted:true}});
  const output=new Float32Array(128).fill(.9);
  for(let i=0;i<20;i++)capture.process([[new Float32Array(128).fill(.8)]],[[output]]);
  assert(output.every(value=>value===0),'capture never echoes into speaker output');
  assert(frames.length>0&&frames.every(frame=>frame.every(value=>value===0)),'muting discards unsubmitted speech from a partial frame');
}
console.log('Voice PCM capture: 24/44.1/48 kHz, exact duration, mute and clipping passed.');

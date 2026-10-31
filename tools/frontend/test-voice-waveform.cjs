const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const {voiceWaveLevels:levels}=await import('data:text/javascript;base64,'+fs.readFileSync(path.resolve(__dirname,'../../ui/voice.js')).toString('base64'));
  const quiet=levels(0,0,40),user=levels(.08,0,40),bot=levels(0,.08,40),loud=levels(.16,0,40);
  assert.equal(quiet.speaker,'quiet');assert(quiet.input.every(v=>v===0));assert(quiet.output.every(v=>v===.107));
  assert.equal(user.speaker,'input');assert.equal(bot.speaker,'output');assert.deepEqual(user.input,bot.output);
  assert(user.output.every(v=>v===0));assert(bot.input.every(v=>v===0));
  assert(user.input.every((v,i)=>v<loud.input[i]),'every fixed position responds to current energy');
  assert.deepEqual(user,levels(.08,0,40),'same PCM energy has no clock-driven decorative motion');
  assert.equal(levels(.08,.20,40).speaker,'input','caller interruption takes priority on the single row');
  assert.deepEqual(levels(.02,0,40,true),levels(.2,0,40,true),'reduced motion retains speaker identity with static bars');
  assert.deepEqual(levels(NaN,-1,NaN),levels(0,0,8));
  assert.equal(levels(1,1,1000).input.length,40);
  assert(levels(1,0,40).input.every(v=>v<=1&&v>=.107));
  console.log(JSON.stringify({stationary:true,currentAudioOnly:true,oneSpeaker:true,quiet:true,reducedMotion:true,bounded:true}));
})().catch(e=>{console.error(e);process.exitCode=1});

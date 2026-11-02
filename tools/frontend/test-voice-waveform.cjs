const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const {voiceWaveLevels:levels,voiceWaveColors:colors}=await import('data:text/javascript;base64,'+fs.readFileSync(path.resolve(__dirname,'../../ui/voice.js')).toString('base64'));
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
  assert(Math.max(...levels(.02,0,40).input)*32>=17,'quiet speech must make a clearly visible excursion');
  assert(Math.max(...levels(0,.08,40).output)*32>=28,'ordinary speech should use the available height');
  const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).reduce((sum,v,i)=>sum+(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  for(const dark of [true,false])for(const color of ['#000000','#ffffff','#2475ff','#7b49d9','#13bcc6','#ff991e','#ee2457','#ffff00']){
    const shades=colors(color,dark),background=dark?'#343434':'#ebebeb';
    assert(contrast(shades.output,background)>=5,'bot ink remains legible for '+color);
    assert(contrast(shades.input,background)>=3.3,'caller ink remains legible for '+color);
    assert.notEqual(shades.input,shades.output);assert.notEqual(shades.quiet,shades.input);
    assert(Object.values(shades).every(ink=>/^#[\da-f]{6}$/.test(ink)),'solid shades, not translucent ink');
  }
  console.log(JSON.stringify({stationary:true,currentAudioOnly:true,oneSpeaker:true,quiet:true,reducedMotion:true,bounded:true,quietSpeechVisible:true,contrastAcrossBotColors:true}));
})().catch(e=>{console.error(e);process.exitCode=1});

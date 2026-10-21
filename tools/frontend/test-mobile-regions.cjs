const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
const {mobileRegions}=await import('data:text/javascript;base64,'+fs.readFileSync(require('node:path').join(__dirname,'../../ui/mobile-regions.js')).toString('base64'));
const region=(x,y,width,height,kind='division',active=true)=>({x,y,width,height,kind,active});
const layout=regions=>mobileRegions({width:900,height:800,reservedRegions:regions},900,800);
assert.equal(layout([]).inner,false);
assert.equal(layout([region(450,0,0,800,'division',false)]).inner,true);
assert.equal(layout([region(450,0,0,800,'division',false)]).vertical,undefined);
assert.deepEqual(layout([region(440,0,20,800)]).safe,{x:460,y:0,width:440,height:800});
assert.deepEqual(layout([region(0,390,900,20)]).safe,{x:0,y:0,width:900,height:390});
assert.equal(layout([region(NaN,0,20,800)]).regions.length,0);
assert.equal(layout([region(-30,0,20,800)]).regions.length,0);
assert.deepEqual(layout([region(-10,0,30,800)]).regions[0],region(0,0,20,800));
const camera=layout([region(440,0,20,800),region(880,0,40,50,'occlusion')]);
assert.deepEqual(camera.safe,{x:460,y:0,width:420,height:800});
assert.equal(mobileRegions({width:1800,height:1600,reservedRegions:[region(880,0,40,1600)]},900,800).vertical.x,440);
assert.deepEqual(layout([region(-10,0,30,800)]).safe,{x:20,y:0,width:880,height:800});
console.log('mobile regions: 11 policy assertions passed');
})().catch(e=>{console.error(e);process.exitCode=1});

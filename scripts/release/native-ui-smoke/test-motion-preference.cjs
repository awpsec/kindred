const assert=require('node:assert/strict');
const {prepareMotion}=require('./motion-preference.cjs');
const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted'};
for(const e of [{},{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'self-hosted'}]){
 const pref=prepareMotion(e,'darwin',()=>{throw Error('Owner preferences touched');});pref.restore();assert(!pref.receipt.changed);
}
for(const original of [null,'0','1']){
 let value=original;
 const pref=prepareMotion(env,'darwin',(_,args)=>{
  if(args[0]==='read'){if(value===null)throw Object.assign(Error('Missing key'),{status:1});return value;}
  value=args[0]==='delete'?null:args.at(-1)==='true'?'1':'0';return '';
 });assert.equal(value,'0');pref.restore();assert.equal(value,original);
}
for(const original of [false,true]){
 let enabled=original;
 const pref=prepareMotion(env,'win32',(_,args,options)=>{
  assert.equal(options.windowsHide,true);const mode=args.at(-1);if(mode!=='read')enabled=mode==='on';return JSON.stringify({enabled});
 });assert(enabled);pref.restore();assert.equal(enabled,original);
}
console.log('Hosted motion setup and restoration: 7 cases passed');

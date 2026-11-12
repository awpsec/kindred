// Hosted CI images disable OS animation. Test real native motion with the actual
// OS preference enabled, then restore it. Never changes a developer's settings.
const {execFileSync}=require('node:child_process');
const path=require('node:path'),assert=require('node:assert/strict');
function prepareMotion(env=process.env,platform=process.platform,exec=execFileSync){
 if(env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted')return {receipt:{changed:false},restore(){}};
 const call=(file,args)=>exec(file,args,{encoding:'utf8',timeout:15000,windowsHide:true}).trim();
 if(platform==='darwin'){
  const args=['com.apple.universalaccess','reduceMotion'];
  let before=null;try{before=call('defaults',['read',...args]);}catch(e){if(e.status!==1)throw e;}
  assert(before===null||['0','1'].includes(before),'Unexpected CI reduce-motion preference');
  const restore=()=>before===null?call('defaults',['delete',...args]):call('defaults',['write',...args,'-bool',before==='1'?'true':'false']);
  try{call('defaults',['write',...args,'-bool','false']);assert.equal(call('defaults',['read',...args]),'0');}catch(e){restore();throw e;}
  return {receipt:{changed:true,before,enabled:true,scope:'hosted CI only'},restore};
 }
 if(platform==='win32'){
  const run=mode=>JSON.parse(call('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'motion-preference.ps1'),'-Mode',mode]));
  const before=run('read');assert.equal(typeof before.enabled,'boolean');
  const restore=()=>assert.equal(run(before.enabled?'on':'off').enabled,before.enabled);
  try{assert.equal(run('on').enabled,true);}catch(e){restore();throw e;}
  return {receipt:{changed:true,before:before.enabled,enabled:true,scope:'hosted CI only'},restore};
 }
 throw Error('Unsupported hosted CI platform');
}
module.exports={prepareMotion};

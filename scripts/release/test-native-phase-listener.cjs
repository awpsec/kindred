const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const file=process.argv[2]||path.join(__dirname,'native-smoke-server.cjs');
const source=fs.readFileSync(file,'utf8'),probe=source.split('const probe=`<script type="module">')[1].split('</script>`;')[0];
async function run(phase,{invokeFailure=false,windowError=false}={}){
 let now=0,polls=0;const reports=[],calls=[];const content={inert:false,getAttribute:()=>null};
 const context={window:{__KINDRED_MAC_OVERLAY:true,addEventListener(type,fn){if(windowError)fn({message:'retained window error'});},open(){},isSecureContext:true,__TAURI__:{core:{invoke:async(command)=>{calls.push(command);if(command==='open_profile_home'&&invokeFailure)throw Error('actual native IPC failure');return{entries:[],version:'0.86.0'};}}}},navigator:{mediaDevices:{}},document:{documentElement:{dataset:{}},querySelector:s=>s==='#content'?content:null,querySelectorAll:()=>[{innerText:'Here is the screenshot.'}]},getComputedStyle:()=>({visibility:'visible'}),setTimeout:(f,ms)=>{now+=ms;f();},fetch:async(url,options)=>{if(url==='/fixture/report'){reports.push(JSON.parse(options.body));return{};}assert.equal(url,'/fixture/phase');polls++;return{json:async()=>({phase:phase(now,polls)})};},innerWidth:1100,innerHeight:760};
 await vm.runInNewContext('(async()=>{'+probe+'})()',context);return{now,polls,reports,calls};
}
(async()=>{
 const early=await run(t=>t>=1000?'accounts':'chat');assert(early.reports.some(r=>r.phase==='accounts'&&r.passed));assert.equal(early.calls.filter(c=>c==='open_profile_home').length,1);
 const late=await run(t=>t>=80000?'accounts':t>=40000?'frame-light':'chat');assert(late.reports.some(r=>r.phase==='accounts'&&r.passed),'later Accounts request must survive earlier phase polls');assert.equal(late.calls.filter(c=>c==='open_profile_home').length,1);
 const idle=await run(()=> 'chat');assert(idle.reports.some(r=>r.passed===false&&r.error.includes('idle budget exhausted')));assert(idle.polls<=301);
 const changing=await run((t,n)=> 'waiting-'+n);assert(changing.reports.some(r=>r.passed===false&&r.error.includes('total polling budget exhausted')));assert.equal(changing.polls,3000);
 const failed=await run(()=> 'accounts',{invokeFailure:true});assert(failed.reports.some(r=>r.passed===false&&r.error.includes('actual native IPC failure')));assert(!failed.reports.some(r=>r.phase==='accounts'));
 console.log(JSON.stringify({passed:5,exactExtractedProbe:true,lateAccounts:{polls:late.polls,elapsed:late.now},idle:{polls:idle.polls,elapsed:idle.now},changing:{polls:changing.polls,elapsed:changing.now},nativeIpcFailurePreserved:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});

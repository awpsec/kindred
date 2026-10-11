'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(process.env.KINDRED_TEST_SMOKE_SOURCE||path.join(__dirname,'native-smoke-server.cjs'),'utf8');
const start=source.indexOf('    const invoke=window.__TAURI__.core.invoke.bind(window.__TAURI__.core);');
const end=source.indexOf('    if(navigator.clipboard)',start);
assert(start>=0&&end>start,'Actual fixture instrumentation must be represented');
const snippet='"use strict";\n'+source.slice(start,end);
function install(native){
 const window={__pasteNativeCalls:[],__pasteBrowserCalls:0,__TAURI_INTERNALS__:{invoke:native}};
 if(process.env.KINDRED_TEST_TAURI_BUNDLE)vm.runInNewContext(fs.readFileSync(process.env.KINDRED_TEST_TAURI_BUNDLE,'utf8'),{window});
 else window.__TAURI__={core:Object.freeze({invoke:native,unchanged:'retained'})};
 const original=window.__TAURI__.core;assert(Object.isFrozen(original));
 vm.runInNewContext(snippet,{window});
 assert(Object.isFrozen(original));assert.notEqual(window.__TAURI__.core,original);
 for(const key of Object.keys(original))if(key!=='invoke')assert.equal(window.__TAURI__.core[key],original[key]);
 return window;
}
(async()=>{
 const value={text:'Aé中😀\nZ'};let calls=[];
 const w=install(async(command,args)=>{calls.push({command,args});return value;});
 const args={token:'synthetic'};assert.equal(await w.__TAURI__.core.invoke('profile_home_state',args),value);assert.equal(w.__pasteNativeCalls.length,0);
 assert.equal(await w.__TAURI__.core.invoke('read_clipboard_text',args),value);assert.equal(calls.length,2);assert.equal(calls[1].args,args);assert.equal(w.__pasteNativeCalls.length,1);assert.equal(w.__pasteNativeCalls[0].completed,true);assert.equal(w.__pasteNativeCalls[0].error,false);
 const failure=new Error('real native refusal');const e=install(async()=>{throw failure;});
 await assert.rejects(e.__TAURI__.core.invoke('read_clipboard_text',{}),error=>error===failure);assert.equal(e.__pasteNativeCalls[0].completed,true);assert.equal(e.__pasteNativeCalls[0].error,true);assert.equal(e.__pasteNativeCalls[0].errorMessage,String(failure));
 let release;const b=install(async()=>value);b.__pasteUIBarrier=new Promise(resolve=>{release=resolve;});let returned=false;
 const pending=b.__TAURI__.core.invoke('read_clipboard_text',{}).then(result=>{returned=true;assert.equal(result,value);});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(b.__pasteNativeCalls[0].completed,true);assert.equal(returned,false);release();await pending;assert.equal(returned,true);
 console.log(JSON.stringify({passed:true,frozenNamespacePreserved:true,realForwarding:true,errorIdentity:true,barrierAfterNative:true,actualTauriBundle:!!process.env.KINDRED_TEST_TAURI_BUNDLE}));
})().catch(error=>{console.error(error);process.exitCode=1;});

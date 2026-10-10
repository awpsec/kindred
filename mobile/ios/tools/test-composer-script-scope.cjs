'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(process.argv[2] || 'mobile/ios/KindredCompanionTests/ComposerUIKitTests.swift', 'utf8');
const helper = source.match(/private func js\(_ source: String\)[\s\S]*?\n    }/)[0];
const wrapped = helper.includes('evaluateJavaScript("{\\n\\(source)\\n}")');
assert(wrapped || helper.includes('evaluateJavaScript(source)'), 'Unknown helper: do not test a guessed implementation');
const encode = text => wrapped ? `{\n${text}\n}` : text;
const lines = source.split('func testNativeDictationComposerStatesKeepDraftAndKeyboard()')[1].split('private func js')[0].split('\n');
const snippets = lines.filter(line => line.includes('try await js("const p=document.querySelector') || line.includes('try await js("const m=document.querySelector'))
  .map(line => JSON.parse(line.match(/js\((".*")\)/)[1]));
assert.equal(snippets.length, 3);
let clicks = 0;
const element = {firstChild:{}, textContent:'', dispatchEvent(){}, focus(){}, click(){clicks++}};
const selection = {removeAllRanges(){}, addRange(){}};
const context = vm.createContext({document:{querySelector(){return element}, createRange(){return {setStart(){},collapse(){}}}},
  InputEvent:class {}, PointerEvent:class {}, getSelection:()=>selection, Promise});
(async()=>{
  for(let repeat=0;repeat<3;repeat++) for(const code of [snippets[0], ...snippets]) assert.equal(vm.runInContext(encode(code),context),true);
  assert.equal(vm.runInContext(encode('21+21'),context),42);
  assert.equal(await vm.runInContext(encode('Promise.resolve(7)'),context),7);
  assert.throws(()=>vm.runInContext(encode('throw new Error("original failure")'),context),/original failure/);
  assert.equal(vm.runInContext('typeof p',context),'undefined');
  assert.equal(vm.runInContext('typeof m',context),'undefined');
  assert.equal(clicks,6);
  console.log(JSON.stringify({passed:true,actualSnippets:snippets.length,repetitions:3,clicks,expression:42,promise:7,errorsPropagated:true,globalsAbsent:true}));
})().catch(error=>{console.error(error.stack);process.exitCode=1});

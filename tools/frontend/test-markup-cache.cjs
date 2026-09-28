const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);const result=await page.evaluate(async()=>{
 const {createMarkupCache}=await import('/markup-cache.js'),{marked,DOMPurify}=await import('/vendor.js');
 let calls=0;const render=(s,breaks)=>{calls++;return DOMPurify.sanitize(marked.parse(s,{breaks}));};
 const cache=createMarkupCache(render),samples=Array.from({length:100},(_,i)=>`Message ${i}\n\n**Report**\n\n`+('- Some *text* with [a link](https://example.com)\n'.repeat(20))+'<img src=x onerror=alert(1)><script>alert(1)</script>');
 const t=performance.now(),expected=samples.map(s=>cache.render(s));const cold=performance.now()-t;
 const t2=performance.now(),actual=samples.map(s=>cache.render(s));const warm=performance.now()-t2;
 const safe=expected.every(s=>!s.includes('<script')&&!s.includes('onerror'));
 const modes=cache.render('one\ntwo',true)!==cache.render('one\ntwo',false);
 const before=calls;cache.clear();cache.render(samples[0]);const cleared=calls===before+1;
 let count=0;const small=createMarkupCache(s=>{count++;return s;},2,30);small.render('a');small.render('b');small.render('a');small.render('c');small.render('b');const eviction=count===4;
 const big='x'.repeat(40);small.render(big);small.render(big);const bounded=count===6;
 return{cold,warm,same:JSON.stringify(expected)===JSON.stringify(actual),safe,modes,cleared,eviction,bounded};
});for(const key of ['same','safe','modes','cleared','eviction','bounded'])assert(result[key],key);console.log(JSON.stringify(result));}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});

const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const p=await browser.newPage(),uploads=[],sends=[],errors=[];p.on('pageerror',e=>errors.push(e.message));let fail=false;
 await p.route(origin+'/api/**',r=>{const q=r.request(),path=new URL(q.url()).pathname,body=q.method()==='POST'?q.postDataJSON():null;
 if(path==='/api/uploads'&&body){if(fail)return r.fulfill({status:500,json:{error:'Upload unavailable'}});uploads.push(body);return r.fulfill({json:{id:'file-'+uploads.length,name:body.name,mime:'text/plain',size:Buffer.from(body.data,'base64').length}});}
 if(path.endsWith('/messages')&&body){sends.push(body);return r.fulfill({json:{runs:[]}});}
 if(path.startsWith('/api/uploads/')&&q.method()==='DELETE')return r.fulfill({json:{ok:true}});
 return r.continue();});
 await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#prompt').waitFor();
 const paste=async text=>{await p.locator('#prompt').focus();await p.evaluate(text=>{const d=new DataTransfer();d.setData('text/plain',text);document.querySelector('#prompt').dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}));},text);};
 await paste('A small paste.');assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'A small paste.');assert.equal(uploads.length,0);
 const big='Full source — 😀\r\n'.repeat(5000);await paste(big);await p.getByRole('button',{name:'Remove Pasted text.txt',exact:true}).waitFor();assert.equal(uploads.length,1);assert.equal(Buffer.from(uploads[0].data,'base64').toString('utf8'),big);assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'A small paste.');
 await p.locator('#send').click();await p.waitForFunction(()=>!document.querySelector('.composer-file'));assert.equal(sends[0].prompt,'A small paste.');assert.deepEqual(sends[0].files,['file-1']);
 await paste(Array(40).fill('line').join('\n'));await p.getByRole('button',{name:'Remove Pasted text.txt',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.composer-file'));assert.equal(uploads.length,2);
 await paste('x'.repeat(4000));await p.getByRole('button',{name:'Remove Pasted text.txt',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.composer-file'));assert.equal(uploads.length,3);
 fail=true;await paste(big);await p.locator('#notice').filter({hasText:'Upload unavailable'}).waitFor();assert.equal(await p.locator('.composer-file').count(),0);assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',exactUnicodeAndLineEndings:true,no64kTruncation:true,draftPreserved:true,sentAsAttachment:true,removable:true,thresholds:true,failureVisible:true}));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1});

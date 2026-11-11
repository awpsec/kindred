const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {botLibraryDownload};'}));await p.goto(origin);await p.locator('#prompt').waitFor();
 await p.evaluate(async()=>{
 const {botLibraryDownload}=await import('/app.js'),{fileCard}=await import('/artifacts.js'),{nativeFileDelivery}=await import('/file-downloads.js');window.receipt=null;window.reveals=0;window.saves=0;
 window.__KINDRED_FILE_DELIVERY=true;window.__KINDRED_FILE_DOWNLOADS_V2=true;window.__TAURI__={core:{Channel:class{},invoke:async(command,args)=>{if(command==='saved_chat_file')return receipt;if(command==='save_chat_file_progress'){saves++;args.onProgress.onmessage({received:2,total:4});await new Promise(r=>window.finishSave=r);return receipt='device-local-receipt';}if(command==='reveal_chat_file'){reveals++;return;}throw Error('Unexpected command '+command);}}};
 const file={id:'library-download',kind:'file',name:'Library check.txt',size:4};const delivery=botLibraryDownload({kind:'attachment',file});const host=document.createElement('section');host.id='fixture-downloads';host.append(delivery.createButton());document.body.append(host);
 // A chat card shares the same native receipt and in-flight progress.
 host.append(fileCard(file,{...nativeFileDelivery(()=>true),downloadScope:sessionStorage.getItem('kindred-token'),notice:()=>{}}));
 });
 const host=p.locator('#fixture-downloads');await host.locator('button.file-download').first().click();await p.waitForFunction(()=>saves===1);assert.equal(await host.getByRole('progressbar').count(),2);assert.equal(await host.getByRole('progressbar').first().getAttribute('aria-valuenow'),'50');await p.evaluate(()=>finishSave());await host.getByRole('button',{name:/Show in/}).first().waitFor();assert.equal(await host.getByRole('button',{name:/Show in/}).count(),2);await host.getByRole('button',{name:/Show in/}).first().click();assert.equal(await p.evaluate(()=>reveals),1);
 // Upload IDs are a different namespace and cannot inherit native receipts.
 await p.evaluate(async()=>{const {botLibraryDownload}=await import('/app.js');document.querySelector('#fixture-downloads').append(botLibraryDownload({kind:'upload',file:{id:'library-download',name:'Upload.txt',size:4}}).createButton());});assert.equal(await host.locator('.file-download').last().getAttribute('aria-label'),'Download');assert.equal(await p.evaluate(()=>saves),1);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({engine,passed:true,libraryChatSharedProgress:true,deviceReceipt:true,uploadsIsolated:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});

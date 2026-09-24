const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const {zipSync,strToU8}=require('fflate');
const ExcelJS=require('exceljs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
function docx(){return Buffer.from(zipSync(Object.fromEntries(Object.entries({
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Quarterly review</w:t></w:r></w:p><w:p><w:r><w:t>Synthetic preview — ready for your feedback.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Revenue</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>$48,200</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'
 }).map(([k,v])=>[k,strToU8(v)]))));}
function pdf(){const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',null,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];for(const [i,text]of [[3,'Quarterly review'],[5,'Second page']]){const stream=`BT /F1 24 Tf 70 710 Td (${text}) Tj ET`;objects[i]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;}let s='%PDF-1.4\n',offsets=[0];objects.forEach((obj,i)=>{offsets.push(s.length);s+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const start=s.length;s+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(s);}
async function createFiles(){const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Overview');sheet.addRows([['Metric','Value'],['Revenue',48200],['Growth',0.15]]);sheet.getCell('B3').numFmt='0%';sheet.getRow(1).font={bold:true};book.addWorksheet('Forecast').addRows([['Month','Amount'],['October',55000]]);
 const files={'review.docx':docx(),'forecast.xlsx':Buffer.from(await book.xlsx.writeBuffer()),'review.pdf':pdf(),'broken.docx':Buffer.from('not a document'),'notes.txt':Buffer.from('A useful plain text artifact.'),'oversize.docx':Buffer.from(zipSync({'word/document.xml':new Uint8Array(13*1024*1024)}))};
 return files;}
module.exports={createFiles};
if(require.main===module)(async()=>{const files=await createFiles();
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{const context=await browser.newContext({viewport:{width:1200,height:860}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(25000);
 await context.addInitScript(t=>{if(window.top!==window)return;sessionStorage.setItem('kindred-token',t);window.__KINDRED_FILE_DELIVERY=true;window.__TAURI__={core:{invoke:async(name,args)=>{if(name==='save_chat_file'){window.__saved=args;return 'receipt';}if(name==='reveal_chat_file'){window.__revealed=args;}return {};}}};},token);
 const attachments=Object.entries(files).map(([name,bytes])=>({id:name,kind:'file',name,size:bytes.length}));let extra=false;
 const messages=()=>[{seq:1,kind:'result',sender:'piper',text:'Here are the files for review. Synthetic examples.',run_id:'run-screenshot',created:1789050000,attachments},...(extra?[{seq:2,kind:'message',sender:'user',text:'Please check the next step.',created:1789050001}]:[])];
 await context.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:messages(),page:{has_before:false,has_after:false}}}));
 await context.route(origin+'/api/chats/dm-piper/messages*',r=>r.fulfill({json:{messages:messages(),page:{has_before:false,has_after:false}}}));
 await context.route(origin+'/api/deliverables/*',r=>{assert.equal(r.request().headers().authorization,'Bearer '+token);const bytes=files[decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop())];return r.fulfill({body:bytes,contentType:'application/octet-stream'});});
 await page.goto(origin);await page.getByText('Here are the files for review. Synthetic examples.').waitFor();await page.locator('.document-stack>summary').click();await page.waitForTimeout(450);
 const card=name=>page.getByRole('region',{name:'File: '+name,exact:true});
 const open=async name=>{await card(name).getByRole('button',{name:'More file actions'}).click();await card(name).getByRole('button',{name:'Preview',exact:true}).click();await page.getByRole('dialog').waitFor();};
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/document-previews');fs.mkdirSync(out,{recursive:true});
 await card('review.docx').getByRole('button',{name:'Download',exact:true}).click();await card('review.docx').getByRole('button',{name:'Show in folder'}).click();assert.deepEqual(await page.evaluate(()=>[window.__saved,window.__revealed]),[{id:'review.docx'},{receipt:'receipt'}]);
 assert((await card('review.docx').boundingBox()).height<80);await page.screenshot({path:path.join(out,'compact-files.png'),clip:{x:268,y:130,width:540,height:280}});
 await open('review.docx');await page.locator('.document-word').getByText('Quarterly review').waitFor();assert.equal(await page.locator('.document-word').evaluate(n=>n.tagName),'ARTICLE');assert.equal(await page.locator('.document-word iframe').count(),0);await page.screenshot({path:path.join(out,'word-preview.png')});
 for(const theme of ['dark','light']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  for(const width of [1200,390]){
   await page.setViewportSize({width,height:860});
   const dimensions=await page.locator('.document-word').evaluate(host=>{
    const paper=host.shadowRoot.querySelector('section.docx'),text=paper.querySelector('p'),s=getComputedStyle(text),ps=getComputedStyle(paper);
    return {color:s.color,paper:ps.backgroundColor};
   });
   assert.equal(dimensions.color,'rgb(0, 0, 0)');assert.equal(dimensions.paper,'rgb(255, 255, 255)');
   await page.screenshot({path:path.join(out,'word-'+theme+'-'+width+'.png')});
  }
 }
 await page.setViewportSize({width:1200,height:860});
extra=true;await page.waitForTimeout(5500);await page.locator('.document-word').getByText('Quarterly review').waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
 // Closing while the Office worker is loading must re-enable Preview.
 await page.route(origin+'/document-worker.js',async r=>{await new Promise(resolve=>setTimeout(resolve,500));await r.continue().catch(e=>{if(!/already handled|closed|disposed/i.test(e.message))throw e;});});
 await open('review.docx');await page.waitForTimeout(80);await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.deliverable-menu button').disabled);await page.unroute(origin+'/document-worker.js');
 await open('forecast.xlsx');await page.getByRole('cell',{name:'48,200',exact:true}).or(page.getByRole('cell',{name:'48200',exact:true})).waitFor();await page.getByRole('cell',{name:'15%',exact:true}).waitFor();await page.getByRole('button',{name:'Forecast',exact:true}).click();await page.getByRole('cell',{name:'October',exact:true}).waitFor();await page.getByRole('button',{name:'Overview',exact:true}).click();await page.screenshot({path:path.join(out,'spreadsheet-preview.png')});await page.keyboard.press('Escape');
 await open('review.pdf');await page.getByText('Page 1 of 2',{exact:true}).waitFor();await page.getByRole('button',{name:'Next page'}).click();await page.getByText('Page 2 of 2',{exact:true}).waitFor();assert(await page.locator('.document-pdf canvas').evaluate(c=>c.width>0&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4!==3&&v<100)));await page.getByRole('button',{name:'Previous page'}).click();await page.getByText('Page 1 of 2',{exact:true}).waitFor();await page.screenshot({path:path.join(out,'pdf-preview.png')});await page.keyboard.press('Escape');
 await open('broken.docx');await page.locator('.document-status').filter({hasText:/invalid|Unable|zip|document/i}).waitFor();await page.keyboard.press('Escape');
 await open('oversize.docx');await page.getByText(/too complex for a quick preview/).waitFor();await page.keyboard.press('Escape');
 await open('notes.txt');await page.getByText('A useful plain text artifact.',{exact:true}).waitFor();await page.keyboard.press('Escape');
 // A cancelled fetch must not reopen the preview or leave its worker behind.
 await page.route(origin+'/api/deliverables/notes.txt',async r=>{await new Promise(resolve=>setTimeout(resolve,400));await r.fulfill({body:files['notes.txt']});});
 await open('notes.txt');await page.getByRole('button',{name:'Close',exact:true}).click();await page.waitForTimeout(600);assert.equal(await page.getByRole('dialog').count(),0);
 // Browser downloads retain the original bytes; native reveal stays absent there.
 await page.evaluate(async()=>{const {fileCard}=await import('/artifacts.js');document.querySelector('#content').append(fileCard({id:'browser',name:'browser.txt',size:14},{getBlob:async()=>new Blob(['original bytes']),notice:()=>{}}));});
 const downloaded=page.waitForEvent('download');await card('browser.txt').getByRole('button',{name:'Download',exact:true}).click();const receipt=await downloaded;assert.equal(fs.readFileSync(await receipt.path(),'utf8'),'original bytes');assert.equal(await card('browser.txt').getByRole('button',{name:'Show in folder'}).count(),0);
 await page.setViewportSize({width:600,height:760});await page.screenshot({path:path.join(out,'compact-files-narrow.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await card('review.docx').getByRole('button',{name:'More file actions'}).click();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.deliverable-more').getAttribute('aria-expanded')==='false');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',office:true,pdf:true,compactCard:true,nativeReveal:true,pollingStable:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

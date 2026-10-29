const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const ExcelJS=require('exceljs'),{unzipSync,zipSync,strFromU8,strToU8}=require('fflate');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function workbook(absolute){
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Assets');
 sheet.addTable({name:'AssetsTable',ref:'A1',headerRow:true,columns:[{name:'Host'},{name:'Status'},{name:'Value'}],rows:[['example.test','In scope',42],['second.example.test','Review',7]]});
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF234567'}};
 sheet.getColumn(1).width=28;sheet.getCell('C2').numFmt='0.00';sheet.getCell('C4').value={formula:'SUM(C2:C3)',result:49};
 book.addWorksheet('Notes').addRow(['Keep this worksheet too']);
 const bytes=Buffer.from(await book.xlsx.writeBuffer());if(!absolute)return bytes;
 const archive=unzipSync(bytes),key='xl/worksheets/_rels/sheet1.xml.rels';
 const rels=strFromU8(archive[key]);assert(rels.includes('../tables/table1.xml'));
 // Valid OPC package-root target, also emitted by openpyxl. Same table bytes.
 archive[key]=strToU8(rels.replace('../tables/table1.xml','/xl/tables/table1.xml'));
 return Buffer.from(zipSync(archive));
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-table-preview';fs.mkdirSync(out,{recursive:true});
 try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.__KINDRED_DESKTOP={platform:'macos'};window.__TAURI__={core:{invoke:async()=>null}};},token);
 await page.goto(origin);await page.locator('#app').waitFor({state:'visible'});
 for(const absolute of [false,true]){
  const bytes=await workbook(absolute);await page.evaluate(async bytes=>{
   const {fileCard}=await import('/artifacts.js');const blob=new Blob([Uint8Array.from(bytes)]);
   const card=fileCard({id:'table-preview',name:'Asset tracker.xlsx',kind:'file',size:blob.size},{getBlob:async()=>blob,notice:()=>{}});
   document.querySelector('#content').replaceChildren(card);
  },[...bytes]);
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.document-grid td')||document.querySelector('.document-status')?.textContent.startsWith('Preview unavailable'));
  const failure=await page.locator('.document-status').allTextContents();assert.equal(failure.length,0,failure.join('; '));
  const grid=page.locator('.document-grid');await grid.getByText('example.test',{exact:true}).waitFor();
  assert.equal(await grid.getByText('42.00',{exact:true}).count(),1);assert.equal(await grid.getByText('49',{exact:true}).count(),1);
  assert.equal(await grid.getByText('Host',{exact:true}).evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(35, 69, 103)');
  await page.getByRole('button',{name:'Notes',exact:true}).click();await grid.getByText('Keep this worksheet too').waitFor();
  await page.getByRole('button',{name:'Assets',exact:true}).click();await page.screenshot({path:path.join(out,engine+(absolute?'-absolute':'-relative')+'.png')});
  const downloadEvent=page.waitForEvent('download');await page.getByRole('dialog').getByRole('button',{name:'Download',exact:true}).click();const saved=await downloadEvent;assert(fs.readFileSync(await saved.path()).equals(bytes),'Download must preserve original workbook bytes');
  await page.getByRole('button',{name:'Close',exact:true}).click();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,relativeAndAbsoluteTables:true,styledCells:true,savedFormula:true,multipleSheets:true,originalDownload:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

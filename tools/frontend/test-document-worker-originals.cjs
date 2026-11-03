const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const bundle=fs.readFileSync(process.env.WORKER_BUNDLE||path.resolve(__dirname,'../../ui/document-worker.js'),'utf8');
async function parse(bytes,extension){let accept,reject;const result=new Promise((yes,no)=>{accept=yes;reject=no;}),timer=setTimeout(()=>reject(Error('worker deadline exceeded')),5000),self={postMessage:accept,setImmediate,clearImmediate},context=vm.createContext({self,setTimeout,clearTimeout,setImmediate,clearImmediate,TextEncoder,TextDecoder,console});try{vm.runInContext(bundle,context,{timeout:3000});await self.onmessage({data:{extension,buffer:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}});return await result;}finally{clearTimeout(timer);}}
(async()=>{const root=path.join(__dirname,'fixtures/document-originals');for(const name of ['original-v1.docx','original-v2.docx']){const bytes=fs.readFileSync(path.join(root,name)),v=await parse(bytes,'docx');assert(!v.error,v.error);assert(Buffer.from(v.buffer).equals(bytes));}
 const result=await parse(fs.readFileSync(path.join(root,'styled-multi-sheet.xlsx')),'xlsx');assert(!result.error,result.error);assert.deepEqual(Array.from(result.sheets,s=>s.name),['Styled overview','Forecast']);const sheet=result.sheets[0];assert.equal(sheet.rows[2][2].text,'2026-10-13 14:30','saved date/time format');assert.equal(sheet.rows[0][0].colSpan,3);assert.equal(sheet.rows[0][1].covered,true);assert.equal(sheet.rows[0][2].covered,true);assert.equal(sheet.rows[0][0].fill,'#234567');assert.equal(sheet.rows[0][0].color,'#FFFFFF');assert.equal(sheet.rows[0][0].align,'center');assert.equal(sheet.rows[0][0].wrap,true);assert.deepEqual(Array.from(sheet.widths),[208,138,180]);assert.equal(sheet.rows[1][1].text,'15.00%');assert.equal(sheet.rows[1][2].text,'48,200.25');assert.equal(sheet.rows[2][1].text,'96,400.50');assert.equal(sheet.rows[3][1].text,'—');assert.equal(sheet.rows[3][1].missingResult,true);
 const ExcelJS=require('exceljs');
 for(const date1904 of [false,true]){
  const book=new ExcelJS.Workbook();book.properties.date1904=date1904;const s=book.addWorksheet('Results');
  s.getCell('A1').value={formula:'1-1',result:0};
  s.getCell('A2').value={formula:'1=2',result:false};
  s.getCell('A3').value={formula:'1/0',result:{error:'#DIV/0!'}};
  s.getCell('A4').value={formula:'SUM(B1:B2)'};
  s.getCell('B1').value={formula:'2+2',result:4};s.getCell('B2').value={sharedFormula:'B1',result:4};
  s.getCell('C1').value=new Date('2026-10-13T14:30:00Z');s.getCell('C1').numFmt='yyyy-mm-dd hh:mm';
  const parsed=await parse(Buffer.from(await book.xlsx.writeBuffer()),'xlsx');assert(!parsed.error,parsed.error);const rows=parsed.sheets[0].rows;
  assert.equal(rows[0][0].text,'0');assert.equal(rows[1][0].text,'FALSE');assert.equal(rows[2][0].text,'#DIV/0!');assert.equal(rows[3][0].text,'—');assert(rows[3][0].missingResult);assert.equal(rows[1][1].text,'4');assert.equal(rows[0][2].text,'2026-10-13 14:30','date epoch '+date1904);
 }
 const artwork=await parse(fs.readFileSync(path.join(root,'default-namespace-drawing.xlsx')),'xlsx');assert(!artwork.error,artwork.error);assert.equal(artwork.sheets[0].rows[1][0].text,'example.test');assert.equal(artwork.sheets[0].rows[1][1].text,'Team');
 const initialZone=process.env.TZ;for(const zone of ['UTC','America/New_York','Asia/Tokyo']){process.env.TZ=zone;const dates=await parse(fs.readFileSync(path.join(root,'styled-multi-sheet.xlsx')),'xlsx');assert.equal(dates.sheets[0].rows[2][2].text,'2026-10-13 14:30',zone);}if(initialZone===undefined)delete process.env.TZ;else process.env.TZ=initialZone;
 const damaged=await parse(Buffer.from('not a ZIP'),'docx');assert(damaged.error);const encrypted=await parse(Buffer.from([208,207,17,224,161,177,26,225]),'xlsx');assert(encrypted.error.includes('password protected or use an unsupported format'));console.log(JSON.stringify({passed:true,date:sheet.rows[2][2].text,mergedColumns:sheet.rows[0][0].colSpan,widths:sheet.widths,scope:'real synthetic original ZIP/worker parsing; no Office application or browser claim'}));
})().catch(e=>{console.error(e);process.exitCode=1;});

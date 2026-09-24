import ExcelJS from 'exceljs/lib/doc/workbook.js';
import SSF from 'ssf';
import {unzipSync} from 'fflate';
// Office files are ZIP containers. Bound both advertised and actual expanded data.
function checkArchive(bytes){
 let size=0,count=0;
 const files=unzipSync(bytes,{filter:file=>{size+=file.originalSize;if(++count>2000||size>24*1024*1024||file.originalSize>12*1024*1024)throw Error('This document is too complex for a quick preview. Download to view it.');return true;}});
 if(Object.values(files).reduce((n,b)=>n+b.length,0)>24*1024*1024)throw Error('Document preview size limit exceeded.');
}
self.onmessage=async({data:{buffer,extension}})=>{try{
 checkArchive(new Uint8Array(buffer));
 if(extension==='docx'){
  self.postMessage({buffer},[buffer]);
 }else{
  const book=new ExcelJS();await book.xlsx.load(buffer,{ignoreNodes:['drawing','picture','dataValidations','conditionalFormatting','extLst']});
  const sheets=book.worksheets.filter(s=>s.state==='visible').slice(0,30).map(sheet=>{
   const rows=[];const rowCount=Math.min(sheet.rowCount,200),columnCount=Math.min(sheet.columnCount,40);
   for(let r=1;r<=rowCount;r++){const row=[];for(let c=1;c<=columnCount;c++){
    const cell=sheet.getCell(r,c);let value=cell.value;
    if(value&&typeof value==='object'&&!(value instanceof Date))value=value.result??value.text??(value.richText?value.richText.map(t=>t.text).join(''):value.formula?'='+value.formula:'');
    let text=value instanceof Date?value.toISOString().slice(0,10):String(value??'');
    if(typeof value==='number'&&cell.numFmt){try{text=SSF.format(cell.numFmt,value);}catch{}}
    row.push({text:text.slice(0,4000),bold:!!cell.font?.bold});
   }rows.push(row);}
   return{name:sheet.name,rows,totalRows:sheet.rowCount,totalColumns:sheet.columnCount};
  });self.postMessage({sheets,truncatedSheets:book.worksheets.filter(s=>s.state==='visible').length>30});
 }
}catch(error){self.postMessage({error:error.message||'Unable to read this document.'});}};

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
 const bytes=new Uint8Array(buffer);if(bytes.length>=8&&[208,207,17,224,161,177,26,225].every((v,i)=>bytes[i]===v))throw Error('This Office file may be password protected or use an unsupported format. Download original to open it.');
 checkArchive(bytes);
 if(extension==='docx'){
  self.postMessage({buffer},[buffer]);
 }else{
  // Preview reads worksheet cells, not structured-table metadata. ExcelJS
  // cannot resolve valid package-root table targets (for example /xl/tables/table1.xml).
  // Skip tableParts so those references cannot break otherwise readable cells;
  // the original workbook and its tables remain unchanged for download.
  const book=new ExcelJS();await book.xlsx.load(buffer,{ignoreNodes:['drawing','picture','dataValidations','conditionalFormatting','extLst','tableParts']});
  const sheets=book.worksheets.filter(s=>s.state==='visible').slice(0,30).map(sheet=>{
   const rows=[];const rowCount=Math.min(sheet.rowCount,200),columnCount=Math.min(sheet.columnCount,40),merges=(sheet.model.merges||[]).map(range=>{const parts=range.split(':').map(ref=>{const m=/^([A-Z]+)([0-9]+)$/.exec(ref);let col=0;for(const ch of m[1])col=col*26+ch.charCodeAt(0)-64;return {row:Number(m[2]),col};});return {top:parts[0].row,left:parts[0].col,bottom:parts[1]?.row||parts[0].row,right:parts[1]?.col||parts[0].col};}).filter(m=>m.top<=rowCount&&m.left<=columnCount);
   for(let r=1;r<=rowCount;r++){const row=[];for(let c=1;c<=columnCount;c++){
    const cell=sheet.getCell(r,c);let value=cell.value;
    if(value&&typeof value==='object'&&!(value instanceof Date))value=value.result??value.text??(value.richText?value.richText.map(t=>t.text).join(''):value.formula?'='+value.formula:'');
    let text=value instanceof Date?value.toISOString().slice(0,10):String(value??'');
    if((typeof value==='number'||value instanceof Date)&&cell.numFmt){try{text=SSF.format(cell.numFmt,value instanceof Date?value.getTime()/86400000+25569:value);}catch{}}
    const merge=merges.find(m=>r>=m.top&&r<=m.bottom&&c>=m.left&&c<=m.right),color=v=>v?.argb&&/^[0-9a-f]{8}$/i.test(v.argb)?'#'+v.argb.slice(2):null;
    row.push({text:text.slice(0,4000),bold:!!cell.font?.bold,wrap:!!cell.alignment?.wrapText,italic:!!cell.font?.italic,underline:!!cell.font?.underline,fontSize:Math.max(8,Math.min(36,cell.font?.size||11)),color:color(cell.font?.color),fill:cell.fill?.type==='pattern'&&cell.fill?.pattern==='solid'?color(cell.fill.fgColor):null,align:['left','center','right'].includes(cell.alignment?.horizontal)?cell.alignment.horizontal:typeof value==='number'||value instanceof Date?'right':'left',vertical:['top','middle','bottom'].includes(cell.alignment?.vertical)?cell.alignment.vertical:'top',rowSpan:merge?Math.min(merge.bottom,rowCount)-merge.top+1:1,colSpan:merge?Math.min(merge.right,columnCount)-merge.left+1:1,covered:!!merge&&(r!==merge.top||c!==merge.left)});
   }rows.push(row);}
   return{name:sheet.name,rows,widths:Array.from({length:columnCount},(_,i)=>Math.max(40,Math.min(480,(sheet.getColumn(i+1).width||12)*7+12))),heights:Array.from({length:rowCount},(_,i)=>Math.max(20,Math.min(120,(sheet.getRow(i+1).height||15)*4/3))),totalRows:sheet.rowCount,totalColumns:sheet.columnCount};
  });self.postMessage({sheets,truncatedSheets:book.worksheets.filter(s=>s.state==='visible').length>30});
 }
}catch(error){self.postMessage({error:error.message||'Unable to read this document.'});}};

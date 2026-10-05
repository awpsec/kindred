const assert=require('node:assert/strict');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await webkit.launch({headless:true});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await p.addInitScript(t=>{window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';sessionStorage.setItem('kindred-token',t);},token);
  await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('.message-bubble').first().waitFor();
  const result=await p.evaluate(async()=>{
   const bubble=document.querySelector('.message-bubble');
   bubble.innerHTML='<table><tr>'+Array.from({length:8},(_,i)=>'<th>Wide column '+i+'</th>').join('')+'</tr><tr>'+Array.from({length:8},()=>'<td>Detailed financial entry</td>').join('')+'</tr></table>';
   (await import('/artifacts.js')).enhanceMarkdown(bubble);
   const table=bubble.querySelector('.markdown-table');
   table.scrollLeft=120;
   return {scroll:table.scrollLeft,width:table.clientWidth,full:table.scrollWidth,right:table.getBoundingClientRect().right,viewport:innerWidth,adjust:getComputedStyle(document.documentElement).getPropertyValue('text-size-adjust')||getComputedStyle(document.documentElement).getPropertyValue('-webkit-text-size-adjust')};
  });
  assert(result.full>result.width);assert(result.scroll>0);assert(result.right<=result.viewport);
  console.log('Mobile WebKit: wide table stays within chat and scrolls horizontally');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

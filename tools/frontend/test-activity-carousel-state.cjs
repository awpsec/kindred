const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright'),{server}=require('./fixtures/desktop.cjs'),assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const page=await browser.newPage({viewport:{width:320,height:800}});await page.goto('http://127.0.0.1:'+server.address().port+'/fixture/site');
 const result=await page.evaluate(async()=>{
  const {prepareActivityCarousels,syncActivityCarousels,revealActivityItem}=await import('/activity-carousel.js');
  const area=document.createElement('section');area.id='content';document.body.replaceChildren(area);
  const style=document.createElement('style');style.textContent='[data-activity-hidden="true"]{display:none}';document.head.append(style);
  let following=true;
  const entry={},receipt=(id,kind='collaboration-link')=>{const n=document.createElement('article');n.className=kind;n.dataset.message=id;n.textContent=id;return n;};
  const job=receipt('job','task-gather');job.dataset.progressGroup='job';job.innerHTML='<details><summary>Job</summary><p>Details</p></details>';
  const block=receipt('block','task-commentary-block');block.dataset.taskCommentaryBlock='job';block.innerHTML='<p>Retained commentary</p>';
  const artifact=receipt('artifact','artifact-update-message'),chat=receipt('chat'),approval=receipt('approval','task-attention');approval.innerHTML='<button>Approve email</button>';
  const lateBlock=receipt('late','task-commentary-block');lateBlock.dataset.taskCommentaryBlock='job';
  const second=[receipt('other-1'),receipt('other-2')];area.append(job,block,artifact,chat,approval,lateBlock,...second);const originals=[...area.children];
  const sync=animate=>{const focus=prepareActivityCarousels(area);syncActivityCarousels(area,entry,{animate,following:()=>following});focus();};sync(false);
  const first=()=>area.querySelector('.activity-pager'),selected=()=>job.dataset.activityHidden==='false';
  const counts=[...area.querySelectorAll('.activity-count')].map(n=>n.textContent);
  first().querySelector('[aria-label="Show update 1 of 3"]').click();job.querySelector('details').open=true;
  const newRow=receipt('new');approval.before(newRow);sync(true);
  const holdsReading=selected()&&job.querySelector('details').open&&first().querySelector('.activity-new').textContent==='1 new update';
  const currentDot=first().querySelector('[aria-current="true"]');currentDot.focus();sync(true);const focusRetained=document.activeElement?.getAttribute('aria-current')==='true';
  first().querySelector('[aria-label="Next update"]').click();const inactiveHidden=job.dataset.activityHidden==='true'&&block.dataset.activityHidden==='true'&&lateBlock.dataset.activityHidden==='true';revealActivityItem(block.firstChild);const quoteReveals=selected()&&block.dataset.activityHidden==='false';
  first().querySelector('[aria-current="true"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));const keyboard=artifact.dataset.activityHidden==='false'&&document.activeElement.getAttribute('aria-current')==='true';
  const pendingVisible=!approval.hasAttribute('data-activity-hidden')&&first().nextElementSibling===approval;
  // Auto-follow must yield to someone focused on or selecting the latest page.
  first().querySelector('[aria-label="Next update"]').click();first().querySelector('[aria-label="Next update"]').click();
  newRow.tabIndex=0;newRow.focus();const arrival=receipt('focused-arrival');approval.before(arrival);sync(true);
  const focusedPageRetained=newRow.dataset.activityHidden==='false'&&document.activeElement===newRow;
  newRow.blur();const range=document.createRange();range.selectNodeContents(newRow);getSelection().removeAllRanges();getSelection().addRange(range);
  approval.before(receipt('selected-arrival'));sync(true);const selectionRetained=newRow.dataset.activityHidden==='false'&&getSelection().toString()==='new';getSelection().removeAllRanges();
  // A history prepend is not a live unread receipt.
  const unreadBefore=first().querySelector('.activity-new').textContent;area.prepend(receipt('older'));sync(false);
  const olderNotNew=first().querySelector('.activity-new').textContent===unreadBefore;

  first().querySelector('.activity-new').click();following=false;const selectedBefore=[...area.children].find(n=>n.dataset.activityHidden==='false'&&!n.dataset.taskCommentaryBlock);approval.before(receipt('while-reading'));sync(true);const olderReaderRetained=selectedBefore.dataset.activityHidden==='false';following=true;
  // Splitting one run must not lend its state object to both resulting runs.
  const separator=receipt('message','message-group');artifact.after(separator);sync(false);
  const models=[...entry.activityCarousels.values()];const separateModels=new Set(models).size===models.length;
  for(let i=0;i<50;i++)approval.before(receipt('burst-'+i));sync(true);
  const bounded=[...area.querySelectorAll('.activity-dots')].every(n=>n.children.length<=5);
  return {counts,holdsReading,focusRetained,inactiveHidden,quoteReveals,keyboard,pendingVisible,focusedPageRetained,selectionRetained,olderNotNew,olderReaderRetained,separateModels,bounded,parentsRetained:originals.every(n=>n.parentElement===area)};
 });
 assert.deepEqual(result.counts,['3 / 3','2 / 2']);for(const [key,value] of Object.entries(result))if(key!=='counts')assert.equal(value,true,key);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',...result}));
 }finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

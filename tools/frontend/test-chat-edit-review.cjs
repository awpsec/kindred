const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true,args:process.env.WEBKIT?[]:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:900,height:750}}),errors=[],decisions=[];
page.on('pageerror',e=>errors.push(e.message));
try{
await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+String.fromCharCode(10)+'export {approvalCard};'}));
await page.route(origin+'/api/approvals/review',r=>{decisions.push(r.request().postDataJSON());return r.fulfill({json:{ok:true}})});
await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await page.goto(origin);
const approval={id:'review',tool:'chat_update',status:'pending',args:{chat_name:'Team General',before:{name:'Team General',description:'General team discussion.',members:['a','b']},after:{name:'team-updates',description:'Post completed work in one line. Ask Alex privately when a decision is needed.',members:['a','c']},people:[{id:'a',name:'Piper'},{id:'b',name:'Scratch'},{id:'c',name:'Atlas'}]}};
async function render(status){
await page.evaluate(async a=>{const {approvalCard}=await import('/app.js');document.getElementById('preview')?.remove();const host=document.createElement('div');host.id='preview';Object.assign(host.style,{position:'fixed',inset:'24px',zIndex:'99999',background:'var(--bg)',padding:'20px',overflow:'auto'});host.append(approvalCard(a,{bot_id:'a'}));document.body.append(host);}, {...approval,status});
}
await render('pending');
const card=page.locator('#preview');
assert(await card.getByText('Add members',{exact:true}).isVisible());
assert(await card.getByText('Atlas',{exact:true}).isVisible());
assert(await card.getByText('Scratch',{exact:true}).isVisible());
fs.mkdirSync('/tmp/kindred-chat-edit',{recursive:true});
await page.locator('.chat-edit-review').screenshot({path:'/tmp/kindred-chat-edit/review.png'});
await card.getByRole('button',{name:'Allow changes',exact:true}).click();
await page.waitForTimeout(100);assert.equal(decisions[0].approved,true);
await render(undefined);await card.getByRole('button',{name:'Decline',exact:true}).click();await page.waitForTimeout(100);assert.equal(decisions[1].approved,false);
await render('approved');assert(await card.getByText('Allowed',{exact:true}).isVisible());assert.equal(await card.getByRole('button',{name:'Allow changes',exact:true}).count(),0);
assert.deepEqual(errors,[]);
console.log('Chat edit review: fields, member names, allow/decline, completed receipt passed');
}finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

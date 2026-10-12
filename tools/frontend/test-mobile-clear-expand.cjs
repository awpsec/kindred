const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const engine=process.env.WEBKIT?'webkit':'chromium';
const out=process.env.KINDRED_TEST_ARTIFACTS;
if(out)fs.mkdirSync(out,{recursive:true});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const b=await (process.env.WEBKIT?webkit:chromium).launch({headless:true});
  const results=[];
  try {
    for(const mode of ['ios','android','desktop'])for(const theme of ['light','dark'])for(const scale of [1,1.5]){
      const p=await b.newPage({viewport:{width:mode==='desktop'?1100:390,height:844}});
      const errors=[];p.on('pageerror',e=>errors.push(e.message));
      await p.route('**/api/settings',route=>route.fulfill({json:{name:'You',theme,reduced_motion:true,approval_mode:'auto'}}));
      await p.addInitScript(({token,mode,scale})=>{
        sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-text-size',String(scale*100));window.__KINDRED_SYSTEM_TEXT_SCALE=scale;
        if(mode!=='desktop'){window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM=mode;}
      },{token,mode,scale});
      await p.goto('http://127.0.0.1:'+server.address().port);
      await p.waitForFunction(()=>!!document.querySelector('#prompt')?.oninput);
      await p.evaluate(({theme,scale})=>{
        document.documentElement.dataset.theme=theme;
        document.documentElement.dataset.motion='off';
        document.documentElement.style.setProperty('--text-scale',scale);
      },{theme,scale});
      for(const focused of [false,true]){
        for(const html of ['', '<br>', '<div><br></div>', '<p><br></p>', '\u200b', 'hello', 'Line one<br>Line two']){
          const state=await p.evaluate(({html,focused})=>{
            const e=document.querySelector('#prompt');
            e.innerHTML=html;e.dispatchEvent(new Event('input',{bubbles:true}));
            if(focused)e.focus({preventScroll:true});else e.blur();
            const sel=getSelection(),r=document.createRange();r.selectNodeContents(e);r.collapse(false);sel.removeAllRanges();sel.addRange(r);
            const beforeHTML=e.innerHTML, nodes=Array.from(e.childNodes);
            const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
            const geometry=()=>({prompt:rect(e.getBoundingClientRect()),composer:rect(document.querySelector('#composer').getBoundingClientRect()),caret:rect(r.getBoundingClientRect())});
            const before=geometry(),pseudo=getComputedStyle(e,'::before');
            const content=pseudo.content,position=pseudo.position;
            const style=document.createElement('style');style.textContent='#prompt::before{content:none!important}';document.head.append(style);
            const withoutPlaceholder=geometry();style.remove();
            return {theme:document.documentElement.dataset.theme,scale:Number(getComputedStyle(document.documentElement).getPropertyValue('--text-scale')),empty:e.dataset.empty,content,position,before,withoutPlaceholder,
              preserved:e.innerHTML===beforeHTML&&nodes.every((n,i)=>e.childNodes[i]===n)&&sel.anchorNode===r.startContainer&&sel.anchorOffset===r.startOffset};
          },{html,focused});
          const empty=!html.replace(/<[^>]*>/g,'').replace(/\u200b/g,'').trim();
          assert.equal(state.theme,theme);assert.equal(state.scale,scale);assert.equal(state.empty,String(empty));assert.equal(state.preserved,true,'DOM/node/selection changed');
          if(empty){
            assert.notEqual(state.content,'none');
            for(const key of ['prompt','composer','caret'])for(const axis of ['x','y','width','height'])
              assert.ok(Math.abs(state.before[key][axis]-state.withoutPlaceholder[key][axis])<.5,
                `${mode}/${theme}/${scale}/${focused}/${html}: placeholder changes ${key}.${axis}: ${JSON.stringify(state)}`);
          }else assert.equal(state.content,'none','placeholder overlays populated editor');
          results.push({mode,theme,scale,focused,html,state});
          if(out&&html==='<div><br></div>'&&focused)await p.locator('#composer').screenshot({path:path.join(out,`${engine}-${mode}-${theme}-${scale}-cleared.png`)});
        }
      }
      // Native browser editing, clear, composition and programmatic restore retain the marker semantics.
      await p.locator('#prompt').focus();await p.keyboard.type('Typed draft');
      await p.keyboard.press('ControlOrMeta+A');await p.keyboard.press('Backspace');
      assert.equal(await p.locator('#prompt').getAttribute('data-empty'),'true');
      const composition=await p.evaluate(()=>{
        const e=document.querySelector('#prompt');e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
        e.innerHTML='\u4e2d';e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'\u4e2d',isComposing:true}));
        const during={text:e.textContent,empty:e.dataset.empty,html:e.innerHTML};
        e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'\u4e2d'}));
        e.value='Restored draft';const restored={text:e.value,empty:e.dataset.empty};e.value='';
        return {during,restored,cleared:e.dataset.empty};
      });
      assert.equal(composition.during.text,'中');assert.equal(composition.during.empty,'false');
      assert.equal(composition.restored.text,'Restored draft');assert.equal(composition.restored.empty,'false');assert.equal(composition.cleared,'true');
      const expanded=await p.evaluate(()=>{document.querySelector('#computer-expand').click();return document.querySelector('#computer-panel').classList.contains('expanded')});
      assert.equal(expanded,mode!=='ios');assert.deepEqual(errors,[]);await p.close();
    }
    console.log(`PASS ${results.length} placeholder geometry/DOM/caret cases; editing/composition/restore and expansion retained`);
  } finally {
    if(out)fs.writeFileSync(path.join(out,`${engine}-results.json`),JSON.stringify(results,null,2));
    await b.close();server.close();
  }
})().catch(e=>{console.error(e);server.close();process.exitCode=1});

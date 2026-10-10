// A device preference: changing accounts must not make this screen hard to read.
(()=>{
 const choices=[100,115,125,150],key='kindred-text-size';
 const fallback=(window.__KINDRED_DESKTOP?window.__KINDRED_DESKTOP.platform==='linux':/Linux/.test(navigator.platform))?115:100;
 const systemManaged=window.__KINDRED_MOBILE_PLATFORM==='ios';
 if(window.__KINDRED_MOBILE)document.documentElement.dataset.mobile='true';
 if(systemManaged)document.documentElement.dataset.systemTextSize='true';
 const validScale=scale=>typeof scale==='number'&&Number.isFinite(scale)&&scale>0;
 let systemScale=validScale(window.__KINDRED_SYSTEM_TEXT_SCALE)?window.__KINDRED_SYSTEM_TEXT_SCALE:1;
 let value=fallback;try{const saved=Number(localStorage.getItem(key));if(choices.includes(saved))value=saved;}catch{}
 const apply=size=>{
  const root=document.documentElement,scale=String(systemManaged?systemScale:size/100);
  if(root.style.getPropertyValue('--text-scale')!==scale)root.style.setProperty('--text-scale',scale);
  if(systemManaged)root.toggleAttribute('data-large-text',systemScale>1.5);
 };
 apply(value);
 window.KindredReadingSize={systemManaged,get:()=>systemManaged?systemScale*100:value,set:size=>{if(systemManaged)return;size=Number(size);if(!choices.includes(size))return;value=size;apply(size);try{localStorage.setItem(key,String(size));}catch{}}};
 window.addEventListener('kindred-system-text-size',event=>{if(!systemManaged||!validScale(event.detail?.scale))return;systemScale=event.detail.scale;apply(value);});
 window.addEventListener('storage',event=>{if(!systemManaged&&event.key===key){const size=Number(event.newValue);value=choices.includes(size)?size:fallback;apply(value);}});
})();

// Typography is local to this device/browser. Mobile always uses the OS family;
// a saved desktop preference on the same server must not override it.
(()=>{
 const key='kindred-interface-font',families={inter:'Inter','dm-sans':'DM Sans',manrope:'Manrope'};
 const systemManaged=!!window.__KINDRED_MOBILE||['ios','android'].includes(window.__KINDRED_MOBILE_PLATFORM)||/Android|iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const valid=value=>Object.hasOwn(families,value);
 let value='inter';try{const saved=localStorage.getItem(key);if(valid(saved))value=saved;}catch{}
 const apply=()=>document.documentElement.dataset.interfaceFont=systemManaged?'system':value;
 const notify=()=>window.dispatchEvent(new Event('kindred-interface-font-change'));
 const update=next=>{
  if(systemManaged)return;
  value=valid(next)?next:'inter';apply();notify();
  // Refit wrapped text once the chosen face replaces its fallback.
  document.fonts?.load(`400 16px "${families[value]}"`).then(notify).catch(()=>{});
 };
 apply();
 window.KindredInterfaceFont={systemManaged,get:()=>systemManaged?'system':value,set:next=>{
  if(systemManaged||!valid(next))return;
  update(next);try{localStorage.setItem(key,value);}catch{}
 }};
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)update(event.newValue);});
})();

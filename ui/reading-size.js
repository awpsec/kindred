// A device preference: changing accounts must not make this screen hard to read.
(()=>{
 const choices=[100,115,125,150],key='kindred-text-size';
 const fallback=(window.__KINDRED_DESKTOP?window.__KINDRED_DESKTOP.platform==='linux':/Linux/.test(navigator.platform))?115:100;
 let value=fallback;try{const saved=Number(localStorage.getItem(key));if(choices.includes(saved))value=saved;}catch{}
 const apply=size=>{document.documentElement.style.setProperty('--text-scale',String(size/100));};
 apply(value);
 window.KindredReadingSize={get:()=>value,set:size=>{size=Number(size);if(!choices.includes(size))return;value=size;apply(size);try{localStorage.setItem(key,String(size));}catch{}}};
 window.addEventListener('storage',event=>{if(event.key===key){const size=Number(event.newValue);value=choices.includes(size)?size:fallback;apply(value);}});
})();

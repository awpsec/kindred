// One lifecycle for completed decisions and completed lists; no history duplication.
const receipts=new Map();
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function signature(root){
 if(root.dataset.visualSignature)return root.dataset.visualSignature;
 const copy=root.cloneNode(true);
 for(const file of copy.querySelectorAll('[data-file-signature]')){
  const marker=document.createElement('span');marker.dataset.fileSignature=file.dataset.fileSignature;file.replaceWith(marker);
 }
 return copy.outerHTML;
}
const reduce=()=>document.hidden||!document.hasFocus()||document.documentElement.dataset.motion==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches;
// Running disclosures settle at their destination on blur, backgrounding or a
// reduced-motion change, as other finite effects do.
const settling=new Set(),settleAll=()=>{for(const finish of [...settling])finish();};
addEventListener('blur',settleAll);document.addEventListener('visibilitychange',settleAll);matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',settleAll);
new MutationObserver(settleAll).observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
export function decisionReceipt(root,{key,title,outcome,terminal=false}={}){
 if(!key)return root;
 const previous=receipts.get(key),mounted=document.querySelector('[data-receipt-key="'+CSS.escape(key)+'"]'),oldHeight=mounted?.getBoundingClientRect().height||0,oldWidth=mounted?.getBoundingClientRect().width||0,restoreFocus=mounted?.contains(document.activeElement);
 root.dataset.receiptKey=key;
 if(receipts.size>500)receipts.delete(receipts.keys().next().value);
 if(!terminal){
  receipts.set(key,{terminal:false,open:false});
  if(previous?.terminal&&oldHeight)requestAnimationFrame(()=>{
   if(!root.isConnected||reduce())return;
   root.classList.add('decision-receipt-moving');
   const motion=root.animate([{height:oldHeight+'px'},{height:root.getBoundingClientRect().height+'px'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
   motion.onfinish=motion.oncancel=()=>root.classList.remove('decision-receipt-moving');
  });
  return root;
 }
 if(root.dataset.decisionReceipt===key)return root;
 const state={terminal:true,open:previous?.terminal?previous.open:false};receipts.set(key,state);if(receipts.size>500)receipts.delete(receipts.keys().next().value);
 root.dataset.decisionSignature=signature(root);root.dataset.decisionReceipt=key;root.classList.add('decision-receipt');root.dataset.receiptTone=/^(completed|allowed|approved|answered|teammate created|upload approved|time selected|sent)/i.test(outcome)?'success':'neutral';
 const details=el('details','decision-receipt-disclosure'),summary=el('summary','decision-receipt-summary'),copy=el('span','decision-receipt-copy'),status=el('span','decision-receipt-outcome',outcome),toggle=el('span','decision-receipt-toggle','View details'),body=el('div','decision-receipt-body');
 copy.append(el('strong','decision-receipt-title',title),status);summary.append(copy,toggle);summary.setAttribute('aria-label',`${title} · ${outcome} · View details`);while(root.firstChild)body.append(root.firstChild);details.append(summary,body);root.append(details);details.open=!!state.open;body.inert=!state.open;
 root.classList.toggle('receipt-collapsed',!state.open);
 let animation=null,settle=0,pending=null;
 function setOpen(open,automatic=false){
  const currentHeight=root.getBoundingClientRect().height,currentWidth=root.getBoundingClientRect().width;settling.delete(pending);clearTimeout(settle);if(animation){animation.onfinish=animation.oncancel=null;animation.cancel();}animation=null;state.open=open;receipts.set(key,state);
  if(!open&&(body.contains(document.activeElement)||restoreFocus&&automatic))summary.focus({preventScroll:true});
  const start=automatic&&oldHeight?oldHeight:currentHeight;
  root.classList.remove('receipt-collapsed');details.open=true;body.inert=!open;toggle.textContent=open?'Hide details':'View details';summary.setAttribute('aria-expanded',String(open));summary.setAttribute('aria-label',`${title} · ${outcome} · ${toggle.textContent}`);
  const expanded=root.getBoundingClientRect();details.open=false;root.classList.add('receipt-collapsed');const collapsed=root.getBoundingClientRect();details.open=true;root.classList.toggle('receipt-collapsed',!open);
  const finish=()=>{settling.delete(finish);clearTimeout(settle);if(animation){animation.onfinish=animation.oncancel=null;animation.cancel();}details.open=open;body.inert=!open;root.classList.remove('decision-receipt-moving');animation=null;};
  if(reduce()||!root.isConnected){finish();return;}
  root.classList.add('decision-receipt-moving');const target=open?expanded:collapsed;
  animation=root.animate([{height:(start||expanded.height)+'px',width:(automatic&&oldWidth?oldWidth:currentWidth)+'px'},{height:target.height+'px',width:target.width+'px'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
  // Settle even when the webview cancels the effect or drops its finish event.
  animation.onfinish=animation.oncancel=finish;settle=setTimeout(finish,360);settling.add(pending=finish);
 }
 toggle.textContent=state.open?'Hide details':'View details';summary.setAttribute('aria-expanded',String(!!state.open));
 summary.onclick=e=>{e.preventDefault();setOpen(!state.open);};
 if(previous?.terminal===false){details.open=true;body.inert=true;let tries=0;const mounted=()=>{if(root.isConnected)setOpen(false,true);else if(++tries<5)requestAnimationFrame(mounted);};requestAnimationFrame(mounted);}
 return root;
}

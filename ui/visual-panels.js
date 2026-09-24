import { decisionReceipt } from './decision-receipts.js';
const el=(tag,cls='',text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const svg=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
const palette=['#7d9cff','#3abea0','#c392ef','#e5ac60','#ea8798','#69b6c6'];
function link(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
const money=(v,c)=>{if(!Number.isFinite(v))return 'Not available';try{return new Intl.NumberFormat(undefined,{style:'currency',currency:c,maximumFractionDigits:2}).format(v);}catch{return String(v)+' '+(c||'');}};
const number=v=>new Intl.NumberFormat(undefined,{maximumFractionDigits:2,notation:Math.abs(v)>=1e6?'compact':'standard'}).format(v);
function external(text,url,cls=''){const a=el('a',cls,text),safe=link(url);if(safe){a.href=safe;a.target='_blank';a.rel='noopener noreferrer';}return a;}
function image(product,cls){const holder=el('div',cls),url=link(product.image_url);holder.append(el('span','visual-image-placeholder','◇'));if(url){const img=el('img');img.alt=product.name;img.loading='lazy';img.referrerPolicy='no-referrer';img.src=url;img.onload=()=>holder.classList.add('loaded');img.onerror=()=>img.remove();holder.append(img);}return holder;}
function button(text,action,cls=''){const b=el('button',cls,text);b.type='button';b.onclick=action;return b;}
export function visualPanel(data,options={}){
 const {onDiscuss}=options;
 const root=el('section','visual-panel visual-'+data.kind);root.dataset.visualPanel=data.id||data.key;root.dataset.visualSignature=JSON.stringify(data);root.setAttribute('aria-label',data.title);
 const header=el('header','visual-heading');header.append(el('span','visual-eyebrow',({shopping:'SHORTLIST',finance:'AT A GLANCE',chart:'THE NUMBERS'}[data.kind]||'')),el('h3','',data.title));if(data.description)header.append(el('p','visual-description',data.description));root.append(header);
 if(data.kind==='shopping')shopping(root,data,onDiscuss);else if(data.kind==='finance')finance(root,data);else if(data.kind==='chart')chartPanel(root,data);else workflow(root,data,options);
 options.onReady?.(root);
 if(['sources','monitor'].includes(data.kind)){header.remove();root.classList.add('workflow-inline');return root;}
 const footer=el('footer','visual-source');footer.append(data.source_url?external(data.source,data.source_url):el('span','',data.source),el('span','','As of '+data.as_of));root.append(footer);return workflowReceipt(root,data);
}
function shopping(root,data,onDiscuss){
 const products=data.products||[];if(!products.length)return;
 const body=el('div','shopping-layout'),focus=el('div','shopping-focus'),rail=el('div','shopping-options');rail.setAttribute('role','group');rail.setAttribute('aria-label','Compare products');let selected=0;
 const tabs=products.map((p,i)=>{const tab=button('',()=>show(i),'shopping-option');tab.setAttribute('aria-label',p.name);tab.append(image(p,'shopping-thumb'),el('span','',p.name));rail.append(tab);return tab;});
 function show(i){selected=i;const p=products[i];tabs.forEach((t,j)=>t.setAttribute('aria-pressed',String(i===j)));focus.replaceChildren();
  const art=external('',p.url,'shopping-art-link');art.setAttribute('aria-label','View '+p.name+' at '+p.merchant);art.append(image(p,'shopping-art'));
  const copy=el('div','shopping-copy');copy.append(el('span','shopping-pick',i===0?'Best match':'Alternative '+i),external(p.name,p.url,'shopping-title'),el('p','shopping-price',Number.isFinite(p.price)?money(p.price,p.currency):'Check current price'),el('span','visual-muted',p.merchant));
  copy.append(el('p','shopping-summary',p.description));const detail=el('details','shopping-description');detail.append(el('summary','','Details & compatibility'),el('p','',p.description),el('p','shopping-compatibility',p.compatibility));
  copy.append(detail);const actions=el('div','visual-actions');actions.append(external('View at '+p.merchant+' ↗',p.url,'visual-button'));if(onDiscuss)actions.append(button('Discuss this pick',()=>onDiscuss({panel_key:data.key,product_id:p.id,name:p.name,url:p.url}),'visual-subtle'));copy.append(actions);focus.append(art,copy);
 }
 rail.addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?products.length-1:(selected+(['ArrowRight','ArrowDown'].includes(e.key)?1:products.length-1))%products.length;show(next);tabs[next].focus();}});
 body.append(focus,rail);root.append(body);show(0);
}
function finance(root,data){
 const row=el('div','finance-grid');for(const h of data.holdings||[]){const card=el('article','finance-widget'),change=Number.isFinite(h.change_percent)?h.change_percent:null;card.dataset.direction=change===null||change===0?'flat':change>0?'up':'down';
  const head=el('div','finance-label');head.append(el('strong','',h.symbol),el('span','',h.name));card.append(head);
  if((h.points||[]).length>=2)card.append(plot([{name:h.symbol,points:h.points}],{spark:true,color:change===null||change===0?'#9299a6':change>0?'#35b88a':'#e27983'}));else card.append(el('div','finance-empty','History unavailable'));
  const value=el('div','finance-value');value.append(el('strong','',money(h.price??h.balance,h.currency)));if(change!==null)value.append(el('span','finance-change',(change>0?'+':'')+number(change)+'%'));card.append(value);
  if(Number.isFinite(h.balance)&&Number.isFinite(h.price))card.append(el('div','finance-detail','Holding '+money(h.balance,h.currency)));
  if(Number.isFinite(h.pnl))card.append(el('div','finance-detail','P&L '+(h.pnl>0?'+':'')+money(h.pnl,h.currency)));
  if(h.url)card.append(external('Source ↗',h.url,'finance-link'));row.append(card);
 }root.append(row);
}
function chartPanel(root,data){
 const controls=el('div','chart-legend'),host=el('div','chart-host'),enabled=new Set((data.series||[]).map((_,i)=>i));
 const draw=()=>host.replaceChildren(plot((data.series||[]).map((s,i)=>({...s,color:palette[i]})).filter((_,i)=>enabled.has(i)),data));
 (data.series||[]).forEach((s,i)=>{const b=button(s.name,()=>{if(enabled.has(i)&&enabled.size===1)return;enabled.has(i)?enabled.delete(i):enabled.add(i);b.setAttribute('aria-pressed',String(enabled.has(i)));draw();},'chart-series');b.style.setProperty('--series-color',palette[i]);b.setAttribute('aria-pressed','true');controls.append(b);});if(data.z_label)controls.append(el('span','visual-muted','Bubble size: '+data.z_label));root.append(controls,host);draw();
 const details=el('details','chart-data'),summary=el('summary','','View data');details.append(summary);const table=el('table');const tr=el('tr');for(const label of ['Series',data.x_label,data.y_label,...(data.z_label?[data.z_label]:[])])tr.append(el('th','',label));const thead=el('thead');thead.append(tr);table.append(thead);const tbody=el('tbody');for(const s of data.series||[])for(const p of s.points||[]){const r=el('tr');for(const value of [s.name,p.label||formatX(p.x,data),number(p.y),...(data.z_label?[p.z==null?'—':number(p.z)]:[])])r.append(el('td','',value));tbody.append(r);}table.append(tbody);details.append(table);root.append(details);
}
function formatX(x,data){if(data.x_type==='time'){const d=new Date(x);return Number.isNaN(d.getTime())?'Unknown date':d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'2-digit'});}return number(x);}
function plot(series,data){
 const wrap=el('div',data.spark?'finance-spark':'visual-chart'),all=series.flatMap((s,si)=>(s.points||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).map(p=>({...p,name:s.name,si})));if(!all.length){wrap.append(el('p','visual-muted','No data available'));return wrap;}
 const W=640,H=data.spark?110:280,left=data.spark?0:62,right=data.spark?0:22,top=data.spark?8:18,bottom=data.spark?8:54;
 let xmin=Math.min(...all.map(p=>p.x)),xmax=Math.max(...all.map(p=>p.x)),ymin=Math.min(...all.map(p=>p.y)),ymax=Math.max(...all.map(p=>p.y));
 if(data.chart_type==='bar'){ymin=Math.min(0,ymin);ymax=Math.max(0,ymax);}if(xmin===xmax){xmin-=.5;xmax+=.5;}if(ymin===ymax){const pad=Math.max(1,Math.abs(ymin)*.05);ymin-=pad;ymax+=pad;}
 const X=x=>left+(x-xmin)/(xmax-xmin)*(W-left-right),Y=y=>top+(ymax-y)/(ymax-ymin)*(H-top-bottom),graph=svg('svg',{viewBox:`0 0 ${W} ${H}`,role:data.spark?'img':'group','aria-label':data.spark?'Price history':`${data.x_label} by ${data.y_label}${data.z_label?', bubble size: '+data.z_label:''}`});
 if(!data.spark){for(let i=0;i<5;i++){const val=ymin+(ymax-ymin)*i/4,y=Y(val);graph.append(svg('line',{x1:left,y1:y,x2:W-right,y2:y,class:'chart-gridline'}));const t=svg('text',{x:left-10,y:y+4,'text-anchor':'end',class:'chart-tick'});t.textContent=number(val);graph.append(t);}const labels=[...new Map(all.filter(p=>p.label).map(p=>[p.x,p.label])).entries()].sort((a,b)=>a[0]-b[0]);const ticks=labels.length?labels.filter((_,i)=>labels.length<=6||i===0||i===labels.length-1||i%Math.ceil(labels.length/5)===0):Array.from({length:4},(_,i)=>{const x=xmin+(xmax-xmin)*i/3;return[x,formatX(x,data)];});ticks.forEach(([val,label],i)=>{const t=svg('text',{x:X(val),y:H-bottom+23,'text-anchor':X(val)<W/3?'start':X(val)>W*2/3?'end':'middle',class:'chart-tick'});t.textContent=String(label).length>24?String(label).slice(0,23)+'…':label;const title=svg('title');title.textContent=label;t.append(title);graph.append(t);});const label=svg('text',{x:W/2,y:H-5,'text-anchor':'middle',class:'chart-axis-label'});label.textContent=data.x_label;graph.append(label);const yl=svg('text',{x:12,y:H/2,transform:`rotate(-90 12 ${H/2})`,'text-anchor':'middle',class:'chart-axis-label'});yl.textContent=data.y_label;graph.append(yl);}
 const tooltip=el('output','chart-tooltip');tooltip.dataset.empty='true';tooltip.setAttribute('aria-live','polite');
 const shared=!data.spark&&!['bar','scatter'].includes(data.chart_type);
 const guide=svg('g',{class:'chart-inspection','pointer-events':'none',visibility:'hidden'});
 let inspectedX=null;
 const hide=()=>{tooltip.dataset.empty='true';guide.setAttribute('visibility','hidden');inspectedX=null;};
 const inspect=x=>{
  if(inspectedX===x)return;inspectedX=x;
  const selected=all.filter(p=>p.x===x),px=X(x);
  guide.replaceChildren(svg('line',{x1:px,x2:px,y1:top,y2:H-bottom,class:'chart-crosshair'}));
  tooltip.replaceChildren(el('strong','chart-tooltip-date',formatX(x,data)));
  if(data.x_type!=='time')tooltip.firstChild.textContent=selected[0]?.label||formatX(x,data);
  for(const p of selected){const color=series[p.si].color||palette[p.si];
   guide.append(svg('circle',{cx:px,cy:Y(p.y),r:6,fill:color,stroke:'var(--bg)','stroke-width':2}));
   const row=el('span','chart-tooltip-row');row.style.setProperty('--series-color',color);
   row.append(el('span','',p.name),el('strong','',number(p.y)));tooltip.append(row);
  }
  tooltip.dataset.empty='false';guide.setAttribute('visibility','visible');
  const scale=graph.getBoundingClientRect().width/W,pos=16+px*scale;
  const preferred=pos+18+tooltip.offsetWidth>wrap.clientWidth?pos-tooltip.offsetWidth-18:pos+18;
  tooltip.style.left=`clamp(8px, ${preferred}px, calc(100% - ${tooltip.offsetWidth+8}px))`;
 };
 if(shared){tooltip.classList.add('chart-tooltip-shared');
  graph.addEventListener('pointermove',e=>{const matrix=graph.getScreenCTM();if(!matrix)return;const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());
   if(point.x<left||point.x>W-right||point.y<top||point.y>H-bottom){hide();return;}
   const target=xmin+(point.x-left)/(W-left-right)*(xmax-xmin);
   inspect(all.reduce((a,p)=>Math.abs(p.x-target)<Math.abs(a-target)?p.x:a,all[0].x));
  });graph.addEventListener('pointerleave',hide);
 }
 const maxZ=Math.max(1,...all.map(p=>p.z||0));series.forEach((s,si)=>{const points=(s.points||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),color=s.color||data.color||palette[si];if(!points.length)return;
  if(!['bar','scatter'].includes(data.chart_type)){const d=points.map((p,i)=>(i?'L':'M')+X(p.x)+' '+Y(p.y)).join(' ');graph.append(svg('path',{d,fill:'none',stroke:color,'stroke-width':data.spark?3:2.5,'vector-effect':'non-scaling-stroke'}));}
  if(!data.spark)points.forEach(p=>{let mark;if(data.chart_type==='bar'){const width=Math.min(40,(W-left-right)/Math.max(1,points.length)/series.length*.7),x=Math.max(left,Math.min(W-right-width,X(p.x)+(si-(series.length-1)/2)*width-width/2));mark=svg('rect',{x,y:Math.min(Y(0),Y(p.y)),width,height:Math.max(1,Math.abs(Y(p.y)-Y(0))),rx:2,fill:color});}else mark=svg('circle',{cx:X(p.x),cy:Y(p.y),r:data.chart_type==='scatter'?p.z==null?5:3+Math.sqrt(p.z/maxZ)*13:4,fill:color});
   const text=s.name+' · '+(p.label||formatX(p.x,data))+' · '+data.y_label+': '+number(p.y)+(p.z!=null?' · '+(data.z_label||'Size')+': '+number(p.z):'');mark.setAttribute('tabindex',graph.querySelector('.chart-point')?'-1':'0');mark.setAttribute('role','img');mark.setAttribute('aria-label',text);mark.classList.add('chart-point');const title=svg('title');title.textContent=text;mark.append(title);const show=()=>{if(shared){inspect(p.x);return;}tooltip.textContent=text;tooltip.dataset.empty='false';};if(!shared){mark.onpointerenter=show;mark.onpointerleave=hide;}mark.onfocus=show;mark.onblur=hide;graph.append(mark);
  });
 });if(shared)graph.append(guide);graph.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const dots=[...graph.querySelectorAll('.chart-point')],i=dots.indexOf(document.activeElement);if(i<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?dots.length-1:Math.max(0,Math.min(dots.length-1,i+(e.key==='ArrowRight'?1:-1)));dots[i].setAttribute('tabindex','-1');dots[next].setAttribute('tabindex','0');dots[next].focus({preventScroll:true});});wrap.append(graph);if(!data.spark)wrap.append(tooltip);return wrap;
}

// Workflow controls carry data back to the authenticated server, never model-authored code.
function disclosure(label,content){const d=el('details','workflow-details');d.append(el('summary','',label),content);return d;}
let workflowGroupId=0;
function workflow(root,data,options){
 const body=el('div','workflow-body'),feedback=el('output','workflow-feedback');feedback.setAttribute('aria-live','polite');
 const actions=el('div','visual-actions');let busy=false;
 const receipt=()=>{feedback.classList.add('is-saved');body.querySelectorAll('input,textarea,.workflow-slot').forEach(n=>n.disabled=true);actions.replaceChildren();feedback.textContent=({approve:'✓ Approved for review',changes:'Changes requested',upload:'✓ Upload approved',select:'✓ Time selected for invitation review',decline:'Declined'}[data.response?.action]||'Response saved');};
 async function respond(input){if(busy)return;busy=true;body.querySelectorAll('input,textarea,.workflow-slot').forEach(n=>n.disabled=true);actions.querySelectorAll('button').forEach(b=>b.disabled=true);feedback.textContent='Saving…';try{data.response=await options.onRespond({...input,revision:data.revision});receipt();workflowReceipt(root,data);}catch(e){feedback.textContent=e.message||'Could not save. Try again.';body.querySelectorAll('input,textarea,.workflow-slot').forEach(n=>n.disabled=false);actions.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{busy=false;}}
 if(data.kind==='project'){
  const rows=data.dependencies||[],visible=el('div'),more=el('div');
  rows.forEach((edge,i)=>{const row=el('div','workflow-dependency');const addBot=(id,name)=>{row.append(options.avatar?options.avatar(id,name):el('span','workflow-initial',name.slice(0,1)),el('strong','',name));};addBot(edge.requester_id,edge.requester);row.append(el('span','visual-muted',edge.resolved?'received from':edge.status==='failed'?'needs follow-up from':['cancelled','cancelling'].includes(edge.status)?'request stopped for':'waiting on'));addBot(edge.bot_id,edge.name);if(options.onChat){const b=button('',()=>options.onChat(edge.chat_id),'workflow-open');b.setAttribute('aria-label','Open chat with '+edge.name);const a=svg('svg',{viewBox:'0 0 24 24','aria-hidden':'true'});a.append(svg('path',{d:'M7 17 17 7M7 7h10v10',fill:'none',stroke:'currentColor','stroke-width':1.5}));b.append(a);row.append(b);}(i<3?visible:more).append(row);});body.append(visible);if(rows.length>3)body.append(disclosure(`${rows.length-3} more dependencies`,more));if(!rows.length)body.append(el('p','visual-muted','No active recorded bot dependencies in this conversation.'));
 } else if(data.kind==='sources'){
  const links=el('div','workflow-source-list');for(const s of data.sources||[]){const a=external(s.title,s.url,'workflow-source');if(link(s.icon_url)){const img=el('img');img.src=s.icon_url;img.alt='';img.referrerPolicy='no-referrer';img.loading='lazy';img.onerror=()=>img.remove();a.append(img);}a.append(el('span','visual-muted',(()=>{try{return new URL(s.url).hostname;}catch{return '';}})()));links.append(a);}body.append(disclosure(`${(data.sources||[]).length} sources · ${data.as_of}`,links));
 } else if(data.kind==='monitor'){
  const m=data.monitor_state;const line=el('div','workflow-monitor');line.append(el('span','workflow-monitor-dot'),el('strong','',m?.name||'Monitor unavailable'),el('span','visual-muted',m?(m.error?'Needs attention':m.enabled?'Enabled':'Paused'):'Removed'));if(m?.enabled&&!m.error)line.querySelector('.workflow-monitor-dot').classList.add('enabled');if(options.onMonitor&&m)line.append(button('Manage',options.onMonitor,'visual-subtle'));body.append(line);if(m?.checked_at)body.append(el('span','visual-muted','Last checked '+new Date(m.checked_at*1000).toLocaleString()));if(m?.error)body.append(disclosure('Check issue',el('p','visual-muted',m.error)));
 } else if(data.kind==='schedule'){
  body.append(el('p','visual-muted',`${data.calendar} · ${data.account} · ${data.timezone}`));let selected=data.response?.input?.slot_id||data.slots?.[0]?.id;
  const slots=el('div','workflow-slots');const format=n=>new Date(n*1000).toLocaleString(undefined,{timeZone:data.timezone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  for(const s of data.slots||[]){const b=button('',()=>{selected=s.id;slots.querySelectorAll('button').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));},'workflow-slot');b.append(el('strong','',format(s.start)),el('span','visual-muted',new Date(s.end*1000).toLocaleTimeString(undefined,{timeZone:data.timezone,hour:'numeric',minute:'2-digit'})));b.setAttribute('aria-pressed',String(s.id===selected));b.disabled=!!data.response;slots.append(b);}body.append(slots,disclosure('Attendees',el('p','visual-muted',(data.attendees||[]).join(' · '))));const meetingGroup='workflow-meeting-'+(++workflowGroupId);let meeting=data.response?.input?.meeting_option_id||'';const meetingDetail=el('div');const detailDisclosure=disclosure('Meeting details',meetingDetail);const updateMeetingDetails=()=>{const selectedOption=(data.meeting_options||[]).find(o=>o.id===meeting);meetingDetail.replaceChildren();detailDisclosure.hidden=!selectedOption?.url&&!selectedOption?.location;if(selectedOption?.url)meetingDetail.append(external(selectedOption.url,selectedOption.url,'workflow-meeting-link'));if(selectedOption?.location)meetingDetail.append(el('p','visual-muted',selectedOption.location));};const choices=el('fieldset','workflow-meeting'),legend=el('legend','','Meeting format');choices.append(legend);const labels={none:'No conferencing',google_meet:'Google Meet',zoom:'Zoom',other:'Existing meeting link',in_person:'In person'};for(const choice of [...(data.meeting_options||[])].sort((a,b)=>['none','google_meet','zoom','other','in_person'].indexOf(a.kind)-['none','google_meet','zoom','other','in_person'].indexOf(b.kind))){const label=el('label','workflow-choice'),radio=el('input');radio.type='radio';radio.name=meetingGroup;radio.value=choice.id;radio.checked=meeting===choice.id;radio.disabled=!!data.response;radio.onchange=()=>{meeting=choice.id;updateMeetingDetails();};label.append(radio,el('span','',labels[choice.kind]||'Meeting'));choices.append(label);}updateMeetingDetails();body.append(choices,detailDisclosure);if(!data.meeting_options?.length)body.append(el('p','visual-muted','Ask the bot to refresh these times with meeting format options.'));if(options.onRespond&&data.meeting_options?.length)actions.append(button('Review invitation',()=>{if(!meeting){feedback.textContent='Choose a meeting format first.';choices.querySelector('input')?.focus();return;}respond({action:'select',slot_id:selected,meeting_option_id:meeting});},'visual-button'));body.append(el('p','workflow-caption','Availability is rechecked before an invitation is sent.'));
 } else {
  if(data.file&&options.fileCard)body.append(options.fileCard(data.file));else body.append(el('p','visual-muted',data.file?.name||'File unavailable'));
  if(data.kind==='upload'){
   body.append(el('p','visual-muted',data.account),external(data.destination,data.destination_url,'workflow-destination'));
   const label=el('label','workflow-field','Filename'),input=el('input');input.value=data.response?.filename||data.filename;input.maxLength=240;input.disabled=!!data.response;label.append(input);body.append(label,el('p','workflow-caption','Approval applies to this file and destination. Existing files will not be overwritten without another approval.'));
   if(options.onRespond&&data.file)actions.append(button('Approve upload',()=>respond({action:'upload',filename:input.value}),'visual-button'));
  }else{
   body.append(el('p','workflow-caption',`Revision ${data.revision} · Approval is for review, not sending.`));
   const label=el('label','workflow-field','Requested changes'),notes=el('textarea');notes.maxLength=4000;label.append(notes);label.hidden=true;body.append(label);
   if(options.onRespond&&data.file)actions.append(button('Approve revision '+data.revision,()=>respond({action:'approve'}),'visual-button'),button('Request changes',()=>{if(label.hidden){label.hidden=false;notes.focus();return;}if(!notes.value.trim()){notes.focus();return;}respond({action:'changes',notes:notes.value});},'visual-subtle'));
  }
 }
 if(options.onRespond&&['schedule','review','upload'].includes(data.kind))actions.append(button('Decline',()=>respond({action:'decline'}),'visual-subtle'));
 body.append(actions,feedback);root.append(body);if(data.response)receipt();
}
export function compactChanges(before='',after=''){
 const root=el('div','workflow-changes'),a=before.split('\n'),b=after.split('\n');let start=0;while(start<a.length&&start<b.length&&a[start]===b[start])start++;let endA=a.length,endB=b.length;while(endA>start&&endB>start&&a[endA-1]===b[endB-1]){endA--;endB--;}
 if(start===endA&&start===endB){root.append(el('p','visual-muted','No text changes'));return root;}
 const removed=a.slice(start,endA).join('\n'),added=b.slice(start,endB).join('\n');const diff=el('div','workflow-diff');for(const[label,text,cls]of [['Current',removed,'removed'],['Proposed',added,'added']]){const section=el('div');section.append(el('span','visual-muted',label),el('pre',cls,text||'(Empty)'));diff.append(section);}
 if(endA-start+endB-start<=6&&removed.length+added.length<=600)root.append(diff);else root.append(el('p','visual-muted',`${endA-start} current lines · ${endB-start} proposed lines`),disclosure('View changes',diff));
 const all=el('div');all.append(disclosure('Current instructions',el('pre','',before)),disclosure('Proposed instructions',el('pre','',after)));root.append(disclosure('Full instructions',all));return root;
}

function workflowReceipt(root,data){
 if(!['schedule','review','upload'].includes(data.kind))return root;
 root.dataset.visualSignature=JSON.stringify(data);
 const labels={approve:'Approved for review',upload:'Upload approved',select:'Time selected',decline:'Declined'};
 return decisionReceipt(root,{key:'workflow:'+data.id+':'+data.revision,title:data.title,outcome:labels[data.response?.action]||'',terminal:!!labels[data.response?.action]});
}

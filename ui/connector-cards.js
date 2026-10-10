import { decisionReceipt } from './decision-receipts.js';
import { emailRecipients } from './email-recipients.js';
// Content comes from connector receipts, never executable model-authored markup.
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const labels={preparing:'Preparing',pending:'Your review',approved:'Approved · awaiting execution',ready:'Ready',executing:'In progress',completed:'Completed',failed:'Check outcome',denied:'Not approved',changes_requested:'Changes requested',interrupted:'Interrupted · check outcome'};
const fieldNames={to:'To',from:'From',cc:'Cc',bcc:'Bcc',subject:'Subject',body:'Message'};
const safeLink=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
function readable(value){if(value===null||value===undefined)return '';if(typeof value==='string')return value;if(typeof value==='number'||typeof value==='boolean')return String(value);if(Array.isArray(value))return value.map(readable).filter(Boolean).join(', ');return value.name||value.filename||value.file_name||value.displayName||value.value||value.text||JSON.stringify(value);}
function safeRelated(value){if(Array.isArray(value))return value.map(safeRelated);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([k])=>!/contentBytes|authorization|token|secret|password|credential|^data$/i.test(k)).map(([k,v])=>[k,safeRelated(v)]));}
function sourceTime(service,key,text){const millis=service==='clickup'&&key==='Due',seconds=service==='stripe'&&key==='Created';if(!(millis||seconds)||! /^-?\d+$/.test(text))return null;const raw=Number(text),value=raw*(millis?1:1000);if(!Number.isSafeInteger(raw)||!Number.isSafeInteger(value))return null;const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;const iso=date.toISOString();return {iso,text:iso.replace('T',' ').replace('.000Z',' UTC').replace('Z',' UTC'),source:`Source timestamp: ${text} (${millis?'milliseconds':'seconds'})`};}
function details(value,service,inline=false){
 const box=el('dl','connector-record-fields');
 for(const[k,v]of Object.entries(value||{})){
  if(/token|secret|password|credential|authorization/i.test(k))continue;
  const clean=inline?safeRelated(v):v,nested=inline&&clean&&typeof clean==='object',text=readable(clean);
  if(!nested&&!text)continue;
  const label=({CustomerRef:'Customer',TotalAmt:'Total',Balance:'Balance due',CurrencyRef:'Currency',DueDate:'Due date',DocNumber:'Number'}[k]||k.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ')).replace(/\b(id|url|api)\b/gi,w=>w.toUpperCase()).replace(/^./,c=>c.toUpperCase());
  box.append(el('dt','',label));const dd=el('dd');
  const href=/^(url|webUrl|web_url|Open source|Open form|Join meeting)$/i.test(k)?safeLink(text):null;
  if(nested){const more=el('details','connector-field-more'),count=Object.keys(clean).length;more.append(el('summary','',`${count} ${count===1?'field':'fields'}`),details(clean,service,true));dd.append(more);}
  else if(href){const a=el('a','',/^(Open |Join )/.test(k)?k:'Open source');a.href=href;a.target='_blank';a.rel='noopener noreferrer';dd.append(a);}
  else{const time=sourceTime(service,k,text);if(time){const n=el('time','',time.text);n.dateTime=time.iso;n.title=time.source;dd.append(n);}else if(inline&&text.length>600){const more=el('details','connector-field-more');more.append(el('summary','',text.slice(0,180)+'…'),el('pre','',text));dd.append(more);}else dd.textContent=text;}
  if(inline&&/(^id$|id$|_id$)/i.test(k))dd.classList.add('connector-field-id');box.append(dd);
 }
 return box;
}
// Provider aliases ("me", template expressions, account IDs) are not sender
// addresses. Never invent an address when the connector has not supplied one.
export function emailSenderLabel(email,account){
 const address=value=>{
  if(value&&typeof value==='object')return address(value.emailAddress||value.address||value.email);
  if(typeof value!=='string')return '';
  const text=value.trim();
  if(/[\r\n{}]/.test(text))return '';
  return /^(?:[^<>]+<)?[^\s<>@]+@[^\s<>@]+(?:>)?$/.test(text)?text:'';
 };
 return address(email?.from?.text)||address(account)||'Connected account';
}
const emailReviewStates=new Map();
// Keep local editors mounted without exposing receipt payloads in DOM attributes.
const cardSignatures=new WeakMap();
export function connectorCardSignature(root){return cardSignatures.get(root)??root.outerHTML;}
export function connectorCard(card,{heading,button,api,onChange,onDiscuss,botName,sanitizeHtml,inline=false}){
 inline=inline&&!card.email_send&&!['pending','changes_requested'].includes(card.status);
 // Presentation follows the email content; sending authority stays on email_send.
 const emailNotice=card.email_send||(!inline&&card.kind==='email');
 const root=el('section','connector-artifact connector-kind-'+card.kind);if(inline)root.classList.add('connector-inline');root.dataset.connectorArtifact=card.id;if(card.approval_id)root.dataset.approval=card.approval_id;root.setAttribute('aria-label',`${card.connection||card.connector}: ${card.title}`);cardSignatures.set(root,JSON.stringify([card,botName,inline]));
 const previewMissing=card.email_send&&!(card.email?.to?.text&&card.email?.body);
 const header=el('header','connector-artifact-header');header.append(heading(card.connection||card.connector,card.source,card.tool));
 const status=card.email_send? (card.status==='completed'?'Email sent':card.status==='failed'&&card.delivery_state==='not_sent'?'Not sent: the call did not dispatch':['failed','interrupted'].includes(card.status)?'Delivery unknown. Check your Sent folder before sending again.':['approved','ready','executing'].includes(card.status)?'Sending…':'Email draft · Not sent'):card.status==='pending'&&card.email_send?'Draft · not sent':card.status==='completed'&&card.email_send?'Sent · connector confirmed':labels[card.status]||card.status;
 const stateLabel=el('span','connector-card-status status-'+card.status,status);stateLabel.setAttribute('role','status');if(inline){const meta=el('div','connector-inline-meta');stateLabel.prepend(document.createTextNode(card.status==='completed'?'✓ ':card.status==='denied'?'✗ ':''));meta.append(stateLabel,document.createTextNode(' · via '+(card.source||'Connector')+' · By '+(botName||'your bot')));root.append(meta);}else{header.append(stateLabel);root.append(header);}
 const operation=el('div','connector-operation');operation.append(el('span','connector-call-name',card.tool.split('__').at(-1)),el('span','',`By ${botName||'your bot'}`));if(card.kind!=='email'&&!inline)root.append(operation);
 const proposed=!card.records?.length&&card.preview_records?.length&&card.status!=='completed';const shown=card.records?.length?card.records:(proposed?card.preview_records:[]);
 const content=el('div','connector-artifact-content');content.tabIndex=0;content.setAttribute('role','region');content.setAttribute('aria-label','Connector contents');root.append(content);const email=card.email||{},pending=card.status==='pending',retry=card.email_send&&['failed','interrupted'].includes(card.status);
 if(card.kind==='email'&&(email.body||email.subject||email.to)){
  content.append(el('h3','connector-email-subject',email.subject?.text||'(No subject supplied)'));
  const meta=el('dl','connector-email-addresses');for(const key of ['from','to','cc','bcc']){const value=key==='from'?emailSenderLabel(email,card.account):email[key]?.text;if(value){meta.append(el('dt','',fieldNames[key]),el('dd','',value));}}content.append(meta);
  const body=el('div','connector-email-body');const text=email.body?.text||'No message body was supplied by this tool.';
  if(email.body?.format==='html'||email.body?.key?.includes('html')||card.input?.is_html===true||card.input?.body_type==='html'){body.classList.add('is-html');body.append(sanitizeHtml(text));}else body.textContent=text;
  content.append(body);
  const attachmentValues=Object.fromEntries(Object.keys(card.input||{}).filter(k=>/attachment/i.test(k)).map(k=>[k,safeRelated(card.input[k])]));
  if(Array.isArray(email.attachments)&&email.attachments.length)attachmentValues['attachments']=safeRelated(email.attachments);
  if(Array.isArray(card.input?.message?.attachments))attachmentValues['message.attachments']=safeRelated(card.input.message.attachments);
  if(Object.keys(attachmentValues).length){
   const list=el('div','connector-email-attachments');const attachments=[...(Array.isArray(card.input?.attachments)?card.input.attachments:[]),...(Array.isArray(card.input?.attachment_ids)?card.input.attachment_ids:[]),...(Array.isArray(card.input?.message?.attachments)?card.input.message.attachments:[])];
   if(attachments.length){list.append(el('span','muted','Attachments'));for(const item of attachments)list.append(el('span','connector-attachment-chip',typeof item==='string'?'Attached file':item.filename||item.name||item.file_name||'Attached file'));if(pending)list.append(button('Remove attachments',async()=>{try{await act('remove_attachments');}catch(error){showError(list,error);}},'subtle-button'));content.append(list);}
   else if(Object.values(attachmentValues).some(v=>v&&(!Array.isArray(v)||v.length))){const extra=el('details','connector-extra');extra.append(el('summary','','Attachments and related fields'),details(attachmentValues));content.append(extra);}
  }
 }else if(previewMissing){
  content.append(el('h3','','Email preview unavailable'),el('p','muted','The connector supplied a draft reference without the recipients or message. Ask your bot to load the draft before sending.'));
 }else{
  if(!inline||shown.length===1&&shown[0].title!==card.title)content.append(el('h3','',shown.length===1?shown[0].title:card.title));
  if(!shown.length){content.append(details(card.input,undefined,inline));if(!content.querySelector('dd'))content.append(el('p','muted','This tool provides no displayable item fields.'));
  }
 }
 if(shown.length){
  if(proposed)content.append(el('p','connector-proposed-label','Proposed details'));
  const records=el('div','connector-records');let expanded=false;
  const renderRecord=record=>{
   const item=el(shown.length>1?'details':'div','connector-record');if(shown.length>1)item.append(el('summary','',record.title));
   const fill=()=>{if(item.dataset.loaded)return;item.dataset.loaded='true';item.append(details(record.fields,card.connector,inline));
   if(record.email){const meta=el('dl','connector-email-addresses');for(const k of ['from','to','cc','bcc'])if(record.email[k]?.text)meta.append(el('dt','',fieldNames[k]),el('dd','',record.email[k].text));item.append(meta);if(record.email.body){const body=el('div','connector-email-body');if(record.email.body.format==='html'||record.email.body.key.includes('html')){body.classList.add('is-html');body.append(sanitizeHtml(record.email.body.text));}else body.textContent=record.email.body.text;item.append(body);}}

   if(record.excerpt){const text=el('div','connector-record-excerpt');if(record.excerpt_html)text.append(sanitizeHtml(record.excerpt));else text.textContent=record.excerpt;item.append(text);}
   if(record.table?.rows?.length){const wrap=el('div','connector-table-scroll');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',record.table.range||'Sheet cells');const table=el('table','connector-sheet-grid'),head=el('tr');for(const title of record.table.columns)head.append(el('th','',title));const thead=el('thead');thead.append(head);table.append(thead);const tbody=el('tbody');for(const cells of record.table.rows){const row=el('tr');for(const value of cells)row.append(el('td','',readable(value)));tbody.append(row);}table.append(tbody);wrap.append(table);item.append(wrap);if(record.table.truncated)item.append(el('p','muted small','Preview limited to 20 rows and 8 columns.'));}
   if(record.lines?.length){const table=el('table','connector-invoice-lines');const head=el('tr');for(const name of ['Description','Quantity','Rate','Amount'])head.append(el('th','',name));table.append(head);for(const line of record.lines){const row=el('tr');for(const key of ['description','quantity','rate','amount'])row.append(el('td','',readable(line[key])));table.append(row);}item.append(table);}
   };
   if(shown.length>1)item.addEventListener('toggle',()=>{if(item.open)fill();});else fill();
   return item;
  };
  const renderRecords=()=>records.replaceChildren(...shown.slice(0,expanded?shown.length:5).map(renderRecord));renderRecords();content.append(records);
  if(shown.length>5){const more=button('+'+(shown.length-5)+' more',()=>{expanded=!expanded;renderRecords();more.replaceChildren(el('span','',expanded?'Show fewer':'+'+(shown.length-5)+' more'));more.setAttribute('aria-expanded',String(expanded));},'subtle-button connector-show-more');more.setAttribute('aria-expanded','false');content.append(more);}
 }
 if(card.feedback)content.append(el('p','connector-feedback','Your feedback: '+card.feedback));
 if(!card.email_send&&['failed','interrupted'].includes(card.status))content.append(el('p','connector-outcome-warning',card.read_only===true||card.display_read_only===true?'This lookup did not finish.': 'The final external state is unconfirmed. Check the connected service before retrying a change.'));
 if(card.edited_by_user)content.append(el('p','connector-edit-receipt','Includes your saved edits'));
 const footer=el('footer','connector-card-actions');let sending=false,editorOpen=false,editorOpener=null;
 const syncActionState=()=>{for(const b of root.querySelectorAll('button'))b.disabled=sending||b.dataset.previewBlocked==='true'||b.dataset.reviewRequested==='true'||(editorOpen&&!b.closest('.connector-card-editor'));};
 const act=async(action,values={})=>{
  if(sending)return;sending=true;for(const b of root.querySelectorAll('button'))b.disabled=true;
  try{const next=await api('/connector-artifacts/'+encodeURIComponent(card.id),'POST',{action,revision:card.revision,...values});await onChange(next);}catch(error){
   if(/draft changed|no longer pending|no longer waiting/i.test(error.message||'')){
    await onChange();
    const current=document.querySelector('[data-connector-artifact="'+CSS.escape(card.id)+'"]')||root;
    showError(current,new Error('This draft changed. Review the updated version before sending.'));
    return;
   }
   throw error;
  }finally{sending=false;syncActionState();}
 };
 const showError=(form,error)=>{form.querySelector('[role=alert]')?.remove();const notice=el('p','connector-outcome-warning',error.message||String(error));notice.setAttribute('role','alert');form.append(notice);};
 const clearPanel=()=>{if(sending)return;const panel=root.querySelector('.connector-card-editor'),restore=panel?.contains(document.activeElement);panel?.disposeEmailEditor?.();panel?.remove();editorOpen=false;root.classList.remove('connector-editing');syncActionState();if(restore&&editorOpener?.isConnected)editorOpener.focus({preventScroll:true});editorOpener=null;};
 const openEditor=(form)=>{if(form.getAttribute('aria-label')==='Edit email draft')form.classList.add('email-draft-editor');editorOpener=root.contains(document.activeElement)?document.activeElement:null;editorOpen=true;root.classList.add('connector-editing');form.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sending){e.preventDefault();clearPanel();}});syncActionState();root.append(form);if(form.classList.contains('email-draft-editor')){const body=form.querySelector('textarea[name=body]');if(body){const resize=()=>{body.style.height='auto';body.style.height=body.scrollHeight+'px';};body.addEventListener('input',resize);resize();let width=body.clientWidth;const observer=new ResizeObserver(()=>{if(!form.isConnected){observer.disconnect();return;}if(body.clientWidth!==width){width=body.clientWidth;resize();}});observer.observe(body);form.disposeEmailEditor=()=>observer.disconnect();}}form.querySelector('input,textarea,select')?.focus();};
 const editDescriptors=()=>{
  // Email edits are keyed by alias (to, cc, subject…), in compose order.
  const rank=key=>{const i=['to','cc','bcc','subject','body'].indexOf(key);return i<0?5:i;};
  if(card.kind==='email')return Object.entries(email).filter(([,f])=>f?.editable).sort(([a],[b])=>rank(a)-rank(b)).map(([key,f])=>({label:fieldNames[key]||key,key,text:String(f.text??''),type:key==='body'?'textarea':'text',array:f.array===true,encoding:f.encoding,recipients:['to','cc','bcc'].includes(key)}));
  return Object.entries(card.edit_fields||{}).filter(([,f])=>f&&f.text!==undefined&&f.key&&f.editable!==false).map(([key,f])=>({label:f.label||key,key:f.key,text:String(f.text??''),type:f.type||'text',options:Array.isArray(f.options)?f.options:[]}));
 };
 if(pending||retry){
  const approve=button(card.email_send?'Send email':'Approve action',()=>act('approve'),'primary small-button');if(previewMissing){approve.disabled=true;approve.dataset.previewBlocked='true';}if(!retry)footer.append(approve);
  const descriptors=editDescriptors();
  if(descriptors.length)footer.append(button(retry?'Review to send again':card.kind==='email'?'Edit draft':'Edit fields',()=>{
   clearPanel();const form=el('form','connector-card-editor'),inputs={};form.setAttribute('aria-label',card.kind==='email'?'Edit email draft':'Edit connector fields');
   const recipientFields=descriptors.filter(f=>f.recipients),recipients=recipientFields.length?emailRecipients({fields:recipientFields,api:path=>api(path)}):null;if(recipients)form.append(recipients.element);form.addEventListener('input',()=>form.querySelector('[role=alert]')?.remove());
   for(const field of descriptors){if(field.recipients)continue;const label=el('label',card.kind==='email'?'email-field email-field-'+field.key:'',field.label),type=field.type==='textarea'?'textarea':'input',input=el(type);input.value=field.text;input.maxLength=field.type==='textarea'?100000:8000;input.name=field.key;input.dataset.editLabel=field.label;if(type==='textarea')input.rows=card.kind==='email'?5:10;input.autocomplete='off';input.spellcheck=field.key==='body'||field.key==='subject';label.append(input);form.append(label);inputs[field.label]=input;}
   const controls=el('div','connector-card-actions');const save=button(retry?'Request new review':card.kind==='email'?'Save edits':'Save field changes',()=>{},'primary small-button');save.type='submit';controls.append(button('Close',clearPanel,'subtle-button'),save);form.append(el('p','muted small',card.kind==='email'?'Saving changes keeps this email here for review. It does not send it.':'Saving changes keeps this action here for review.'),controls);
   const unknown=retry&&card.delivery_state!=='not_sent';let confirmUnknown=null;
   if(unknown){const warning=el('label','email-retry-confirm');confirmUnknown=el('input');confirmUnknown.type='checkbox';confirmUnknown.required=true;warning.append(confirmUnknown,document.createTextNode('This may already have been sent. I checked my Sent folder and want a new review.'));controls.before(warning);}
   form.onsubmit=async e=>{e.preventDefault();if(sending||!form.reportValidity())return;form.querySelector('[role=alert]')?.remove();const problem=recipients?.validate();if(problem){showError(form,new Error(problem.message));problem.focus();return;}
    const fields={...recipients?.changes(),...Object.fromEntries(descriptors.filter(f=>!f.recipients&&inputs[f.label].value!==f.text).map(f=>[f.key,inputs[f.label].value]))};if(!retry&&!Object.keys(fields).length){clearPanel();return;}try{await act(retry?'review_again':'edit',{fields,...(retry?{request_id:emailReviewStates.get(card.id)?.requestId||card.id,confirm_unknown:!unknown||confirmUnknown.checked}:{})});clearPanel();}catch(error){showError(form,error);syncActionState();}};openEditor(form);
  },'outline-button'));
  if(!retry)footer.append(button('Chat about this',()=>{
   clearPanel();const form=el('form','connector-card-editor'),label=el('label','','What would you like changed?'),input=el('textarea');input.rows=3;input.maxLength=8000;input.required=true;input.placeholder='Make it shorter, adjust the recipient, or explain what needs another look…';label.append(input);form.append(label);
   const controls=el('div','connector-card-actions'),send=button('Request changes',()=>{},'primary small-button');send.type='submit';controls.append(send,button('Cancel',clearPanel,'subtle-button'));form.append(el('p','muted small','Returns this action to the bot with your feedback. The current draft will not be sent.'),controls);form.onsubmit=async e=>{e.preventDefault();if(form.reportValidity())try{await act('changes',{feedback:input.value});}catch(error){showError(form,error);}};openEditor(form);
  },'outline-button'));
  if(!retry)footer.append(button('Decline',()=>act('deny'),'subtle-button'));
  if(pending&&card.email_send&&!card.forced&&!previewMissing){const more=el('details','connector-send-policy');more.append(el('summary','','Sending permissions'),el('p','',`Allow ${botName||'this bot'} to send future emails through this same connection without asking. Other connector actions keep their existing permissions.`),button('Approve & allow future emails',()=>act('approve',{choice:'always_allow_email'}),'outline-button'));content.append(more);}
 }else footer.append(button('Chat about this',()=>onDiscuss(card),inline?'subtle-button connector-inline-discuss':'outline-button',inline?'reply':undefined));
 root.append(footer);
 if(emailNotice){
  if(card.review_requested){for(const b of footer.querySelectorAll('button'))if(b.textContent==='Review to send again'){b.disabled=true;b.dataset.reviewRequested='true';}content.append(el('p','muted small','A new review was requested. The earlier email is unchanged.'));}
  const model=emailReviewStates.get(card.id)||{open:false,revision:card.revision,requestId:card.id,status:card.status};emailReviewStates.set(card.id,model);
  if(model.status!=='completed'&&card.status==='completed')model.open=false;model.status=card.status;
  root.classList.add('email-notice');header.firstChild?.remove();header.prepend(el('strong','email-notice-title',card.title));
  const toggle=button(card.status==='completed'?'Details':'Review',()=>{model.open=!model.open;paint();if(model.open)content.focus({preventScroll:true});},'subtle-button');header.append(toggle);
  const close=button('Close',()=>{model.open=false;paint();toggle.focus({preventScroll:true});},'subtle-button');close.classList.add('email-review-close');footer.prepend(close);
  const send=[...footer.children].find(b=>b.classList.contains('primary')),secondary=el('div','connector-card-actions email-review-secondary'),final=el('div','email-review-final');
  for(const action of [...footer.children])if(action!==close&&action!==send)secondary.append(action);
  final.append(close);if(send)final.append(send);footer.replaceChildren(secondary,final);footer.classList.add('email-review-footer');
  if(card.retry_unknown){const warning=el('p','connector-outcome-warning','This may already have been sent. Check your Sent folder before sending again.');footer.before(warning);}
  let disclosureMotion=null;
  function paint(){
   const before=root.isConnected?root.getBoundingClientRect().height:0;disclosureMotion?.cancel();
   content.hidden=!model.open;footer.hidden=!model.open;root.classList.toggle('email-review-open',model.open);toggle.textContent=model.open?'Hide details':card.status==='completed'?'Details':'Review';toggle.setAttribute('aria-expanded',String(model.open));
   const after=root.getBoundingClientRect().height;
   if(before&&before!==after&&document.documentElement.dataset.motion!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)disclosureMotion=root.animate([{height:before+'px'},{height:after+'px'}],{duration:180,easing:'cubic-bezier(.2,.7,.2,1)'});
  }
  paint();return root;
 }
 if(!inline&&(card.approval_id||card.email_send||['pending','denied'].includes(card.status)))return decisionReceipt(root,{key:'connector:'+card.id,title:card.title,outcome:status,terminal:['approved','executing','completed','denied'].includes(card.status)});return root;
}

import { decisionReceipt } from './decision-receipts.js';
// Content comes from connector receipts, never executable model-authored markup.
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const labels={preparing:'Preparing',pending:'Your review',approved:'Approved · awaiting execution',ready:'Ready',executing:'In progress',completed:'Completed',failed:'Check outcome',denied:'Not approved',changes_requested:'Changes requested',interrupted:'Interrupted · check outcome'};
const fieldNames={to:'To',from:'From',cc:'Cc',bcc:'Bcc',subject:'Subject',body:'Message'};
const safeLink=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
function readable(value){if(value===null||value===undefined)return '';if(typeof value==='string')return value;if(typeof value==='number'||typeof value==='boolean')return String(value);if(Array.isArray(value))return value.map(readable).filter(Boolean).join(', ');return value.name||value.filename||value.file_name||value.displayName||value.value||value.text||JSON.stringify(value);}
function safeRelated(value){if(Array.isArray(value))return value.map(safeRelated);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([k])=>!/contentBytes|authorization|token|secret|password|credential|^data$/i.test(k)).map(([k,v])=>[k,safeRelated(v)]));}
function sourceTime(service,key,text){const millis=service==='clickup'&&key==='Due',seconds=service==='stripe'&&key==='Created';if(!(millis||seconds)||! /^-?\d+$/.test(text))return null;const raw=Number(text),value=raw*(millis?1:1000);if(!Number.isSafeInteger(raw)||!Number.isSafeInteger(value))return null;const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;const iso=date.toISOString();return {iso,text:iso.replace('T',' ').replace('.000Z',' UTC').replace('Z',' UTC'),source:`Source timestamp: ${text} (${millis?'milliseconds':'seconds'})`};}
function details(value,service){const box=el('dl','connector-record-fields');for(const[k,v]of Object.entries(value||{})){if(/token|secret|password|credential|authorization/i.test(k))continue;const text=readable(v);if(!text)continue;box.append(el('dt','',({CustomerRef:'Customer',TotalAmt:'Total',Balance:'Balance due',CurrencyRef:'Currency',DueDate:'Due date',DocNumber:'Number'}[k]||k.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' '))));const dd=el('dd');const href=/^(url|webUrl|web_url|Open source|Open form|Join meeting)$/i.test(k)?safeLink(text):null;if(href){const a=el('a','',/^(Open |Join )/.test(k)?k:'Open source');a.href=href;a.target='_blank';a.rel='noopener noreferrer';dd.append(a);}else{const time=sourceTime(service,k,text);if(time){const n=el('time','',time.text);n.dateTime=time.iso;n.title=time.source;dd.append(n);}else dd.textContent=text;}box.append(dd);}return box;}
export function connectorCard(card,{heading,button,api,onChange,onDiscuss,botName,sanitizeHtml}){
 const root=el('section','connector-artifact connector-kind-'+card.kind);root.dataset.connectorArtifact=card.id;root.setAttribute('aria-label',`${card.connection||card.connector}: ${card.title}`);
 const header=el('header','connector-artifact-header');header.append(heading(card.connection||card.connector,card.source,card.tool));
 const status=card.status==='completed'&&card.email_send?'Sent · connector confirmed':labels[card.status]||card.status;
 header.append(el('span','connector-card-status status-'+card.status,status));root.append(header);
 const operation=el('div','connector-operation');operation.append(el('span','connector-call-name',card.tool.split('__').at(-1)),el('span','',`By ${botName||'your bot'}`));root.append(operation);
 const proposed=!card.records?.length&&card.preview_records?.length&&card.status!=='completed';const shown=card.records?.length?card.records:(proposed?card.preview_records:[]);
 const content=el('div','connector-artifact-content');content.tabIndex=0;content.setAttribute('role','region');content.setAttribute('aria-label','Connector contents');root.append(content);const email=card.email||{},pending=card.status==='pending';
 if(card.kind==='email'&&(email.body||email.subject||email.to)){
  content.append(el('h3','connector-email-subject',email.subject?.text||'(No subject supplied)'));
  const meta=el('dl','connector-email-addresses');for(const key of ['from','to','cc','bcc']){const value=email[key]?.text||(key==='from'?card.account||'Sender resolved by the connected account':'');if(value){meta.append(el('dt','',fieldNames[key]),el('dd','',value));}}content.append(meta);
  const body=el('div','connector-email-body');const text=email.body?.text||'No message body was supplied by this tool.';
  if(email.body?.format==='html'||email.body?.key?.includes('html')||card.input?.is_html===true||card.input?.body_type==='html'){body.classList.add('is-html');body.append(sanitizeHtml(text));}else body.textContent=text;
  content.append(body);
  const attachmentValues=Object.fromEntries(Object.keys(card.input||{}).filter(k=>/attachment/i.test(k)).map(k=>[k,safeRelated(card.input[k])]));
  if(Array.isArray(email.attachments)&&email.attachments.length)attachmentValues['attachments']=safeRelated(email.attachments);
  if(Array.isArray(card.input?.message?.attachments))attachmentValues['message.attachments']=safeRelated(card.input.message.attachments);
  if(Object.keys(attachmentValues).length){const list=el('details','connector-extra');list.append(el('summary','','Attachments and related fields'),details(attachmentValues));content.append(list);}
 }else{
  content.append(el('h3','',shown.length===1?shown[0].title:card.title));
  if(!shown.length){content.append(details(card.input));if(!content.querySelector('dd'))content.append(el('p','muted','This tool provides no displayable item fields.'));
  }
 }
 if(shown.length){
  if(proposed)content.append(el('p','connector-proposed-label','Proposed details'));
  const records=el('div','connector-records');let expanded=false;
  const renderRecord=record=>{
   const item=el(shown.length>1?'details':'div','connector-record');if(shown.length>1)item.append(el('summary','',record.title));
   const fill=()=>{if(item.dataset.loaded)return;item.dataset.loaded='true';item.append(details(record.fields,card.connector));
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
 if(['failed','interrupted'].includes(card.status))content.append(el('p','connector-outcome-warning','The final external state is unconfirmed. Check the connected service before retrying a change.'));
 if(card.edited_by_user)content.append(el('p','connector-edit-receipt','Includes your saved edits'));
 const footer=el('footer','connector-card-actions');let sending=false,editorOpen=false;
 const syncActionState=()=>{for(const b of root.querySelectorAll('button'))b.disabled=sending||(editorOpen&&!b.closest('.connector-card-editor'));};
 const act=async(action,values={})=>{
  if(sending)return;sending=true;for(const b of root.querySelectorAll('button'))b.disabled=true;
  try{const next=await api('/connector-artifacts/'+encodeURIComponent(card.id),'POST',{action,revision:card.revision,...values});await onChange(next);}finally{sending=false;syncActionState();}
 };
 const showError=(form,error)=>{form.querySelector('[role=alert]')?.remove();const notice=el('p','connector-outcome-warning',error.message||String(error));notice.setAttribute('role','alert');form.append(notice);};
 const clearPanel=()=>{if(sending)return;root.querySelector('.connector-card-editor')?.remove();editorOpen=false;root.classList.remove('connector-editing');syncActionState();};
 const openEditor=(form)=>{editorOpen=true;root.classList.add('connector-editing');form.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sending){e.preventDefault();clearPanel();}});syncActionState();root.append(form);form.querySelector('input,textarea,select')?.focus();};
 const editDescriptors=()=>{
  if(card.kind==='email')return Object.entries(email).filter(([,f])=>f?.editable).map(([key,f])=>({label:fieldNames[key]||key,key,text:f.text,type:key==='body'?'textarea':'text'}));
  return Object.entries(card.edit_fields||{}).filter(([,f])=>f&&f.text!==undefined&&f.key&&f.editable!==false).map(([key,f])=>({label:f.label||key,key:f.key,text:String(f.text??''),type:f.type||'text',options:Array.isArray(f.options)?f.options:[]}));
 };
 if(pending){
  footer.append(button(card.email_send?'Approve & send':'Approve action',()=>act('approve'),'primary small-button'));
  const descriptors=editDescriptors();
  if(descriptors.length)footer.append(button(card.kind==='email'?'Edit draft':'Edit fields',()=>{
   clearPanel();const form=el('form','connector-card-editor'),inputs={};form.setAttribute('aria-label',card.kind==='email'?'Edit email draft':'Edit connector fields');
   for(const field of descriptors){const label=el('label','',field.label),type=field.type==='textarea'?'textarea':'input',input=el(type);input.value=field.text;input.maxLength=field.type==='textarea'?100000:8000;input.name=field.key;input.dataset.editLabel=field.label;if(type==='textarea')input.rows=8;label.append(input);form.append(label);inputs[field.label]=input;}
   const controls=el('div','connector-card-actions');const save=button(card.kind==='email'?'Save draft changes':'Save field changes',()=>{},'primary small-button');save.type='submit';controls.append(save,button('Cancel editing',clearPanel,'subtle-button'));form.append(el('p','muted small',card.kind==='email'?'Saving changes keeps this email here for review. It does not send it.':'Saving changes keeps this action here for review.'),controls);
   form.onsubmit=async e=>{e.preventDefault();if(sending)return;const fields=Object.fromEntries(descriptors.filter(f=>inputs[f.label].value!==f.text).map(f=>[f.key,inputs[f.label].value]));if(!Object.keys(fields).length){clearPanel();return;}try{await act('edit',{fields});clearPanel();}catch(error){showError(form,error);syncActionState();}};openEditor(form);
  },'outline-button'));
  footer.append(button('Chat about this',()=>{
   clearPanel();const form=el('form','connector-card-editor'),label=el('label','','What would you like changed?'),input=el('textarea');input.rows=3;input.maxLength=8000;input.required=true;input.placeholder='Make it shorter, adjust the recipient, or explain what needs another look…';label.append(input);form.append(label);
   const controls=el('div','connector-card-actions'),send=button('Request changes',()=>{},'primary small-button');send.type='submit';controls.append(send,button('Cancel',clearPanel,'subtle-button'));form.append(el('p','muted small','Returns this action to the bot with your feedback. The current draft will not be sent.'),controls);form.onsubmit=async e=>{e.preventDefault();if(form.reportValidity())try{await act('changes',{feedback:input.value});}catch(error){showError(form,error);}};openEditor(form);
  },'outline-button'));
  footer.append(button('Decline',()=>act('deny'),'subtle-button'));
  if(card.email_send&&!card.forced){const more=el('details','connector-send-policy');more.append(el('summary','','Sending permissions'),el('p','muted small',`Allow ${botName||'this bot'} to send future emails through this same connection without asking. Other connector actions keep their existing permissions.`),button('Approve & allow future emails',()=>act('approve',{choice:'always_allow_email'}),'outline-button'));content.append(more);}
 }else footer.append(button('Chat about this',()=>onDiscuss(card),'outline-button'));
 root.append(footer);if(card.approval_id||card.email_send||['pending','denied'].includes(card.status))return decisionReceipt(root,{key:'connector:'+card.id,title:card.title,outcome:status,terminal:['approved','executing','completed','denied'].includes(card.status)});return root;
}

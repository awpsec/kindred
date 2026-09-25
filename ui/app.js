import {settingsHeaderArt} from './settings-header-art.js';
import {workspaceArtifactCard,artifactStudio,artifactUpdateRow,artifactUpdateBatches} from './workspace-artifacts.js';
import {groupActivity,transitionGroupActivity,visibleGroupWorkers,sharedConversationWorkers} from './group-activity.js';
import { decisionReceipt } from './decision-receipts.js';
import {installThemedSelects} from "./select-menu.js";
import "./reading-size.js";
import {enhanceMarkdown,fileCard,artifactPreview,inlineShard} from "./artifacts.js";
import {connectorCatalog} from "./connector-catalog.js";
import {connectorCard} from "./connector-cards.js";
installThemedSelects();
import {createDictationUI} from "./dictation.js";
import {createProfileUI} from "./profiles.js";
import {createWorkspaceImportUI} from "./workspace-import.js";
import {createServerChatsUI} from "./server-chats.js";
import {createCommandsUI} from "./commands.js";
import {composerText,createComposerLists} from "./composer-text.js";
import {availableRelease, newerVersion} from "./updates.js";
import { RFB, marked, DOMPurify } from "./vendor.js";
import { computerClickIndicator } from "./computer-pointer.js";
import { visualPanel, compactChanges } from "./visual-panels.js";
import {
  character,
  replaceCharacter,
  revealCharacter,
  icon,
  shapes,
  colors,
  defaultProfile,
  setActivity,
  activityState,
  syncCharacter,
  idleCompanion,
  arriveCharacter,
  departCharacter,
} from "./characters.js";
document.addEventListener('pointerdown',()=>{document.documentElement.dataset.inputModality='pointer';},true);
document.addEventListener('keydown',e=>{if(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(e.key))document.documentElement.dataset.inputModality='keyboard';},true);
const UI_VERSION = "0.63.0";
let commandsUI, dictationUI, composerLists;
const CHAT_PAGE_SIZE=50, CHAT_WINDOW_SIZE=150, CHAT_CACHE_SIZE=6;
const chatHistory=new Map();
let chatOpening=null;
const stoppingTasks=new Set();
const $ = (id) => document.getElementById(id);
const state = {
  token:
    window.__KINDRED_NEW_ACCOUNT ? "" : sessionStorage.getItem("kindred-token") ||
    (!window.__KINDRED_NATIVE_SESSION_BOOTSTRAP && localStorage.getItem("kindred-token")) ||
    "",
  bots: [],
  chats: [],
  chat: null,
  replyDrafts: new Map(),
  pendingSends: new Map(),
  bot: null,
  status: {},
  allRuns: [],
  approvals: [],
  userTasks: [],
  routines: [],
  general: { name: "You", theme: "dark", identity: "", reduced_motion: false, approval_mode: "ask", show_activity: false },
  connections: { apps: [] },
  activities: {},
  attention: {bots:{},chats:{}},
  details: new Map(),
  openActivity: new Set(),
  view: "details",
  settings: "general",
  refreshing: false,
  chatKey: "",
  navKey: "",
  headerKey: "",
  panelKey: "",
  rfb: null,
  desktopGeneration: 0,
  desktopConnected: false,
  takingControl: false,
  newProfile: { ...defaultProfile },
};
const serverChatsUI=createServerChatsUI({api,state,node,button,field,select,modal,icon,buddy,notice,refresh:()=>refresh(true),chooseChat,chooseBot});
const workspaceUI = createWorkspaceImportUI({api,node,button,field,select,modal,notice,getBots:()=>state.bots,refresh:()=>{commandsUI?.invalidate();return refresh(true);},openBot:async id=>{const bot=state.bots.find(b=>b.id===id);if(bot){$("settings-dialog").close();await chooseBot(bot);}}});
const profilesUI = createProfileUI({
  getToken:()=>state.token, setToken:token=>{state.token=token;}, connect, nativeInvoke:(...args)=>nativeInvoke(...args), notice,
  restoreAfterSwitch:async()=>{
    if(window.__KINDRED_DESKTOP)await nativeInvoke('start_desktop',{token:state.token});
    if(!$('computer-panel').hidden)await connectDesktop();
  },
  beforeSwitch:async(previous,next)=>{
    if(state.teaching)throw new Error("Finish teaching before switching profiles.");
    if(artifactWorkspace&&!await artifactWorkspace.prepareLeave())throw new Error("Save or discard your artifact edits before switching profiles.");
    if(window.__KINDRED_PROFILE_HOST)await nativeInvoke('prepare_profile_switch',{});
    workspaceUI.close();
    dictationUI?.cancel();
    saveDraft();
    if(previous)sessionStorage.setItem('kindred-profile-draft-'+previous,JSON.stringify(conversationSnapshot()));
    let saved={};try{saved=JSON.parse(sessionStorage.getItem('kindred-profile-draft-'+next)||'{}');}catch{}
    for(const [key,value] of Object.entries({drafts:saved.drafts||[],replies:saved.replies||[],files:saved.files||[],sends:saved.sends||[],selection:saved.selection||{}}))sessionStorage.setItem('kindred-reload-'+key,JSON.stringify(value));
    disconnectDesktop();
    if(window.__KINDRED_DESKTOP)await nativeInvoke('start_desktop',{token:''});
  }
});
function node(tag, cls = "", text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function button(text, action, cls = "subtle-button", symbol) {
  const b = node("button", cls);
  b.type = "button";
  if (symbol) b.append(icon(symbol));
  if (text) b.append(node("span", "", text));
  b.onclick = () => perform(action, b);
  return b;
}
function iconButton(symbol, label, action) {
  const b = button("", action, "icon-button", symbol);
  b.title = label;
  b.setAttribute("aria-label", label);
  return b;
}
function notice(text, error = false) {
  $("notice").classList.remove("continuation-confirmation");
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
  $("notice").hidden = false;
  positionNotice();
  clearTimeout(state.noticeTimer);
  state.noticeTimer = setTimeout(
    () => ($("notice").hidden = true),
    error ? 9000 : 4000,
  );
}
function pausedScreens() {
  const pauses=state.status.control_pauses;
  if(Array.isArray(pauses))return pauses.filter(p=>state.bots.some(b=>b.id===p.bot_id&&!profile(b).archived));
  const b=state.bots.find(b=>b.id===state.status.screen_bot_id);
  return state.status.takeover&&b?[{bot_id:b.id,name:b.name,control_id:'legacy-'+b.id,reason:'',queued:0}]:[];
}
const leftControlPanes=new Set();
function leaveControlPane(){state.controlPaneEngaged=false;for(const p of pausedScreens())if(p.bot_id===screenBotId())leftControlPanes.add(p.control_id);}
document.addEventListener('pointerdown',event=>{
  const panel=$('computer-panel');
  if(panel.hidden||event.target.closest('#control-notice'))return;
  if(panel.contains(event.target)){for(const p of pausedScreens())if(p.bot_id===screenBotId())leftControlPanes.delete(p.control_id);}
  else leaveControlPane();
  state.controlPaneEngaged=panel.contains(event.target);
  renderControlNotice();
},true);
function renderControlNotice(force=false) {
  const all=pausedScreens(),live=new Set(all.map(p=>p.control_id));
  for(const id of leftControlPanes)if(!live.has(id))leftControlPanes.delete(id);
  // The teaching bar owns this pause. A floating return-control notice would
  // cover its controls after closing a lesson dialog, and cannot return control
  // until the lesson is finished anyway. Other paused bots still need a notice.
  const box=$('control-notice'),pauses=all.filter(p=>leftControlPanes.has(p.control_id)&&p.bot_id!==state.teaching?.botId);
  const key=JSON.stringify(pauses.map(p=>[p.bot_id,p.control_id,state.allRuns.filter(r=>r.bot_id===p.bot_id&&r.status==='queued').map(r=>r.id)]));
  if(!pauses.length){box.hidden=true;state.controlNoticeKey='';state.dismissedControlNotice='';return;}
  if(force)state.dismissedControlNotice='';
  box.hidden=state.dismissedControlNotice===key||!!(state.controlPaneEngaged&&!$('computer-panel').hidden);
  if(state.controlNoticeKey===key)return;
  state.controlNoticeKey=key;
  const heading=node('div','control-notice-heading');
  heading.append(node('strong','',pauses.length===1?'A bot is waiting for control':'Bots are waiting for control'),iconButton('close','Dismiss control notice',()=>{state.dismissedControlNotice=key;box.hidden=true;}));
  box.replaceChildren(heading);
  for(const pause of pauses){
    const row=node('div','control-notice-row'),copy=node('div','control-notice-copy');
    const reason=pause.reason==='open_app'?'Opening an app paused this computer.':pause.reason==='teaching'?'Teaching paused this computer.':pause.reason==='manual'?'Manual control paused this computer.':'This computer is still marked as under manual control. The earlier action was not recorded.';
    copy.append(node('strong','',pause.name),node('p','',reason+' '+(pendingHumanTask(pause.bot_id)?'Its requested subtask still needs your response.':'Return control to let this bot continue.')));
    const error=node('p','control-notice-error');error.hidden=true;error.setAttribute('role','alert');
    const action=button('Return control',async()=>{try{await returnScreenControl(pause);}catch(e){error.textContent=e.message||'Could not return control. Try again.';error.hidden=false;}},'primary small-button');
    action.setAttribute('aria-label','Return control to '+pause.name);row.append(copy,action,error);box.append(row);
  }
}
async function returnScreenControl(pause) {
  if(state.teaching?.botId===pause.bot_id)throw new Error('Finish or discard the lesson before returning control.');
  const selected=pause.bot_id===screenBotId();
  state.statusEpoch=(state.statusEpoch||0)+1;
  if(selected){state.desktopControlRequested=false;disconnectDesktop();}
  // An explicit bot ID prevents chat navigation from redirecting this action.
  await api('/takeover','POST',{enabled:false,bot_id:pause.bot_id,...(Array.isArray(state.status.control_pauses)?{control_id:pause.control_id}:{})});
  state.statusEpoch++;
  if(Array.isArray(state.status.control_pauses))state.status.control_pauses=state.status.control_pauses.filter(p=>p.bot_id!==pause.bot_id);
  if(state.status.screen_bot_id===pause.bot_id)state.status.takeover=false;
  renderHeader();updateDesktopState();
  await refresh(true);
  if(selected&&!$('computer-panel').hidden&&pause.bot_id===screenBotId())await connectDesktop();
}
async function perform(action, control) {
  if (control?.dataset.pending === 'true') return;
  if (control) {control.disabled = true;control.dataset.pending='true';control.setAttribute('aria-busy','true');control.classList.add('is-busy');}
  try {
    return await action();
  } catch (e) {
    if(e==='pagehide')return;
    notice(e.message || "Something went wrong.", true);
  } finally {
    if (control) {control.disabled = false;delete control.dataset.pending;control.removeAttribute("aria-busy");control.classList.remove("is-busy");}
  }
}
const pendingApiRequests=new Set();
let pageSuspended=false;
async function api(path, method = "GET", body, options = {}) {
  if(pageSuspended)throw 'pagehide';
  path=path.replace(/^\/chats\/(server-[^/?]+)/,'/server-chats/$1');
  const bot_id = screenBotId();
  if (method === "GET" && ["/status", "/computer"].includes(path))
    path += "?bot_id=" + encodeURIComponent(bot_id);
  if (
    method === "POST" &&
    ["/computer", "/takeover", "/computer/session"].includes(path)
  )
    body = { ...body, bot_id: body?.bot_id ?? bot_id };
  const timeout=new AbortController();
  pendingApiRequests.add(timeout);
  const startingComputer=method==="POST"&&(path==="/codex/login"||/^\/provider-cli\/[^/]+\/login$/.test(path));
  const abort=()=>timeout.abort(options.signal.reason);
  if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>timeout.abort(),options.timeoutMs??(startingComputer?2400000:60000));
  try {
  const res = await fetch("/api" + path, {
    signal:timeout.signal,
    method,
    headers: {
      Authorization: "Bearer " + state.token,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("The server did not return a valid response.");
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
  } catch(e) {
    if(timeout.signal.reason==='pagehide')throw 'pagehide';
    if(timeout.signal.aborted && timeout.signal.reason!=='pagehide')throw new Error(method==='GET'?'The server took too long to respond. Try again.':'The response timed out. Check whether the change completed before retrying.');
    throw e;
  } finally {clearTimeout(timer);options.signal?.removeEventListener('abort',abort);pendingApiRequests.delete(timeout);}
}
const active = (r) =>
  ["running", "awaiting_user", "awaiting_approval", "cancelling"].includes(r.status);
const clock = (t) =>
  new Date(t * 1000).toLocaleTimeString([], {timeZone:botTimezone(),
    hour: "numeric",
    minute: "2-digit",
  });
const providerName = (b) =>
  (state.providerAccounts || []).find(p=>p.id===b?.provider)?.name || ({codex:"Codex",openrouter:"OpenRouter","claude-code":"Claude Code","kimi-code":"Kimi Code"}[b?.provider]) || "Custom provider";
function profile(b) {
  return { ...defaultProfile, ...b?.profile };
}
function portrait(b) { return {...profile(b),name:b?.name||""}; }
function plain(text = "") {
  return text
    .replace(/[`*_#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function quietCompletionMarker(text = '') {
  if(typeof text!=='string')return false;
  text = text.trim();
  if(text.length>256)return false;
  return /^(?:<((?:mcp__kindred__)?finish_quietly)>\s*(?:\{\})?\s*<\/\1>|<(?:mcp__kindred__)?finish_quietly\s?\/>)$/.test(text);
}
function hiddenCompletionMessage(message) {
  return message && message.sender!=='user' && ['assistant','result'].includes(message.kind)
    && !message.status_notice && !message.attachments?.length && !message.deliverables?.length
    && quietCompletionMarker(message.text);
}
function visibleRunPreview(run) {
  return run && (run.status!=='completed' || run.error || (run.output?.trim() && !quietCompletionMarker(run.output)));
}
// Measure the uncut text, so wrapping, font changes and rich text count toward
// the visible length. Only the viewport clips; controls remain outside it.
const longMessageObservers = new Map();
function foldLongMessage(bubble, key, entry) {
  const viewport=node('div','message-text-viewport'), text=node('div','message-text-content');
  text.append(...bubble.childNodes);viewport.append(text);bubble.append(viewport);
  entry.expandedMessages ||= new Set();
  const toggle=button('Show more',()=>{
    chatScroll.follow=false;captureChatAnchor();
    if(entry.expandedMessages.has(key))entry.expandedMessages.delete(key);else entry.expandedMessages.add(key);
    update();
  },'message-expand');
  toggle.hidden=true;bubble.append(toggle);
  function update(){
    if(!text.isConnected)return;
    const line=parseFloat(getComputedStyle(text).lineHeight)||23.25;
    const long=text.getBoundingClientRect().height>30*line+1;
    const expanded=entry.expandedMessages.has(key);
    viewport.style.maxHeight=long&&!expanded?`${15.5*line}px`:'';
    viewport.classList.toggle('is-truncated',long&&!expanded);
    toggle.hidden=!long;toggle.textContent=expanded?'Show less':'Show more';
    toggle.setAttribute('aria-expanded',String(expanded));
    // Clipped links must not remain invisible keyboard stops.
    for(const link of text.querySelectorAll('a,button,input')){
      if(long&&!expanded){if(!link.hasAttribute('data-fold-tabindex'))link.dataset.foldTabindex=link.getAttribute('tabindex')??'';link.tabIndex=-1;}
      else if(link.hasAttribute('data-fold-tabindex')){const value=link.dataset.foldTabindex;if(value)link.setAttribute('tabindex',value);else link.removeAttribute('tabindex');delete link.dataset.foldTabindex;}
    }
  }
  viewport._observeLongMessage=()=>{const observer=new ResizeObserver(update);observer.observe(text);longMessageObservers.set(viewport,observer);update();};
}
function observeLongMessages(target){
  for(const [element,observer] of longMessageObservers)if(!element.isConnected){observer.disconnect();longMessageObservers.delete(element);}
  for(const viewport of target.querySelectorAll('.message-text-viewport'))if(!longMessageObservers.has(viewport))viewport._observeLongMessage?.();
}
function markdown(text, mentions=false, preserveBreaks=false) {
  const n = node("div", "message-bubble");
  n.innerHTML = DOMPurify.sanitize(marked.parse(text || "",{breaks:preserveBreaks}), {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "del",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "blockquote",
      "pre",
      "code",
      "a",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "hr",
      "input",
    ],
    ALLOWED_ATTR: ["href", "title", "class", "type", "checked", "disabled", "start", "align"],
  });
  for (const link of n.querySelectorAll("a")) {
    try {
      const u = new URL(link.getAttribute("href"), location.href);
      if (!["https:", "http:"].includes(u.protocol) || !/^https?:\/\//i.test(link.getAttribute('href')||'')) {
        link.removeAttribute("href");
        continue;
      }
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } catch {
      link.removeAttribute("href");
    }
  }
  for(const el of n.querySelectorAll('[class]')){if(el.tagName==='CODE'){el.className=(el.className.match(/(?:^|\s)(language-[\w-]+)/)||[])[1]||'';}else el.removeAttribute('class');}
  enhanceMarkdown(n,{sourceText:text||''});
  if(mentions){const walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT),texts=[];let text;while(text=walker.nextNode())if(!text.parentElement.closest('pre,code,a,button,.artifact-preview'))texts.push(text);for(const text of texts){const replacement=renderMentions(text.textContent,true);if(replacement.querySelector('[data-mention]'))text.replaceWith(...replacement.childNodes);}}
  return n;
}
function field(label, value = "", kind = "input", attrs = {}) {
  const l = node("label", "", label),
    input = node(kind);
  Object.assign(input, attrs);
  if (kind === "select") input.setAttribute("aria-label", label);
  input.value = value;
  l.append(input);
  return { label: l, input };
}
function select(options, value) {
  const s = node("select");
  for (const [v, t] of options) {
    const o = node("option", "", t);
    o.value = v;
    s.append(o);
  }
  s.value = value;
  return s;
}
function section(title) {
  const n = node("section", "settings-section");
  n.append(node("h3", "", title));
  return n;
}
function actionMessage(text, actions, tone = 'muted') {
  const root=node('div','action-message'),row=node('div','row-actions');
  row.append(...actions);root.append(node('p',tone,text),row);
  return root;
}
function switchField(label, value) {
  const l = node("label", "switch-row"),
    input = node("input");
  input.type = "checkbox";
  input.checked = value;
  input.setAttribute("role", "switch");
  l.append(node("span", "", label), input);
  return { label: l, input };
}
function deviceTimezone(){return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}
function botTimezone(){return state.general.timezone||deviceTimezone();}
function localDateInput(date,zone=botTimezone()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function settingsPane(title){const root=section(title),body=node('div','settings-pane');root.classList.add('organized-settings');root.append(body);return {root,body};}
function settingRow(title,control,detail=''){
  const row=node('div','setting-row'),copy=node('div','setting-copy');copy.append(node('span','setting-label',title));if(detail)copy.append(node('p','muted small',detail));
  if(!control.getAttribute('aria-label'))control.setAttribute('aria-label',title);row.append(copy,control);return row;
}
function settingSwitch(label,value){const valueField=switchField(label,value);valueField.label.classList.add('setting-row');return valueField;}
function applyGeneral() {
  const theme = state.general.theme;
  document.documentElement.dataset.theme =
    theme === "system"
      ? matchMedia("(prefers-color-scheme:dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.dataset.motion = state.general.reduced_motion
    ? "off"
    : "on";
  $("identity-name").textContent = state.general.name;
  $("identity-name").title = state.general.name;
  $("identity-button").title = "Account options";
  $("user-avatar").textContent = personInitials(state.general.name);
}
function personInitials(name='You') {
  const words=name.trim().split(/\s+/).filter(Boolean);
  return (words.length===1&&/^[A-Z]{2,3}$/.test(words[0])?words[0].slice(0,2):words.slice(0,2).map(w=>w[0]).join('')).toUpperCase()||'Y';
}
async function connect() {
  await api("/status");
  state.status={};state.controlNoticeKey='';state.dismissedControlNotice='';$('control-notice').hidden=true;
  sessionStorage.setItem("kindred-token", state.token);
  if ($("remember-device").checked && !window.__KINDRED_PROFILE_HOST)
    localStorage.setItem("kindred-token", state.token);
  else localStorage.removeItem("kindred-token");
  [state.general, state.connections] = await Promise.all([
    api("/settings"),
    api("/connections"),
  ]);
  if(!state.general.timezone||state.general.timezone_mode==='auto'){
    try{state.general=await api('/settings/timezone/initialize','POST',{timezone:deviceTimezone()});}catch{/* An older server keeps its existing settings until updated. */}
  }
  applyGeneral();
  void dictationUI?.init();
  $("connect").hidden = true;
  $("app").hidden = false;
  await refresh(true);
  await profilesUI.connected();
  if(window.__KINDRED_DESKTOP)await nativeInvoke("start_desktop",{token:state.token});
  else void pollBrowserNotifications();
}
async function chooseBot(b) {
  if(state.teaching && b.id!==state.teaching.botId){notice("Finish teaching before switching bots.");return;}
  if(!state.chat && state.bot?.id===b.id){captureUnreadBoundary(`dm-${b.id}`);$('app').classList.remove('sidebar-open');await renderChat(true,'cached');return;}
  dictationUI?.cancel();
  $('details-content').querySelector('.artifact-library')?.remove();
  rememberChatPosition();
  captureUnreadBoundary(b.id ? `dm-${b.id}` : '');
  state.screenBotId = b.id;
  if (!$("computer-panel").hidden) {
    disconnectDesktop();
    setTimeout(() => perform(connectDesktop), 0);
  }
  saveDraft();
  state.bot = b;
  state.chat = null;
  restoreDraft();
  state.chatKey = "";
  state.headerKey = "";
  state.panelKey = "";
  state.view = "details";
  $("app").classList.remove("sidebar-open");
  renderSidebar();
  renderHeader();
  await showCachedConversation();
  await refresh(true);
}
async function refresh(force = false) {
  if (!state.token) return;
  if (state.refreshing) {
    if (force) state.pendingRefresh = true;
    return;
  }
  state.refreshing = true;
  let renderingId=null;
  const statusEpoch=state.statusEpoch||0,botEpoch=state.botWriteEpoch||0;
  try {
    const [fetchedBots, status, runs, approvals, routines, activities, privateChats, userTasks, attention, serverChats] =
      await Promise.all([
        api("/bots"),
        api("/status"),
        api("/runs"),
        api("/approvals"),
        api("/routines"),
        api("/activity"),
        api("/chats"),
        api("/user-tasks"),
        api("/attention"),
        serverChatsUI.list(),
      ]);
    const chats=[...privateChats,...serverChats];
    for(const chat of serverChats){attention.chats??={};attention.chats[chat.id]={unread:chat.unread,cursor:chat.cursor,read_cursor:chat.unread?chat.read_cursor:chat.cursor,latest_message_seq:chat.cursor};}
    const bots=botEpoch===(state.botWriteEpoch||0)?fetchedBots:state.bots;
    if (state.botsLoaded) for (const b of bots)
      if (!state.bots.some(old=>old.id===b.id) && !profile(b).archived && !botArrivals.has(b.id)) botArrivals.set(b.id,Date.now());
    state.botsLoaded=true;
    void warmUsageCache();
    state.bots = bots;
    state.chats = chats;
    if (state.chat)
      state.chat =
        chats.find((c) => c.id === state.chat.id && !c.archived) || null;
    if (statusEpoch===(state.statusEpoch||0) && (!status.screen_bot_id || status.screen_bot_id === screenBotId()))
      state.status = status;
    state.allRuns = runs;
    for(const id of stoppingTasks){const run=runs.find(r=>r.id===id);if(!run||(!active(run)&&run.status!=='queued'))stoppingTasks.delete(id);}
    state.approvals = approvals;
    state.userTasks = userTasks;
    state.routines = routines;
    state.activities = activities;
    state.activityReadAt = Date.now();
    acceptAttention(attention);
    if (!state.restoredReload) {
      state.restoredReload = true;
      try {
        const updateKey=await restartDraftKey();
        state.reloadResumeKey=updateKey.replace('kindred-update-resume-','kindred-tab-resume-');
        const stored=localStorage.getItem(updateKey)||(!sessionStorage.getItem('kindred-reload-selection')&&sessionStorage.getItem(state.reloadResumeKey));
        if(stored){const resume=JSON.parse(stored);for(const key of ["drafts","replies","files","sends","selection"])sessionStorage.setItem("kindred-reload-"+key,JSON.stringify(resume[key]||(key==="selection"?{}:[])));localStorage.removeItem(updateKey);}
        state.drafts = new Map(
          JSON.parse(sessionStorage.getItem("kindred-reload-drafts") || "[]"),
        );
        const pick = JSON.parse(
          sessionStorage.getItem("kindred-reload-selection") || "{}",
        );
        state.bot = bots.find((b) => b.id === pick.bot) || state.bot;
        state.chat = chats.find((c) => c.id === pick.chat) || state.chat;
        state.replyDrafts=new Map(JSON.parse(sessionStorage.getItem("kindred-reload-replies")||"[]"));
        state.pendingSends=new Map(JSON.parse(sessionStorage.getItem("kindred-reload-sends")||"[]"));
        for(const [id,files] of JSON.parse(sessionStorage.getItem("kindred-reload-files")||"[]"))pendingFiles.set(id,files);
        restoreDraft();
      } catch {
        /* An invalid local draft cannot block connection. */
      }
      sessionStorage.removeItem("kindred-reload-replies");
      sessionStorage.removeItem("kindred-reload-drafts");
      sessionStorage.removeItem("kindred-reload-selection");
      sessionStorage.removeItem("kindred-reload-sends");
      sessionStorage.removeItem("kindred-reload-files");
    }
    state.bot =
      bots.find((b) => b.id === state.bot?.id && !profile(b).archived) ||
      bots.find((b) => !profile(b).archived) ||
      null;
    if (
      state.screenBotId &&
      (!bots.some((b) => b.id === state.screenBotId && !profile(b).archived) ||
        (!$('computer-panel').hidden && !chatScreenBots().some(b=>b.id===state.screenBotId)))
    ) {
      state.screenBotId = chatScreenBots()[0]?.id || "";
      if (!$("computer-panel").hidden)
        setTimeout(() => perform(connectDesktop), 0);
    }
    renderSidebar();
    renderHeader();
    syncArtifactRoute();
    renderingId=currentConversationId();await renderChat(force);
    if (!$("details-panel").hidden && state.view === "details") renderDetails();
    updateDesktopState();
    if(!$("computer-panel").hidden){renderScreenPicker();renderComputerRoutines();}
    updateReactions();
    scheduleReadReceipt();
  } catch(error) {
    failConversationOpening(renderingId||currentConversationId(),error);
    throw error;
  } finally {
    state.refreshing = false;
    if (state.pendingRefresh) {
      state.pendingRefresh = false;
      await refresh(true);
    }
  }
}
const avatarCache = new Map(),
  botArrivals = new Map();
function visibleActivityRun(run) {
  return !run.chat_id || run.chat_id.startsWith('dm-') || visibleGroupWorkers([run]).length>0;
}
function botActivity(id) {
  const activity=state.activities[id];
  const run=state.allRuns.find(r=>r.id===activity?.run_id)||state.allRuns.find(r=>r.bot_id===id&&active(r));
  return run&&!visibleActivityRun(run)?{...activity,status:'idle',shape:'idle',label:''}:activity;
}
function reaction(id) {
  return activityState(
    botActivity(id),
    Date.now() / 1000,
    Math.max(state.attention.bots[id]?.last_active_at||0,(botArrivals.get(id)||0)/1000),
  );
}
function buddy(b, size, busy = false, key = "") {
  const signature = JSON.stringify(portrait(b));
  let avatar = key ? avatarCache.get(key) : null;
  if (!avatar || avatar.dataset.profile !== signature) {
    const previous=avatar;
    avatar = character(portrait(b), size, busy);
    avatar.dataset.profile = signature;
    if (b) avatar.dataset.botId = b.id;
    if (b) setActivity(avatar, reaction(b.id).action, { immediate: true,startedAt:(state.activities[b.id]?.run_created_at??state.activities[b.id]?.started_at)*1000 });
    if (b && botArrivals.has(b.id) && Date.now()-botArrivals.get(b.id)<1150) arriveCharacter(avatar,botArrivals.get(b.id));
    else if (avatar.dataset.tribute && previous && previous.dataset.tribute!==avatar.dataset.tribute) revealCharacter(avatar);
    else if (key.startsWith("work-") && !avatar.dataset.tribute) arriveCharacter(avatar);
    if (key) avatarCache.set(key, avatar);
  }
  if(b && /^(nav|pin|header)-/.test(key)) {
    avatar.classList.add('has-presence');
    avatar.classList.toggle('is-online',reaction(b.id).online);
    avatar.title=reaction(b.id).online?'Recently active':'Resting';
  }
  return avatar;
}
// Sidebar and header stacks pass a cache prefix so routine rebuilds keep each
// avatar's live pose instead of restarting it.
function participantStack(chat,variant='row',cache='') {
  if(chat.shared){const stack=node('span','participant-stack participant-stack-'+variant),members=chat.participants||[];stack.dataset.slots=String(Math.min(members.length,3));stack.setAttribute('aria-label',members.map(m=>m.name).join(', '));for(const m of members.slice(0,3))stack.append(serverChatsUI.avatar(m,variant==='tile'?30:22));if(members.length>3)stack.append(node('span','participant-more','+'+(members.length-3)));return stack;}
  const stack=node('span','participant-stack participant-stack-'+variant);
  const members=chat.members.map(id=>state.bots.find(b=>b.id===id)).filter(Boolean),limit=2;
  stack.dataset.slots=String((chat.bot_only?0:1)+Math.min(members.length,limit)+(members.length>limit?1:0));
  stack.setAttribute('aria-label',[...(chat.bot_only?[]:[state.general.name||'You']),...members.map(b=>b.name)].join(', '));
  if(!chat.bot_only){const user=node('span','participant-user',personInitials(state.general.name));user.title=state.general.name||'You';stack.append(user);}
  for(const bot of members.slice(0,limit)){
    const avatar=buddy(bot,variant==='tile'?30:variant==='header'?20:22,false,cache&&`${cache}-${chat.id}-${bot.id}`);avatar.classList.add('participant-bot');stack.append(avatar);
  }
  if(members.length>limit){const count=node('span','participant-more','+'+(members.length-limit));count.title=members.slice(limit).map(b=>b.name).join(', ');stack.append(count);}
  return stack;
}
function senderName(bot,avatar) {
  const name=node('strong','message-sender-name',bot.name),color=avatar.style.getPropertyValue('--bot-fill');
  if(!/^#[a-f\d]{6}$/i.test(color)||avatar.classList.contains('adaptive-white'))return name;
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),luminance=values=>values.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  for(const theme of ['dark','light']){
    let result=rgb;
    for(let amount=0;amount<=1;amount+=.025){result=rgb.map(v=>Math.round(v+((theme==='dark'?255:0)-v)*amount));const lum=luminance(result),contrast=theme==='dark'?(lum+.05)/.05:1.05/(lum+.05);if(contrast>=4.5)break;}
    name.style.setProperty('--sender-'+theme,`rgb(${result.join(',')})`);
  }
  return name;
}
function workLine(bot, run) {
  const line = node("div", "work-line");
  line.tabIndex = 0;
  const label = node("span", "work-label working-glimmer", reaction(run.bot_id).label);
  label.dataset.activityLabel = run.bot_id;
  label.dataset.workRun = run.id;
  updateWorkLabel(label);
  line.append(buddy(bot, 48, true, `work-${run.id}`), label);
  line.append(taskStopButton(bot,run));
  return line;
}
function taskStopButton(bot,run) {
  const stopping=run.status==='cancelling'||stoppingTasks.has(run.id);
  const stop=button('',async()=>{
    if(stoppingTasks.has(run.id)||run.status==='cancelling')return;
    stoppingTasks.add(run.id);stop.disabled=true;
    try{await api('/runs/'+run.id+'/cancel','POST',{});}
    catch(error){stoppingTasks.delete(run.id);stop.disabled=false;throw error;}
    stop.classList.add('is-stopping');stop.setAttribute('aria-label','Stopping task for '+bot.name);stop.title='Stopping…';
    notice('Stop requested. Waiting for the task and its in-flight command to finish stopping.');
    try{await refresh(true);}
    catch(error){notice('Stop requested, but task status could not refresh. '+error.message,true);}
  },'icon-button work-stop','close');
  stop.disabled=stopping;stop.dataset.run=run.id;
  const stopClick=stop.onclick;
  stop.onclick=async()=>{await stopClick();stop.disabled=stoppingTasks.has(run.id)||run.status==='cancelling';};
  stop.classList.toggle('is-stopping',stopping);stop.title=stopping?'Stopping…':'Stop this task';stop.setAttribute('aria-label',(stopping?'Stopping task for ':'Stop task for ')+bot.name);
  return stop;
}
function elapsedTime(seconds) {
  const n=Math.max(0,Math.floor(seconds));
  return n<60?`${n}s`:n<3600?`${Math.floor(n/60)}m${String(n%60).padStart(2,'0')}s`:`${Math.floor(n/3600)}h${String(Math.floor(n%3600/60)).padStart(2,'0')}m`;
}
function queuedWork(botId,chatId) {
  const runs=state.allRuns.filter(r=>r.bot_id===botId);
  const queued=runs.filter(r=>r.status==='queued').sort((a,b)=>a.created-b.created);
  const pause=pausedScreens().find(p=>p.bot_id===botId);
  // Dispatch is bot-wide; filter by conversation only after identifying the starting run.
  const starting=!pause&&!runs.some(active)?queued[0]:null;
  return {pause,starting,waiting:queued.filter(r=>r.id!==starting?.id&&(!chatId||r.chat_id===chatId)).length};
}
function updateWorkLabel(label) {
  const a=state.activities[label.dataset.activityLabel]||{},r=reaction(label.dataset.activityLabel);
  const age=state.activityReadAt?(Date.now()-state.activityReadAt)/1000:0,stale=age>15;
  const now=a.server_time?(a.server_time+(stale?0:age)):Date.now()/1000;
  const current=a.run_id===label.dataset.workRun || !a.run_id;
  const run=state.allRuns.find(r=>r.id===label.dataset.workRun)||state.details.get(label.dataset.workRun)?.run;
  const pending=run?.status==='queued'&&!(current&&a.status==='running');
  const queue=queuedWork(label.dataset.activityLabel);
  const starting=pending&&queue.starting?.id===run.id;
  // The first scheduler hop is part of sending, not a queue behind other work.
  label.hidden=!!(starting&&!stale&&now-run.created<10);
  const retry=current&&run?.status==='running'&&a.provider_retry?.phase==='retrying'?a.provider_retry:null;
  label.classList.toggle('provider-retrying',!!retry&&!stale);
  if(retry&&!stale){
    label.hidden=false;label.classList.remove('working-glimmer');
    if(label.dataset.providerRetry===String(retry.attempt))return;
    label.dataset.providerRetry=String(retry.attempt);
    const dots=node('span','provider-retry-dots');dots.setAttribute('aria-hidden','true');for(let i=0;i<3;i++)dots.append(node('span','','.'));
    label.replaceChildren(node('span','',`Connection issue - retrying (${retry.attempt}/5)`),dots);continueLoops(label);
    label.title='Retrying the same provider. Completed work is preserved.';return;
  }
  delete label.dataset.providerRetry;
  const caption=pending?(queue.pause?'Waiting for control':starting?'Waiting to start':'Waiting for the current task'):current?r.label:'Waiting for the current task';
  const text=node('span','',stale?'Connection lost · last known: '+(caption||'Waiting to start'):caption);
  const timer=node('time','work-timer',elapsedTime(now-(current?(a.started_at||now):now)));
  timer.title='Elapsed time in this step';
  label.classList.toggle('working-glimmer',!stale&&a.status==='running'&&r.action!=='waiting'&&r.action!=='worry');
  label.replaceChildren(text,timer);continueLoops(label);
  label.title=stale?'The server has not confirmed new activity. The timer is paused at the last received status.':a.run_created_at?'Task elapsed: '+elapsedTime(now-a.run_created_at):'';
}
const chatMotionReduced=()=>document.hidden||!document.hasFocus()||document.documentElement.dataset.motion==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches;
const WORK_DEPARTURE_MS=1970, REPLY_ARRIVAL_MS=280;
function prepareChatPresentation(entry,runs,messages,mode) {
  entry.finishing??=new Map();entry.replyArrivals??=new Map();
  const sameView=state.renderedChatId===entry.id,now=Date.now();
  const animate=sameView && !entry.hasAfter && chatScroll.follow && !chatMotionReduced();
  const candidates=runs.filter(r=>r.chat_id===entry.id && (active(r)||r.status==='queued'));
  const workerBots=new Set();
  const workers=candidates.sort((a,b)=>Number(active(b))-Number(active(a))||a.created-b.created).filter(r=>{if(workerBots.has(r.bot_id))return false;workerBots.add(r.bot_id);return true;});
  for(const [id,prior] of entry.workingRuns||[]) {
    const current=runs.find(r=>r.id===id && r.chat_id===entry.id);
    if(current?.status!=='completed' || entry.finishing.has(id))continue;
    // Question handoffs and quiet completions deliberately have no final reply.
    // Do not retain their worker while waiting for a message that will never exist.
    const events=state.details.get(id)?.events||[];
    const silent=!current.error && (!current.output?.trim() || quietCompletionMarker(current.output) || events.some(e=>e.kind==='question_wait' || (e.kind==='tool_result' && e.body?.tool==='finish_quietly' && e.body?.failed===false)));
    if(silent){avatarCache.delete('work-'+id);continue;}
    // The run feed and message page are fetched separately. Keep a written
    // result's presence until that reply has actually reached visible history.
    const delivered=messages.some(m=>m.run_id===id && (m.kind==='result'||(current.output&&m.text===current.output)));
    if(!delivered){workers.push(prior);continue;}
    if(animate && !workers.some(r=>r.bot_id===current.bot_id)) {
      const finish={run:current,at:now};entry.finishing.set(id,finish);
      finish.timer=setTimeout(()=>{
        entry.finishing.delete(id);avatarCache.delete('work-'+id);
        if(currentConversationId()===entry.id){
          beginChatRender(entry.id);$('content').querySelector(`[data-finishing-run="${id}"]`)?.remove();
          state.chatKey='';endChatRender();
        }
      },WORK_DEPARTURE_MS);
    }
  }
  if(!animate)for(const [id,finish] of entry.finishing){clearTimeout(finish.timer);entry.finishing.delete(id);avatarCache.delete('work-'+id);}
  entry.workingRuns=new Map(workers.map(r=>[r.id,r]));
  if(animate && mode==='sync' && entry.renderedIds)for(const m of messages)
    if(!entry.renderedIds.has(m.seq) && m.created>=entry.latestRenderedTime && (['assistant','result'].includes(m.kind)||(m.kind==='message'&&m.sender!=='user'&&m.sender!=='system'&&m.mine!==true)))entry.replyArrivals.set(m.seq,now);
  for(const [seq,at] of entry.replyArrivals)if(now-at>=REPLY_ARRIVAL_MS || !animate)entry.replyArrivals.delete(seq);
  entry.renderedIds=new Set(messages.map(m=>m.seq));entry.latestRenderedTime=Math.max(0,...messages.map(m=>m.created));
  return workers;
}
function revealReply(group,at) {
  if(at==null || chatMotionReduced())return;
  const elapsed=Date.now()-at;if(elapsed>=REPLY_ARRIVAL_MS)return;
  group.classList.add('reply-arriving');
  // Fade the mounted message without changing its height or the reading anchor.
  const effect=group.animate([{opacity:0},{opacity:1}],{duration:REPLY_ARRIVAL_MS,easing:'ease-out',fill:'both'});
  effect.currentTime=elapsed;
  trackMotion(effect,REPLY_ARRIVAL_MS-elapsed,()=>group.classList.remove('reply-arriving'));
}
function finishingWork(entry,finish) {
  const run=finish.run,bot=state.bots.find(b=>b.id===run.bot_id),group=node('article','message-group finishing-work'),line=workLine(bot,run);
  group.dataset.finishingRun=run.id;group.setAttribute('aria-hidden','true');line.removeAttribute('tabindex');line.querySelector('.work-label').remove();
  group.append(line);$('content').append(group);
  departCharacter(line.querySelector('.character'),finish.at);
  const height=group.getBoundingClientRect().height,margin=getComputedStyle(group).marginBottom;
  group.style.overflow='clip';
  const effect=group.animate([{height:height+'px',marginBottom:margin},{height:height+'px',marginBottom:margin,offset:1750/WORK_DEPARTURE_MS},{height:'0px',marginBottom:'0px'}],{duration:WORK_DEPARTURE_MS,easing:'ease-in-out',fill:'both'});
  effect.currentTime=Math.max(0,Date.now()-finish.at);
  trackMotion(effect,Math.max(0,WORK_DEPARTURE_MS-(Date.now()-finish.at)),()=>{
    clearTimeout(finish.timer);entry.finishing.delete(run.id);avatarCache.delete('work-'+run.id);
    group.remove();scheduleChatPosition();
  });
}
function updateReactions() {
  for(const preview of document.querySelectorAll("[data-sidebar-activity]"))updateSidebarActivity(preview);
  for (const avatar of document.querySelectorAll(".character[data-bot-id]")) {
    const r = reaction(avatar.dataset.botId);
    if(avatar.classList.contains('has-presence')){avatar.classList.toggle('is-online',r.online);avatar.title=r.online?'Recently active':'Resting';}
    const stale=state.activityReadAt&&Date.now()-state.activityReadAt>15000;
    if(avatar.closest('.archive-burial'))continue;
    setActivity(avatar, stale&&botActivity(avatar.dataset.botId)?.status==='running'?'waiting':r.action,{startedAt:(state.activities[avatar.dataset.botId]?.run_created_at??state.activities[avatar.dataset.botId]?.started_at)*1000});
    syncCharacter(avatar);
  }
  for(const timer of document.querySelectorAll('[data-group-started]'))timer.textContent=elapsedTime(Math.max(0,Date.now()/1000-Number(timer.dataset.groupStarted)));
  for (const label of document.querySelectorAll("[data-activity-label]")) {
    if(label.dataset.workRun){updateWorkLabel(label);continue;}
    const r = reaction(label.dataset.activityLabel);
    label.textContent =
      r.action === "idle" && label.dataset.idlePreview
        ? label.dataset.idlePreview
        : (label.dataset.activityPrefix || "") + r.label;
  }
  for (const [key, avatar] of avatarCache) {
    if (
      !avatar.isConnected &&
      key.startsWith("work-") &&
      !state.allRuns.some(
        (r) => `work-${r.id}` === key && (active(r) || r.status === "queued"),
      )
    )
      avatarCache.delete(key);
  }
}
let pinPreview, pinPreviewTimer;
function hidePinPreview() {
  clearTimeout(pinPreviewTimer);
  pinPreview?.remove();
  pinPreview = null;
}
function attachPinPreview(tile, name, latest, fallback) {
  const show = () => {
    if(pinDrag)return;
    hidePinPreview();
    const preview = node("div", "pin-preview");
    preview.id = "pin-preview";
    preview.setAttribute("role", "tooltip");
    tile.setAttribute("aria-describedby", preview.id);
    const head = node("div", "pin-preview-heading");
    head.append(node("strong", "", name));
    if (latest?.created) head.append(node("span", "muted", clock(latest.created)));
    const sender = latest?.sender === "user" ? "You" : state.bots.find(b => b.id === latest?.sender)?.name;
    preview.append(head, node("p", "", (sender ? sender + ": " : "") + plain(latest?.text || fallback || "Say hello.")));
    document.body.append(preview);
    const bounds = tile.getBoundingClientRect(), width = preview.offsetWidth;
    preview.style.left = Math.max(8, Math.min(innerWidth - width - 8, bounds.right + 8)) + "px";
    preview.style.top = Math.max(8, Math.min(innerHeight - preview.offsetHeight - 8, bounds.top)) + "px";
    preview.onmouseenter = () => clearTimeout(pinPreviewTimer);
    preview.onmouseleave = () => { pinPreviewTimer = setTimeout(hidePinPreview, 100); };
    pinPreview = preview;
  };
  tile.onmouseenter = show;
  tile.onfocus = show;
  tile.onmouseleave = () => { pinPreviewTimer = setTimeout(hidePinPreview, 100); };
  tile.onblur = hidePinPreview;
  tile.addEventListener("click", hidePinPreview);
}
document.addEventListener("keydown", e => { if (e.key === "Escape") hidePinPreview(); });
window.addEventListener("resize", hidePinPreview);
let pinDrag=null;
const pinnedOrderKey='kindred-pinned-conversation-order';
function pinnedOrder(){try{const saved=JSON.parse(localStorage.getItem(pinnedOrderKey)||'[]');return Array.isArray(saved)?saved.filter(k=>typeof k==='string'):[];}catch{return [];}}
function sortPinnedEntries(){
  const area=$('pinned-bots'),order=pinnedOrder(),rank=k=>{const i=order.indexOf(k);return i<0?Infinity:i;};
  [...area.children].sort((a,b)=>rank(a.dataset.pinKey)-rank(b.dataset.pinKey)).forEach(n=>area.append(n));
}
function clearPinDrag(){pinDrag=null;document.querySelectorAll('.pin-dragging,.pin-drop-before,.pin-drop-after').forEach(n=>n.classList.remove('pin-dragging','pin-drop-before','pin-drop-after'));}
function reorderPin(source,target,after){
  const existing=pinnedOrder(),keys=[...new Set([...existing,...[...$('pinned-bots').children].map(n=>n.dataset.pinKey)])];
  const order=keys.filter(k=>k!==source),index=order.indexOf(target);if(index<0)return;
  order.splice(index+(after?1:0),0,source);
  try{localStorage.setItem(pinnedOrderKey,JSON.stringify(order));}catch{notice('Could not save pinned order.',true);return;}
  const places=sidebarPlaces();sortPinnedEntries();glideSidebar(places);
}
function enablePinReordering(wrap,control,key){
  wrap.dataset.pinKey=key;control.style.touchAction='none';let suppressClick=false;
  control.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();}},true);
  control.addEventListener('pointerdown',e=>{
    if(e.button!==0||wrap.parentElement!==$('pinned-bots'))return;
    const x=e.clientX,y=e.clientY;let moved=false,target=null,after=false;
    pinDrag=key;control.setPointerCapture(e.pointerId);
    const move=event=>{
      if(event.pointerId!==e.pointerId)return;
      if(!moved&&Math.hypot(event.clientX-x,event.clientY-y)<6)return;
      moved=true;suppressClick=true;hidePinPreview();wrap.classList.add('pin-dragging');
      document.querySelectorAll('.pin-drop-before,.pin-drop-after').forEach(n=>n.classList.remove('pin-drop-before','pin-drop-after'));
      target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.pinned-entry');
      if(target===wrap||target?.parentElement!==$('pinned-bots')){target=null;return;}
      after=event.clientX>target.getBoundingClientRect().left+target.offsetWidth/2;
      target.classList.add(after?'pin-drop-after':'pin-drop-before');
    };
    const finish=event=>{
      if(event.pointerId!==undefined&&event.pointerId!==e.pointerId)return;
      if(event.type==='keydown'&&event.key!=='Escape')return;
      if(event.type==='pointerup'&&moved&&target)reorderPin(key,target.dataset.pinKey,after);
      clearPinDrag();control.removeEventListener('pointermove',move);control.removeEventListener('pointerup',finish);control.removeEventListener('pointercancel',finish);control.removeEventListener('lostpointercapture',finish);document.removeEventListener('keydown',finish);
      if(control.hasPointerCapture(e.pointerId))control.releasePointerCapture(e.pointerId);
      setTimeout(()=>{suppressClick=false;state.navKey='';renderSidebar();},0);
    };
    control.addEventListener('pointermove',move);control.addEventListener('pointerup',finish);control.addEventListener('pointercancel',finish);control.addEventListener('lostpointercapture',finish);document.addEventListener('keydown',finish);
  });
}
function sidebarEntry(control, item, kind, pinned) {
  const wrap = node("div", pinned ? "pinned-entry" : "nav-entry");
  const showMenu = kind === 'bots' ? showBotMenu : showChatMenu;
  const more = iconButton('more', `Actions for ${item.name}`, () => {
    const bounds = more.getBoundingClientRect();
    showMenu(item, more, bounds.right, bounds.bottom + 6);
  });
  more.classList.add('nav-more');
  for (const target of [control, more]) {
    target.dataset.sidebarId = item.id;
    target.dataset.sidebarKind = kind;
    target.setAttribute('aria-haspopup', 'menu');
  }
  wrap.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    showMenu(item, control, e.clientX, e.clientY);
  });
  wrap.addEventListener('keydown', e => {
    if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
    e.preventDefault(); e.stopPropagation();
    const trigger = e.target === more ? more : control, bounds = trigger.getBoundingClientRect();
    showMenu(item, trigger, bounds.left + 8, bounds.bottom);
  });
  const toggle = iconButton("pin", `${pinned ? "Unpin" : "Pin"} ${item.name}`, async () => {
    await api(`/${kind}/${item.id}/pin`, "PUT", {pinned: !pinned});
    hidePinPreview();
    state.navKey = "";
    await refresh(true);
  });
  toggle.classList.add("nav-pin");
  toggle.setAttribute("aria-pressed", String(pinned));
  wrap.append(control, toggle, more);
  if(pinned)enablePinReordering(wrap,control,kind+':'+item.id);
  return wrap;
}
function updateSidebarActivity(preview){
  const id=preview.dataset.sidebarActivity,runs=state.allRuns.filter(r=>r.bot_id===id&&visibleActivityRun(r)),run=runs.find(r=>r.status==='running')||runs.find(active)||runs.find(r=>r.status==='queued');
  const activity=state.activities[id]||{},stale=state.activityReadAt&&Date.now()-state.activityReadAt>15000;
  const labels={queued:'queued',awaiting_user:'waiting for you',awaiting_approval:'awaiting approval',cancelling:'stopping'};
  const steps={investigate:'searching',search:'searching',read:'reading',terminal:'running a command',hammer:'building',saw:'building',drill:'building',write:'writing'};
  const label=run?(stale?'reconnecting':labels[run.status]||steps[activity.shape]||'working'):(activity.commands?(stale?'reconnecting':`${activity.commands} command${activity.commands===1?'':'s'} running`):'');
  const key=label||preview.dataset.idlePreview;
  if(preview.dataset.activityText===key)return;
  preview.dataset.activityText=key;preview.classList.toggle('is-working',!!label);
  if(!label){preview.textContent=preview.dataset.idlePreview;return;}
  const dots=node('span','sidebar-activity-dots');dots.setAttribute('aria-hidden','true');
  for(let i=0;i<3;i++)dots.append(node('span','','.'));
  dots.classList.toggle('is-moving',!stale&&run?.status==='running');
  preview.replaceChildren(dots,node('span','sidebar-activity-label',label));
  continueLoops(preview);
}
const archivingBots=new Set();
// The sidebar is rebuilt as a whole. Keep keyboard focus on the equivalent
// control, and let rows that changed place glide there instead of jumping.
let sidebarQuery='';
const sidebarEntries=()=>[...document.querySelectorAll('#pinned-bots .pinned-entry,#bots .nav-entry')];
function sidebarKey(entry){const control=entry.querySelector(':scope>[data-sidebar-id]');return control?control.dataset.sidebarKind+':'+control.dataset.sidebarId:'';}
function sidebarPlaces(){return new Map(sidebarEntries().map(entry=>[sidebarKey(entry),entry.getBoundingClientRect()]));}
function sidebarFocus(){
  // Older webviews without :focus-visible restore any sidebar focus.
  const focused=document.activeElement,visible=()=>{try{return focused.matches(':focus-visible');}catch{return true;}};
  if(!focused?.closest||!visible())return null;
  const entry=focused.closest('#pinned-bots .pinned-entry,#bots .nav-entry');
  if(entry)return {key:sidebarKey(entry),index:[...entry.children].indexOf(focused)};
  return focused.matches('#bots .bot-chat-section>summary')?{section:true}:null;
}
function restoreSidebarFocus(focus){
  if(!focus||(document.activeElement&&document.activeElement!==document.body))return;
  const target=focus.section?$('bots').querySelector('.bot-chat-section>summary'):sidebarEntries().find(entry=>sidebarKey(entry)===focus.key)?.children[focus.index];
  target?.focus({preventScroll:true});
}
function glideSidebar(places){
  if(!places.size||!motionAllowed())return;
  for(const entry of sidebarEntries()){
    const to=entry.getBoundingClientRect(),from=places.get(sidebarKey(entry));
    if(!to.height||to.bottom<0||to.top>innerHeight||to.right<0||to.left>innerWidth)continue;
    let frames=[{opacity:0},{opacity:1}];
    if(from?.height){
      const dx=from.left-to.left,dy=from.top-to.top;
      if(Math.abs(dx)<1&&Math.abs(dy)<1)continue;
      // A long move (a chat rising to the top) settles in place rather than
      // sweeping across every row between.
      frames=Math.abs(dy)>to.height*2.5||Math.abs(dx)>to.width?[{opacity:0,transform:`translateY(${Math.sign(dy)*6}px)`},{opacity:1,transform:'none'}]:[{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}];
    }
    trackMotion(entry.animate(frames,{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'}),240);
  }
}
function renderSidebar() {
  if(archivingBots.size||pinDrag)return;
  const key = JSON.stringify([
    state.bots,
    state.general.name,state.general.separate_bot_chats,
    state.chats,
    Object.entries(state.attention.chats).map(([id,value])=>[id,value.unread]),
    state.chat?.id,
    state.allRuns.map((r) => [r.id, r.status, r.output.slice(-400),r.error,r.activity_started]),
    state.bot?.id,
    $("search").value,
  ]);
  if (key === state.navKey) return;
  state.navKey = key;
  hidePinPreview();
  const q = $("search").value.toLowerCase().trim(),
    visible = state.bots
      .filter((b) => !profile(b).archived)
      .filter(
        (b) =>
          !q ||
          [
            b.name,
            profile(b).label,
            profile(b).description,
            ...state.allRuns
              .filter((r) => r.bot_id === b.id)
              .map((r) => r.prompt + " " + r.output),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
      );
  visible.sort(
    (a, b) =>
      (state.chats.find(c=>c.id===`dm-${b.id}`&&!hiddenCompletionMessage(c.last_message))?.last_message?.created || state.allRuns.find(r=>r.bot_id===b.id&&visibleRunPreview(r))?.created || 0) -
      (state.chats.find(c=>c.id===`dm-${a.id}`&&!hiddenCompletionMessage(c.last_message))?.last_message?.created || state.allRuns.find(r=>r.bot_id===a.id&&visibleRunPreview(r))?.created || 0),
  );
  const coordinationOpen=$("bots").querySelector(".bot-chat-section")?.open??false;
  const places=q===sidebarQuery?sidebarPlaces():new Map(),focus=sidebarFocus();sidebarQuery=q;
  $("bots").replaceChildren();
  const coordination=node("details","bot-chat-section"),coordinationBody=node("div","bot-chat-list");coordination.open=coordinationOpen;coordination.append(node("summary","","Bot conversations"),coordinationBody);
  $("pinned-bots").replaceChildren();
  for (const b of visible) {
    const latest = state.allRuns.find((r) => r.chat_id === `dm-${b.id}` && visibleRunPreview(r)),
      busy = state.allRuns.some((r) => r.bot_id === b.id && active(r) && visibleActivityRun(r));
    const savedMessage = state.chats.find(c => c.id === `dm-${b.id}`)?.last_message;
    const lastMessage = hiddenCompletionMessage(savedMessage)?null:savedMessage;
    const preview = plain((lastMessage?.kind==='connection_card'?connectorBrand(lastMessage.text).name+' · Connection':lastMessage?.text) || latest?.error || latest?.output || latest?.prompt || profile(b).description) || "Say hello.";
    const row = button(
      "",
      () => chooseBot(b),
      "bot-link" + (!state.chat && b.id === state.bot?.id ? " active" : ""),
    );
    row.setAttribute("aria-label", b.name);
    row.append(buddy(b, 44, busy, `nav-${b.id}`));
    const info = node("div", "bot-info"),
      title = node("div", "bot-title-row");
    title.append(node("strong", "", b.name));
    if (profile(b).label)
      title.append(node("span", "bot-label", profile(b).label));
    if (lastMessage || latest) title.append(node("span", "bot-time", clock(lastMessage?.created || latest.created)));
    const previewLine=node('div','bot-preview');previewLine.dataset.sidebarActivity=b.id;previewLine.dataset.idlePreview=preview;
    updateSidebarActivity(previewLine);info.append(title,previewLine);
    row.append(info);
    addUnreadDot(row,`dm-${b.id}`);
    if (profile(b).pinned) {
      const p = button("", () => chooseBot(b), "pinned-bot" + (!state.chat && b.id === state.bot?.id ? " active" : ""));
      p.setAttribute("aria-label", b.name);
      p.append(buddy(b, 58, busy, `pin-${b.id}`), node("span", "", b.name));
      addUnreadDot(p,`dm-${b.id}`);
      attachPinPreview(p, b.name, lastMessage, preview);
      $("pinned-bots").append(sidebarEntry(p, b, "bots", true));
    } else $("bots").append(sidebarEntry(row, b, "bots", false));
  }
  for (const c of state.chats.filter(
    (c) =>
      !c.archived &&
      !c.id.startsWith("dm-") &&
      (!q || c.name.toLowerCase().includes(q) || channelTitle(c).toLowerCase().includes(q)),
  )) {
    const row = button(
      "",
      () => chooseChat(c),
      "bot-link" + (state.chat?.id === c.id ? " active" : ""),
    );
    row.setAttribute("aria-label", channelTitle(c));
    const avatars = participantStack(c,'row','stack-row');
    const info = node("div", "bot-info");
    const latest = state.allRuns.find(r=>r.chat_id===c.id&&visibleRunPreview(r));
    const lastMessage=hiddenCompletionMessage(c.last_message)?null:c.last_message;
    const preview = plain((lastMessage?.kind==='connection_card'?connectorBrand(lastMessage.text).name+' · Connection':lastMessage?.text) || latest?.error || latest?.output || latest?.prompt) || (c.shared?c.participants.map(p=>p.name):c.members.map(id => state.bots.find(b => b.id === id)?.name || "Bot")).join(", ");
    info.append(
      node("strong", "", channelTitle(c)),
      node(
        "div",
        "bot-preview",
        preview,
      ),
    );
    row.append(avatars, info);
    addUnreadDot(row,c.id);
    if(c.bot_only&&state.general.separate_bot_chats!==false){const entry=sidebarEntry(row,c,"chats",!!c.pinned);entry.className="nav-entry";coordinationBody.append(entry);continue;}
    if (c.pinned) {
      const tile = button("", () => chooseChat(c), "pinned-bot" + (state.chat?.id === c.id ? " active" : ""));
      tile.setAttribute("aria-label", channelTitle(c));
      tile.append(participantStack(c,'tile','stack-tile'), node("span", "", channelTitle(c)));
      addUnreadDot(tile,c.id);
      attachPinPreview(tile, c.name, lastMessage, preview);
      $("pinned-bots").append(sidebarEntry(tile, c, "chats", true));
    } else $("bots").append(sidebarEntry(row, c, "chats", false));
  }
  if(coordinationBody.children.length){if(q)coordination.open=true;$("bots").append(coordination);}
  sortPinnedEntries();
  $("pinned-bots").hidden = !$("pinned-bots").children.length;
  if (!$("bots").children.length&&!$("pinned-bots").children.length)
    $("bots").append(
      node(
        "p",
        "muted small",
        q ? "No matching conversations." : "Start a chat or create a bot with +.",
      ),
    );
  for(const [key,avatar] of avatarCache)if(/^stack-(row|tile)-/.test(key)&&!avatar.isConnected)avatarCache.delete(key);
  restoreSidebarFocus(focus);glideSidebar(places);continueLoops($("bots"));
}
function renderHeader() {
  renderPendingFiles();
  const b = state.chat?.shared?null:state.bot,
    busy = state.allRuns.some((r) => r.bot_id === b?.id && active(r));
  const group=state.chat&&!state.chat.id.startsWith('dm-');
  $('bot-details').disabled=!(b||group);
  const key = JSON.stringify([b, busy, state.chat,channelTitle(state.chat),state.general.name,state.bots.map(b=>[b.id,b.name,b.profile])]);
  if (key !== state.headerKey) {
    state.headerKey = key;
    $("heading").textContent = channelTitle(state.chat) || b?.name || "Kindred";
    $("header-avatar").replaceChildren(
      group?participantStack(state.chat,'header','stack-header'):buddy(b, 34, busy, `header-${b?.id || "empty"}`),
    );
    $("prompt").placeholder = b ? "Message " + b.name : "Message";
  }
  let chatActions=$('chat-actions');
  if(!chatActions){chatActions=iconButton('more','Chat actions',()=>{const bounds=chatActions.getBoundingClientRect();if(state.chat&&!state.chat.id.startsWith('dm-'))showChatMenu(state.chat,chatActions,bounds.right-200,bounds.bottom+6);else if(state.bot)showBotMenu(state.bot,chatActions,bounds.right-200,bounds.bottom+6);});chatActions.id='chat-actions';chatActions.setAttribute('aria-haspopup','menu');$('show-computer').before(chatActions);}
  chatActions.hidden=!(group||b);
  chatActions.title=group?'Chat actions':'Bot actions';
  chatActions.setAttribute('aria-label',chatActions.title);

  $("composer-area").hidden = !b&&!state.chat;
  $("show-computer").hidden=!!state.chat?.shared&&!chatScreenBots().length;
  $("composer-actions").hidden=false;
  const pause = pausedScreens().find(p=>p.bot_id===b?.id), thisBotPaused=!!pause;
  const queueChatId = state.chat?.id || (b ? `dm-${b.id}` : '');
  const queued = queueChatId ? [...new Set(state.allRuns.filter(r=>r.chat_id===queueChatId).map(r=>r.bot_id))].reduce((count,id)=>count+queuedWork(id,queueChatId).waiting,0) : 0;
  $('queue-status').hidden = !queued && !pause;
  $('queue-status').replaceChildren(node('span','',queued ? `${queued} message${queued===1?'':'s'} queued${pause?' · waiting for control to be returned':''}` : 'Computer paused for manual control'));
  if(pause)$('queue-status').append(button('Return control',()=>returnScreenControl(pause),'subtle-button small-button'));
  $('queue-status').title = pause ? 'Return control to let this bot continue. Dismissing the notice does not resume work.' : 'Ordinary follow-ups join the current task after its next action. Slash commands and scheduled work keep their place in the queue.';
  renderControlNotice();
  if (state.chat) {
    $("prompt").setAttribute("data-placeholder", "Message " + state.chat.name);
  } else
    $("prompt").setAttribute(
      "data-placeholder",
      b ? "Message " + b.name : "Message",
    );
  renderReplyDraft();
  const hint=$("composer-hint"),providerKey=b?JSON.stringify([b.provider,providerName(b)]):'';
  if(hint.dataset.providerKey!==providerKey){
    hint.dataset.providerKey=providerKey;hint.replaceChildren();
    if (b) {
      const mark=node("span", "provider-mark"); mark.title=providerName(b); mark.setAttribute("aria-label",providerName(b)); mark.setAttribute("role","img");
      if (b.provider==="codex") {
        for (const color of ["white","black"]) { const img=node("img", "openai-logo openai-"+color); img.src="/openai-"+color+".svg"; img.alt=""; mark.append(img); }
      } else if (["claude-code","openrouter","kimi-code"].includes(b.provider)) {
        const symbol=node("span","provider-symbol");symbol.dataset.provider=b.provider;symbol.setAttribute("aria-hidden","true");mark.append(symbol);
      } else mark.append(icon("network",18));
      hint.append(mark);
    }
  }
  $("composer-caption").textContent = thisBotPaused
    ? "This computer is paused for manual control. Return control to let the bot continue."
    : "";
  renderVersions();
  renderUpdateNotice();
}
function installedClientVersion(){return typeof window.__KINDRED_DESKTOP_VERSION==='string'?window.__KINDRED_DESKTOP_VERSION:null;}
function renderVersions(){
  const client=installedClientVersion(),desktop=!!window.__KINDRED_DESKTOP;
  $('version').textContent=(desktop?'Client ':'Browser UI ')+(desktop?(client||'Unknown'):UI_VERSION);
  $('server-version').textContent='Server '+(state.status.version||'Connecting…');
  for(const n of document.querySelectorAll('[data-client-version]'))n.textContent=desktop?(client||'Unknown'):('Browser UI '+UI_VERSION);
  for(const n of document.querySelectorAll('[data-server-version]'))n.textContent=state.status.version||'Connecting…';
  for(const n of document.querySelectorAll('[data-client-update-status]')){
    n.textContent=state.updateRelease?'Desktop app '+state.updateRelease.version+' is available.':desktop&&client&&newerVersion(state.status.version,client)?'The connected server is newer than this desktop app. Check for an app update.':desktop?'App updates affect this device. Server updates are managed separately.':'This interface is loaded from your server.';
  }
  for(const n of document.querySelectorAll('[data-client-update-action]')){n.hidden=!state.updateRelease;n.textContent=canInstallClientUpdate()?'Update desktop app':'Download app update';}
}
function canInstallClientUpdate(){return !!window.__KINDRED_NATIVE_UPDATER || (!!window.__KINDRED_SERVER_UPDATER&&state.updateRelease?.transport==='server');}
function openClientDownload(){
  const release=state.updateRelease,version=release?.version;
  if(['linux','macos'].includes(window.__KINDRED_DESKTOP?.platform)&&!release?.downloadPath)return toast('Check this server for a signed client update first.');
  const url=release?.downloadPath?new URL(release.downloadPath,location.origin).href:version&&/^\d+\.\d+\.\d+$/.test(version)?'https://github.com/awpsec/kindred/releases/tag/v'+version:'https://github.com/awpsec/kindred/releases/latest';
  if(window.__KINDRED_EXTERNAL_LINKS)return nativeInvoke('open_external_url',{url});
  window.open(url,'_blank','noopener,noreferrer');
}
async function clientUpdateAction(){if(canInstallClientUpdate())return updateKindred();return openClientDownload();}
function renderUpdateNotice() {
  renderVersions();
  const desktop=!!window.__KINDRED_DESKTOP,newerUI=!desktop&&newerVersion(state.status.version,UI_VERSION);
  const visible=desktop?!!state.updateRelease:newerUI;
  let update=$('client-update');
  if(!visible){update?.parentElement.remove();return;}
  if(!update){
    const slot=node('span','update-slot');
    update=button('Update',async()=>{
      if(desktop)return clientUpdateAction();
      for(const [key,value] of Object.entries(conversationSnapshot()))sessionStorage.setItem('kindred-reload-'+key,JSON.stringify(value));location.reload();
    },'client-update','download');
    update.id='client-update';slot.append(update);$('identity-row').append(slot);
  }
  const manual=desktop&&!canInstallClientUpdate();
  const label=manual?'Download update':'Update';
  if(update.dataset.label!==label){update.dataset.label=label;update.replaceChildren(icon('download'),document.createTextNode(label));}
  update.setAttribute('aria-label',desktop?(manual?'Download Kindred client update':'Update Kindred client'):'Reload updated interface');
  update.title=desktop?'Client '+state.updateRelease.version+' is available'+(canInstallClientUpdate()?'':' · Download and install once to enable in-app updates'):'Reload the updated server interface';
}
async function checkUpdates(force=false) {
  if(!window.__KINDRED_DESKTOP||!installedClientVersion()||state.checkingUpdate||(!force&&Date.now()-(state.lastUpdateCheck||0)<60000))return;
  state.checkingUpdate=true;state.lastUpdateCheck=Date.now();
  try{state.updateRelease=await availableRelease(installedClientVersion(),window.__KINDRED_DESKTOP.platform);renderUpdateNotice();}
  finally{state.checkingUpdate=false;}
}
setInterval(()=>{if(!document.hidden)void checkUpdates();},60000);
window.addEventListener("focus",()=>void checkUpdates());
document.addEventListener("visibilitychange",()=>{if(!document.hidden)void checkUpdates();});
void checkUpdates(true);

async function renderChat(force, mode='sync') {
  const currentChat =
    state.chat || state.chats.find((c) => c.id === `dm-${state.bot?.id}`);
  if (currentChat) return renderSharedChat(currentChat, force, mode);
  clearConversationOpening();
  const bot = state.bot,
    area = $("content");
  if (!bot) {
    if (state.chatKey === "empty") return;
    state.chatKey = "empty";
    const empty = node("div", "empty");
    empty.append(
      character({ shape: "pebble" }, 100),
      node("h1", "", "Meet your next little helper."),
      node("p", "", "Give your bot a name and something to look after."),
      button("Create a bot", newBot, "primary"),
    );
    area.replaceChildren(empty);
    return;
  }
  const runs = state.allRuns.filter((r) => r.bot_id === bot.id);
  await Promise.all(
    runs
      .filter(
        (r) =>
          active(r) ||
          !state.details.has(r.id) ||
          state.details.get(r.id).run.status !== r.status,
      )
      .map(async (r) => state.details.set(r.id, await api("/runs/" + r.id))),
  );
  if (state.bot?.id !== bot.id) return;
  const key = JSON.stringify([
    bot.id,
    runs,
    state.approvals,
    state.userTasks,
    runs.map((r) => state.details.get(r.id)?.events),
  ]);
  if (!force && key === state.chatKey) return;
  state.chatKey = key;
  beginChatRender('bot-'+bot.id);
  releaseScreenshotUrls();
  area.replaceChildren();
  if (!runs.length) {
    const empty = node("div", "empty");
    empty.append(
      character(portrait(bot), 105),
      node("h1", "", `Hey, I'm ${bot.name}.`),
      node(
        "p",
        "",
        profile(bot).description || "What can I take off your plate?",
      ),
    );
    const suggestions = node("div", "suggestions");
    for (const [label, prompt] of [
      [
        "Get to know me",
        "Let’s get to know each other. Ask me what would be useful to remember about how I work.",
      ],
      [
        "Look at my computer",
        "Take a look at the bot computer and tell me what you can see.",
      ],
      [
        "Start a routine",
        "Help me set up a useful routine. Ask what I want to repeat and how often.",
      ],
    ])
      suggestions.append(
        button(label, () => {
          $("prompt").value = prompt;
          $("prompt").focus();
        }),
      );
    empty.append(suggestions);
    area.append(empty);
    endChatRender();
    return;
  }
  for (const run of [...runs].reverse()) {
    const group = node("article", "message-group");
    group.dataset.run = run.id;
    group.append(
      node(
        "div",
        "message-date",
        new Date(run.created * 1000).toLocaleString([], {timeZone:botTimezone(),
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        }),
      ),
    );
    const user = node("div", "message-row user");
    user.append(node("div", "message-bubble plain-message", run.prompt));
    group.append(user);
    const detail = state.details.get(run.id),
      events = detail?.events || [];
    const messages = events.filter((e) => e.kind === "assistant");
    if (!messages.length && run.output)
      messages.push({ body: { text: run.output }, created: run.created });
    for (const message of messages) {
      if(message.body.status_notice==='provider_error'){group.append(chatStatusNotice('Provider error',message.body.text));continue;}
      const row = node("div", "message-row assistant");
      row.append(markdown(message.body.text));
      group.append(row);
      const foot = node("div", "message-foot");
      foot.append(
        node("span", "", clock(message.created)),
        iconButton("copy", "Copy message", async () => {
          await navigator.clipboard.writeText(message.body.text);
          notice("Copied.");
        }),
      );
      group.append(foot);
    }
    if(['failed','cancelled','interrupted'].includes(run.status)){group.append(chatStatusNotice(run.status==='cancelled'?'Task stopped':run.status==='interrupted'?'Task interrupted':'Task failed',run.error||''),continueTaskButton(run));}
    renderAttachments(group, detail?.attachments || []);
    const tools = events.filter((e) => e.kind !== "assistant");
    if (state.general.show_activity === true && tools.length) {
      const activity = node("details", "activity");
      activity.open = state.openActivity.has(run.id);
      activity.append(
        node(
          "summary",
          "",
          `${events.filter((e) => e.kind === "tool_requested").length} actions · ${run.status.replaceAll("_", " ")}`,
        ),
      );
      const body = node("div", "activity-body");
      for (const event of tools) {
        const row = node("div", "activity-event");
        row.append(
          node(
            "strong",
            "",
            event.kind === "tool_requested"
              ? connectorActivityLabel(event.body) || event.body.tool || "Action"
              : event.kind.replaceAll("_", " "),
          ),
          node(
            "pre",
            "",
            event.body.args
              ? JSON.stringify(event.body.args, null, 2)
              : event.body.text || JSON.stringify(event.body, null, 2),
          ),
        );
        body.append(row);
      }
      activity.append(body);
      activity.ontoggle = () =>
        activity.open
          ? state.openActivity.add(run.id)
          : state.openActivity.delete(run.id);
      group.append(activity);
    }
    group.append(taskCards(run));
    if (active(run)) {
      group.append(workLine(bot, run));
    }
    if (run.error) group.append(node("div", "run-error", run.error));
    area.append(group);
  }
  endChatRender();
}
function openDetails(view = "details") {
  if (!state.bot) return;
  state.view = view;
  showPane($("details-panel"));
  hidePane($("computer-panel"));
  disconnectDesktop();
  state.panelKey = "";
  view === "settings" ? renderBotSettings() : renderDetails();
}
function renderDetails() {
  const b = state.bot;
  if (!b) return;
  const routines = state.routines.filter((r) => r.bot_id === b.id),
    key = JSON.stringify([b, routines]);
  if (key === state.panelKey) return;
  state.panelKey = key;
  $("details-title").textContent = "Details";
  $("details-back").hidden = true;
  $("bot-settings").hidden = false;
  const root = $("details-content");
  const previousForm=root.querySelector('.bot-identity-form');
  const form=previousForm?.dataset.botId===b.id?previousForm:botIdentityForm(b);
  form.updateIdentity(b);
  const previousMenu = root.querySelector('.avatar-menu');
  const avatar = previousMenu?.dataset.botId === b.id ? previousMenu : avatarMenu(b);
  const previousRoutines = root.querySelector('.bot-detail-routines');
  const focusedChoice = root.contains(document.activeElement) ? document.activeElement : null;
  avatar.updateProfile(b);
  root.replaceChildren();
  const card = node("div", "bot-identity");
  card.append(avatar);
  root.append(card,form);
  focusedChoice?.focus({preventScroll:true});
  root.append(
    button(
      "Connections",
      () => openSettings("connections"),
      "detail-link",
      "link",
    ),
    button("Skills", () => openSettings("skills"), "detail-link", "book"),
    button("Artifacts", () => openArtifacts(), "detail-link", "file"),
  );
  const routineSection=previousRoutines?.dataset.botId===b.id?previousRoutines:node('section','bot-detail-routines');
  routineSection.dataset.botId=b.id;root.append(routineSection);
  renderBotDetailRoutines(routineSection,routines,focusedChoice);
  if(focusedChoice&&routineSection.contains(focusedChoice))focusedChoice.focus({preventScroll:true});
}
const pendingDetailRoutines=new Set();
function renderBotDetailRoutines(root,routines,focused){
  const key=JSON.stringify(routines);if(root.dataset.key===key)return;root.dataset.key=key;
  const focusedId=focused?.closest('[data-routine-id]')?.dataset.routineId,focusedAction=focused?.dataset.routineAction;
  const heading=node('h3','','Routines');heading.id='bot-detail-routines-title';root.setAttribute('aria-labelledby',heading.id);
  root.replaceChildren(heading);
  if(!routines.length){root.append(node('p','muted small','No routines yet.'));return;}
  const list=node('ul','bot-detail-routine-list');root.append(list);
  for(const r of routines){
    const row=node('li','bot-detail-routine');row.dataset.routineId=r.id;row.classList.toggle('is-paused',!r.enabled);
    const overview=node('div','bot-detail-routine-overview'),cadence=(r.enabled?'':'Paused · ')+routineScheduleLabel(r);
    overview.append(node('strong','',r.name),node('span','muted small',cadence));
    const actions=node('div','bot-detail-routine-actions');
    const toggle=iconButton(r.enabled?'pause':'play',(r.enabled?'Pause ':'Resume ')+r.name,()=>changeDetailRoutine(r,'toggle'));
    const edit=iconButton('edit','Edit '+r.name,()=>editRoutine(r));
    const remove=iconButton('trash','Delete '+r.name,()=>changeDetailRoutine(r,'delete'));
    for(const [control,action] of [[toggle,'toggle'],[edit,'edit'],[remove,'delete']]){control.dataset.routineAction=action;control.disabled=pendingDetailRoutines.has(r.id);actions.append(control);}
    row.append(overview,actions);list.append(row);
    if(r.monitor?.error){const status=node('span','small run-error','Needs attention');status.title=r.monitor.error;overview.append(status);}
    if(focusedId===r.id&&focusedAction)actions.querySelector('[data-routine-action="'+focusedAction+'"]')?.focus({preventScroll:true});
  }
}
async function changeDetailRoutine(r,action){
  if(pendingDetailRoutines.has(r.id))return;
  if(action==='delete'&&!confirm('Delete routine “'+r.name+'”? Its chat and task history will remain.'))return;
  if(action==='toggle'&&!r.enabled&&r.run_at&&r.run_at<=Date.now()/1000){editRoutine(r);return;}
  const setPending=pending=>{
    for(const row of document.querySelectorAll('.bot-detail-routine'))if(row.dataset.routineId===r.id){
      row.setAttribute('aria-busy',String(pending));for(const control of row.querySelectorAll('button'))control.disabled=pending;
    }
  };
  pendingDetailRoutines.add(r.id);setPending(true);
  try{
    if(r.trigger==='activity'){
      if(action==='delete'){
        if(r.enabled)await api('/inbox-monitors/'+r.id+'/pause','POST',{});
        try{await api('/inbox-monitors/'+r.id,'DELETE');}
        catch(error){await refresh(true).catch(()=>{});throw error;}
      }
      else if(r.enabled)await api('/inbox-monitors/'+r.id+'/pause','POST',{});
      else await api('/inbox-monitors','POST',inboxWatchInput(r.monitor,{enabled:true}));
    }else await api('/routines/'+r.id,action==='delete'?'DELETE':'PATCH',action==='delete'?undefined:{enabled:!r.enabled});
    await refresh(true);
  }finally{pendingDetailRoutines.delete(r.id);setPending(false);}
}
function botIdentityForm(bot){
  const form=node('form','bot-identity-form');form.dataset.botId=bot.id;
  const name=field('Name',bot.name,'input',{required:true,maxLength:80}),
    label=field('Label (optional)',profile(bot).label,'input',{maxLength:80}),
    description=field('Description',profile(bot).description,'textarea',{rows:4,maxLength:2000}),
    notifications=switchField('Notifications',profile(bot).notifications!==false);
  form.append(name.label,label.label,description.label,notifications.label);
  notifications.input.addEventListener('change',()=>{if(notifications.input.checked)void enableNotifications();});
  const saver=livePreferences(form,()=>({name:name.input.value,label:label.input.value,description:description.input.value,notifications:notifications.input.checked}),value=>queueAvatarWrite(bot.id,async()=>{
    state.botWriteEpoch=(state.botWriteEpoch||0)+1;
    try{
      const saved=await api('/bots/'+bot.id+'/identity','PUT',value);
      state.bots=state.bots.map(b=>b.id===bot.id?saved:b);if(state.bot?.id===bot.id)state.bot=saved;
      return saved;
    }
    finally{state.botWriteEpoch=(state.botWriteEpoch||0)+1;}
  }),value=>{
    state.bots=state.bots.map(b=>b.id===bot.id?value:b);
    if(state.bot?.id===bot.id)state.bot=value;
    const dm=state.chats.find(c=>c.id==='dm-'+bot.id);if(dm)dm.name=value.name;
    state.navKey='';state.headerKey='';renderSidebar();renderHeader();
    state.panelKey="";if(state.view==="details")renderDetails();
  });
  form.updateIdentity=value=>{
    if(saver.dirty || form.contains(document.activeElement))return;
    name.input.value=value.name;label.input.value=profile(value).label||'';description.input.value=profile(value).description||'';notifications.input.checked=profile(value).notifications!==false;
  };
  return form;
}
function preparePreview(img) {
  const fallback=node("span","preview-fallback");fallback.append(icon("computer",24),node("span","","Loading preview…"));img.after(fallback);
  img.style.opacity="0";
  img.onload=()=>{img.style.opacity="1";fallback.hidden=true;};
  img.onerror=()=>previewUnavailable(img);
}
function previewUnavailable(img) {
  img.style.opacity="0";
  const fallback=img.parentElement?.querySelector(".preview-fallback");
  if(fallback){fallback.hidden=false;fallback.lastElementChild.textContent="Preview unavailable · Open computer to reconnect";}
}
async function refreshPreview() {
  const images = [
    ...document.querySelectorAll("[data-computer-preview]"),
  ].filter((img) => img.offsetParent !== null);
  if (!images.length) return;
  if(state.previewBusy){state.previewPending=true;return;}
  state.previewBusy = true;
  try {
    const groups=new Map();
    for(const img of images){const id=img.dataset.computerPreview||screenBotId();if(!groups.has(id))groups.set(id,[]);groups.get(id).push(img);}
    await Promise.all([...groups].map(async([id,targets])=>{
      const current=img=>img.isConnected&&(img.dataset.computerPreview||screenBotId())===id;
      try{const result=await api('/computer?bot_id='+encodeURIComponent(id));for(const img of targets)if(current(img))img.src=result.image;}
      catch{for(const img of targets)if(current(img))previewUnavailable(img);}
    }));
  } finally {
    state.previewBusy = false;
    if(state.previewPending){state.previewPending=false;void refreshPreview();}
  }
}
function renderBotSettings() {
  const b = state.bot;
  if (!b) return;
  $("details-title").textContent = "Bot settings";
  $("details-back").hidden = false;
  $("bot-settings").hidden = true;
  const root = $("details-content");
  root.replaceChildren();
  const draft = structuredClone(b),
    avatar = button(
      "",
      () =>
        pickAvatar({...draft.profile,name:name.input.value}, (p) => {
          const {name:_,...appearance}=p;draft.profile = appearance;
          replaceCharacter(avatar,{...p,name:name.input.value},90);
          saver.schedule();
        }),
      "avatar-edit",
    );
  avatar.append(character(portrait(draft), 90));
  const form = node("form", "bot-edit-form");
  const name = field("Name", b.name, "input", {
      required: true,
      maxLength: 80,
    }),
    label = field("Role", profile(b).label, "input", { maxLength: 80 }),
    description = field("Description", profile(b).description, "textarea", {
      rows: 3,
      maxLength: 2000,
    }),
    models = modelControls(b.provider, b.model, b.reasoning_effort || "");
  const provider = select(
      providerOptions(b.provider),
      b.provider,
    ),
    pl = node("label", "", "AI provider");
  pl.append(provider);
  provider.setAttribute('aria-label','AI provider');
  void loadProviderAccounts().then(()=>{if(!provider.isConnected)return;const chosen=provider.value;const updated=select(providerOptions(chosen),chosen);provider.replaceChildren(...Array.from(updated.options));provider.value=chosen;}).catch(()=>{});
  name.input.addEventListener("input",()=>replaceCharacter(avatar,{...draft.profile,name:name.input.value},90));
  const connectors=botConnectorPreferences(draft);
  provider.onchange = () => {models.changeProvider(provider.value);connectors.setProvider(provider.value,false);};
  const automatic = approvalSelect(b.approval_mode || "inherit", true),
    pinned = switchField("Pin in sidebar", profile(b).pinned),
    notifications = switchField("Notifications", profile(b).notifications !== false);
  const local = botLocalAccess(b);
  notifications.input.addEventListener("change", () => {if(notifications.input.checked) void enableNotifications();});
  form.append(
    avatar,
    name.label,
    label.label,
    description.label,
    notifications.label,
    local.root,
    pl,
    models.root,
    button("Instructions", () => editBotText(b.id, "instructions"), "bot-text-button", "chevron"),
    button("Memory", () => editBotText(b.id, "memory"), "bot-text-button", "chevron"),
    button("Workspace origin", () => workspaceUI.origin(b), "bot-text-button", "chevron"),
    automatic.label,
    pinned.label,
  );
  const saver = livePreferences(form, () => ({
    ...draft, name: name.input.value, provider: provider.value,
    model: models.model.value, reasoning_effort: models.effort.value,
    preserve_text: true,
    auto_approve: false, approval_mode: automatic.input.value,
    profile: {...profile(draft), label: label.input.value, description: description.input.value,
      pinned: pinned.input.checked, notifications: notifications.input.checked, animated: true, local_access: local.input.checked, local_device_id: local.device.value},
  }), value => api("/bots/" + b.id, "PUT", value), value => {
    Object.assign(draft, value);connectors.setProvider(value.provider,true);
    state.bots = state.bots.map(bot => bot.id === b.id ? value : bot);
    if (state.bot?.id === b.id) state.bot = value;
    state.navKey = ""; state.headerKey = ""; renderSidebar(); renderHeader();
  });
  root.append(
    form,
    connectors,
    button("Archive bot", () => archiveBot(b.id), "danger-text"),
  );
}
async function editBotText(id, key) {
  const latest = (await api('/bots')).find(b => b.id === id);
  if (!latest) throw new Error('This bot is no longer available.');
  const title = key === 'memory' ? 'Memory' : 'Instructions';
  const d = modal(title, 'bot-text-dialog');
  const form = node('form'), editor = field(title, latest[key], 'textarea', {rows:20});
  const count = node('span', 'muted small'), error = node('p', 'run-error');
  const save = node('button', 'primary', 'Save');save.type = 'submit';
  const actions = node('div', 'bot-text-actions');
  actions.append(count, button('Cancel', () => d.close(), 'outline-button'), save);
  const limit = key === 'instructions' ? 32000 : 64000;
  const validate = () => {const bytes = new TextEncoder().encode(editor.input.value).length;count.textContent=bytes.toLocaleString()+' / '+limit.toLocaleString()+' bytes';editor.input.setCustomValidity(bytes>limit?'Shorten this text to '+limit.toLocaleString()+' bytes.':'');};
  editor.input.addEventListener('input', validate);validate();
  form.append(editor.label,error,actions);d.append(form);
  form.onsubmit = e => {e.preventDefault();void perform(async()=>{
    error.textContent='';
    try {
      const updated = await api('/bots/'+id+'/text','PUT',{field:key,value:editor.input.value,expected:latest[key]});
      state.bots=state.bots.map(b=>b.id===id?updated:b);if(state.bot?.id===id)state.bot=updated;
      d.close();
    } catch(e) {error.textContent=e.message;}
  },save);};
  editor.input.focus({preventScroll:true});
}
function pickAvatar(value, save) {
  state.avatarDraft = { ...defaultProfile, ...value };
  state.avatarSave = save;
  renderAvatar();
  $("avatar-dialog").showModal();
}
function renderAvatar() {
  const p = state.avatarDraft;
  replaceCharacter($("avatar-preview"),p,104);
  $("shape-options").replaceChildren();
  for (const shape of shapes) {
    const b = button(
      "",
      () => {
        state.avatarDraft.shape = shape;
        state.avatarSave({...state.avatarDraft, animated: true});
        renderAvatar();
      },
      "shape-option" + (p.shape === shape ? " selected" : ""),
    );
    b.title = shape;
    b.setAttribute("aria-label", shape);
    b.append(character({ ...p, name:"", shape, animated: false }, 48));
    $("shape-options").append(b);
  }
  $("color-options").replaceChildren();
  for (const [name, color] of colors) {
    const b = button(
      "",
      () => {
        state.avatarDraft.color = color;
        state.avatarSave({...state.avatarDraft, animated: true});
        renderAvatar();
      },
      "color-option" + (p.color === color ? " selected" : ""),
    );
    b.style.backgroundColor = color === '#ffffff' ? 'var(--fg)' : color;
    b.title = name;
    b.setAttribute("aria-label", name);
    $("color-options").append(b);
  }


}
async function newBot(proposal = null) {
  try { await loadProviderAccounts(); } catch { notice("Provider list unavailable; showing saved choices."); }
  $("bot-form").elements.provider.replaceChildren(...providerOptions(state.general.default_provider).map(([id,name])=>new Option(name,id)));
  state.botProposal = proposal;
  const draft = proposal?.bot;
  state.newProfile = { ...defaultProfile, ...draft?.profile };
  $("bot-form").reset();
  const fields = $("bot-form").elements;
  fields.name.value = draft?.name || '';
  fields.label.value = draft?.profile.label || '';
  fields.description.value = draft?.profile.description || '';
  fields.instructions.value = draft?.instructions || 'Be a thoughtful, practical personal assistant. Use the shared computer when useful. Ask before taking consequential actions.';
  fields.provider.value = draft?.provider || state.general.default_provider || 'codex';
  $("bot-dialog").classList.toggle('is-teammate-draft',!!proposal);
  $("bot-dialog-title").textContent = proposal ? 'Teammate draft' : 'New bot';
  $("new-avatar-button").replaceChildren(character({...state.newProfile,name:fields.name.value},90));
  $("bot-dialog").showModal();
  const models = modelControls(fields.provider.value, draft?.model || "", draft?.reasoning_effort || "");
  $("new-model-controls").replaceChildren(models.root);
  $("bot-form").elements.provider.onchange = (e) =>
    models.changeProvider(e.target.value);
}
const modelCache = new Map();
async function loadModels(provider, refresh = false) {
  if (!refresh && modelCache.has(provider)) return modelCache.get(provider);
  const request = api(
    provider === "codex" ? "/codex/models" : provider === "openrouter" ? "/openrouter/models" : ["opencode","opencode-go"].includes(provider) ? "/opencode/"+provider+"/models" : provider.startsWith("custom-") ? "/providers/"+provider+"/models" : "/provider-cli/"+provider+"/models",
    ["codex","claude-code","kimi-code"].includes(provider) || provider.startsWith('custom-')&&refresh ? "POST" : "GET",
    ["codex","claude-code","kimi-code"].includes(provider) || provider.startsWith('custom-')&&refresh ? {} : undefined,
  )
    .then((result) => {if(result.catalog?.error)notice(result.catalog.error+(result.data?.length?' Using the saved catalogue.':''),true);return result.data || [];})
    .catch((e) => {
      modelCache.delete(provider);
      throw e;
    });
  modelCache.set(provider, request);
  return request;
}
function modelControls(initialProvider, initialModel, initialEffort, configuringDefault=false) {
  const root = node("div", "model-controls"),
    model = select([], ""),
    effort = select([], "");
  model.name = "model";
  model.dataset.searchable = "true";
  effort.name = "reasoning_effort";
  model.setAttribute("aria-label", "Model");
  effort.setAttribute("aria-label", "Thinking level");
  const modelLabel = node("label", "", "Model"),
    effortLabel = node("label", "", "Thinking level"),
    help = node("p", "muted small");
  modelLabel.append(model);
  effortLabel.append(effort);
  const refresh = button(
    "Refresh models",
    () => populate(true),
    "subtle-button small-button",
    "refresh",
  );
  const versions = switchField("Show model versions", false);
  versions.label.classList.add('model-version-toggle');versions.label.hidden = true;
  root.append(modelLabel, versions.label, effortLabel, help, refresh);
  let provider = initialProvider,
    wantedModel = initialModel,
    wantedEffort = initialEffort,
    catalog = [],
    generation = 0;
  const drafts = new Map();
  function thoughts(value = "") {
    const selected =
      catalog.find((m) => m.model === (model.value || (!configuringDefault && state.general.model_defaults?.[provider]?.model))) ||
      (model.value === "" ? catalog.find((m) => m.isDefault) : null);
    const options =
      Array.isArray(selected?.supportedReasoningEfforts)
        ? (selected?.supportedReasoningEfforts || []).map((e) => [
            e.reasoningEffort,
            e.description,
          ])
        : selected?.reasoning
          ? [
              ["low", "Lighter reasoning"],
              ["medium", "Balanced reasoning"],
              ["high", "Deeper reasoning"],
            ]
          : [];
    const names = {
      none: "None",
      minimal: "Minimal",
      low: "Low",
      medium: "Medium",
      high: "High",
      xhigh: "Extra high",
      max: "Maximum",
      ultra: "Ultra",
    };
    effort.replaceChildren();
    effort.append(
      new Option(
        !configuringDefault && !model.value && state.general.model_defaults?.[provider]?.reasoning_effort
          ? `General default (${names[state.general.model_defaults[provider].reasoning_effort] || state.general.model_defaults[provider].reasoning_effort})`
          : selected?.defaultReasoningEffort
          ? `Model default (${names[selected.defaultReasoningEffort] || selected.defaultReasoningEffort})`
          : "Model default",
        "",
      ),
    );
    for (const [id, description] of options) {
      const o = new Option(names[id] || id, id);
      o.title = description;
      effort.append(o);
    }
    if (value && !options.some(([id]) => id === value)) {
      const missing = new Option(
        `${names[value] || value} (unavailable)`,
        value,
      );
      missing.disabled = true;
      effort.append(missing);
      effort.setCustomValidity(
        "Choose a thinking level supported by this model.",
      );
    } else effort.setCustomValidity("");
    effort.value = value;
    effort.disabled = !selected && !value;
    help.textContent = model.validity.customError ? 'Saved model is unavailable. Choose another model.' : '';
    help.hidden = !help.textContent;
  }
  async function populate(force = false) {
    const ticket = ++generation;
    model.replaceChildren(
      new Option(wantedModel || "Loading models…", wantedModel),
    );
    model.disabled = true;
    // Keep saved values intact while fetching, including when offline.
    effort.replaceChildren(
      new Option(wantedEffort || "Model default", wantedEffort),
    );
    effort.disabled = false;
    help.textContent = '';help.hidden = true;
    try {
      const data = await loadModels(provider, force);
      if (ticket !== generation) return;
      catalog = data.filter((m) => !m.hidden);
      model.replaceChildren();
      const savedDefault=!configuringDefault&&state.general.model_defaults?.[provider]?.model;
      model.required = provider !== 'codex' && !savedDefault;
      if(savedDefault){
        const selected=catalog.find(m=>m.model===savedDefault);
        model.append(new Option('Default · '+(selected?.displayName||savedDefault),''));
      } else if (provider === "codex") {
        const d = catalog.find((m) => m.isDefault);
        model.append(
          new Option(
            d ? `Provider default · ${d.displayName}` : "Provider default",
            "",
          ),
        );
      } else {
        model.append(new Option("Choose a model", ""));
        model.required = true;
      }
      versions.label.hidden = provider !== 'claude-code' || !catalog.some(m=>m.advanced);
      for (const m of catalog) {
        if(m.advanced && !versions.input.checked && m.model!==wantedModel)continue;
        model.append(new Option(m.selectionKind==='fixed' && (m.advanced||versions.input.checked) ? m.versionLabel || m.model : m.displayName || m.model, m.model));
      }
      if (wantedModel && !catalog.some((m) => m.model === wantedModel)) {
        const missing = new Option(`${wantedModel} (unavailable)`, wantedModel);
        missing.disabled = true;
        model.append(missing);
        model.setCustomValidity("Choose a model from the current catalog.");
      } else model.setCustomValidity("");
      model.value = wantedModel;
      model.disabled = false;
      thoughts(wantedEffort);
    } catch (e) {
      if (ticket !== generation) return;
      model.disabled = false;
      help.textContent =
        e.message +
        " Your saved selection is unchanged. Refresh models to try again.";
      help.hidden = false;
      // A saved configuration may still be edited offline; new configurations need a catalog.
      model.setCustomValidity(
        initialModel || (initialProvider === provider && provider === "codex")
          ? ""
          : "Load the model catalog first.",
      );
    }
  }
  versions.input.addEventListener('change',e=>{e.stopPropagation();void populate();});
  model.onchange = () => {
    model.setCustomValidity("");
    wantedModel = model.value;
    wantedEffort = "";
    thoughts();
  };
  effort.onchange = () => {
    effort.setCustomValidity("");
    wantedEffort = effort.value;
  };
  function changeProvider(next) {
    drafts.set(provider, [model.value, effort.value]);
    provider = next;
    [wantedModel, wantedEffort] = drafts.get(next) || ["", ""];
    model.required = provider !== "codex";
    populate();
  }
  populate();
  return { root, model, effort, changeProvider };
}
function editRoutine(r) {
  if(r?.trigger==='activity')return openActivityRoutine(r);
  if (!state.bots.some(b=>!profile(b).archived)) return notice('Add an active bot first.');
  state.editRoutine = r || null;
  state.editRoutineBotId = r?.bot_id || screenBotId() || state.bots.find(b=>!profile(b).archived)?.id;
  const f = $("routine-form");
  f.reset();
  const assigned=f.elements.bot_id;assigned.replaceChildren();
  for(const b of state.bots.filter(b=>!profile(b).archived||b.id===state.editRoutineBotId)){const option=node('option','',b.name);option.value=b.id;assigned.append(option);}
  assigned.value=state.editRoutineBotId;assigned.disabled=!!r?.id;
  f.elements.schedule_mode.querySelector('[value="activity"]').disabled=!!r?.id;
  f.elements.timezone.value=r?.schedule?.timezone || botTimezone();
  const daily=r?.schedule?.days?.length===7&&r.schedule.start===r.schedule.end;
  const windowed=!!r?.schedule&&r.schedule.start!==r.schedule.end;
  const windowOption=f.elements.schedule_mode.querySelector('[value=window]');windowOption.hidden=!windowed;windowOption.disabled=!windowed;
  f.elements.schedule_mode.value=r?.run_at?'once':r?.schedule?(windowed?'window':daily?'daily':'weekly'):r?'interval':'daily';
  f.elements.daily_time.value=daily?r.schedule.start:'08:00';
  const onceDate=new Date((r?.run_at||Math.ceil(Date.now()/1000)+3600)*1000);
  const onceLocal=localDateInput(onceDate,f.elements.timezone.value);
  f.elements.run_date.value=onceLocal.slice(0,10);f.elements.once_time.value=onceLocal.slice(11,16);
  renderRoutineCalendar(f.elements.run_date.value);
  if(!$('routine-timezones').children.length){for(const zone of (Intl.supportedValuesOf?.('timeZone')||['UTC','America/New_York'])){const option=node('option');option.value=zone;$('routine-timezones').append(option);}}
  if(r?.schedule){const s=r.schedule;f.elements.start.value=s.start;f.elements.end.value=s.end;f.elements.every_minutes.value=s.every_minutes;for(const day of f.querySelectorAll('[name=weekday]'))day.checked=s.days.includes(Number(day.value));}
  updateRoutineScheduleFields();
  $("routine-dialog-title").textContent = r?.id ? "Edit routine" : "New routine";
  if (r) {
    f.elements.name.value = r.name;
    f.elements.prompt.value = r.prompt;
    f.elements.interval.value = r.interval_seconds / 60;
    f.elements.enabled.checked = r.enabled;
  }
  $("routine-dialog").showModal();
}
function renderRoutineCalendar(selected,month=selected.slice(0,7)){
  const host=$('routine-calendar'),f=$('routine-form').elements;
  const [year,m]=month.split('-').map(Number),date=new Date(Date.UTC(year,m-1,1));
  host.replaceChildren();
  const header=node('div','routine-calendar-heading');
  const move=delta=>{const next=new Date(Date.UTC(year,m-1+delta,1));renderRoutineCalendar(f.run_date.value,next.toISOString().slice(0,7));host.querySelector(delta<0?'[aria-label="Previous month"]':'[aria-label="Next month"]')?.focus();};
  const prev=button('‹',()=>move(-1),'icon-button'),next=button('›',()=>move(1),'icon-button');
  prev.setAttribute('aria-label','Previous month');next.setAttribute('aria-label','Next month');
  const heading=node('strong','',date.toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'}));heading.setAttribute('aria-live','polite');
  header.append(prev,heading,next);host.append(header);
  const grid=node('div','routine-calendar-grid');
  for(const day of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])grid.append(node('span','muted',day));
  for(let i=0;i<(date.getUTCDay()+6)%7;i++)grid.append(node('span'));
  const count=new Date(Date.UTC(year,m,0)).getUTCDate();
  for(let day=1;day<=count;day++){
    const value=month+'-'+String(day).padStart(2,'0');
    const cell=button(String(day),()=>{f.run_date.value=value;renderRoutineCalendar(value);host.querySelector('[aria-pressed="true"]')?.focus();},'routine-calendar-day');
    cell.setAttribute('aria-label',new Date(value+'T12:00:00Z').toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}));
    cell.setAttribute('aria-pressed',String(value===selected));grid.append(cell);
  }
  host.append(grid);
}
function updateRoutineScheduleFields(){
  const mode=$('routine-form').elements.schedule_mode.value;
  for(const key of ['interval','daily','weekly','once']){const fields=$('routine-'+key+'-fields'),active=mode===key||(key==='weekly'&&mode==='window');fields.hidden=!active;fields.disabled=!active;}
  const windowFields=$('routine-window-fields');windowFields.hidden=mode!=='window';windowFields.disabled=mode!=='window';
}
$('routine-schedule-mode').onchange=async()=>{
  if($('routine-schedule-mode').value!=='activity')return updateRoutineScheduleFields();
  const f=$('routine-form').elements;
  try{
    await openActivityRoutine(null,{bot_id:f.bot_id.value,name:f.name.value||'Monitor Gmail inbox',instructions:f.prompt.value});
    $('routine-dialog').close();
  }catch(e){notice(e.message);f.schedule_mode.value='interval';updateRoutineScheduleFields();}
};
async function openActivityRoutine(r,draft={}){
  const [data,connections]=await Promise.all([api('/inbox-monitors'),api('/composio')]);
  if(r)return editInboxMonitor(r.monitor||null,data,connections,draft);
  chooseInboxRoutine(data,connections,draft);
}
function routineScheduleLabel(r){
  if(r.trigger==='activity')return 'Constant';
  if(r.run_at)return 'Once · '+new Date(r.run_at*1000).toLocaleString(undefined,{timeZone:botTimezone(),timeZoneName:'short'});
  if(!r.schedule){const seconds=r.interval_seconds,[count,unit]=seconds%86400===0?[seconds/86400,'day']:seconds%3600===0?[seconds/3600,'hour']:[seconds/60,'minute'];return count===1?'Every '+unit:'Every '+count+' '+unit+'s';}
  const s=r.schedule,days=s.days.length===7?'Daily':JSON.stringify([...s.days].sort())==='[1,2,3,4,5]'?'Weekdays':s.days.map(d=>['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d]).join(', ');
  if(s.start===s.end){const [h,m]=s.start.split(':').map(Number);return `${days==='Daily'?'Every day':days} at ${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'} · ${s.timezone}`;}
  const repeat=s.every_minutes===60?'Hourly':'Every '+s.every_minutes+' minutes';
  return `${days} · ${repeat} · ${s.start}–${s.end} · ${s.timezone}`;
}
function settingsWait(promise, message, milliseconds=5000){
  let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);})]).finally(()=>clearTimeout(timer));
}
let closePermissionPage=null,settingsRevision=0,settingsRequest=null,settingsMotion=null;
async function openSettings(page = "general") {
  settingsMotion?.cancel();settingsMotion=null;
  const revision=++settingsRevision;settingsRequest?.abort('settings-navigation');settingsRequest=new AbortController();
  if(closePermissionPage){const close=closePermissionPage;closePermissionPage=null;void settingsWait(close(),'The device permissions view is taking too long to close.').catch(e=>notice(e.message,true));}
  if(page==='monitors')page='routines';
  state.settings = page;
  // Keep navigation nodes alive: rebuilding them drops keyboard focus on every tab.
  if (!$('settings-nav').children.length) for (const [id, label, symbol] of [
    ["general", "General", "user"],
    ["connections", "Connections", "link"],
    ["routines", "Routines", "clock"],
    ["skills", "Skills", "book"],
    ["archived", "Archived", "archive"],
    ["computer", "Computer", "computer"],
    ["bot-computer", "Bot Computer", "bot"],
  ]) {
    const tab=button(label,()=>openSettings(id),'settings-tab',symbol);
    // Navigation remains available while its destination loads; disabling a
    // focused button drops keyboard focus in Chromium and some native webviews.
    tab.onclick=()=>perform(()=>openSettings(id));
    tab.dataset.settingsPage=id;$('settings-nav').append(tab);
  }
  for (const tab of $('settings-nav').children) {
    const selected=tab.dataset.settingsPage===page;
    tab.classList.toggle('active',selected);
    if(selected)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
  }
  $("settings-title").textContent = page==='bot-computer'?'Bot Computer':page[0].toUpperCase() + page.slice(1);
  const loading=node('p','muted','Loading…');loading.setAttribute('role','status');
  $("settings-content").replaceChildren(loading);
  $("settings-content").scrollTop=0;
  if (!$('settings-dialog').open) {
    $('settings-dialog').showModal();
    // WebKit can restore focus to a previous form control and scroll the new
    // page halfway down. Give a fresh visit a stable navigation target instead.
    $('settings-nav').querySelector('[aria-current="page"]')?.focus({preventScroll:true});
  }
  let revealed=false;
  const reveal=()=>{
    if(revealed||settingsRevision!==revision||!$('settings-dialog').open||loading.isConnected)return;
    revealed=true;
    // Reset against the real content height, not just the short loading message.
    $('settings-content').scrollTop=0;
    if(motionAllowed())settingsMotion=trackMotion($('settings-content').animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:170,easing:'ease-out'}),170);
  };
  const ready={
    general: settingsGeneral,
    connections: settingsConnections,
    routines: settingsRoutines,
    skills: settingsSkills,
    archived: settingsArchived,
    computer: settingsComputer,
    "bot-computer": settingsBotComputer,
  }[page](revision);
  // General renders cached controls immediately, then refreshes in the background.
  // Never fade those controls a second time when that request eventually completes.
  reveal();
  await ready.then(reveal).catch(e=>{
    if(settingsRevision===revision&&state.settings===page)$('settings-content').replaceChildren(node('p','run-error',e.message),button('Try again',()=>openSettings(page),'outline-button','refresh'));
  });
}
async function settingsArchived(revision=settingsRevision) {
  const [bots,chats]=await Promise.all([api('/bots'),api('/chats')]);
  if(revision!==settingsRevision||state.settings!=='archived')return;
  const root=$('settings-content');root.replaceChildren();
  const archived=bots.filter(b=>profile(b).archived);
  root.append(node('h3','archive-section-title','Bots'));
  if(!archived.length)root.append(node('p','muted','No archived bots.'));
  for(const bot of archived){
    const row=node('div','archived-bot-row'),copy=node('div','archived-bot-copy'),actions=node('div','archived-bot-actions');
    copy.append(node('strong','',bot.name),node('span','muted small',profile(bot).label||'Archived bot'));
    actions.append(button('Restore',async()=>{
      const fresh=(await api('/bots')).find(b=>b.id===bot.id);if(!fresh)throw new Error('This bot no longer exists.');
      await api('/bots/'+bot.id,'PUT',{...fresh,preserve_text:true,profile:{...profile(fresh),archived:false}});
      await refresh(true);await settingsArchived(revision);notice(bot.name+' restored.');
    },'archive-restore','restore'),iconButton('trash','Delete permanently',()=>confirmDeleteArchivedBot(bot)));
    actions.lastElementChild.classList.add('archive-delete');
    row.append(buddy(bot,36),copy,actions);root.append(row);
  }
  const archivedChats=[...chats,...state.chats.filter(c=>c.shared)].filter(c=>c.archived&&!c.id.startsWith('dm-'));
  root.append(node('h3','archive-section-title','Chats'));
  if(!archivedChats.length)root.append(node('p','muted','No archived chats.'));
  for(const chat of archivedChats){const row=node('div','archived-bot-row');row.append(node('strong','archived-bot-copy',chat.name),button('Restore',async()=>{const fresh=chat.shared?chat:(await api('/chats/'+chat.id+'?limit=1')).chat;await api('/chats/'+chat.id,'PUT',chat.shared?{archived:false}:{...fresh,archived:false});await refresh(true);await settingsArchived(revision);},'archive-restore','restore'));root.append(row);}
}
function confirmDeleteArchivedBot(bot){
  const d=modal('Permanently delete '+bot.name+'?','text-dialog'),form=node('form'),name=field('Type '+bot.name+' to confirm','','input',{autocomplete:'off'}),error=node('p','run-error');
  form.append(node('p','','This permanently removes this bot, its private chat, instructions, memory, routines, and stored task files. It cannot be restored.'),node('p','muted small','Shared messages, account connections, usage history and files on computers remain.'),name.label,error);
  const remove=node('button','danger-button','Delete permanently');remove.type='submit';remove.disabled=true;name.input.oninput=()=>{remove.disabled=name.input.value!==bot.name;};
  const actions=node('div','archived-bot-actions');actions.append(button('Cancel',()=>d.close(),'subtle-button'),remove);form.append(actions);d.append(form);
  form.onsubmit=async e=>{e.preventDefault();if(name.input.value!==bot.name||remove.disabled)return;remove.disabled=true;name.input.disabled=true;try{await api('/bots/'+bot.id,'DELETE',{confirmed:true,name:name.input.value});d.close();await refresh(true);await settingsArchived();notice(bot.name+' permanently deleted.');}catch(e){error.textContent=e.message;name.input.disabled=false;remove.disabled=name.input.value!==bot.name;}};
}
const approvalHelp = "Ask for approval: confirm computer actions. Approve for me: routine VM work proceeds; external changes ask. Full access: actions proceed without prompts. Connection access limits still apply. Bots classify computer actions; choose Ask for approval to review each one.";
function approvalSelect(value, inherit = false) {
  const input = select([...(inherit ? [["inherit", "Use global default"]] : []),
    ["ask", "Ask for approval"], ["auto", "Approve for me"], ["full", "Full access"]], value);
  const label = node("label", "", inherit ? "Approval policy" : "Default approval policy");
  input.setAttribute("aria-label", inherit ? "Approval policy" : "Default approval policy");
  label.append(input); return {label, input};
}
function livePreferences(form, read, write, accepted) {
  const status = node("div", "preference-status");status.hidden=true;
  status.setAttribute("role", "status");
  const retry = button("Retry save", () => flush(), "subtle-button"); retry.hidden = true;
  form.append(status, retry);
  let timer, statusTimer, revision = 0, saved = 0, running = false;
  async function flush() {
    clearTimeout(timer);
    if (running || revision === saved) return;
    clearTimeout(statusTimer);status.hidden=false;
    if (form.querySelector(".model-controls select:disabled")) { status.textContent = "Waiting for models…"; timer = setTimeout(flush, 150); return; }
    if (!form.checkValidity()) { status.textContent = "Complete the highlighted fields to save."; return; }
    running = true; const ticket = revision, value = read();
    status.textContent = "Saving…"; status.classList.remove("error"); retry.hidden = true;
    try {
      const result = await write(value); saved = ticket;
      if (revision === ticket) { accepted(result); status.textContent = "Saved";statusTimer=setTimeout(()=>{if(revision===saved&&!running)status.hidden=true;},1500); }
    } catch (e) {
      status.textContent = "Not saved · " + e.message; status.classList.add("error"); retry.hidden = false;
    } finally {
      running = false;
      if (revision > ticket) void flush();
    }
  }
  function schedule(delay = 0) { revision++; clearTimeout(timer); timer = setTimeout(flush, delay); }
  form.addEventListener("input", e => { if (!e.target.closest("[data-device-preference]") && e.target.matches("input, textarea")) schedule(350); });
  form.addEventListener("change", e => { if (!e.target.closest("[data-device-preference]") && e.target.matches("input, textarea, select")) schedule(); });
  form.onsubmit = e => { e.preventDefault(); schedule(); };
  return {schedule,get dirty(){return running||revision!==saved;}};
}

function botLocalAccess(bot) {
  const root=node('section','local-access-settings'),toggle=switchField('Local access',profile(bot).local_access===true),device=select([[profile(bot).local_device_id||'',profile(bot).local_device_id==='*'?'All paired desktops':profile(bot).local_device_id?'Saved desktop':'Choose a desktop']],profile(bot).local_device_id||'');
  const label=node('label','','Local desktop');device.setAttribute('aria-label','Local desktop');label.append(device);
  const help=node('p','muted small local-access-help');help.setAttribute('aria-live','polite');root.append(toggle.label,label,help);
  let desktops=[],loaded=false;
  const describe=()=>{
    toggle.input.disabled=!device.value;
    const steps=[],all=device.value==='*',selected=desktops.find(d=>d.id===device.value);
    if(toggle.input.checked&&state.general.local_access!==true)steps.push('Local access is off in Settings > Computer.');
    if(selected&&!selected.online)steps.push(`${selected.name} is offline.`);
    if(toggle.input.checked&&selected?.mode==='off')steps.push('Desktop permissions are off.');
    if(loaded&&device.value&&!all&&!selected)steps.push('Saved desktop unavailable.');
    help.textContent=steps.join(' ');help.hidden=!help.textContent;
  };
  device.onchange=()=>{if(!device.value)toggle.input.checked=false;describe();};toggle.input.addEventListener('change',describe);describe();
  api('/local/devices').then(data=>{if(!root.isConnected)return;desktops=data.devices||[];loaded=true;const selected=device.value;device.replaceChildren();for(const [id,name] of [['','Choose a desktop'],['*','All paired desktops'],...desktops.map(d=>[d.id,d.name+(d.online?'':' · offline')+(d.mode==='off'?' · access off':'')])]){const option=node('option','',name);option.value=id;device.append(option);}if(selected&&!Array.from(device.options).some(o=>o.value===selected)){const option=node('option','','Saved desktop · unavailable');option.value=selected;device.append(option);}device.value=selected;describe();}).catch(e=>{help.textContent=e.message;help.hidden=false;});
  return {root,input:toggle.input,device};
}
async function defaultModelSettings(root,current) {
  const pane=settingsPane('Default model');root.append(pane.root);
  try {
    await loadProviderAccounts();if(!current())return;
    const form=node('form','default-model-form'),provider=select(providerOptions(state.general.default_provider),state.general.default_provider||'codex');
    provider.setAttribute('aria-label','Default provider');
    const holder=node('div');let controls;
    const populate=()=>{const saved=state.general.model_defaults?.[provider.value]||{};controls=modelControls(provider.value,saved.model||'',saved.reasoning_effort||'',true);holder.replaceChildren(controls.root);};
    populate();provider.onchange=populate;
    const save=node('button','outline-button','Save default'),status=node('p','muted small');save.type='submit';status.setAttribute('role','status');
    form.append(settingRow('Provider',provider),holder,save,status);form.addEventListener('change',()=>{status.textContent='';});pane.body.append(form);
    form.onsubmit=async e=>{e.preventDefault();if(controls.model.disabled){status.textContent='Wait for the model list to load.';return;}if(!form.reportValidity())return;save.disabled=true;
      const selectedProvider=provider.value,selectedModel=controls.model.value,selectedEffort=controls.effort.value;
      try{const saved=await api('/settings','PUT',{...state.general,default_provider:selectedProvider,model_defaults:{...state.general.model_defaults,[selectedProvider]:{model:selectedModel,reasoning_effort:selectedEffort}}});if(saved.default_provider!==selectedProvider||saved.model_defaults?.[selectedProvider]?.model!==selectedModel||saved.model_defaults?.[selectedProvider]?.reasoning_effort!==selectedEffort)throw new Error('This server did not save the model default. Update the Kindred server and try again.');state.general=saved;status.textContent='Default saved. Applies to the next task for bots using Default.';}
      catch(error){status.textContent=error.message||String(error);}finally{save.disabled=false;}
    };
  }catch(error){if(current())pane.body.append(node('p','muted small',error.message||String(error)));}
}
async function settingsGeneral(revision) {
  if(state.settings!=='general'||!$('settings-dialog').open)return;
  revision??=++settingsRevision;
  const root=$('settings-content');root.replaceChildren();
  const current=()=>settingsRevision===revision&&state.settings==='general'&&$('settings-dialog').open;
  const loading=node('div','settings-refresh-state');loading.setAttribute('role','status');
  const message=node('p','muted small','Refreshing account settings…');loading.append(message);root.append(loading);
  const fresh=api('/settings','GET',undefined,{timeoutMs:8000,signal:settingsRequest?.signal});
  // Observe failure immediately while the rest of the page is constructed.
  const response=fresh.then(value=>({value}),error=>({error}));
  const form=node('form','general-settings-form');
  const identity=settingsPane('Account'),name=field('Name',state.general.name,'input',{required:true,maxLength:80});
  const account=node('div','settings-account');account.append(node('span','user-avatar',personInitials(state.general.name)),name.label);identity.body.append(account);
  const about=node('details','settings-about'),prefs=field('What should your bots know about you?',state.general.identity,'textarea',{rows:3,maxLength:16000,placeholder:'How you work, what you care about, how you like replies…'});about.append(node('summary','','About you'),prefs.label);identity.body.append(about);
  const appearance=settingsPane('Appearance'),theme=select([['system','Follow System'],['dark','Dark'],['light','Light']],state.general.theme||'system');
  const motion=settingSwitch('Reduce motion',state.general.reduced_motion),activity=settingSwitch('Show activity in chats',state.general.show_activity===true);
  const separateBots=settingSwitch('Separate bot conversations',state.general.separate_bot_chats!==false);
  appearance.body.append(settingRow('Theme',theme),motion.label);
  const conversations=settingsPane('Conversations');conversations.body.append(activity.label,separateBots.label);
  const textSize=select([['100','100%'],['115','115%'],['125','125%'],['150','150%']],String(window.KindredReadingSize.get()));
  textSize.setAttribute('aria-label','Text size');textSize.onchange=()=>window.KindredReadingSize.set(textSize.value);
  const textRow=settingRow('Text size',textSize);textRow.dataset.devicePreference='true';appearance.body.append(textRow);
  const versions=settingsPane('Versions');versions.root.dataset.devicePreference='true';
  const clientVersion=node('span'),serverVersion=node('span'),updateStatus=node('p','muted small');
  clientVersion.dataset.clientVersion='';serverVersion.dataset.serverVersion='';updateStatus.dataset.clientUpdateStatus='';
  const updateActions=node('div','version-actions');
  if(window.__KINDRED_DESKTOP){
    updateActions.append(button('Check for app updates',async()=>{await checkUpdates(true);updateStatus.textContent=state.updateRelease?'Desktop app '+state.updateRelease.version+' is available.':'No newer desktop app update is available.';},'outline-button','refresh'));
    const updateAction=button('Update desktop app',()=>clientUpdateAction(),'outline-button','download');updateAction.dataset.clientUpdateAction='';updateActions.append(updateAction);
  }
  versions.body.append(settingRow(window.__KINDRED_DESKTOP?'Desktop app on this device':'Browser interface',clientVersion),settingRow('Connected server',serverVersion,location.host),updateStatus,updateActions);
  if(window.__KINDRED_DESKTOP&&!window.__KINDRED_NATIVE_UPDATER&&!window.__KINDRED_SERVER_UPDATER)versions.body.append(node('p','muted small','This installed client predates in-app updates. Download the client from this server and install it once to enable future in-place updates.'));
  const system=settingsPane('System');system.root.dataset.devicePreference='true';
  if(window.__KINDRED_DESKTOP?.platform==='linux'&&window.__KINDRED_LINUX_UPDATER){
    const install=button('Install downloaded AppImage…',()=>nativeInvoke('open_linux_update',{}),'outline-button','download');install.setAttribute('aria-label','Install downloaded AppImage…');
    system.body.append(settingRow('Desktop app updates',install,'Installs an app update on this device. Your local server keeps running.'));
  }
  if(window.__KINDRED_DESKTOP)system.body.append(desktopNotificationControl());
  if(window.__KINDRED_PROFILE_HOST){
    const startup=settingSwitch('Open Kindred at sign-in',false);startup.input.disabled=true;
    system.body.append(startup.label);
    const deviceStatus=node('div','settings-device-status');system.body.append(deviceStatus);
    const loadDevice=async()=>{deviceStatus.replaceChildren();try{
      const value=await settingsWait(nativeInvoke('profile_home_state',{}),'Device settings did not respond. You can retry them here.');if(!current()||!form.isConnected)return;startup.input.checked=value.launch_on_startup===true;startup.input.disabled=false;
      if(window.__KINDRED_DESKTOP?.platform==='windows'&&window.__KINDRED_SYSTEM_SETTINGS&&value.hardware_acceleration_supported){
        const accel=settingSwitch('Use hardware acceleration',value.hardware_acceleration!==false),hint=node('p','muted small settings-device-status');
        hint.textContent=value.hardware_acceleration!==value.hardware_acceleration_active?'Restart Kindred to apply hardware acceleration.':'';hint.hidden=!hint.textContent;
        system.body.insertBefore(accel.label,startup.label);system.body.append(hint);
        accel.input.onchange=async()=>{const enabled=accel.input.checked;accel.input.disabled=true;try{const saved=await nativeInvoke('set_hardware_acceleration',{enabled});hint.textContent=saved.restart_required?'Restart Kindred to apply hardware acceleration.':'';hint.hidden=!hint.textContent;}catch(e){accel.input.checked=!enabled;notice(e.message||String(e),true);}finally{accel.input.disabled=false;}};
      }
    }catch(e){if(current())deviceStatus.replaceChildren(node('p','muted small',e.message||String(e)),button('Retry device settings',loadDevice,'subtle-button'));}};
    void loadDevice();
    startup.input.onchange=async()=>{const enabled=startup.input.checked;startup.input.disabled=true;try{await nativeInvoke('set_launch_on_startup',{enabled});}catch(e){startup.input.checked=!enabled;notice(e.message||String(e),true);}finally{startup.input.disabled=false;}};
  }
  const bots=settingsPane('Bot'),zoneOptions=[['auto','Auto-detect ('+deviceTimezone()+')'],...([...new Set(['UTC',state.general.timezone,...(Intl.supportedValuesOf?.('timeZone')||[])])].filter(Boolean)).map(z=>[z,z])];
  const timezone=select(zoneOptions,state.general.timezone_mode==='fixed'?state.general.timezone:'auto');
  bots.body.append(settingRow('Timezone',timezone,'Shared by your bots and new routines. Existing routines keep their saved timezone.'));
  const approval=approvalSelect(state.general.approval_mode||'ask'),notifications=select([['all','All'],['input_needed','Input needed'],['none','None']],state.general.notifications||'all');
  bots.body.append(settingRow('Default approval policy',approval.input),settingRow('Notifications',notifications));
  const help=node('details','settings-about');help.append(node('summary','','About approval policies'),node('p','muted small',approvalHelp));bots.body.append(help);
  notifications.onchange=()=>{if(notifications.value!=='none')void enableNotifications();};
  const dictation=dictationUI.settingsSection();dictation.dataset.devicePreference='true';
  const speechPane=dictation.querySelector('.settings-pane');speechPane.insertBefore(dictationUI.microphoneControl(),speechPane.querySelector('.dictation-model-row'));
  system.root.hidden=!system.body.children.length;
  form.append(identity.root,appearance.root,conversations.root,dictation,system.root,bots.root,versions.root);
  const serverControls=[name.input,prefs.input,theme,motion.input,activity.input,separateBots.input,timezone,approval.input,notifications];
  serverControls.forEach(control=>control.disabled=true);
  root.append(form);renderVersions();
  for(const input of [theme,motion.input])input.addEventListener('change',()=>{state.general={...state.general,theme:theme.value,reduced_motion:motion.input.checked};applyGeneral();});
  const loaded=await response;if(!current()||!form.isConnected)return;
  if(loaded.error){
    message.textContent='Account settings could not refresh. '+loaded.error.message;
    loading.append(button('Retry settings',()=>openSettings('general'),'outline-button','refresh'));
  }else{
    state.general=loaded.value;account.querySelector('.user-avatar').textContent=personInitials(state.general.name);
    name.input.value=state.general.name||'';prefs.input.value=state.general.identity||'';theme.value=state.general.theme||'system';
    motion.input.checked=state.general.reduced_motion===true;activity.input.checked=state.general.show_activity===true;separateBots.input.checked=state.general.separate_bot_chats!==false;
    const selected=state.general.timezone_mode==='fixed'?state.general.timezone:'auto';
    if(selected&&!Array.from(timezone.options).some(o=>o.value===selected))timezone.add(new Option(selected,selected));
    timezone.value=selected;approval.input.value=state.general.approval_mode||'ask';notifications.value=state.general.notifications||'all';
    serverControls.forEach(control=>control.disabled=false);loading.remove();
    void defaultModelSettings(root,current);
  livePreferences(form,()=>({name:name.input.value,identity:prefs.input.value,theme:theme.value,reduced_motion:motion.input.checked,approval_mode:approval.input.value,notifications:notifications.value,show_activity:activity.input.checked,separate_bot_chats:separateBots.input.checked,timezone:timezone.value==='auto'?deviceTimezone():timezone.value,timezone_mode:timezone.value==='auto'?'auto':'fixed'}),value=>api('/settings','PUT',value),value=>{state.general=value;applyGeneral();renderSidebar();void renderChat(true,'cached');});
  }
  const accountActions=node('div','settings-account-actions');root.append(accountActions);
  accountActions.append(button('Manage archived bots and chats',()=>openSettings('archived'),'outline-button'));
  accountActions.append(
    button(
      "Disconnect this app",
      async () => {
        await profilesUI.disconnect();
        disconnectDesktop();
        sessionStorage.removeItem("kindred-token");
        localStorage.removeItem("kindred-token");
        state.token = "";
        commandsUI?.reset();
        browserNotificationCursor=null;
        screenshotCache.clear();releaseScreenshotUrls();
        if(window.__KINDRED_DESKTOP)await nativeInvoke("start_desktop",{token:""});
        location.reload();
      },
      "danger-text",
    ),
  );
}
const builtinProviders = [
  {id:'codex',name:'Codex',kind:'subscription'}, {id:'claude-code',name:'Claude Code',kind:'subscription'},
  {id:'kimi-code',name:'Kimi Code',kind:'subscription'}, {id:'openrouter',name:'OpenRouter',kind:'api'},
];
const accountStatuses=new Map(),usageSnapshots=new Map(),customCataloguesWarmed=new Set();
async function warmCustomCatalogue(provider){
  if(!provider.id.startsWith('custom-')||!provider.connected||customCataloguesWarmed.has(provider.id))return;
  customCataloguesWarmed.add(provider.id);
  try{const data=await api('/providers/'+provider.id+'/models','POST',{startup:true}),current=state.providerAccounts?.find(p=>p.id===provider.id);
    if(!current||data.revision!==current.revision)return;
    current.models=data.models||[];current.catalog=data.catalog||{};modelCache.delete(provider.id);
    for(const row of document.querySelectorAll('.provider-catalog'))if(row.dataset.providerId===provider.id)row.dispatchEvent(new CustomEvent('catalogupdated',{detail:data}));
  }catch{/* Startup discovery errors remain available on the provider card. */}
}
let providerCatalogPending=null,usageWarmPending=null,usageWarmedAt=0;
function providerCatalogChanged() {$('identity-menu')?.dispatchEvent(new Event('providersupdated'));}
async function loadProviderAccounts(force=false) {
  if(providerCatalogPending){if(!force)return providerCatalogPending;await providerCatalogPending.catch(()=>{});}
  providerCatalogPending=(async()=>{
    const data=await api('/providers');
    for(const p of data.providers)if(p.id.startsWith('custom-')&&JSON.stringify(state.providerAccounts?.find(old=>old.id===p.id)?.models)!==JSON.stringify(p.models))modelCache.delete(p.id);
    state.providerAccounts=data.providers.map(p=>({...p,...(p.kind==='subscription'?{connected:accountStatuses.get(p.id)?.data?.connected}:{} )}));
    for(const provider of state.providerAccounts)void warmCustomCatalogue(provider);
    providerCatalogChanged();return state.providerAccounts;
  })();
  try{return await providerCatalogPending;}finally{providerCatalogPending=null;}
}
async function warmUsageCache(force=false) {
  if(!state.token||usageWarmPending||(!force&&Date.now()-usageWarmedAt<60000))return;
  usageWarmedAt=Date.now();
  usageWarmPending=(async()=>{
    const providers=await loadProviderAccounts();
    await Promise.allSettled(providers.map(async p=>{
      if(p.kind==='subscription')await subscriptionStatus(p);
      else if(p.connected||p.has_usage)await recordedProviderUsage(p);
    }));
  })();
  try{await usageWarmPending;}catch{/* Keep the last known accounts while offline. */}finally{usageWarmPending=null;}
}
async function recordedProviderUsage(provider,force=false) {
  const cached=usageSnapshots.get(provider.id)||{};
  if(cached.pending)return cached.pending;
  if(!force&&cached.data&&Date.now()-cached.updated<60000)return cached.data;
  usageSnapshots.set(provider.id,cached);
  cached.pending=api('/providers/'+provider.id+'/usage').then(data=>{
    cached.data=data;cached.updated=Date.now();cached.error=null;return data;
  }).catch(e=>{cached.error=e.message;throw e;}).finally(()=>{cached.pending=null;});
  return cached.pending;
}
setInterval(()=>{if(!document.hidden)void warmUsageCache();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void warmUsageCache();});
function providerOptions(current) {const options=(state.providerAccounts || builtinProviders).map(p=>[p.id,p.name]);if(current&&!options.some(([id])=>id===current))options.push([current,current]);return options;}
function accountCard(provider) {
  const card=node('details','ai-account'), summary=node('summary','ai-account-summary'), check=node('span','account-check'),
    label=node('strong','',provider.name), compact=node('span','account-state'), body=node('div','ai-account-body');
  summary.append(check,label,compact,icon('chevron',14));card.append(summary,body);
  function status(connected,text) {
    card.classList.toggle('disconnected',!connected);check.textContent=connected?'✓':'○';
    compact.textContent=text || (connected?'Connected':'Not connected');
    summary.setAttribute('aria-label',provider.name+' · '+compact.textContent);
    provider.connected=connected;
  }
  status(provider.connected===true, provider.connected ? (provider.kind==='api'?(provider.no_auth?'Configured':'Key saved'):'Connected') : 'Not connected');
  return {card,body,status};
}
async function subscriptionStatus(provider,force=false) {
  const cached=accountStatuses.get(provider.id)||{};
  if(cached.pending){if(!force)return cached.pending;await cached.pending.catch(()=>{});}
  if(!force&&cached.data&&Date.now()-cached.updated<60000)return cached.data;
  accountStatuses.set(provider.id,cached);
  cached.pending=(async()=>{
    let data;
    if(provider.id==='codex') {
      const result=await api('/codex/account','POST',{});
      data={...result,connected:result.account?.type==='chatgpt',message:result.account?.email || result.message || 'Sign in to your ChatGPT subscription.'};
    }else data=await api('/provider-cli/'+provider.id+'/account','POST',{});
    cached.data=data;cached.updated=Date.now();
    provider.connected=data.connected;
    const current=state.providerAccounts?.find(p=>p.id===provider.id);if(current)current.connected=data.connected;
    providerCatalogChanged();return data;
  })();
  try{return await cached.pending;}finally{cached.pending=null;}
}
async function claudeBrowserSignIn(row,message,check) {
  const popup=authPopup();let attempt='',opened='',stopped=false,timer=null,phase='starting',revision=0;
  row.body.querySelector('.claude-login')?.remove();
  const root=node('div','claude-login'),help=node('p','muted small','Authorize Claude in your browser. This connection is shared by the bots in this workspace.');
  const link=node('a','outline-button oauth-link','Open Claude sign-in');link.target='_blank';link.rel='noopener noreferrer';link.hidden=true;
  const form=node('form','claude-login-code'),code=field('Claude authorization code','','input',{type:'password',autocomplete:'off',spellcheck:'false',placeholder:'Paste the code Claude shows after sign-in'});
  const hint=node('p','muted small','If Claude shows a code after you authorize, paste it here to finish. If it completes automatically, no code is needed.');form.hidden=true;
  const submit=node('button','primary','Finish sign-in');submit.type='submit';
  form.onsubmit=async event=>{event.preventDefault();if(submit.disabled)return;
    let value=code.input.value.trim();code.input.value='';
    if(!value)return;
    submit.disabled=true;revision++;
    try{await paint(await api('/provider-cli/claude-code/login-complete','POST',{attempt,code:value}));}
    catch(e){message.textContent=e.message+' Check connection before submitting another code.';}
    finally{value='';submit.disabled=phase!=='waiting';}
  };
  form.append(code.label,hint,submit);
  const cancel=button('Cancel sign-in',async()=>{revision++;await paint(await api('/provider-cli/claude-code/login-cancel','POST',{attempt}));closePendingPopup();});cancel.hidden=true;
  root.append(help,link,form,cancel);row.body.append(root);
  message.textContent='Preparing Claude sign-in. First computer setup can take several minutes…';
  // Once handed to Claude, the browser owns this window. Closing a disowned
  // cross-origin popup is rejected by WebKit and some enterprise browser policies.
  function closePendingPopup(){if(!opened)popup?.close();}
  function stop(){stopped=true;clearTimeout(timer);code.input.value='';link.hidden=true;form.hidden=true;cancel.hidden=true;}
  async function paint(result){
    if(!root.isConnected){stop();return;}
    phase=result.state;
    attempt=result.attempt||attempt;message.textContent=result.message||'Waiting for Claude sign-in…';
    if(result.state==='connected'&&result.connected===true){stop();closePendingPopup();help.textContent='Claude is connected for this workspace’s bots.';await check(true);return;}
    if(['failed','expired','cancelled','idle'].includes(result.state)||!result.state){stop();closePendingPopup();return;}
    if(result.state==='waiting'&&result.url){
      const url=new URL(result.url),params=url.searchParams;
      const official=(url.hostname==='claude.com'&&url.pathname==='/cai/oauth/authorize')||(url.hostname==='claude.ai'&&url.pathname==='/oauth/authorize');
      if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!official||params.get('response_type')!=='code'||!['client_id','state','code_challenge'].every(k=>params.get(k)))throw new Error('Claude returned an unexpected sign-in address.');
      link.href=url.href;link.hidden=false;form.hidden=false;
      if(opened!==url.href){opened=url.href;if(popup&&!popup.closed)popup.location.replace(url.href);else if(window.__KINDRED_DESKTOP_VERSION)window.open(url.href,'_blank','noopener,noreferrer');}
    }
    submit.disabled=result.state!=='waiting';cancel.hidden=!attempt;
  }
  async function poll(){
    if(stopped||!root.isConnected){stop();return;}
    try{const started=revision,result=await api('/provider-cli/claude-code/login-status','POST',{});if(started===revision)await paint(result);}
    catch(e){stop();message.textContent=e.message+' Choose Sign in to resume.';return;}
    if(!stopped)timer=setTimeout(poll,1500);
  }
  try{
    await paint(await api('/provider-cli/claude-code/login','POST',{}));
    if(!stopped)timer=setTimeout(poll,1500);
  }catch(e){stop();closePendingPopup();message.textContent=e.message;throw e;}
}
async function settingsConnections(revision) {
  if(state.settings!=='connections'||!$('settings-dialog').open)return;
  revision??=++settingsRevision;
  const [connections,providers]=await Promise.all([api('/connections'),loadProviderAccounts(true)]);
  if(settingsRevision!==revision||state.settings!=='connections'||!$('settings-dialog').open)return;
  state.connections=connections;
  const root=$('settings-content');root.replaceChildren();const ai=section('AI accounts');root.append(ai);
  const openCodePlans=providers.filter(provider=>['opencode','opencode-go'].includes(provider.id));
  for(const provider of providers) {
    if(openCodePlans.includes(provider)){
      if(provider===openCodePlans[0])openCodeAccount(ai,openCodePlans);
      continue;
    }
    const row=accountCard(provider);ai.append(row.card);
    if(provider.kind==='subscription') {
      const message=node('p','muted small','Checking account…'), actions=node('div','row-actions');row.body.append(message,actions);
      let revision=0,signingIn=false;
      const check=async(force=true)=>{if(signingIn)return;const started=++revision;try{const data=await subscriptionStatus(provider,force);if(!row.card.isConnected||started!==revision)return;row.status(data.connected,data.preparing?'Setting up':data.setup==='failed'?'Setup failed':undefined);message.textContent=data.message || (data.connected?'Subscription connected.':'Sign in to connect.');modelCache.delete(provider.id);}catch(e){if(!row.card.isConnected||started!==revision)return;row.status(false,'Unavailable');message.textContent=e.message;}};
      actions.append(button('Sign in',async()=>{
        revision++;signingIn=true;
        for(const control of actions.children)control.disabled=true;
        row.body.querySelectorAll('.login-info').forEach(info=>info.remove());
        try{
        if(provider.id==='claude-code')return await claudeBrowserSignIn(row,message,async force=>{signingIn=false;return check(force);});
        message.textContent='Starting your computer. First setup can take several minutes…';
        if(provider.id==='codex') {
          const result=await api('/codex/login','POST',{}),info=node('div','login-info');message.textContent='Complete the official sign-in, then check connection.';
          const codeRow=node('div','login-code-row'),codeLabel=node('p','','Enter this code: ');
          codeLabel.append(node('code','',result.userCode));
          const copy=button('Copy code',async()=>{await copyText(result.userCode);notice('Activation code copied.');},'outline-button','copy');
          copy.setAttribute('aria-label','Copy activation code');codeRow.append(codeLabel,copy);info.append(codeRow);
          const link=node('a','','Open OpenAI sign-in');
          link.href=result.verificationUrl;link.target='_blank';link.rel='noopener';info.append(link,node('p','muted small','After signing in, choose Check connection.'));row.body.append(info);
        } else {
          const result=await api('/provider-cli/'+provider.id+'/login','POST',{bot_id:screenBotId()});
          message.textContent=result.message;notice('Sign-in opened on the bot computer.');
          row.body.append(button('Open bot computer',async()=>{ $('settings-dialog').close(); await openComputer(); }));
        }
        }catch(e){message.textContent=e.message;throw e;}
        finally{signingIn=false;for(const control of actions.children)control.disabled=false;}
      }),button('Check connection',check),button('Sign out',async()=>{
        if(!confirm('Sign out of '+provider.name+' for your bots?'))return;
        await api(provider.id==='codex'?'/codex/logout':'/provider-cli/'+provider.id+'/logout','POST',{});await check();
      }));
      if(['claude-code','codex'].includes(provider.id)) {
        const codex=provider.id==='codex',source=codex?'Codex':'Claude';
        const inherited=node('div','provider-catalog'),status=node('p','muted small',source+' account connectors are available to '+source+' bots. Refresh to check connected apps.'),items=node('div','catalog-model-list');
        status.setAttribute('role','status');
        const refreshConnectors=async()=>{
          refresh.disabled=true;status.classList.remove('run-error');status.textContent='Checking '+source+' account connectors…';items.replaceChildren();
          try {
            const result=await api(codex?'/codex/connectors':'/provider-cli/claude-code/connectors','POST',{});
            if(!inherited.isConnected)return;
            const rows=(codex?result.connections:result.data)||[];
            status.textContent=rows.length?'Available through this workspace’s '+source+' sign-in. Kindred-connected apps remain available to all providers.':'No connectors were returned by this '+source+' account. Connect an app in '+source+', then refresh.';
            if(result.warning){status.textContent=connectorRefreshMessage(result.warning,source);status.classList.add('run-error');}
            for(const connection of rows){const item=node('div','connector-setting-row'),info=node('div');info.append(connectorHeading(connection.display_name,source),node('p','muted small',connection.status==='connected'?'Connected':connection.status==='needs-auth'?'Reconnect in '+source:'Unavailable'));if(codex&&connection.availability_message)info.append(node('p','muted small',connection.availability_message));item.append(info);items.append(item);}
          }catch(e){if(inherited.isConnected){status.textContent=connectorRefreshMessage(e,source);status.classList.add('run-error');}}
          finally{refresh.disabled=false;}
        };
        const refresh=button('Refresh '+source+' connectors',refreshConnectors);
        inherited.append(node('strong','',source+' account connectors'),status,items,refresh);
        if(codex)inherited.append(node('p','muted small','Manage connected apps in Codex, then refresh here. Each connector call requires review.'));
        else{const manage=node('a','outline-button','Manage in Claude');manage.href='https://claude.ai/customize/connectors';manage.target='_blank';manage.rel='noopener noreferrer';inherited.append(manage);}
        row.body.append(inherited);
      }
      void check(false);
    } else if(provider.id==='openrouter') {
      row.body.append(node('p','muted small','API key stored on your Kindred server. Requests require zero data retention support.'));
      const key=field('API key','','input',{type:'password',autocomplete:'off',placeholder:'sk-or-…'});
      row.body.append(key.label,button('Save key',async()=>{await api('/connections/openrouter','POST',{key:key.input.value});key.input.value='';await settingsConnections();}));
      if(provider.connected)row.body.append(button('Disconnect',async()=>{await api('/connections/openrouter','POST',{key:''});await settingsConnections();}));
    } else customProviderEditor(row.body,provider);
  }
  const add=accountCard({name:'Add custom provider',connected:false});add.status(false,'OpenAI-compatible API');
  customProviderEditor(add.body);ai.append(add.card);
  await settingsComposio(root);
}
function openCodeAccount(root,plans) {
  const row=accountCard({name:'OpenCode',kind:'api'});root.append(row.card);
  const plan=select(plans.map(provider=>[provider.id,provider.id==='opencode-go'?'Go · Subscription':'Zen · Pay as you go']),plans.find(provider=>provider.connected)?.id||plans[0].id);
  plan.setAttribute('aria-label','OpenCode plan');
  const label=node('label','','Plan');label.append(plan);
  const details=node('div');row.body.append(label,details);
  function render() {
    const provider=plans.find(provider=>provider.id===plan.value),go=provider.id==='opencode-go';
    const connected=plans.filter(provider=>provider.connected);
    row.status(connected.length>0,connected.length?connected.map(provider=>provider.id==='opencode-go'?'Go':'Zen').join(' + ')+' · Key saved':'API key');
    details.replaceChildren(node('p','muted small',go?'Use your Go subscription allowance.':'Usage is billed from your Zen balance.'));
    const link=node('a','subtle-button','Get API key');link.href='https://opencode.ai/auth';link.target='_blank';link.rel='noopener noreferrer';
    const key=field('API key','','input',{type:'password',autocomplete:'off',placeholder:provider.connected?'Saved · paste a replacement key':'Paste your OpenCode API key'});
    const feedback=node('p','muted small');feedback.setAttribute('role','status');
    const save=button('Save key',async()=>{
      if(!key.input.value.trim()){feedback.textContent='Paste your OpenCode API key first.';return;}
      await update(key.input.value.trim());notice('OpenCode '+(go?'Go':'Zen')+' key saved.');
    },'outline-button');
    async function update(value) {
      await api('/opencode/'+provider.id+'/key','POST',{key:value});
      key.input.value='';provider.connected=!!value;modelCache.delete(provider.id);
      render();await loadProviderAccounts(true);
    }
    const models=button('Check available models',async()=>{
      models.disabled=true;feedback.textContent='Loading supported models…';
      try{const values=await loadModels(provider.id,true);feedback.textContent=values.length+' supported models available. Your key and plan are checked when a task runs.';}catch(e){feedback.textContent=e.message;}finally{models.disabled=false;}
    },'subtle-button','refresh');
    const actions=node('div','row-actions');actions.append(save,models);
    if(provider.connected)actions.append(button('Disconnect',()=>update(''),'subtle-button'));
    details.append(link,key.label,actions,feedback);
  }
  plan.addEventListener('change',render);render();
}
function connectorRefreshMessage(error,source) {
  // Older backends can forward a provider's full HTML error page. Keep the
  // recovery message bounded and never put those scripts/tokens in the UI.
  const message=String(error?.message||error||'Connector refresh failed.'),lower=message.toLowerCase();
  if(/_cf_chl|challenge-platform/.test(lower))return source+' connector refresh was blocked by '+(source==='Codex'?'an OpenAI':'a provider')+' browser security check'+(/403\s+forbidden|status\s+403/.test(lower)?' (HTTP 403)':'')+'. Try refreshing later; signing in again may not resolve this.';
  if(/<!doctype\s+html|<html\b|<body\b|<script\b|<style\b/.test(lower))return source+' returned an error page'+(/403\s+forbidden|status\s+403/.test(lower)?' (HTTP 403)':'')+'. Connector access could not be verified. Try refreshing later.';
  const text=message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim();
  return text.length>480?text.slice(0,479)+'…':text;
}
function customProviderEditor(root,provider=null) {
  root.classList.add('custom-provider-editor');
  const name=field('Name',provider?.name||'','input',{maxLength:80}),url=field('Base URL',provider?.base_url||'','input',{placeholder:'https://your-provider.example/v1'}),
    key=field('API key','','input',{type:'password',autocomplete:'off',placeholder:provider?.connected?'Saved · leave blank to keep':'Provider API key'});
  const noAuth=switchField('No API key required',provider?.no_auth===true);key.input.disabled=noAuth.input.checked;noAuth.input.onchange=()=>{key.input.disabled=noAuth.input.checked;};
  root.append(name.label,url.label,noAuth.label,key.label,node('p','muted small','Models come from this provider’s /models catalogue. Use an OpenAI-compatible base URL, such as https://api.example.com/v1 or http://localhost:1234/v1. Local addresses refer to the Kindred server. Changing the base URL clears its saved key.'));
  root.append(button('Save provider',async()=>{
    const data={id:provider?.id||'',name:name.input.value.trim(),base_url:url.input.value.trim(),no_auth:noAuth.input.checked};
    const body={provider:data};if(key.input.value || !provider)body.key=key.input.value;
    const saved=await api('/providers','POST',body);key.input.value='';modelCache.delete(saved.id);await settingsConnections();notice('Provider saved. Its models load automatically.');
  },'outline-button'));
  if(provider){
    const catalog=node('div','provider-catalog'),status=node('p','muted small'),error=node('p','catalog-error small'),list=node('details','catalog-models'),summary=node('summary'),items=node('div','catalog-model-list');
    status.setAttribute('role','status');list.append(summary,items);catalog.append(status,error,list);root.append(catalog);
    function paint(){
      const models=provider.models||[],info=provider.catalog||{};
      summary.textContent=models.length+' model'+(models.length===1?'':'s')+' available';list.hidden=!models.length;items.replaceChildren();
      for(const model of models){const row=node('div','catalog-model');row.append(node('span','',model.display_name||model.model));if(model.display_name&&model.display_name!==model.model)row.append(node('span','muted small',model.model));items.append(row);}
      status.textContent=provider.catalog_refreshing?'Refreshing models…':info.updated_at?'Updated '+new Date(info.updated_at*1000).toLocaleString(undefined,{timeZone:botTimezone()}):models.length?'Saved catalogue · refreshes when the server starts.':provider.connected?'Models will load automatically.':'Add an API key or choose No API key required to load models.';
      error.textContent=info.error?(models.length?'Using the saved catalogue. ':'')+info.error:'';error.hidden=!info.error;
    }
    async function update(force=false){
      if(force&&(url.input.value.trim()!==provider.base_url||noAuth.input.checked!==provider.no_auth||key.input.value)){notice('Save provider changes before refreshing models.',true);return;}
      provider.catalog_refreshing=true;paint();
      try{const result=await api('/providers/'+provider.id+'/models',force?'POST':'GET',force?{}:undefined);if(!root.isConnected)return;
        provider.models=result.models||result.data?.map(m=>({model:m.model,display_name:m.displayName}))||[];provider.catalog=result.catalog||{};modelCache.delete(provider.id);
        const current=state.providerAccounts?.find(p=>p.id===provider.id);if(current){current.models=provider.models;current.catalog=provider.catalog;}
      }catch(e){provider.catalog={...provider.catalog,error:e.message};}finally{provider.catalog_refreshing=false;if(root.isConnected)paint();}
    }
    catalog.dataset.providerId=provider.id;
    catalog.addEventListener('catalogupdated',e=>{provider.models=e.detail.models||[];provider.catalog=e.detail.catalog||{};provider.catalog_refreshing=false;paint();});
    catalog.append(button('Refresh models',()=>update(true),'subtle-button','refresh'));paint();
    if(provider.connected&&(provider.catalog_refreshing||!(provider.models?.length)&&!provider.catalog?.checked_at))void update();
    root.append(button('Remove provider',async()=>{
      if(!confirm('Remove “'+provider.name+'”? Bots using it will need another provider. Chat and usage history will remain.'))return;
      await api('/providers/'+encodeURIComponent(provider.id),'DELETE');modelCache.delete(provider.id);
      await settingsConnections();notice('Provider removed.');
    },'subtle-button danger-text','trash'));
    if(provider.connected&&!provider.no_auth)root.append(button('Disconnect',async()=>{const {id,name,base_url,no_auth}=provider;await api('/providers','POST',{provider:{id,name,base_url,no_auth},key:''});await settingsConnections();}));
  }
}
async function settingsComposio(root) {
  const data = await api("/composio");
  if (!root.isConnected) return;
  const group = section("Apps marketplace");
  group.append(
    node(
      "p",
      "muted small",
      "Search Composio apps and add them to your workspace. All your bots share connected apps.",
    ),
  );
  group.append(button("Browse marketplace", openMarketplace, "outline-button"));
  const key = field("Composio project API key", "", "input", {
    type: "password",
    autocomplete: "off",
    placeholder: data.configured
      ? "Project connected · replacement key"
      : "Paste your project key",
  });
  const keyActions = node("div", "row-actions composio-key-actions");
  const feedback = node("p", "inline-feedback small");
  feedback.setAttribute("role", "status");
  keyActions.append(
    button(
      "Save project key",
      async () => {
        feedback.textContent = "Checking project access…";
        feedback.classList.remove("error");
        try {
          if (!key.input.value.trim())
            throw new Error("Paste your Composio project key first.");
          await api("/composio/key", "POST", { key: key.input.value.trim() });
          key.input.value = "";
          connectionsChanged();
          notice("Composio project connected.");
        } catch (e) {
          feedback.textContent = e.message;
          feedback.classList.add("error");
        }
      },
      "outline-button",
    ),
  );
  const link = node("a", "icon-button composio-dashboard");
  link.append(icon("external",16));link.title="Open Composio dashboard";link.setAttribute("aria-label","Open Composio dashboard");
  link.href = "https://dashboard.composio.dev/";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  keyActions.append(link);
  group.append(key.label, keyActions, feedback);
  group.append(
    node(
      "p",
      "muted small",
      "Use a project API key with access to toolkits, auth configs, connected accounts and tools. Your key stays on your server.",
    ),
  );
  if (data.configured) {
    const remove=button("Remove Composio key", async () => {
      await api("/composio/key", "POST", { key: "" });
      connectionsChanged();
    },"subtle-button composio-key-remove");
    keyActions.append(remove);
  }
  for (const app of data.apps) {
    const accounts=appAccounts(app),row=node('details','composio-service'),summary=node('summary','composio-service-summary');
    const connected=accounts.filter(a=>a.status==='ACTIVE').length;
    summary.append(connectorLogo({key:app.id,name:app.name}),node('strong','composio-service-name',app.name),node('span','muted small composio-account-count',`${connected} connected account${connected===1?'':'s'}`),icon('chevron',14));
    const body=node('div','composio-service-accounts');
    const paint=()=>{
      body.replaceChildren();
      for(const account of accounts){
        const entry=button('',()=>openAppDetails(app),'composio-account-line');
        entry.append(node('span','',account.name||'default'),node('span','muted small',account.status==='ACTIVE'?'Connected':account.status==='INITIATED'?'Needs sign-in':'Reconnect needed'));
        if(account.email)entry.append(node('span','muted small composio-account-email','('+account.email+')'));
        entry.setAttribute('aria-label','Manage '+(account.name||'default')+' '+app.name+' account');body.append(entry);
      }
    };
    paint();row.append(summary,body);group.append(row);
    let checked=false;
    row.addEventListener('toggle',async()=>{
      if(!row.open||checked)return;checked=true;
      if(app.id==='gmail')for(const account of accounts.filter(a=>a.status==='ACTIVE'&&!a.email)){
        try{const result=await api('/composio/gmail/test','POST',{account_id:account.id});if(result.email){account.email=result.email;paint();}}catch{/* Account management remains available if profile lookup fails. */}
      }
    });
  }
  root.append(group);
}
async function checkAccount(element) {
  const data = await api("/codex/account", "POST", {});
  element.textContent =
    data.account?.type === "chatgpt"
      ? `Connected${data.account.email ? " · " + data.account.email : ""}${data.account.planType ? " · " + data.account.planType : ""}`
      : "Not signed in with an Codex (Subscription).";
}
let monitorRefreshTimer;
async function settingsRoutines(revision) {
  if(state.settings!=='routines'||!$('settings-dialog').open)return;
  revision??=++settingsRevision;
  clearTimeout(monitorRefreshTimer);
  const [data,connections,routines]=await Promise.all([api('/inbox-monitors'),api('/composio'),api('/routines')]);
  if(settingsRevision!==revision||state.settings!=='routines'||!$('settings-dialog').open)return;
  const root=$('settings-content'),expanded=new Set([...root.querySelectorAll('.monitor-row[open]')].map(row=>row.dataset.monitorId));root.replaceChildren();
  const top=node('div','section-toolbar monitor-toolbar');
  top.append(node('h3','','Scheduled'),button('Add routine',()=>editRoutine(),'subtle-button','plus'));
  root.append(top);
  const accounts=(connections.apps||[]).filter(a=>a.id==='gmail').flatMap(a=>a.accounts||[]);
  const scheduled=routines.filter(r=>r.trigger!=='activity');
  for(const r of scheduled)root.append(scheduledRoutineCard(r,true));
  if(!scheduled.length)root.append(node('p','muted small','No scheduled routines.'));
  root.append(node('h3','monitor-section-title','Monitors'));
  const gmail=node('p','monitor-empty-line');gmail.append(node('strong','','Gmail'),node('span','',data.items.length?'Inbox monitoring':'No active monitors'));root.append(gmail);
  const labels={starting:'Starting',fast:'Fast checks · every 15 seconds',push:'Gmail push · backup checks every 5 minutes',waiting_for_push:'Waiting for push · fast checks active',error:'Needs attention',paused:'Paused'};
  for(const watch of data.items){
    const row=node('details','monitor-row');row.open=expanded.has(watch.id);row.classList.toggle('is-disabled',!watch.enabled);row.dataset.monitorId=watch.id;
    const heading=node('summary','monitor-heading'),body=node('div','monitor-body');
    const bot=state.bots.find(b=>b.id===watch.bot_id),account=accounts.find(a=>a.id===watch.account_id);
    const overdue=watch.enabled&&watch.checked_at&&Date.now()/1000>watch.next_check+60;
    const mailbox=watch.mailbox||account?.name||'Gmail';
    const inbox=node('span','monitor-mailbox',mailbox);inbox.title=mailbox;
    heading.append(routineAssignee(watch.bot_id),inbox,node('span','monitor-status'+(watch.error||watch.status==='error'||overdue?' run-error':''),!watch.enabled?'Paused':watch.error||watch.status==='error'||overdue?'Needs attention':watch.status==='starting'?'Starting':'Monitoring'));row.append(heading,body);
    body.append(node('p','muted small'+(watch.status==='error'||overdue?' run-error':''),overdue?'Check overdue':labels[watch.status]||watch.status));
    const time=value=>value?new Date(value*1000).toLocaleString(undefined,{timeZone:botTimezone()}):'Not yet';
    body.append(node('p','muted small','Last successful check: '+time(watch.checked_at)+(watch.mode==='push'?' · Last push: '+time(watch.push_at):'')));
    if(watch.pending_messages)body.append(node('p','small',watch.pending_messages+' new '+(watch.pending_messages===1?'message is':'messages are')+' waiting for '+(bot?.name||'the bot')+'.'));
    if(watch.error)body.append(node('p','run-error',watch.error));
    if(bot?.profile?.notifications===false||['none','input_needed'].includes(state.general.notifications))body.append(node('p','run-error','Inbox result notifications are muted by your global or bot settings. The bot can still post its findings in chat.'));
    if(watch.mode==='push'&&watch.callback_url){
      const setup=node('details','monitor-push-details');setup.append(node('summary','','Google Cloud delivery setup'));
      setup.append(node('p','muted small','Use this push endpoint in your Pub/Sub subscription. Enable authentication with the configured service account and set the audience to this exact URL.'));
      const url=field('Push endpoint',watch.callback_url,'input',{readOnly:true});url.input.onclick=()=>url.input.select();setup.append(url.label,button('Copy endpoint',async()=>{await navigator.clipboard.writeText(watch.callback_url);notice('Push endpoint copied.');},'outline-button','copy'));
      const help=node('a','detail-link','Gmail push setup guide');help.href='https://developers.google.com/workspace/gmail/api/guides/push';help.target='_blank';help.rel='noopener noreferrer';setup.append(help);body.append(setup);
    }
    const actions=node('div','monitor-actions');actions.append(button('Edit',()=>editInboxMonitor(watch,data,connections),'outline-button','edit'));
    if(watch.enabled){
      actions.append(button('Check now',async()=>{await api('/inbox-monitors/'+watch.id+'/check','POST',{});await settingsRoutines();},'outline-button','refresh'),button('Pause',async()=>{await api('/inbox-monitors/'+watch.id+'/pause','POST',{});await settingsRoutines();},'outline-button','pause'));
    }else actions.append(button('Resume',async()=>{await api('/inbox-monitors','POST',inboxWatchInput(watch,{enabled:true}));await settingsRoutines();},'outline-button','play'),button('Remove',async()=>{if(!confirm('Remove this paused inbox monitor? Its chat and task history will remain.'))return;await api('/inbox-monitors/'+watch.id,'DELETE');await settingsRoutines();},'outline-button','trash'));
    body.append(actions);root.append(row);
  }
  monitorRefreshTimer=setTimeout(()=>{if(state.settings==='routines'&&$('settings-dialog').open)settingsRoutines().catch(()=>{});},15000);
}
function inboxWatchInput(w,overrides={}){
  const value={};for(const k of ['id','bot_id','account_id','name','instructions','mode','topic','service_account','public_url','enabled'])if(w[k]!==undefined)value[k]=w[k];return {...value,...overrides};
}
function chooseInboxRoutine(data,connections,draft={}){
  if(!(data.provider_sources||[]).length)return editInboxMonitor(null,data,connections,draft);
  const d=modal('Inbox routine','inbox-monitor-dialog'),form=node('form','inbox-monitor-form');
  const bots=state.bots.filter(b=>!profile(b).archived),assigned=node('label','','Assigned bot'),bot=select(bots.map(b=>[b.id,b.name]),draft.bot_id||state.bot?.id||bots[0]?.id);bot.setAttribute('aria-label','Assigned bot');assigned.append(bot);
  const sourceLabel=node('label','','Inbox connection'),source=select([],'');source.setAttribute('aria-label','Inbox connection');sourceLabel.append(source);
  const help=node('p','muted small'),next=button('Continue',()=>{},'primary');next.type='submit';next.onclick=null;
  let options=[];
  const update=()=>{
    options=[{id:'kindred',name:'Gmail connected to Kindred',kind:'kindred'},...(data.provider_sources||[]).filter(s=>s.bot_id===bot.value).map((s,i)=>({...s,id:'provider-'+i,kind:'provider'}))];
    source.replaceChildren(...options.map(s=>new Option(s.name,s.id)));source.value=options.length>1?options[1].id:'kindred';describe();
  };
  const describe=()=>{const choice=options.find(s=>s.id===source.value);help.textContent=choice?.kind==='provider'?'Scheduled AI reviews using this bot’s existing provider connection. Every check uses AI.':'Activity checks work with any provider and use AI only when new mail arrives. You can connect Gmail in the next step.';};
  bot.onchange=update;source.onchange=describe;update();form.append(assigned,sourceLabel,help,next);d.append(form);
  form.onsubmit=e=>{e.preventDefault();const choice=options.find(s=>s.id===source.value);d.close();const selected={...draft,bot_id:bot.value};if(choice.kind==='provider')editProviderInbox({provider_sources:[choice]},selected);else editInboxMonitor(null,data,connections,selected);};
}
function editProviderInbox(data,draft={}){
  const sources=data.provider_sources||[];if(!sources.length)return;
  const d=modal('Scheduled inbox reviews','inbox-monitor-dialog'),form=node('form','inbox-monitor-form');
  const connection=select(sources.map((s,i)=>[String(i),s.bot_name+' · '+s.name]),'0');connection.setAttribute('aria-label','Inbox bot and connection');
  const assigned=node('label','','Bot and connection');assigned.append(connection);
  const timing=select([['300','Every 5 minutes'],['900','Every 15 minutes'],['3600','Every hour'],['custom','Custom interval']],'900');timing.setAttribute('aria-label','Review frequency');
  const schedule=node('label','','Review frequency');schedule.append(timing);
  const custom=field('Minutes between reviews','15','input',{type:'number',min:1,max:525600,step:1});custom.label.hidden=true;custom.input.disabled=true;timing.onchange=()=>{custom.label.hidden=timing.value!=='custom';custom.input.disabled=timing.value!=='custom';};
  const instructions=field('When should the bot alert you?','Alert me about messages needing my response, deadlines or important changes. Stay quiet about routine mail and anything already reported. Do not send replies or change messages.','textarea',{required:true,rows:5,maxLength:16000});
  const help=node('p','muted small','Uses the selected bot’s connected inbox. Each scheduled check uses that bot’s AI provider, including an unchanged inbox. The first review starts with mail received after setup. Existing permission prompts still apply.');
  const error=node('p','run-error');error.setAttribute('role','alert');error.hidden=true;const save=node('button','primary','Create inbox routine');save.type='submit';
  form.append(assigned,schedule,custom.label,instructions.label,help,error,save);d.append(form);
  form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity())return;save.disabled=true;error.hidden=true;const source=sources[Number(connection.value)];
    try{await api('/provider-inbox-routines','POST',{bot_id:source.bot_id,account_key:source.account_key,connector_key:source.connector_key,name:draft.name||'Review inbox',prompt:instructions.input.value,interval_seconds:timing.value==='custom'?Number(custom.input.value)*60:Number(timing.value)});d.close();notice('Scheduled inbox reviews configured. The first check has not run yet.');try{await refresh();if(state.settings==='routines'&&$('settings-dialog').open)await settingsRoutines();}catch(e){notice('Inbox routine saved. The view could not refresh: '+e.message,true);}}
    catch(e){error.textContent=e.message;error.hidden=false;}finally{save.disabled=false;}
  };
}
function editInboxMonitor(w,data,connections,draft={}){
  const d=modal(w?'Edit routine':'New routine','inbox-monitor-dialog'),form=node('form','inbox-monitor-form');
  const accounts=(connections.apps||[]).filter(a=>a.id==='gmail').flatMap(a=>a.accounts||[]).filter(a=>a.status==='ACTIVE');
  const bots=state.bots.filter(b=>!profile(b).archived);
  const name=field('Routine name',w?.name||draft.name||'Monitor Gmail inbox','input',{required:true,maxLength:320});
  const assigned=node('label','', 'Assigned bot'),bot=select(bots.map(b=>[b.id,b.name]),w?.bot_id||draft.bot_id||state.bot?.id||bots[0]?.id);bot.required=true;bot.setAttribute('aria-label','Assigned bot');assigned.append(bot);
  const source=node('label','','Gmail account'),account=select(accounts.map(a=>[a.id,a.name||a.id]),w?.account_id||accounts[0]?.id);account.required=true;account.setAttribute('aria-label','Gmail account');source.append(account);
  if(w){bot.disabled=true;account.disabled=true;}
  const instructions=field('When should the bot alert you?',w?.instructions||draft.instructions||'Read new inbox messages. Alert me promptly about messages requiring my response, deadlines, or important changes. Include who it is from, what matters, and a direct link. Stay quiet about routine mail and information already reported. Do not send replies or change messages.','textarea',{required:true,maxLength:16000,rows:5});
  const frequency=node('p','routine-frequency','Frequency: Constant · Monitor activity');
  const modeLabel=node('label','','Detection'),mode=select([['fast','Fast checks · every 15 seconds'],['push','Gmail push · requires Google Cloud setup']],w?.mode||'fast');mode.setAttribute('aria-label','Detection');modeLabel.append(mode);
  const help=node('p','muted small');
  const advanced=node('fieldset','monitor-push-fields'),legend=node('legend','','Google Cloud settings');advanced.append(legend);
  const publicUrl=field('Public Kindred URL',w?.public_url||data.public_url||'','input',{type:'url',placeholder:'https://kindred.example.com'});
  const topic=field('Pub/Sub topic',w?.topic||'','input',{placeholder:'projects/my-project/topics/kindred-inbox'});
  const identity=field('Push service account',w?.service_account||'','input',{type:'email',placeholder:'kindred-push@my-project.iam.gserviceaccount.com'});
  advanced.append(node('p','muted small','Native Gmail push requires a Pub/Sub topic in the same Google Cloud project as your Gmail OAuth client. Composio-managed OAuth cannot use a topic in your own project. Use a custom Gmail OAuth configuration with read-only Gmail scope. Your callback must be publicly reachable; a tailnet-only address will not work.'),publicUrl.label,topic.label,identity.label);
  const update=()=>{const push=mode.value==='push';advanced.hidden=!push;advanced.disabled=!push;for(const x of [publicUrl,topic,identity])x.input.required=push;help.textContent=push?'Gmail signals changes; Kindred fetches the new message IDs and wakes this bot. Fast checks remain active until the first verified push, then a five-minute backup check catches missed events.':'A lightweight Gmail history check runs every 15 seconds. AI work starts only when new mail is detected. Response time also includes the bot’s queue and processing.';};mode.onchange=update;update();
  const error=node('p','run-error');error.setAttribute('role','alert');error.hidden=true;
  const save=node('button','primary',w?'Save routine':'Create routine');save.type='submit';save.disabled=!accounts.length||!bots.length;
  form.append(name.label,assigned,source,frequency,instructions.label,modeLabel,help,advanced,error,save);d.append(form);
  if(!accounts.length){
    const connect=node('div','monitor-connect');
    connect.append(node('p','muted small','Connect a Gmail account before creating this routine. Read-only access is enough.'),button('Connect Gmail',()=>{d.close();$('settings-dialog').close();openMarketplace();},'outline-button','link'));
    form.prepend(connect);
  }
  form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;save.disabled=true;error.hidden=true;
    try{const saved=await api('/inbox-monitors','POST',{id:w?.id||'',bot_id:bot.value,account_id:account.value,name:name.input.value,instructions:instructions.input.value,mode:mode.value,topic:topic.input.value,service_account:identity.input.value,public_url:publicUrl.input.value,enabled:w?.enabled??true});d.close();await refresh(true);if(state.settings==='routines'&&$('settings-dialog').open)await settingsRoutines();if(saved.status==='error')notice('Routine saved, but needs attention. Check its status.');else if(saved.status==='waiting_for_push')notice('Finish Google Cloud delivery setup using the saved push endpoint.');else notice(w?.enabled===false?'Monitor updated and remains paused.':'Constant inbox routine started.');}
    catch(e){error.textContent=e.message;error.hidden=false;}finally{save.disabled=false;}
  };
}

async function settingsSkills(revision) {
  if(state.settings!=='skills'||!$('settings-dialog').open)return;
  revision??=++settingsRevision;
  const [skills, commands] = await Promise.all([api("/skills"), api("/commands")]);
  if(settingsRevision!==revision||state.settings!=='skills'||!$('settings-dialog').open)return;
  const root = $("settings-content");
  root.replaceChildren();
  const top = node("div", "section-toolbar skills-toolbar");
  top.append(
    node("p", "muted small", "Reusable workflows for your bots. Type / in a chat, or ask your bot with /new-skill to create one."),
    button("Add skill", () => editSkill(), "outline-button", "plus"),
    button("Import workflows", () => importSkills(), "outline-button", "folder"),
  );
  root.append(top);
  const workspace=node('div','section-toolbar workspace-import-entry');workspace.append(node('p','muted small','Create a bot from a workspace’s instructions, memories and workflows.'),button('Import workspace',()=>workspaceUI.start(),'outline-button','book'));root.append(workspace);
  const search = node("input", "command-library-search");
  search.type="search";search.placeholder="Search skills and commands";search.setAttribute("aria-label",search.placeholder);
  root.append(search);
  const list = node("div", "skills-list");
  if (!skills.length)
    list.append(
      node(
        "p",
        "empty-list",
        "No skills yet. Add a workflow your bots can reuse.",
      ),
    );
  for (const skill of skills) {
    const row = node("div", "skill-row"),
      open = button("", () => editSkill(skill), "skill-open");
    const copy = node("div");
    copy.append(
      node("strong", "", skill.name),
      node("p", "muted small", skill.description || skill.body.replace(/\s+/g, " ").slice(0, 120)),
    );
    const command=commands.find(c=>c.skill_name===skill.name);
    if(command)copy.append(node("code","command-usage",command.usage));
    if(skill.import)copy.append(node("span","command-source","Workspace import · "+skill.import.files+" files"));
    row.dataset.search=[skill.name,skill.description,skill.command,skill.body].join(' ').toLowerCase();
    open.append(icon("book"), copy);
    row.append(open);
    row.append(iconButton("edit", "Edit " + skill.name, () => editSkill(skill)));
    row.append(
      iconButton("trash", "Delete " + skill.name, async () => {
        if (!confirm("Delete skill “" + skill.name + "”?")) return;
        await api("/skills/" + encodeURIComponent(skill.name), "DELETE");
        commandsUI?.invalidate();
        await settingsSkills();
      }),
    );
    list.append(row);
  }
  root.append(list);
  const defaults=node("div","skills-list command-defaults");
  root.append(node("h3","","Built-in and connected commands"),node("p","muted small","Gmail and Calendar commands appear when an account is connected. Sending and scheduling are available for accounts that allow actions with approval."),defaults);
  for(const command of commands.filter(c=>!c.skill_name)){
    const row=node("div","skill-row"),copy=node("div","command-library-copy");
    row.dataset.search=[command.name,command.description,command.source].join(' ').toLowerCase();
    copy.append(node("code","command-usage",command.usage),node("p","muted small",command.description));
    row.append(copy);
    if(command.source==='built-in'){
      const mark=node("img","command-kindred-mark");
      mark.src="./favicon.svg";mark.alt="Built-in Kindred command";mark.title="Built-in Kindred command";
      row.append(mark);
    }else row.append(node("span","command-source",command.source));
    defaults.append(row);
  }
  const noMatch=node("p","empty-list","No matching skills or commands.");noMatch.hidden=true;root.append(noMatch);
  search.oninput=()=>{let visible=0;for(const row of root.querySelectorAll('[data-search]')){row.hidden=!row.dataset.search.includes(search.value.trim().toLowerCase());if(!row.hidden)visible++;}noMatch.hidden=visible>0;};
}
function importSkills() {
  const d=modal('Import commands and skills','skill-import-dialog'),root=node('div','skill-import-content');
  root.append(node('p','muted','Bring in commands and prompt templates (.md) or skill folders (SKILL.md with supporting files) from Claude Code, Codex, Pi or a portable workspace. Imported copies are shared by every bot in this profile.'));
  const pickers=node('div','skill-import-pickers'),folder=node('input'),files=node('input');
  folder.type='file';folder.webkitdirectory=true;folder.multiple=true;folder.hidden=true;
  files.type='file';files.accept='.md';files.multiple=true;files.hidden=true;
  pickers.append(button('Choose workspace or skills folder',()=>folder.click(),'outline-button','folder'),button('Choose command files',()=>files.click(),'outline-button','file'),folder,files);
  root.append(pickers,node('p','muted small','Choose a workspace, .claude, .codex, .agents or .pi folder, or one complete skill folder. Commands and prompts are imported alongside skills. To adapt AGENTS.md / CLAUDE.md into a bot, use Import workspace in Skills. If the picker omits hidden folders, select the context folder directly. Any bot with local access can discover workflows and pull updates from their saved source.'));
  const status=node('p','muted small'),list=node('div','skill-import-list'),actions=node('div','dialog-actions');
  const apply=button('Import selected',()=>{},'primary');apply.disabled=true;
  actions.append(button('Close',()=>d.close(),'outline-button'),apply);root.append(status,list,actions);d.append(root);
  let reviews=[],generation=0,busy=false;
  const encode=async f=>{const bytes=new Uint8Array(await f.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);};
  function refresh(){apply.disabled=busy||!reviews.some(r=>r.check.checked&&!r.done);}
  async function choose(selected,folders){
    const current=++generation;reviews=[];list.replaceChildren();apply.disabled=true;busy=true;status.textContent='Finding workflows…';
    try {
      const all=[...selected].map(file=>({file,path:(file.webkitRelativePath||file.name).replaceAll('\\','/')}));
      if(all.length>5000)throw Error('Choose a smaller folder (up to 5,000 files).');
      const portable=p=>!p.split('/').some(part=>part.startsWith('.')&&!['.claude','.codex','.agents','.pi'].includes(part)||['node_modules','__pycache__','target','venv'].includes(part));
      const loose=new Set();for(const f of all){if(portable(f.path)&&/(^|\/)\.pi\/(?:agent\/)?skills\/[^/]+\.md$/.test(f.path)&&f.file.size<=48000&&/^---\r?\n[\s\S]*?^description:[ \t]*\S[\s\S]*?^---/m.test(await f.file.text()))loose.add(f.path);}
      const entries=all.filter(f=>portable(f.path)&&(f.path.endsWith('/SKILL.md')||f.path==='SKILL.md'||loose.has(f.path)||f.path.endsWith('.md')&&(!folders||/(^|\/)(commands|prompts)\//.test(f.path))));
      if(!entries.length)throw Error('No command files or SKILL.md entries found in that folder.');
      if(entries.length>256)throw Error('Choose up to 256 workflows at once.');
      for(const entry of entries){
        if(current!==generation)return;
        const skill=entry.path.split('/').at(-1)==='SKILL.md',prefix=entry.path.includes('/')?entry.path.slice(0,entry.path.lastIndexOf('/')+1):'';
        const members=skill&&folders?all.filter(f=>f.path.startsWith(prefix)&&portable(f.path)):[entry];
        const name=skill?prefix.split('/').filter(Boolean).at(-1)||'imported-skill':entry.file.name.slice(0,-3);
        const packageValue={entry:entry.path.slice(prefix.length),name,source:entry.path,files:{}};
        const card=node('section','skill-import-card');list.append(card);
        try {
          if(members.length>128||members.reduce((sum,f)=>sum+f.file.size,0)>8*1024*1024||members.some(f=>f.file.size>2*1024*1024))throw Error('Package is too large: use up to 128 files, 2 MiB per file, 8 MiB total.');
          for(const f of members)packageValue.files[f.path.slice(prefix.length)]=await encode(f.file);
          const preview=await api('/skills/import','POST',{action:'preview',package:packageValue});
          if(current!==generation)return;
          const label=node('label','skill-import-select'),check=node('input');check.type='checkbox';check.checked=!preview.existing&&!preview.command_conflict;check.setAttribute('aria-label','Select '+preview.name);label.append(check,node('strong','',preview.name));
          const nameField=field('Skill name',preview.name,'input',{maxLength:100}),command=field('Slash command',preview.command,'input',{maxLength:48});
          const meta=node('p','muted small',`${preview.files.length} files · ${Math.round(preview.import.bytes/1024)} KB · ${preview.import.source}`);
          card.append(label,meta,nameField.label,command.label);
          if(preview.import.argument_hint)card.append(node('p','muted small','Arguments: '+preview.import.argument_hint));
          const warnings=[...(preview.import.warnings||[])];
          if(skill&&!folders)warnings.push('Only SKILL.md was selected. Choose its folder to include supporting files.');
          if(preview.import.disable_model_invocation)warnings.push('Runs only when you invoke its slash command.');
          if(preview.import.user_invocable===false)warnings.push('Available to bots; hidden from the slash-command menu by its source settings.');
          if(preview.command_conflict)warnings.push('Command already used by '+preview.command_conflict+'. Choose another command name.');
          for(const text of warnings)card.append(node('p','skill-import-warning',text));
          let replace=null;
          if(preview.existing){
            if(preview.existing_hash){const l=node('label','skill-import-select');replace=node('input');replace.type='checkbox';l.append(replace,node('span','','Replace the current imported version with this reviewed copy'));card.append(l);}
            else card.append(node('p','skill-import-warning','An existing skill has this name. Rename this import to keep both.'));
          }
          const details=node('details'),summary=node('summary','','Review instructions and files'),body=node('pre','skill-import-body',preview.body),filenames=node('pre','skill-import-files',preview.files.join('\n'));details.append(summary,body,filenames);card.append(details);
          const outcome=node('p','muted small');card.append(outcome);
          const review={package:packageValue,preview,check,name:nameField.input,command:command.input,replace,outcome,done:false};reviews.push(review);check.onchange=refresh;
        }catch(e){card.append(node('strong','',entry.path),node('p','skill-import-warning',e.message));}
      }
      status.textContent=reviews.length+' workflows ready to review. Importing saves their files and instructions; it does not run them.';
    }catch(e){status.textContent=e.message;}finally{if(current===generation){busy=false;refresh();}}
  }
  folder.onchange=()=>void choose(folder.files,true);files.onchange=()=>void choose(files.files,false);
  apply.onclick=async()=>{
    if(busy)return;busy=true;refresh();let imported=0;
    try {
      for(const r of reviews.filter(r=>r.check.checked&&!r.done)){
        r.outcome.textContent='Importing…';
        try {
          const result=await api('/skills/import','POST',{action:'import',package:r.package,expected_hash:r.preview.import.hash,name:r.name.value,command:r.command.value,...(r.replace?.checked?{replace_hash:r.preview.existing_hash}:{})});
          r.done=true;r.check.disabled=true;r.name.disabled=true;r.command.disabled=true;r.outcome.textContent=result.status==='unchanged'?'Already imported; no changes.':'Imported · /'+result.command;imported++;
        }catch(e){r.outcome.textContent=e.message;}
      }
      if(imported){commandsUI?.invalidate();if(state.settings==='skills')await settingsSkills();}
      status.textContent=imported+' selected workflows imported or already current. They are available to bots in this workspace.';
    }finally{busy=false;refresh();}
  };
}

function editSkill(skill = null) {
  const d = modal(skill ? "Edit skill" : "Add skill", "skill-dialog"),
    form = node("form");
  const name = field("Name", skill?.name || "", "input", {
      required: true,
      maxLength: 100,
      placeholder: "weekly-review",
      readOnly: !!skill,
    }),
    command = field("Slash command", skill?.command || "", "input", {maxLength:49,placeholder:"weekly-review"}),
    description = field("Description", skill?.description || "", "input", {maxLength:600,placeholder:"What this workflow does"}),
    parameters = field("Parameters", (skill?.parameters||[]).map(p=>(p.required?'':'[')+p.name+(p.rest?'...':'')+(p.required?'':']')).join(' '), "input", {placeholder:"domain userlist [notes...]"}),
    body = field("Instructions", skill?.body || "", "textarea", {
      required: true,
      rows: 12,
      maxLength: 48000,
      placeholder: "Describe when to use this skill and the steps to follow…",
    });
  if(skill?.import){const imported=node("details","skill-import-details");imported.append(node("summary","","Imported files and compatibility"),node("p","muted small",skill.import.source),node("pre","skill-import-files",(skill.import.file_names||[]).join("\n")));for(const warning of skill.import.warnings||[])imported.append(node("p","skill-import-warning",warning));form.append(imported);}
  const originalParameters=parameters.input.value;
  const argumentIndex=skill?.import?select([['1','$1 is the first input (legacy commands, Codex, Pi)'],['0','$0 is the first input (current Claude skills)']],String(skill.import.argument_index??0)):null;
  if(argumentIndex){const row=node('label');argumentIndex.setAttribute('aria-label','Positional arguments');row.append(node('span','','Positional arguments'),argumentIndex);form.append(row,node('p','muted small','$ARGUMENTS contains all input as typed. $ARGUMENTS[0] always means the first input. Quoted values stay together.'));}
  const counter=node('p','muted small skill-size');
  function validateSkill(){const size=new TextEncoder().encode(body.input.value).length;counter.textContent=size.toLocaleString()+' / 48,000 bytes';body.input.setCustomValidity(size>48000?'Shorten these instructions to 48,000 bytes or less.':'');}
  body.input.addEventListener('input',validateSkill);validateSkill();
  const actions = node("div", "row-actions"),
    save = node("button", "primary", skill ? "Save changes" : "Create skill");
  actions.append(
    save,
    button("Cancel", () => d.close()),
  );
  form.append(name.label,command.label,node("p","muted small",skill?"Leave blank to keep this as a skill without a slash command.":"Leave blank to generate a command name from the skill name."),description.label,parameters.label,node("p","muted small","Separate names with spaces. Use [name] for optional input and name... for the rest of the message (last parameter only). Refer to inputs in your instructions as {{domain}} or {{userlist}}. Quote values containing spaces when running the command."),body.label, counter, actions);
  d.append(form);
  form.onsubmit = (e) => {
    e.preventDefault();
    perform(async () => {
      await api("/skills", "POST", {
        name: name.input.value.trim(),
        body: body.input.value,
        ...(skill||command.input.value.trim()?{command:command.input.value.trim()}:{}),
        description:description.input.value.trim(),
        ...(argumentIndex&&Number(argumentIndex.value)!==skill.import.argument_index?{argument_index:Number(argumentIndex.value)}:{}),
        ...(skill?.import&&parameters.input.value===originalParameters?{}:{parameters:parameters.input.value.trim().split(/\s+/).filter(Boolean).map(value=>{
          const match=value.match(/^(\[)?([a-z][a-z0-9_-]*)(\.\.\.)?(\])?$/);
          if(!match||!!match[1]!==!!match[4])throw Error('Use parameter names such as domain, [notes], or message...');
          const old=skill?.parameters?.find(p=>p.name===match[2]);
          return {name:match[2],description:old?.description||'',required:!match[1],rest:!!match[3]};
        })}),
      });
      commandsUI?.invalidate();
      d.close();
      await settingsSkills();
      notice("Skill saved.");
    }, save);
  };
  (skill ? body.input : name.input).focus();
}
async function settingsDesktopPermissions(){
  // WebKitGTK packs additional native webviews into the window's box, shrinking
  // the main app. Use its own trusted window on Linux instead of a child view.
  if(window.__KINDRED_DESKTOP?.platform==='linux'){await nativeInvoke('open_local_access',{theme:document.documentElement.dataset.theme||'dark'});return;}
  const content=$('settings-content'),title=$('settings-title');
  content.replaceChildren();content.classList.add('embedded-permissions-content');content.scrollTop=0;
  const back=button('',()=>openSettings('computer'),'icon-button settings-back','back');back.setAttribute('aria-label','Back to Computer');
  title.replaceChildren(back,document.createTextNode('Desktop permissions'));
  const placeholder=node('div','embedded-permissions-placeholder');content.append(placeholder);
  settingsMotion?.cancel();settingsMotion=null;
  // A native child view uses these bounds; keep its anchor stationary during entry.
  if(motionAllowed())settingsMotion=trackMotion(content.animate([{opacity:0},{opacity:1}],{duration:180,easing:'ease-out'}),180);
  const bounds=()=>{const r=content.getBoundingClientRect(),scale=window.devicePixelRatio||1;return {x:r.x*scale,y:r.y*scale,width:r.width*scale,height:(r.height-12)*scale};};
  let closed=false,opening=true,frame=0;
  const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!closed&&!opening)void nativeInvoke('position_local_access',{bounds:bounds()}).catch(e=>notice(String(e),true));});};
  const observer=new ResizeObserver(resize);observer.observe(content);window.addEventListener('resize',resize);
  const cleanup=async()=>{if(closed)return;closed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',resize);content.classList.remove('embedded-permissions-content');$('settings-dialog').removeEventListener('close',cleanup);await nativeInvoke('position_local_access',{bounds:null}).catch(()=>{});};
  closePermissionPage=cleanup;$('settings-dialog').addEventListener('close',cleanup);
  try{await nativeInvoke('open_local_access',{theme:document.documentElement.dataset.theme||'dark',bounds:bounds()});opening=false;if(closed)await nativeInvoke('position_local_access',{bounds:null});else resize();}
  catch(e){await cleanup();content.replaceChildren(node('p','run-error','Desktop permissions could not open. '+String(e)),button('Back to Computer',()=>openSettings('computer'),'outline-button'));}
}
async function settingsComputer(){
  const root=$('settings-content');root.replaceChildren();
  const access=settingsPane('Local access'),toggle=settingSwitch('Allow local access',state.general.local_access===true);
  access.body.append(toggle.label,node('p','muted small settings-device-status','Bots also need Local access enabled and a desktop selected in their own settings.'));
  toggle.input.onchange=async()=>{const enabled=toggle.input.checked;toggle.input.disabled=true;try{const current=await api('/settings');state.general=await api('/settings','PUT',{...current,local_access:enabled});}catch(e){toggle.input.checked=!enabled;notice(e.message,true);}finally{toggle.input.disabled=false;}};
  root.append(access.root);
  const computers=settingsPane('Saved computers'),list=node('div','saved-computers');computers.body.append(list);root.append(computers.root);
  const modes={off:'Off',workspace:'Workspace files only',ask:'Ask before commands',full:'Full desktop access'};
  const permissions={off:'Files and commands are blocked.',workspace:'Files stay inside the Kindred workspace. Commands are blocked.',ask:'Outside files and every command require desktop approval.',full:'Desktop files and commands are allowed. Bot and connector policies still apply.'};
  const render=async()=>{
    const [value,current]=await Promise.all([api('/local/devices'),window.__KINDRED_LOCAL_ACCESS?nativeInvoke('local_access_status').catch(e=>({error:String(e?.message||e)})):Promise.resolve(null)]);
    if(!list.isConnected||list.querySelector('.computer-rename'))return;
    const devices=[...(value.devices||[])];
    if(current?.device_id&&!devices.some(d=>d.id===current.device_id))devices.unshift({id:current.device_id,name:'This computer',mode:current.mode,online:false,pending:true});
    devices.sort((a,b)=>Number(b.id===current?.device_id)-Number(a.id===current?.device_id));
    list.replaceChildren();
    if(current?.error)list.append(node('p','run-error', 'This computer’s local connection is unavailable: '+current.error));
    else if(current&&!current.device_id)list.append(node('p','muted small','Starting this computer’s local connection…'));
    if(!devices.length)list.append(node('p','muted small settings-device-status','Open the Kindred desktop app in this workspace to save a computer.'));
    for(const d of devices){
      const here=d.id===current?.device_id,card=node('div','saved-computer'),header=node('div','saved-computer-heading'),copy=node('div');
      copy.append(node('strong','',d.name),node('span','muted small',here?(current.error?'Current computer · disconnected':d.online?'Current computer · online':'Current computer · connecting'):d.online?'Online':'Offline'));header.append(copy);
      if(!d.pending){const rename=button('Rename',()=>{const form=node('form','computer-rename'),name=field('Computer name',d.name,'input',{required:true,maxLength:100}),save=button('Save',()=>{},'outline-button');save.onclick=null;save.type='submit';form.append(name.label,save);header.replaceChildren(form);name.input.focus();form.onsubmit=e=>{e.preventDefault();if(!form.checkValidity())return;void perform(async()=>{await api('/local/devices/'+d.id,'PUT',{name:name.input.value.trim()});form.remove();await render();},save);};},'subtle-button');header.append(rename);}
      card.append(header);
      const details=node('div','saved-computer-permissions'),copyAccess=node('div');copyAccess.append(node('span','setting-label','Execution on this computer'),node('p','muted small',permissions[d.mode]||'Open this desktop to check its permissions.'));details.append(copyAccess);
      if(here){const change=button(modes[d.mode]||'Desktop permissions',()=>settingsDesktopPermissions(),'outline-button computer-permission-button','chevron');change.setAttribute('aria-label','Desktop permissions');details.append(change);}
      else details.append(node('span','computer-permission-value',modes[d.mode]||d.mode));
      card.append(details);
      const assigned=state.bots.filter(b=>!profile(b).archived&&profile(b).local_access&&(profile(b).local_device_id===d.id||profile(b).local_device_id==='*')).map(b=>b.name);
      card.append(node('p','muted small assigned-computer-bots',assigned.length?'Enabled for: '+assigned.join(', '):'No bots have local access enabled for this computer.'));
      list.append(card);
    }
    if(devices.some(d=>d.id!==current?.device_id))computers.root.querySelector('.remote-permission-note')?.remove();
    if(devices.some(d=>d.id!==current?.device_id)){const note=node('p','muted small remote-permission-note','Change another computer’s execution permissions from Kindred on that computer.');computers.root.append(note);}
  };
  await render();
  const timer=setInterval(()=>{if(!list.isConnected){clearInterval(timer);return;}if(!list.querySelector('.computer-rename'))void render().catch(()=>{});},3000);
  const devices = section("Add another computer");
  devices.append(
    node(
      "p",
      "muted small",
      "Open Kindred from your MacBook, PC or another browser. Each linked device opens this same workspace; local execution still follows its desktop permissions. Keep your devices connected to the server’s Tailscale network.",
    ),
  );
  const address = field("Server address", state.status.public_url, "input", {
    readOnly: true,
  });
  devices.append(address.label);
  const linkBox = node("div", "device-link");
  devices.append(
    button(
      "Create one-use device link",
      async () => {
        const result = await api("/devices/link", "POST", {});
        const link = field("Private device link", result.url, "input", {
          readOnly: true,
        });
        link.input.onclick = () => link.input.select();
        linkBox.replaceChildren(
          link.label,
          button("Copy device link", async () => {
            await navigator.clipboard.writeText(result.url);
            notice("Device link copied. Open it on your other device.");
          }),
          node(
            "p",
            "muted small",
            "Expires in 10 minutes and works once. Only share it with your own device; it grants full access.",
          ),
        );
      },
      "outline-button",
    ),
    linkBox,
  );
  root.append(devices);
 }
async function settingsBotComputer() {
  const root = $("settings-content");
  root.replaceChildren();
  const resources = section("Live computer");
  const screenChoice=select(state.bots.filter(b=>!profile(b).archived).map(b=>[b.id,b.name+'’s screen']),screenBotId());
  screenChoice.id='computer-settings-screen';screenChoice.setAttribute('aria-label','Preview bot screen');screenChoice.disabled=!!state.teaching;
  screenChoice.onchange=()=>perform(()=>selectComputerScreen(screenChoice.value,{workspace:true}));
  resources.firstElementChild.classList.add('computer-preview-heading');resources.firstElementChild.append(screenChoice);
  const preview = button(
    "",
    () => {
      $("settings-dialog").close();
      return openComputer(false,true);
    },
    "computer-preview",
  );
  const img = node("img");
  img.id = "computer-settings-preview-image";
  img.dataset.computerPreview = screenBotId();
  img.alt = (state.bots.find(b=>b.id===screenBotId())?.name||'Bot')+'’s screen';
  preview.append(img, node("span", "preview-open", "Open"));
  preparePreview(img);
  const overview = node("div", "computer-overview");
  overview.append(preview);
  const stats = node("div", "resource-stats");
  stats.dataset.resources = "";
  overview.append(stats);
  resources.append(overview);
  root.append(resources);
  refreshPreview();
  refreshResources();
  const machine = section("Shared bot computer");
  machine.append(
    node("div", "setting-box", state.status.vm || "Virtual machine"),
  );
  const machineActions = node("div", "row-actions");
  const machineStatus=node('p','muted small');machineStatus.id='computer-action-status';machineStatus.setAttribute('role','status');machineStatus.setAttribute('aria-live','polite');machineStatus.hidden=true;
  let machineControlBusy=false;
  async function controlComputer(action){
    if(machineControlBusy)return;
    machineControlBusy=true;
    for(const control of machineActions.children)control.disabled=true;
    machineStatus.hidden=false;machineStatus.className='muted small';
    machineStatus.textContent={start:'Starting the computer…',reboot:'Restarting the computer…',shutdown:'Shutting down the computer…'}[action];
    try{
      await api('/vm/'+action,'POST',{});
      machineStatus.textContent={start:'Computer started.',reboot:'Restart requested. The screen will reconnect when ready.',shutdown:'Shutdown requested.'}[action];
    }catch(error){machineStatus.className='run-error small';machineStatus.textContent=error.message;}
    finally{machineControlBusy=false;for(const control of machineActions.children)control.disabled=false;}
  }
  machineActions.append(
    button(
      "Open computer",
      () => {
        $("settings-dialog").close();
        return openComputer();
      },
      "outline-button",
      "computer",
    ),
    button("Start computer", () => controlComputer('start')),
    button("Reboot computer", async () => {
      if (!confirm("Reboot the shared bot computer? All bot screens will restart.")) return;
      disconnectDesktop();
      await controlComputer('reboot');
    }),
    button("Shut down", async () => {
      if (!confirm("Shut down the bot computer?")) return;
      disconnectDesktop();
      await controlComputer('shutdown');
    }),
  );
  for(const action of machineActions.children)action.classList.add('outline-button');
  machine.append(machineActions,machineStatus);
  root.append(machine);
  const maintenance=section('Computer updates'),updateStatus=node('p','muted small');updateStatus.id='computer-maintenance-status';
  const updateSwitch=settingSwitch('Update automatically',true),updateLabel=updateSwitch.label,updateToggle=updateSwitch.input;updateToggle.id='computer-maintenance-enabled';updateToggle.setAttribute('aria-label','Update the bot computer automatically');
  const updateNow=button('Update now',()=>{},'outline-button','refresh');updateNow.disabled=true;
  updateNow.onclick=async()=>{
    updateNow.disabled=true;updateNow.dataset.submitting='true';
    try{showMaintenance(await api('/computer/maintenance','POST',{}));}
    catch(e){delete updateNow.dataset.submitting;renderComputerMaintenance();updateStatus.textContent=e.message;return;}
    delete updateNow.dataset.submitting;renderComputerMaintenance();
  };updateNow.id='computer-maintenance-now';updateNow.title='Update Linux and all provider runtimes, then restart the computer';
  const updateActions=node('div','row-actions computer-update-actions');updateActions.append(updateLabel,updateNow);
  maintenance.append(updateActions,node('p','muted small','Automatic updates run during downtime, at most once every three days.'),updateStatus);root.append(maintenance);
  function showMaintenance(value){state.status.maintenance=value;updateToggle.checked=value.enabled;renderComputerMaintenance();}
  updateToggle.disabled=true;
  api('/computer/maintenance').then(value=>{if(maintenance.isConnected){showMaintenance(value);updateToggle.disabled=false;}}).catch(e=>{updateStatus.textContent=e.message;});
  updateToggle.onchange=()=>{updateToggle.disabled=true;api('/computer/maintenance','PUT',{enabled:updateToggle.checked}).then(showMaintenance).catch(e=>{updateToggle.checked=!updateToggle.checked;updateStatus.textContent=e.message;}).finally(()=>{updateToggle.disabled=false;});};
  const server = section("Server");
  server.append(
    node("p", "muted small", "This app is connected to " + location.origin),
  );
  if (state.status.public_url && state.status.public_url !== location.origin)
    server.append(
      node(
        "p",
        "muted small",
        "Private network address: " + state.status.public_url,
      ),
      button("Copy server address", async () => {
        await navigator.clipboard.writeText(state.status.public_url);
        notice("Address copied.");
      }),
    );
  server.append(
    node(
      "p",
      "muted small",
      "Chat history and browser data stay on your server and VM. AI providers receive the prompts, screenshots and tool results needed for a task.",
    ),
  );
  root.append(server);
}
function screenBotId() {
  return state.screenBotId || state.bot?.id || "";
}
function chatScreenBots() {
  const members=state.chat?.shared?state.chat.participants.filter(p=>p.kind==='bot').map(p=>p.bot_id):state.chat?.members || [state.bot?.id];
  return members.map(id=>state.bots.find(b=>b.id===id)).filter(b=>b&&!profile(b).archived);
}
async function selectComputerScreen(id,{workspace=false}={}){
  if(state.teaching){notice('Finish teaching before switching screens.');return;}
  const candidates=workspace?state.bots.filter(b=>!profile(b).archived):chatScreenBots();
  if(!candidates.some(b=>b.id===id))return;
  if(workspace&&!$('computer-panel').hidden&&!chatScreenBots().some(b=>b.id===id))await chooseBot(candidates.find(b=>b.id===id));
  state.screenBotId=id;state.desktopRetry=0;
  const choice=$('computer-settings-screen'),img=$('computer-settings-preview-image');
  if(choice)choice.value=id;
  if(img){img.dataset.computerPreview=id;img.alt=(state.bots.find(b=>b.id===id)?.name||'Bot')+'’s screen';img.removeAttribute('src');img.style.opacity='0';const fallback=img.parentElement.querySelector('.preview-fallback');if(fallback){fallback.hidden=false;fallback.lastElementChild.textContent='Loading preview…';}}
  renderScreenPicker();renderComputerRoutines();
  await Promise.all([refreshPreview(),!$('computer-panel').hidden?connectDesktop():Promise.resolve()]);
}
function renderScreenPicker() {
  let picker = $("screen-picker");
  if (!picker) {
    const wrap=node('div','screen-picker-wrap');
    picker = button('',()=>{
      const menu=$('screen-picker-menu');
      if(!menu.hidden){closeScreenPicker(true);return;}
      menu.hidden=false;picker.setAttribute('aria-expanded','true');
      (menu.querySelector('[aria-checked="true"]')||menu.firstElementChild)?.focus();
    },'screen-picker-trigger');
    picker.id = "screen-picker";
    picker.setAttribute('aria-haspopup','menu');picker.setAttribute('aria-expanded','false');picker.setAttribute('aria-controls','screen-picker-menu');
    const menu=node('div','screen-picker-menu');menu.id='screen-picker-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Chat screens');
    wrap.append(picker,menu);$("computer-panel").querySelector(".panel-header > strong").replaceWith(wrap);
    picker.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(menu.hidden)picker.click();const options=[...menu.children];(e.key==='ArrowUp'?options.at(-1):options[0])?.focus();}});
    menu.addEventListener('keydown',e=>{
      const options=[...menu.children],index=options.indexOf(document.activeElement);
      if(e.key==='Escape'){e.preventDefault();closeScreenPicker(true);}
      else if(e.key==='Tab')closeScreenPicker(true);
      else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?options.length-1:(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[next]?.focus();}
    });
  }
  const bots=chatScreenBots(),current=screenBotId(),selected=bots.find(b=>b.id===current);
  const menu=$('screen-picker-menu'),key=JSON.stringify([bots.map(b=>[b.id,b.name]),current,!!state.teaching]);
  if(picker.dataset.key!==key){
    const hadFocus=menu.contains(document.activeElement);closeScreenPicker(hadFocus);
    picker.dataset.key=key;picker.value=current;
    picker.replaceChildren(node('span','',selected?selected.name+'’s screen':'No screens'),icon('chevron'));
    picker.setAttribute('aria-label','Bot screen: '+(selected?.name||'none'));
    menu.replaceChildren();
    for(const b of bots){
      const item=button('',()=>{closeScreenPicker(true);return selectComputerScreen(b.id);},'screen-picker-option');
      item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String(b.id===current));item.tabIndex=-1;item.dataset.botId=b.id;
      item.append(node('span','',b.name+'’s screen'),icon('check'));menu.append(item);
    }
  }
  picker.disabled = !!state.teaching || !bots.length;
  const settingsChoice=$('computer-settings-screen');if(settingsChoice){settingsChoice.value=current;settingsChoice.disabled=!!state.teaching;}
}
function closeScreenPicker(focus=false){
  const menu=$('screen-picker-menu'),picker=$('screen-picker');if(menu)menu.hidden=true;
  picker?.setAttribute('aria-expanded','false');if(focus)picker?.focus();
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.screen-picker-wrap'))closeScreenPicker();});
function disconnectDesktop() {
  if(state.teaching){state.teaching.paused=true;renderTeaching();}
  state.stopDesktopGlass?.();state.stopDesktopGlass=null;
  state.stopComputerPointer?.();state.stopComputerPointer=null;
  clearTimeout(state.desktopRetryTimer);
  clearTimeout(state.desktopTimeout);
  state.desktopGeneration++;
  state.desktopConnected = false;
  state.rfb?.disconnect();
  state.rfb = null;
  $("desktop").replaceChildren();
  $("desktop-loading")?.remove();
}
// Sample only a tiny decorative copy; the actual VNC canvas stays untouched.
function desktopGlass(host) {
  const glass=node('canvas','desktop-glass');glass.setAttribute('aria-hidden','true');
  glass.width=240;glass.height=150;$('desktop').prepend(glass);
  const context=glass.getContext('2d',{alpha:false});let timer,stopped=false;
  const stop=()=>{stopped=true;clearTimeout(timer);glass.remove();};
  if(!context){stop();return stop;}
  function paint(){
    if(stopped)return;
    if(!host.isConnected||$('computer-panel').hidden){stop();return;}
    const source=host.querySelector('canvas');
    if(!document.hidden&&source?.width>1&&source.height>1&&context){
      const scale=240/Math.max(source.width,source.height),width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale));
      if(glass.width!==width||glass.height!==height){glass.width=width;glass.height=height;}
      try{context.drawImage(source,0,0,width,height);glass.classList.add('ready');}
      catch{stop();return;}
    }
    timer=setTimeout(paint,500);
  }
  paint();return stop;
}
// The live screen fades in over the connecting state instead of cutting to it.
function revealDesktop(host) {
  const loading=$("desktop-loading");
  if(!motionAllowed()){loading?.remove();return;}
  const timing={duration:260,easing:'cubic-bezier(.2,.8,.2,1)'};
  trackMotion(host.animate([{opacity:0,transform:'scale(.985)'},{opacity:1,transform:'none'}],timing),timing.duration,()=>{});
  if(loading){loading.id='';loading.inert=true;trackMotion(loading.animate([{opacity:1},{opacity:0}],{duration:200,easing:'ease-out',fill:'forwards'}),200,()=>loading.remove());}
}
// A still of the last frame lets a closing pane fade out showing its screen.
function desktopStill() {
  const source=$("desktop").querySelector('.desktop-canvas canvas');
  if(!source?.width||!source.isConnected||!motionAllowed())return null;
  const still=node('canvas','desktop-still'),box=source.getBoundingClientRect();
  still.width=source.width;still.height=source.height;still.setAttribute('aria-hidden','true');
  still.style.width=box.width+'px';still.style.height=box.height+'px';
  try{still.getContext('2d').drawImage(source,0,0);}catch{return null;}
  return still;
}
function desktopLoading(label = "Connecting") {
  $("desktop-loading")?.remove();
  const loading = node("div", "desktop-loading");
  loading.id = "desktop-loading";
  loading.setAttribute("role", "status");
  const bot = state.bots.find((b) => b.id === screenBotId());
  const face = character(portrait(bot),46);
  if(!face.dataset.tribute)face.classList.add('adaptive-white');
  face.classList.remove('animated');
  face.classList.add('static-connecting-bot');
  loading.append(face, node("span", "working-glimmer", label));
  $("desktop").append(loading);
  $("desktop-mode").textContent = label;
}
function retryDesktop(generation, message) {
  if (generation !== state.desktopGeneration || $("computer-panel").hidden)
    return;
  clearTimeout(state.desktopTimeout);
  clearTimeout(state.desktopRetryTimer);
  state.desktopConnected = false;
  state.stopDesktopGlass?.();state.stopDesktopGlass=null;
  const reason=message || "The screen connection closed before it was ready.";
  $("desktop-error").textContent=reason;
  $("desktop-error").hidden=false;
  if ((state.desktopRetry || 0) >= 3) {
    desktopLoading("Screen unavailable");
    $("desktop-error").textContent=reason+" Check Computer settings, then use Reconnect desktop to try again.";
    return;
  }
  desktopLoading("Reconnecting…");
  const delay = Math.min(
    15000,
    1000 * 2 ** Math.min(state.desktopRetry || 0, 4),
  );
  state.desktopRetry = (state.desktopRetry || 0) + 1;
  state.desktopRetryTimer = setTimeout(() => perform(connectDesktop), delay);
}
async function openComputer(controlRequested = false, expanded = false) {
  // Workspace settings may preview any bot; opening it enters that bot's chat.
  if(!chatScreenBots().some(b=>b.id===screenBotId())){
    const selected=state.bots.find(b=>b.id===screenBotId()&&!profile(b).archived);
    if(selected)await chooseBot(selected);
  }
  state.desktopControlRequested = controlRequested === true;
  state.desktopRetry = 0;
  hidePane($("details-panel"));
  state.controlPaneEngaged=true;
  showPane($("computer-panel"));
  renderControlNotice();
  setComputerExpanded(expanded);
  renderComputerRoutines();
  renderScreenPicker();
  await Promise.all([connectDesktop(), refreshResources()]);
}
async function connectDesktop() {
  disconnectDesktop();
  const candidates=chatScreenBots();
  if(!candidates.some(b=>b.id===screenBotId()))state.screenBotId=candidates[0]?.id||'';
  if(state.desktopRetryBot!==screenBotId()){state.desktopRetryBot=screenBotId();state.desktopRetry=0;}
  renderScreenPicker();
  if(!candidates.length){desktopLoading('No screens in this chat');return;}
  const generation = state.desktopGeneration;
  $("desktop-error").hidden = true;
  desktopLoading();
  try {
    // Read the selected screen directly; a concurrent chat refresh may still be in flight.
    const status = await api("/status");
    if (generation !== state.desktopGeneration) return;
    state.status = status;
    state.statusEpoch=(state.statusEpoch||0)+1;
    const control = !!state.desktopControlRequested && !!state.status.takeover;
    if(!state.status.takeover)state.desktopControlRequested=false;
    const result = await api("/computer/session", "POST", { control });
    if (generation !== state.desktopGeneration || $("computer-panel").hidden)
      return;
    const url = new URL("/vnc", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", result.ticket);
    const host = node("div", "desktop-canvas");
    $("desktop").prepend(host);
    const rfb = new RFB(host, url.href);
    const previewOpen=button('',()=>setComputerExpanded(true),'desktop-preview-open');
    previewOpen.setAttribute('aria-label','Open computer screen');previewOpen.append(node('span','','Open'));previewOpen.hidden=true;host.append(previewOpen);
    let failed=false;
    const fail=message=>{if(failed||generation!==state.desktopGeneration)return;failed=true;rfb.disconnect();retryDesktop(generation,message);};
    state.rfb = rfb;
    state.stopComputerPointer?.();
    state.stopComputerPointer = computerClickIndicator(host, () => state.status, () => screenBotId());
    rfb.viewOnly = !control;
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.background = "transparent";
    state.desktopTimeout = setTimeout(() => {
      if (generation === state.desktopGeneration) {
        fail("The computer did not finish connecting within 35 seconds.");
      }
    }, 35000);
    rfb.addEventListener("connect", () => {
      if (failed || generation !== state.desktopGeneration) return;
      clearTimeout(state.desktopTimeout);
      state.desktopRetry = 0;
      state.desktopConnected = true;
      state.stopDesktopGlass?.();state.stopDesktopGlass=desktopGlass(host);
      revealDesktop(host);
      $("desktop-error").hidden = true;
      updateDesktopState();
    });
    rfb.addEventListener("disconnect", () => fail("The screen connection closed. The computer may be offline or its screen service unavailable."));
    rfb.addEventListener("securityfailure", () => fail("The computer rejected the screen connection. Check its screen service and retry."));
  } catch (e) {
    if (generation !== state.desktopGeneration) return;
    retryDesktop(generation,e.message);
  }
  updateDesktopState();
}
function renderComputerMaintenance(){
  const value=state.status.maintenance,status=$('computer-maintenance-status'),toggle=$('computer-maintenance-enabled');if(!value||!status||!toggle)return;
  if(!toggle.disabled)toggle.checked=value.enabled;
  const updateNow=$('computer-maintenance-now');if(updateNow){updateNow.disabled=!!updateNow.dataset.submitting||!!value.requested||['starting','updating','checking','rebooting'].includes(value.phase);}
  status.textContent=value.error||(value.phase==='rebooting'?'Restarting the computer…':['starting','updating','checking','rebooting'].includes(value.phase)?'Updating the computer. New tasks are queued.':value.requested?'Update queued. Waiting for the computer to be available.':value.reboot_recommended?'Updates installed · reboot recommended.':value.last_success?'Last updated '+new Date(value.last_success*1000).toLocaleString():value.enabled?'Waiting for downtime.':'Automatic updates off.');
}
function updateDesktopState() {
  renderComputerMaintenance();
  const takeover = !!state.status.takeover && !!state.desktopControlRequested,
    updating = ["starting","updating","checking","rebooting"].includes(state.status.maintenance?.phase),
    recovering = state.status.computer_recovering_seconds || 0,
    busy = state.allRuns.some((r) => r.bot_id === screenBotId() && active(r) && r.status !== "awaiting_user"),
    human = pendingHumanTask();
  const controlLabel = updating ? "Updating computer…" : takeover
    ? "Return control"
    : state.status.takeover
      ? "Use screen"
      : recovering
      ? `Wait ${recovering}s`
      : busy
        ? "Stop task & take control"
        : "Take control";
  $('computer-panel').classList.toggle('is-controlling',takeover&&!!state.desktopConnected);
  const previewOpen=$('desktop').querySelector('.desktop-preview-open');if(previewOpen)previewOpen.hidden=!state.desktopConnected;
  $('done-subtask').hidden = !human || !takeover;
  $('done-subtask').disabled = state.takingControl;
  $('take-control').hidden = !!human && takeover;
  renderControlNotice();
  $('teach-task').hidden = !!human;
  $("take-control").disabled = state.takingControl || recovering > 0 || updating;
  screenAction($('take-control'),controlLabel,updating?'refresh':recovering?'clock':takeover?'back':'pointer');
  screenAction($('teach-task'),state.teaching?'Review lesson':'Teach a task',state.teaching?'book':'record');
  screenAction($('done-subtask'),'Done with subtask','check');
  $("teach-task").disabled = state.takingControl || recovering > 0 || updating;
  if (state.desktopConnected)
    $("desktop-mode").textContent = takeover
      ? "You have control"
      : updating ? "Updating computer" : "Watching live";
  $("desktop-paste").disabled = !takeover || !state.desktopConnected;
  if(state.teaching && (!takeover || !state.desktopConnected) && !state.teaching.paused){state.teaching.paused=true;renderTeaching();}
  $("desktop-address").textContent = location.host;
}
function screenAction(control,label,symbol) {
  control.classList.add('desktop-action');control.title=label;control.setAttribute('aria-label',label);
  if(control.dataset.label===label)return;
  control.dataset.label=label;control.replaceChildren(icon(symbol,16),node('span','desktop-action-label',label));
}
async function toggleControl() {
  state.statusEpoch=(state.statusEpoch||0)+1;
  state.takingControl = true;
  updateDesktopState();
  try {
    if (state.status.takeover && state.desktopControlRequested) {
      const task = pendingHumanTask();
      if(task) { await finishHumanTask(task); return; }
      const pause=pausedScreens().find(p=>p.bot_id===screenBotId());
      if(pause)await returnScreenControl(pause);
      return;
    }
    if(state.status.takeover){
      state.desktopControlRequested=true;
      await connectDesktop();
      return;
    }
    const running = state.allRuns.filter(
      (r) => r.bot_id === screenBotId() && active(r) && r.status !== 'awaiting_user',
    );
    if (running.length) {
      for (const run of running)
        await api("/runs/" + run.id + "/cancel", "POST", {});
      await refresh();
      notice(
        "Task stopped. Take control when its current command has finished.",
      );
      return;
    }
    await api("/takeover", "POST", { enabled: true, reason: state.startingTeaching?'teaching':'manual' });
    state.desktopControlRequested=true;
    await refresh();
    await connectDesktop();
  } finally {
    state.takingControl = false;
    updateDesktopState();
  }
}
async function openApp(app) {
  if (
    state.allRuns.some((r) => r.bot_id === screenBotId() && active(r)) ||
    state.status.computer_recovering_seconds
  )
    throw new Error(
      "Stop the active task and wait for it to finish before opening an app.",
    );
  if (!state.status.takeover) await api("/takeover", "POST", { enabled: true, reason: 'open_app' });
  disconnectDesktop();
  await api("/computer", "POST", {
    tool: "computer_open_url",
    args: { url: app.url },
  });
  $("settings-dialog").close();
  await openComputer(true);
}
for (const [id, symbol] of Object.entries({
  "new-bot": "plus",
  "search-icon": "search",
  "show-computer": "computer",
  "composer-actions": "plus",
  send: "send",
  "bot-settings": "settings",
  "details-back": "back",
  "details-close": "close",
  "computer-expand": "expand",
  "computer-close": "close",
  "desktop-reconnect": "refresh",
  "settings-close": "close",
}))
  $(id).append(icon(symbol));
$("settings-button").append(icon("settings"), node("span", "", "Settings"));
for (const b of document.querySelectorAll("[data-close]")) {
  b.append(icon("close"));
  b.onclick = () => $(b.dataset.close).close();
}
const greeter=character({shape:"pebble"},95);
$("connect-character").append(greeter);
idleCompanion(greeter);
$("remember-device").checked = typeof window.__KINDRED_REMEMBER_SESSION === 'boolean'
  ? window.__KINDRED_REMEMBER_SESSION
  : Boolean(localStorage.getItem("kindred-token")) || Boolean(window.__KINDRED_PROFILE_HOST);
const pairCode = new URLSearchParams(location.hash.slice(1)).get("pair");
if (pairCode) {
  history.replaceState(null, "", location.pathname + location.search);
  $("connect-form").querySelector("p").textContent =
    "Connect this device to the shared Kindred workspace with full access.";
  $("token").required = false;
  $("token").closest("label").hidden = true;
  $("connect-form").querySelector("button").textContent = "Connect this device";
}
$("connect-form").onsubmit = (e) => {
  e.preventDefault();
  state.token = $("token").value.trim();
  perform(async () => {
    try {
      if (pairCode) {
        const response = await fetch("/device/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: pairCode }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Device link failed");
        state.token = result.token;
      }
      await connect();
      $("token").value = "";
    } catch (e) {
      $("connect-error").textContent = e.message;
      throw e;
    }
  });
};
$("new-bot").onclick = () => {
  $("new-menu").hidden = !$("new-menu").hidden;
};
$("search").oninput = renderSidebar;
$("mobile-menu").onclick = () => $("app").classList.toggle("sidebar-open");
$("settings-button").onclick = () => perform(() => openSettings());
$("identity-button").onclick = toggleIdentityMenu;
$("settings-title").parentElement.prepend(settingsHeaderArt());
$("settings-close").onclick = () => $("settings-dialog").close();
$('settings-dialog').addEventListener('close',()=>{if($('settings-dialog').open)return;settingsRevision++;settingsRequest?.abort('settings-navigation');settingsMotion?.cancel();settingsMotion=null;});
$("bot-details").onclick = () =>
  state.chat && !state.chat.id.startsWith('dm-') ? editChat(state.chat) : openDetails();
$("bot-settings").onclick = () => openDetails("settings");
$("details-back").onclick = () => openDetails();
$("details-close").onclick = () => hidePane($("details-panel"));
$("composer-actions").onclick = toggleComposerMenu;
$("show-computer").onclick = () => perform(openComputer);
$("computer-close").onclick = () => {
  leaveControlPane();
  const still=desktopStill();
  disconnectDesktop();
  if(still)$("desktop").append(still);
  hidePane($("computer-panel"));
  renderControlNotice(true);
};
$("computer-expand").onclick = () => setComputerExpanded(!$("computer-panel").classList.contains("expanded"));
$('desktop').addEventListener('pointerdown',e=>{
  if(e.target.tagName!=='CANVAS'||$('computer-panel').classList.contains('expanded'))return;
  e.preventDefault();e.stopImmediatePropagation();setComputerExpanded(true);
},true);
$("desktop-reconnect").onclick = () => {state.desktopRetry=0;return perform(connectDesktop);};
$("take-control").onclick = () => perform(()=>state.teaching && state.desktopControlRequested ? reviewTeaching() : toggleControl());
$("teach-task").onclick = () => perform(()=>state.teaching ? reviewTeaching() : startTeaching());
$("computer-settings-link").onclick = () =>
  perform(() => openSettings("bot-computer"));
async function pasteIntoComputer(value) {
  if (!state.rfb || !state.status.takeover || !state.desktopControlRequested)
    throw new Error("Take control of the computer first.");
  if (!value) throw new Error("Your clipboard has no text to paste.");
  disconnectDesktop();
  try {
    await api("/computer", "POST", {tool:"computer_type",args:{text:value}});
  } finally {
    await connectDesktop();
  }
}
$("desktop-paste").onclick = () => perform(async () => {
  let value;
  try {
    value = await navigator.clipboard.readText();
  } catch {
    // Some browsers deny clipboard reads. Keep a direct paste target outside chat.
    $("paste-text").value = "";
    $("text-dialog").showModal();
    $("paste-text").focus();
    return;
  }
  await pasteIntoComputer(value);
}, $("desktop-paste"));
$("text-form").onsubmit = (e) => {
  e.preventDefault();
  perform(async () => {
    await pasteIntoComputer($("paste-text").value);
    $("paste-text").value = "";
    $("text-dialog").close();
  }, e.submitter);
};
$("composer").onsubmit = (e) => {
  e.preventDefault();
  perform(async () => {
    const commandDraft=$("prompt").value,commandChat=composerChatId();
    const library=state.chat?.shared?false:await commandsUI?.beforeSend();
    if(commandDraft!==$("prompt").value||commandChat!==composerChatId())return;
    if(library) {
      $("prompt").value="";saveDraft();await openSettings("skills");return;
    }
    normalizePromptMentions();
    const selectedChatId = composerChatId();
    const files = [...(pendingFiles.get(selectedChatId) || [])];
    if(files.some(f=>f.loading))throw new Error('Wait for your files to finish uploading.');
    const submittedDraft = $("prompt").value;
    const submittedReply = state.replyDrafts.get(selectedChatId);
    const prompt = submittedDraft.trim() || (files.length ? 'Please review the attached files.' : '');
    if (!prompt || (!state.bot&&!state.chat)) return;
    if (new TextEncoder().encode(prompt).length > 64000)
      throw new Error("Message is too long (64 KB maximum).");
    const mentions = [...$("prompt").querySelectorAll("[data-mention]:not([data-channel])")].map(
      (n) => n.dataset.mention,
    );
    const chat =
      state.chat || state.chats.find((c) => c.id === `dm-${state.bot.id}`);
    followChatLatest();
    if (chat) {
      const payload={prompt,mentions:state.chat?mentions:[],files:files.map(f=>f.id),reply_to:submittedReply?.seq??null};
      const signature=JSON.stringify(payload),old=state.pendingSends.get(selectedChatId);
      const send=old?.signature===signature?old:{signature,request_id:crypto.randomUUID()};
      state.pendingSends.set(selectedChatId,send);persistConversation();
      await api("/chats/"+chat.id+"/messages","POST",{...payload,request_id:send.request_id});
      if(state.pendingSends.get(selectedChatId)===send)state.pendingSends.delete(selectedChatId);
    }
    else await api("/runs", "POST", { bot_id: state.bot.id, prompt });
    const pending = pendingFiles.get(selectedChatId) || [];
    for (const file of files) {const index=pending.indexOf(file);if(index>=0)pending.splice(index,1);releasePendingPreview(file);}
    renderPendingFiles();
    if(state.replyDrafts.get(selectedChatId)===submittedReply)state.replyDrafts.delete(selectedChatId);
    renderReplyDraft();
    if(state.drafts?.get(selectedChatId)===submittedDraft)state.drafts.delete(selectedChatId);
    if(composerChatId()===selectedChatId && $("prompt").value===submittedDraft){
      $("prompt").value = "";
      $("prompt").style.height = "auto";
    }
    persistConversation();
    await refresh(true);
  }, $("send"));
};
function resizeComposer() {
  const editor=$('prompt'),form=$('composer');editor.style.height='auto';dictationUI?.render();
  if(!form.getClientRects().length||form.matches('.is-replying,.has-files,.is-dictating')){
    form.classList.remove('is-multiline');return;
  }
  const css=getComputedStyle(editor),line=parseFloat(css.lineHeight)+parseFloat(css.paddingTop)+parseFloat(css.paddingBottom);
  // A draft that still wraps at full width cannot fit the compact layout. Keep
  // the live scrolling editor stable instead of narrowing it on every keystroke.
  if(form.classList.contains('is-multiline')&&editor.scrollHeight>Math.ceil(line)+1)return;
  // Only short drafts need a compact-width measurement at the wrap boundary.
  form.classList.remove('is-multiline');
  form.classList.toggle('is-multiline',editor.scrollHeight>Math.ceil(line)+1);
}
let composerWidth=0,composerFont='',composerMode='';
function updateComposerLayout(){
  const form=$('composer'),width=form.clientWidth,font=getComputedStyle($('prompt')).fontSize,
    mode=['is-replying','has-files','is-dictating','dictation-enabled','dictation-empty'].filter(c=>form.classList.contains(c)).join(' ');
  if(width===composerWidth&&font===composerFont&&mode===composerMode)return;
  composerWidth=width;composerFont=font;composerMode=mode;resizeComposer();
}
const composerLayout=new ResizeObserver(updateComposerLayout);
new MutationObserver(updateComposerLayout).observe($('composer'),{attributes:true,attributeFilter:['class']});
composerLayout.observe($('composer'));document.fonts.ready.then(resizeComposer);
// Track the overlay for explicit scroll-into-view operations only. History padding
// stays fixed so growing drafts do not displace messages or change bottom-follow.
const composerClearance=new ResizeObserver(()=>{const area=$('composer-area');area.closest('.conversation').style.setProperty('--composer-clearance',area.hidden?'0px':area.getBoundingClientRect().height+'px');});
composerClearance.observe($('composer-area'));
function isDraftingFor(id) {
  const selected=state.chat ? state.chat.members.includes(id) : state.bot?.id===id;
  return selected && document.activeElement===$("prompt") && Date.now()-(state.lastTyped||0)<6500;
}
function wakeCuriousBot() { state.lastTyped=Date.now();updateReactions(); }
$("prompt").addEventListener("blur",()=>updateReactions());
$("prompt").oninput = () => {
  updateMentions();
  resizeComposer();
  wakeCuriousBot();
};
$("prompt").onkeydown = (e) => {
  if(commandsUI?.keydown(e))return;
  if(!e.isComposing&&!$("mention-options").hidden&&['ArrowDown','ArrowUp'].includes(e.key)){
    e.preventDefault();const list=$("mention-options"),items=[...list.querySelectorAll('button')];
    const index=(Number(list.dataset.selected||0)+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;
    list.dataset.selected=index;items.forEach((item,i)=>item.classList.toggle('selected',i===index));items[index]?.scrollIntoView({block:'nearest'});return;
  }
  if (
    !e.isComposing &&
    (e.key === "Enter" || e.key === "Tab") &&
    !$("mention-options").hidden
  ) {
    e.preventDefault();
    $("mention-options").querySelectorAll("button")[Number($("mention-options").dataset.selected||0)]?.click();
    return;
  }
  if (e.key === "Escape") $("mention-options").hidden = true;
  if(composerLists?.keydown(e))return;
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
};
$("new-avatar-button").onclick = () =>
  pickAvatar({...state.newProfile,name:$("bot-form").elements.name.value}, (p) => {
    const {name:_,...appearance}=p;state.newProfile = appearance;
    replaceCharacter($("new-avatar-button"),{...p,name:$("bot-form").elements.name.value},90);
  });
$("bot-form").elements.name.addEventListener("change",()=>replaceCharacter($("new-avatar-button"),{...state.newProfile,name:$("bot-form").elements.name.value},90));
$("save-avatar").onclick = () => {
  $("avatar-dialog").close();
};
$("bot-form").onsubmit = (e) => {
  e.preventDefault();
  perform(async () => {
    const f = e.target.elements;
    const draft = {
      id: "",
      name: f.name.value,
      instructions: f.instructions.value,
      memory: "",
      provider: f.provider.value,
      model: f.model.value,
      reasoning_effort: f.reasoning_effort.value,
      auto_approve: false,
      approval_mode: "inherit",
      profile: {
        ...state.newProfile,
        label: f.label.value,
        description: f.description.value,
      },
    };
    const proposal = state.botProposal;
    const b = proposal
      ? await api('/bot-drafts/'+proposal.id+'/create','POST',{bot:draft})
      : await api('/bots','POST',draft);
    $("bot-dialog").close();
    botArrivals.set(b.id,Date.now());
    if(proposal){state.botProposal=null;await refresh(true);notice(b.name+' joined your team.');}
    else await chooseBot(b);
  });
};
$("routine-form").onsubmit = (e) => {
  e.preventDefault();
  perform(async () => {
    const f = e.target.elements;
    const schedule=f.schedule_mode.value==='daily'?{timezone:f.timezone.value.trim(),days:[1,2,3,4,5,6,7],start:f.daily_time.value,end:f.daily_time.value,every_minutes:1440}:['weekly','window'].includes(f.schedule_mode.value)?{timezone:f.timezone.value.trim(),days:[...e.target.querySelectorAll('[name=weekday]:checked')].map(n=>Number(n.value)),start:f.start.value,end:f.schedule_mode.value==='window'?f.end.value:f.start.value,every_minutes:f.schedule_mode.value==='window'?Number(f.every_minutes.value):1440}:null;
    if(schedule && !schedule.days.length)throw new Error('Choose at least one day.');
    if(schedule && schedule.end<schedule.start)throw new Error('The last run must be at or after the first run.');
    try{new Intl.DateTimeFormat(undefined,{timeZone:f.timezone.value.trim()}).format();}catch{throw new Error('Choose a valid time zone.');}
    const runAt=f.schedule_mode.value==='once'?(await api('/settings/timezone/resolve','POST',{local:f.run_date.value+'T'+f.once_time.value,timezone:f.timezone.value.trim()})).run_at:null;
    if(runAt!==null&&(!Number.isFinite(runAt)||f.enabled.checked&&runAt<=Date.now()/1000))throw new Error('Choose a future one-time date.');
    const interval=runAt!==null?60:schedule?schedule.every_minutes*60:Number(f.interval.value)*60;
    const old=state.editRoutine;
    if(old?.id){
      const patch={name:f.name.value,prompt:f.prompt.value,enabled:f.enabled.checked,expected_prompt:old.prompt};
      if((old.run_at||null)!==runAt||JSON.stringify(old.schedule||null)!==JSON.stringify(schedule)||old.interval_seconds!==interval){
        if(runAt!==null)patch.run_at=runAt;else if(schedule)patch.schedule=schedule;else patch.interval_seconds=interval;
      }
      await api('/routines/'+old.id,'PATCH',patch);
    }else await api('/routines','POST',{id:'',bot_id:f.bot_id.value,name:f.name.value,prompt:f.prompt.value,interval_seconds:interval,schedule,run_at:runAt,next_run:0,enabled:f.enabled.checked});
    $("routine-dialog").close();
    await refresh(true);
    if(state.settings==='routines'&&$('settings-dialog').open)await settingsRoutines();
    notice("Routine saved.");
  },e.target.querySelector('button[type="submit"]'));
};
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("app").classList.add("sidebar-open");
    $("search").focus();
  }
});
matchMedia("(prefers-color-scheme:dark)").addEventListener(
  "change",
  applyGeneral,
);
setInterval(() => {
  if (state.token && !document.hidden) perform(() => refresh());
}, 2500);
setInterval(() => {
  if (state.token && !document.hidden) updateReactions();

}, 1000);
setInterval(() => {
  if (state.token && !document.hidden) refreshPreview();
}, 6000);
if (window.__KINDRED_TOKEN__) {
  state.token = window.__KINDRED_TOKEN__;
  delete window.__KINDRED_TOKEN__;
}
void profilesUI.init(pairCode).then(()=>{if (state.token && !pairCode) perform(connect);});

// Shared conversations and typed mentions.
async function chooseChat(chat) {
  if(state.teaching){notice("Finish teaching before switching conversations.");return;}
  if(state.chat?.id===chat.id){captureUnreadBoundary(chat.id);$('app').classList.remove('sidebar-open');await renderChat(true,'cached');return;}
  dictationUI?.cancel();
  $('details-content').querySelector('.artifact-library')?.remove();
  rememberChatPosition();
  captureUnreadBoundary(chat.id);
  state.screenBotId = chat.shared?chat.participants.find(p=>p.kind==='bot'&&state.bots.some(b=>b.id===p.bot_id))?.bot_id||'':chat.members[0];
  if (!$("computer-panel").hidden) {
    disconnectDesktop();
    if(chat.shared)$("computer-panel").hidden=true;else setTimeout(() => perform(connectDesktop), 0);
  }
  saveDraft();
  state.chat = chat;
  state.bot = state.bots.find((b) => b.id === chat.members[0]) || state.bot;
  restoreDraft();
  state.chatKey = "";
  state.headerKey = "";
  state.panelKey = "";
  $("details-panel").hidden = true;
  $("app").classList.remove("sidebar-open");
  renderSidebar();
  renderHeader();
  await showCachedConversation();
  await refresh(true);
}
function modal(title, cls = "text-dialog") {
  const d = node("dialog", cls),
    head = node("header", "dialog-header");
  head.append(
    node("h2", "", title),
    iconButton("close", "Close", () => d.close()),
  );
  d.setAttribute('aria-label',title);
  d.append(head);
  d.onclose = () => d.remove();
  document.body.append(d);
  d.showModal();
  return d;
}
async function editChat(chat = null) {
  if(chat?.shared||(!chat&&await serverChatsUI.available())){$("new-menu").hidden=true;return serverChatsUI.edit(chat);}
  $("new-menu").hidden = true;
  const d = modal(chat ? "Chat settings" : "New chat", "chat-dialog");
  const f = node("form"),
    name = field("Chat name", chat?.name || "", "input", {
      required: true,
      maxLength: 100,
      placeholder: "The team",
    });
  const description=field("Description",chat?.description||"","textarea",{maxLength:2000,placeholder:"What this chat is for, how updates should look, and who coordinates."});
  description.input.rows=3;
  f.append(
    name.label,description.label,
    node(
      "p",
      "muted small",
      "Choose up to six bots. Address a bot by name or @mention. General messages reach the group; bots can work together.",
    ),
  );
  const members = node("div", "chat-members"),
    selected = new Set(chat?.members || []);
  for (const b of state.bots.filter((b) => !profile(b).archived)) {
    const label = node("label", "member-option"),
      check = node("input");
    check.type = "checkbox";
    check.value = b.id;
    check.checked = selected.has(b.id);
    check.onchange = () => {
      check.checked ? selected.add(b.id) : selected.delete(b.id);
    };
    label.append(
      check,
      buddy(b, 30),
      node("span", "", b.name),
      node("small", "muted", profile(b).label),
    );
    members.append(label);
  }
  const botOnly=settingSwitch("Bot-only conversation",chat?.bot_only===true);
  f.append(members,botOnly.label);
  const save = node(
    "button",
    "primary wide",
    chat ? "Save chat" : "Create chat",
  );
  f.append(save);
  f.onsubmit = (e) => {
    e.preventDefault();
    perform(async () => {
      if (selected.size < 1 || selected.size > 6)
        throw new Error("Choose one to six bots.");
      const c = await api(
        chat ? "/chats/" + chat.id : "/chats",
        chat ? "PUT" : "POST",
        {
          id: chat?.id || "",
          name: name.input.value,
          description: description.input.value,
          bot_only: botOnly.input.checked,
          members: [...selected],
          archived: false,
        },
      );
      d.close();
      await chooseChat(c);
    }, save);
  };
  d.append(f);
  if (chat && !chat.id.startsWith("dm-"))
    d.append(
      button(
        "Archive chat",
        async () => {
          await api("/chats/" + chat.id, "PUT", { ...chat, archived: true });
          state.chat = null;
          d.close();
          await refresh(true);
        },
        "danger-text",
      ),
    );
}
let chatContextMenu,chatContextTrigger;
function closeChatMenu(focus=false){
  chatContextMenu?.remove();chatContextMenu=null;
  chatContextTrigger?.setAttribute('aria-expanded','false');
  if(focus){
    let trigger=chatContextTrigger;
    // Polling rebuilds sidebar entries. Restore focus to the same bot/chat's
    // current control, rather than dropping keyboard users onto the page body.
    if(trigger&&!trigger.isConnected){
      const {sidebarId,sidebarKind}=trigger.dataset,more=trigger.classList.contains('nav-more');
      trigger=[...document.querySelectorAll('button[data-sidebar-id]')].find(n=>n.dataset.sidebarId===sidebarId&&n.dataset.sidebarKind===sidebarKind&&n.classList.contains('nav-more')===more);
    }
    trigger?.focus({preventScroll:true});
  }
  chatContextTrigger=null;
  hidePinPreview();
}
function muteMenuAction(kind,id){
  const until=state.attention.mutes?.[kind+':'+id]||0,muted=until===-1||until>Date.now()/1000;
  const save=async seconds=>{
    state.attention.mutes=await api('/notification-mutes/'+kind+'/'+encodeURIComponent(id),'PUT',{seconds});
    await refresh(true);
  };
  return muted?['Unmute',()=>save(0)]:['Mute conversation',[
    ['For 1 hour',()=>save(3600)],['For 24 hours',()=>save(86400)],['Indefinitely',()=>save(-1)]
  ]];
}
function showConversationMenu(title,trigger,x,y,actions){
  closeChatMenu();chatContextTrigger=trigger;
  trigger.setAttribute('aria-expanded','true');
  const menu=node('div','chat-context-menu');menu.setAttribute('role','menu');menu.setAttribute('aria-label',title);
  for(const [label,action,symbol] of actions){
    const nested=Array.isArray(action);
    const item=button(label,()=>{if(nested){openSubmenu(true);return;}closeChatMenu(true);return action();},'chat-context-item',symbol);
    let submenu;
    function openSubmenu(focus=false){
      for(const other of menu.querySelectorAll('.conversation-submenu'))if(other!==submenu){other.hidden=true;other._trigger?.setAttribute('aria-expanded','false');}
      if(!submenu){
        submenu=node('div','chat-context-menu conversation-submenu');submenu.setAttribute('role','menu');submenu.setAttribute('aria-label',label);submenu._trigger=item;
        for(const [text,fn] of action){const choice=button(text,()=>{closeChatMenu(true);return fn();},'chat-context-item');choice.setAttribute('role','menuitem');choice.tabIndex=-1;submenu.append(choice);}
        menu.append(submenu);
        submenu.addEventListener('keydown',e=>{
          e.stopPropagation();const choices=[...submenu.children],i=choices.indexOf(document.activeElement);
          if(e.key==='ArrowLeft'||e.key==='Escape'){e.preventDefault();submenu.hidden=true;item.setAttribute('aria-expanded','false');item.focus();}
          else if(e.key==='Tab')closeChatMenu(true);
          else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();choices[e.key==='Home'?0:e.key==='End'?choices.length-1:(i+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length].focus();}
        });
      }
      submenu.hidden=false;item.setAttribute('aria-expanded','true');
      const r=item.getBoundingClientRect(),w=submenu.offsetWidth;
      submenu.style.left=Math.max(8,r.right+w+8>innerWidth?r.left-w:r.right)+'px';
      submenu.style.top=Math.max(8,Math.min(r.top,innerHeight-submenu.offsetHeight-8))+'px';
      if(focus)submenu.firstElementChild.focus();
    }
    if(nested){
      item.setAttribute('aria-haspopup','menu');item.setAttribute('aria-expanded','false');item.append(icon('chevron',12));item.classList.add('has-submenu');
      item.addEventListener('pointerenter',()=>openSubmenu());
      item.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();openSubmenu(true);}});
    }else item.addEventListener('pointerenter',()=>{for(const sub of menu.querySelectorAll('.conversation-submenu')){sub.hidden=true;sub._trigger.setAttribute('aria-expanded','false');}});

    item.setAttribute('role','menuitem');item.tabIndex=-1;menu.append(item);
  }
  document.body.append(menu);chatContextMenu=menu;
  menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';
  menu.firstElementChild.focus({preventScroll:true});
  menu.addEventListener('contextmenu',e=>e.preventDefault());
  menu.addEventListener('keydown',e=>{
    const items=[...menu.children].filter(n=>n.matches('button')),i=items.indexOf(document.activeElement);
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeChatMenu(true);}
    else if(e.key==='Tab')closeChatMenu(true);
    else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
  });
}
function showChatMenu(chat,trigger,x,y){
  const current=()=>state.chats.find(c=>c.id===chat.id)||chat,actions=[];
  if(!chat.shared||chat.can_manage)actions.push(['Rename',()=>renameChat(current()),'edit']);
  actions.push(
    [current().pinned?'Unpin':'Pin',async()=>{const c=current();await api('/chats/'+c.id+'/pin','PUT',{pinned:!c.pinned});state.navKey='';await refresh(true);},'pin'],
    muteMenuAction('chat',chat.id),
    ['Chat settings',()=>editChat(current()),'settings'],
    ['Archive chat',async()=>{const fresh=(await api('/chats/'+chat.id+'?limit=1')).chat;await api('/chats/'+chat.id,'PUT',chat.shared?{archived:true}:{...fresh,archived:true});if(state.chat?.id===chat.id)state.chat=null;await refresh(true);}]
  );
  showConversationMenu('Chat actions',trigger,x,y,actions);
}
function showBotMenu(bot,trigger,x,y){
  const current=()=>{
    const b=state.bots.find(b=>b.id===bot.id&&!profile(b).archived);
    if(!b)throw new Error('This bot is no longer available.');
    return b;
  };
  showConversationMenu('Bot actions',trigger,x,y,[
    ['Edit bot',async()=>{const b=current();await chooseBot(b);if(!state.chat&&state.bot?.id===b.id)openDetails('settings');},'edit'],
    [profile(current()).pinned?'Unpin':'Pin',async()=>{const b=current();await api('/bots/'+b.id+'/pin','PUT',{pinned:!profile(b).pinned});state.navKey='';await refresh(true);},'pin'],
    muteMenuAction('bot',bot.id),
    ['Instructions',()=>editBotText(current().id,'instructions')],
    ['Memory',()=>editBotText(current().id,'memory')],
    ['Archive bot',()=>archiveBot(current().id)]
  ]);
}
async function animateBotArchive(id) {
  if(!motionAllowed())return;
  const entries=[...document.querySelectorAll('[data-sidebar-id]')].filter(n=>n.dataset.sidebarId===id).map(n=>n.closest('.nav-entry,.pinned-entry')).filter((n,i,all)=>n&&all.indexOf(n)===i);
  await Promise.all(entries.map(async entry=>{
    let avatar=entry.querySelector('.character');if(!avatar)return;
    entry.inert=true;
    const bounds=avatar.getBoundingClientRect(),stage=node('span','archive-burial');
    stage.style.width=bounds.width+'px';stage.style.height=bounds.height+'px';
    avatar.replaceWith(stage);stage.append(avatar);
    // Illustrated tribute avatars first settle into their underlying bot shape;
    // keep their cached artwork untouched for a later restore.
    if(avatar._character?.tribute){
      const original=avatar,ordinary=character({...avatar._character.p,name:''},bounds.width);
      stage.append(ordinary);
      const out=original.animate([{opacity:1},{opacity:0}],{duration:180,fill:'forwards'});
      const incoming=ordinary.animate([{opacity:0},{opacity:1}],{duration:180});
      await Promise.all([out.finished,incoming.finished].map(p=>p.catch(()=>{})));
      original.remove();out.cancel();avatar=ordinary;
    }
    stage.classList.add('archive-coffin');
    stage.append(node('span','archive-ground'));
    setActivity(avatar,'coffin');
    // After the existing silhouette morph, project a solid lid and six side
    // walls together. Tilting a single SVG plane makes it look like cardboard.
    const ns='http://www.w3.org/2000/svg',mesh=document.createElementNS(ns,'svg');
    mesh.setAttribute('viewBox','0 0 100 110');mesh.classList.add('archive-coffin-solid');mesh.setAttribute('aria-hidden','true');
    const color=getComputedStyle(avatar).getPropertyValue('--bot-fill').trim()||'#7956ff';
    const vertices=[[34,6],[66,6],[80,28],[69,94],[31,94],[20,28]];
    const polygon=(fill,opacity=1)=>{const p=document.createElementNS(ns,'polygon');p.setAttribute('fill',fill);p.setAttribute('opacity',opacity);mesh.append(p);return p;};
    const walls=vertices.map(()=>{const base=polygon(color),shade=polygon('#000',.48);base.setAttribute('stroke','#141820');base.setAttribute('stroke-width','1.5');base.setAttribute('stroke-linejoin','round');return {base,shade};});
    const lid=polygon(color);
    const cross=document.createElementNS(ns,'path');cross.setAttribute('fill','none');cross.setAttribute('stroke','var(--bot-ink)');cross.setAttribute('stroke-width','4');cross.setAttribute('stroke-linecap','round');mesh.append(cross);
    stage.append(mesh);mesh.style.opacity=0;
    const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
    const motion=stage.animate([{opacity:1},{opacity:1}],{duration:2100,fill:'forwards'});
    let frame;
    const draw=()=>{
      const time=Number(motion.currentTime)||0,tilt=smooth((time-620)/650),lower=smooth((time-1530)/570);
      if(time>=560){avatar.style.visibility='hidden';mesh.style.opacity=String(1-smooth((lower-.65)/.35));}
      const az=tilt*Math.PI*.46,ax=tilt*Math.PI*.40;
      const project=([x,y],z=0)=>{
        x-=50;y-=55;const rx=x*Math.cos(az)-y*Math.sin(az),ry=x*Math.sin(az)+y*Math.cos(az);
        const depth=ry*Math.sin(ax)+z*Math.cos(ax),scale=320/(320-depth);
        return [50+rx*scale,55+(ry*Math.cos(ax)-z*Math.sin(ax))*scale+tilt*4+lower*105];
      };
      const top=vertices.map(v=>project(v)),bottom=vertices.map(v=>project(v,-25));
      const points=vs=>vs.map(v=>v.join(',')).join(' ');
      walls.forEach((wall,i)=>{const next=(i+1)%vertices.length,d=points([top[i],top[next],bottom[next],bottom[i]]);wall.base.setAttribute('points',d);wall.shade.setAttribute('points',d);wall.shade.setAttribute('opacity',String(.30+.24*Math.abs(Math.cos(i*Math.PI/3+az))));});
      lid.setAttribute('points',points(top));
      const line=(vs)=>vs.map((v,i)=>(i?'L':'M')+project(v).join(' ')).join('');
      cross.setAttribute('d',line([[50,35],[50,58]])+line([[42,43],[58,43]]));
      if(time<2100&&stage.isConnected)frame=requestAnimationFrame(draw);
    };
    frame=requestAnimationFrame(draw);
    await motion.finished.catch(()=>{});cancelAnimationFrame(frame);
    const height=entry.getBoundingClientRect().height;
    entry.style.overflow='hidden';
    await entry.animate([{height:height+'px',opacity:1},{height:'0px',opacity:0,marginTop:'0px',marginBottom:'0px'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'}).finished.catch(()=>{});
    motion.cancel();avatar.style.visibility='';mesh.remove();setActivity(avatar,'idle',{immediate:true});
  }));
}
async function archiveBot(id){
  if(archivingBots.has(id))return;
  if(state.teaching?.botId===id)throw new Error('Finish teaching before archiving this bot.');
  if(state.allRuns.some(r=>r.bot_id===id&&(active(r)||r.status==='queued')))throw new Error('Wait for or stop this bot’s tasks before archiving.');
  const b=(await api('/bots')).find(b=>b.id===id);
  if(!b)throw new Error('This bot is no longer available.');
  archivingBots.add(id);
  try {
    await api('/bots/'+id,'PUT',{...b,preserve_text:true,profile:{...profile(b),archived:true,pinned:false}});
    await animateBotArchive(id);
    if(state.bot?.id===id){hidePane($('details-panel'));hidePane($('computer-panel'));disconnectDesktop();}
  } finally {archivingBots.delete(id);state.navKey='';}
  await refresh(true);
  notice('Archived. Restore it in Settings → Archived.');
}
function renameChat(chat){
  const d=modal('Rename chat','rename-chat-dialog'),form=node('form'),name=field('Chat name',chat.name,'input',{required:true,maxLength:100});
  const save=node('button','primary wide','Save');form.append(name.label,save);d.append(form);
  form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;perform(async()=>{
    const value=name.input.value.trim();if(!value)throw new Error('Enter a chat name.');
    const fresh=(await api('/chats/'+chat.id+'?limit=1')).chat;
    await api('/chats/'+chat.id,'PUT',chat.shared?{name:value}:{...fresh,name:value});d.close();state.navKey='';state.headerKey='';await refresh(true);
  },save);};name.input.focus();name.input.select();
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.chat-context-menu'))closeChatMenu();});
window.addEventListener('resize',()=>closeChatMenu());
function channelCandidates(extra=state.chat) {
  const source=extra&&!state.chats.some(c=>c.id===extra.id)?[...state.chats,extra]:state.chats;
  const chats=source.filter(c=>!c.archived&&!c.id.startsWith('dm-')&&(!c.shared||c.participants?.some(p=>p.kind==='bot')||c.participants?.length>2));
  const slug=c=>c.name.normalize('NFKC').toLocaleLowerCase().replace(/^#+/,'').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'')||'channel';
  return chats.map(c=>({id:c.id,name:slug(c)+(chats.filter(other=>slug(other)===slug(c)).length>1?'-'+c.id.slice(-8):''),channel:true,chat:c}));
}
function channelTitle(chat) {const c=channelCandidates(chat).find(c=>c.id===chat?.id);return c?'#'+c.name:chat?.name;}
function mentionBadge(bot,interactive=false) {
  const chip = node("span", "mention-badge");
  chip.contentEditable = "false";
  chip.dataset.mention = bot.id;
  chip.dataset.name = bot.name;
  if(bot.channel){chip.dataset.channel=bot.id;chip.append(node('span','channel-symbol','#'),node('span','',bot.name));}
  else chip.append(bot.kind?serverChatsUI.avatar(bot,19):buddy(bot, 19), node("span", "", bot.name));
  const target=bot.channel?bot.chat:state.bots.find(b=>b.id===bot.id||b.id===bot.bot_id);
  if(interactive&&target){
    chip.classList.add('mention-link');chip.tabIndex=0;chip.setAttribute('role','link');chip.setAttribute('aria-label','Open '+(bot.channel?'#':'')+bot.name);
    const open=()=>bot.channel?chooseChat(target):chooseBot(target);
    chip.onclick=e=>{e.stopPropagation();void open();};chip.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();void open();}};
  }
  return chip;
}
function renderMentions(text,interactive=false) {
  const wrap = node("span");
  let rest = text;
  const bots = [...(state.chat?.shared?state.chat.participants:state.bots),...channelCandidates()].sort((a, b) => b.name.length - a.name.length);
  while (rest) {
    let best = null;
    for (const b of bots) {
      const needle = (b.channel?"#":"@") + b.name;
      const at = rest.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
      if (
        at >= 0 && (!at||!/[\p{L}\p{N}_/#@-]/u.test(rest[at-1])) &&
        (!best || at < best.at) &&
        (!rest[at + needle.length] ||
          !/[\p{L}\p{N}_-]/u.test(rest[at + needle.length]))
      )
        best = { at, b, len: needle.length };
    }
    if (!best) {
      wrap.append(document.createTextNode(rest));
      break;
    }
    wrap.append(
      document.createTextNode(rest.slice(0, best.at)),
      mentionBadge(best.b,interactive),
    );
    rest = rest.slice(best.at + best.len);
  }
  return wrap;
}
function mentionCandidates() {
  if(state.chat?.shared)return state.chat.participants.filter(p=>p.id!==state.chat.me);
  return state.bots.filter(
    (b) =>
      !profile(b).archived &&
      (!state.chat || state.chat.members.includes(b.id)),
  );
}
function updateMentions() {
  const list = $("mention-options"),
    sel = getSelection();
  list.replaceChildren();
  list.dataset.selected=0;
  list.hidden = true;
  if (
    !sel?.rangeCount ||
    !$("prompt").contains(sel.anchorNode) ||
    sel.anchorNode.nodeType !== Node.TEXT_NODE
  )
    return;
  const text = sel.anchorNode.textContent.slice(0, sel.anchorOffset),
    match = text.match(/(?:^|\s)([@#])([^@#\n]{0,80})$/);
  if (!match) return;
  const query = match[2].toLocaleLowerCase(),
    candidates = (match[1]==='#'?channelCandidates():mentionCandidates()).filter((b) =>
      b.name.toLocaleLowerCase().startsWith(query),
    );
  const exact = candidates.filter((b) => b.name.toLocaleLowerCase() === query);
  const range = sel.getRangeAt(0).cloneRange();
  range.setStart(sel.anchorNode, sel.anchorOffset - query.length - 1);
  const insert = (b) => {
    range.deleteContents();
    const chip = mentionBadge(b),
      space = document.createTextNode("\u00a0");
    range.insertNode(space);
    range.insertNode(chip);
    const end = document.createRange();
    end.setStartAfter(space);
    end.collapse(true);
    sel.removeAllRanges();
    sel.addRange(end);
    list.hidden = true;
    $("prompt").focus();
  };
  if (exact.length === 1 && match[1]==='@') {
    insert(exact[0]);
    return;
  }
  for (const b of candidates.slice(0, 6)) {
    const item = button("", () => insert(b), "mention-option");
    item.onmousedown = (e) => e.preventDefault();
    item.append(b.channel?node('span','channel-symbol','#'):b.kind?serverChatsUI.avatar(b,24):buddy(b, 24), node("span", "", b.name));
    if(!list.children.length)item.classList.add('selected');
    list.append(item);
  }
  list.hidden = !list.children.length;
}
const questionDrafts=new Map(),questionPending=new Set();
let questionFocus=null;

const planningPending=new Set();
const planningWorkBusy=new Set(),planningWorkRequests=new Map();
function planningFeedback(){const feedback=node('p','run-error small');feedback.setAttribute('role','alert');feedback.hidden=true;return feedback;}
function planningError(message,feedback){
  if(feedback?.closest('dialog[open],.artifact-library')){feedback.textContent=message;feedback.hidden=false;}
  else notice(message,true);
}
async function planningPatch(kind,record,patch,feedback){
  if(planningPending.has(record.id))return null;
  if(feedback)feedback.hidden=true;
  planningPending.add(record.id);let saved=null;
  try{
    saved=await api(`/chats/${encodeURIComponent(record.chat_id)}/${kind}/${encodeURIComponent(record.id)}`,'PATCH',{expected_revision:record.revision,...patch});
  }catch(e){planningError(e.message,feedback);}
  finally{planningPending.delete(record.id);}
  if(saved)document.querySelector('.artifact-library-record[data-artifact-id="'+CSS.escape(saved.id)+'"] .artifact-record-body')?.dispatchEvent(new CustomEvent('kindred-planning-saved',{detail:saved}));
  // A confirmed save remains successful even if refreshing the conversation fails.
  state.chatKey='';
  try{await renderChat(true);}
  catch(e){
    if(saved)notice('Saved, but the conversation could not refresh. '+e.message,true);
    try{await renderChat(true,'cached');}catch{/* Preserve the save result and its notice. */}
  }
  return saved;
}
function planningSources(sources){
  const refs=node('div','planning-sources');
  for(const source of sources||[]){
    let url;try{url=new URL(source.url);}catch{continue;}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)continue;
    const a=node('a','',source.title);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';refs.append(a);
  }
  return refs;
}
async function workOnChecklistItem(list,item,feedback){
  const key=list.id+':'+item.id;if(planningWorkBusy.has(key))return;
  planningWorkBusy.add(key);let confirmed=false;
  try{
    const saved=await planningPatch('checklists',list,{item_id:item.id,state:'current'},feedback);if(!saved)return;
    let payload=planningWorkRequests.get(key);
    if(!payload){payload={prompt:`Let's work on “${item.title}” from “${list.title}”. Read the current saved checklist and its source context, then help me carry out this item. Keep the checklist updated as we go.`,mentions:(state.chats.find(c=>c.id===list.chat_id)?.members||[]).includes(list.bot_id)?[list.bot_id]:[],request_id:crypto.randomUUID()};planningWorkRequests.set(key,payload);}
    await api('/chats/'+encodeURIComponent(list.chat_id)+'/messages','POST',payload);confirmed=true;planningWorkRequests.delete(key);
    await refresh();
  }catch(error){planningError(confirmed?'Work request sent. The conversation could not refresh: '+error.message:'Focus saved, but the work request could not be confirmed. Retry Work on this to check the same request. '+error.message,feedback);}
  finally{planningWorkBusy.delete(key);state.chatKey='';await renderChat(true,'cached');}
}
function checklistCard(list){
  const card=node('section','planning-card checklist-card');card.dataset.list=list.id;
  card.setAttribute('aria-label',list.title);
  const heading=node('div','planning-heading'),summary=node('div');
  summary.append(node('h3','',list.title),node('span','muted small',`${list.items.filter(i=>i.state==='done').length} of ${list.items.length} done${list.local_date?' · '+list.local_date:''}${list.archived?' · Archived':''}`));
  heading.append(summary,button('Edit',()=>editChecklist(list),'subtle-button small-button'));card.append(heading);
  const rows=node('ol','checklist-items'),feedback=planningFeedback();
  for(const item of list.items){
    const row=node('li','checklist-item '+item.state),label=node('label','checklist-label'),check=node('input');
    check.type='checkbox';check.checked=item.state==='done';check.disabled=!!list.archived||planningPending.has(list.id);check.setAttribute('aria-label','Mark '+item.title+' done');
    check.onchange=async()=>{
      check.disabled=true;
      const saved=await planningPatch('checklists',list,{item_id:item.id,state:check.checked?'done':'pending'},feedback);
      check.checked=(saved?.items?.find(i=>i.id===item.id)||item).state==='done';
      check.disabled=!!list.archived||planningPending.has(list.id);
    };
    const content=node('div','checklist-content');label.append(check,node('span','',item.title));content.append(label);
    const meta=node('div','checklist-meta');meta.append(node('span','muted small',item.owner==='bot'?'Bot task':'Your task'));
    if(item.state==='current')content.append(node('span','current-label','Current'));
    if(item.details||item.sources?.length){
      const details=node('details','checklist-description'),toggle=node('summary','','See more');
      details.append(toggle,meta);
      if(item.details)details.append(node('p','muted small',item.details));
      if(item.sources?.length)details.append(planningSources(item.sources));
      details.ontoggle=()=>{toggle.textContent=details.open?'See less':'See more';};
      content.append(details);
    }
    row.append(content);
    if(!list.archived&&item.state!=='done'){
      const actions=node('div','checklist-actions');
      const work=button('Work on this',()=>workOnChecklistItem(list,item,feedback),'subtle-button small-button');work.disabled=planningWorkBusy.has(list.id+':'+item.id);actions.append(work);
      row.append(actions);
    }
    rows.append(row);
  }
  card.append(rows,feedback);
  if(!list.items.length)card.append(node('p','muted','No items yet. Use Edit to add one.'));
  return decisionReceipt(card,{key:'checklist:'+list.id,title:list.title,outcome:list.archived?'Archived':'Completed',terminal:!!list.archived||(list.items.length>0&&list.items.every(item=>item.state==='done'))});
}
function editChecklist(list){
  const d=modal('Edit checklist','planning-dialog checklist-edit-dialog'),form=node('form','planning-form'),title=field('List title',list.title,'input',{required:true,maxLength:200});
  const rows=node('div','planning-edit-items');let items=structuredClone(list.items);
  const render=()=>{
    rows.replaceChildren();
    items.forEach((item,index)=>{
      const row=node('div','planning-edit-item'),name=field('Item '+(index+1),item.title,'input',{required:true,maxLength:500});
      name.input.oninput=()=>item.title=name.input.value;row.append(name.label);
      const controls=node('div','planning-edit-controls');
      if(index>0)controls.append(iconButton('chevronUp','Move up',()=>{[items[index-1],items[index]]=[items[index],items[index-1]];render();}));
      if(index<items.length-1)controls.append(iconButton('chevronDown','Move down',()=>{[items[index+1],items[index]]=[items[index],items[index+1]];render();}));
      controls.append(iconButton('trash','Remove item '+(index+1),()=>{items.splice(index,1);render();}));row.append(controls);rows.append(row);
    });
  };
  render();
  const add=button('Add item',()=>{items.push({title:'',state:'pending',owner:'user',sources:[]});render();rows.lastElementChild?.querySelector('input')?.focus();},'outline-button');
  const archived=node('input');archived.type='checkbox';archived.checked=!!list.archived;const archiveLabel=node('label','planning-archive');archiveLabel.append(archived,document.createTextNode('Archive this list'));
  const save=button('Save',()=>{},'primary');save.onclick=null;save.type='submit';
  const feedback=planningFeedback(),footer=node('div','checklist-edit-footer');footer.append(button('Cancel',()=>d.close(),'subtle-button'),save);form.append(title.label,rows,add,archiveLabel,feedback,footer);d.append(form);
  form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;save.disabled=true;const saved=await planningPatch('checklists',list,{title:title.input.value,items,archived:archived.checked},feedback);if(saved)d.close();else save.disabled=false;};
}
function reminderWhen(reminder){
  return new Date(reminder.run_at*1000).toLocaleString([],{timeZone:reminder.timezone,dateStyle:'medium',timeStyle:'short'})+' · '+reminder.timezone;
}
function reminderCard(reminder,delivered=false){
  const card=node('section','planning-card reminder-card'),feedback=planningFeedback();card.dataset.reminder=reminder.id;
  const heading=node('div','planning-heading');heading.append(node('h3','',delivered?'Reminder':reminder.status==='pending'?'Reminder set':`Reminder ${reminder.status}`));
  if(!delivered&&reminder.status!=='delivered'){
    heading.append(button('Edit',()=>editReminder(reminder),'subtle-button small-button'));
    if(reminder.status!=='cancelled')heading.append(button('Cancel',()=>planningPatch('reminders',reminder,{cancel:true},feedback),'subtle-button small-button'));
  }
  card.append(heading,node('p','reminder-message',reminder.message),node('p','muted small',reminderWhen(reminder)));
  if(delivered&&reminder.delivered_at-reminder.run_at>60)card.append(node('p','muted small','Delivered after its scheduled time when the server and conversation were available.'));
  if(reminder.status==='paused')card.append(node('p','muted small','Paused after transfer. Edit to choose a future delivery time.'));
  if(reminder.status==='pending')card.append(node('p','muted small','Appears here once. Desktop alerts follow your notification settings while the app is connected.'));
  card.append(planningSources(reminder.sources),feedback);return card;
}
function editReminder(reminder){
  const d=modal('Edit reminder','planning-dialog'),form=node('form','planning-form');
  const message=field('Reminder',reminder.message,'textarea',{required:true,maxLength:2000}),time=field('Date and time',reminder.local_time,'input',{type:'datetime-local',required:true}),zone=field('Time zone',reminder.timezone,'input',{required:true});
  const save=button('Save',()=>{},'primary');save.onclick=null;save.type='submit';
  const feedback=planningFeedback();form.append(message.label,time.label,zone.label,feedback,save);d.append(form);
  form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;save.disabled=true;const saved=await planningPatch('reminders',reminder,{message:message.input.value,local_time:time.input.value,timezone:zone.input.value},feedback);if(saved)d.close();else save.disabled=false;};
}
async function openArtifacts(){
  const bot=state.bot;if(!bot)return;state.view='artifacts';state.panelKey='';
  showPane($('details-panel'));hidePane($('computer-panel'));disconnectDesktop();
  $('details-title').textContent='Artifacts';$('details-back').hidden=false;$('bot-settings').hidden=true;
  const root=node('section','artifact-library'),intro=node('p','muted','Files, shards, hosted artifacts, lists and reminders saved by '+bot.name+'. Ask in chat to create or update them.'),toolbar=node('div','artifact-library-toolbar');
  const kind=select([['','All artifacts'],['file','Files'],['snippet','Shards'],['visual','Shopping, finance & charts'],['checklist','Lists'],['reminder','Reminders'],['workspace','Hosted artifacts']],'');kind.setAttribute('aria-label','Artifact type');
  const feedback=node('p','muted'),content=node('div','artifact-library-records'),pages=node('div','artifact-library-pages');feedback.setAttribute('role','status');
  const reloadButton=iconButton('refresh','Refresh artifacts',()=>load(cursor));toolbar.append(kind,reloadButton);root.append(intro,toolbar,feedback,content,pages);$('details-content').replaceChildren(root);
  let cursor='',previous=[],generation=0;
  const current=()=>root.isConnected&&state.view==='artifacts'&&state.bot?.id===bot.id;
  async function load(before){
    const version=++generation;feedback.textContent='Loading artifacts…';content.setAttribute('aria-busy','true');reloadButton.disabled=true;
    // Drop previous records and any running iframe instead of accumulating pages.
    content.replaceChildren();pages.replaceChildren();
    try{
      const data=await api('/bots/'+encodeURIComponent(bot.id)+'/artifacts?kind='+encodeURIComponent(kind.value)+'&before='+encodeURIComponent(before));if(!current()||version!==generation)return;
      cursor=before;feedback.textContent=data.items.length?'':'No saved artifacts yet.';
      for(const item of data.items){
        const row=node('details','artifact-library-record'),summary=node('summary'),label=node('span','artifact-record-title',item.title),meta=node('span','muted small',({file:'File',checklist:'List',reminder:'Reminder'}[item.kind]||'Artifact')+(item.status?' · '+item.status:'')+' · '+new Date(item.created*1000).toLocaleDateString()),body=node('div','artifact-record-body');summary.append(label,meta);row.append(summary,body);content.append(row);let expansion=0;
        row.dataset.artifactId=item.id;
        body.addEventListener('kindred-planning-saved',event=>{const record=event.detail;if(record.id!==item.id)return;label.textContent=record.title||record.message;body.replaceChildren(item.kind==='checklist'?checklistCard(record):reminderCard(record));});
        row.addEventListener('toggle',async()=>{
          const attempt=++expansion;body.replaceChildren();if(!row.open)return;
          // Keep one expanded record, including one running preview, at a time.
          for(const other of content.children)if(other!==row)other.open=false;
          if(item.kind==='file'){renderAttachments(body,[{...item,name:item.title}]);return;}
          body.append(node('p','muted','Loading saved record…'));
          try{const record=await api('/bots/'+encodeURIComponent(bot.id)+'/artifacts/'+encodeURIComponent(item.kind)+'/'+encodeURIComponent(item.id));if(!current()||!row.isConnected||!row.open||attempt!==expansion)return;
            if(item.kind==='snippet'){body.replaceChildren();for(const [i,snippet] of (record.snippets||[]).entries())body.append(snippet.error?node('p','muted',snippet.error):inlineShard(snippet.source,snippet.language,(snippet.language==='html'?'HTML':'React')+' shard '+(i+1)));if(!body.children.length)body.append(node('p','muted','No complete shard is available in this message.'));}
            else body.replaceChildren(item.kind==='workspace'?workspaceArtifactCard(record,{api,markdown,baseUrl:state.status.public_url||location.origin}):item.kind==='visual'?visualPanel(record):item.kind==='checklist'?checklistCard(record):reminderCard(record));}
          catch(e){if(row.isConnected&&row.open&&attempt===expansion)body.replaceChildren(node('p','run-error',e.message),button('Retry',()=>{row.open=false;queueMicrotask(()=>row.open=true);},'outline-button small-button'));}
        });
      }
      if(previous.length)pages.append(button('Previous',()=>{const before=previous.pop();void load(before);},'outline-button small-button'));
      if(data.next_cursor)pages.append(button('Next',()=>{previous.push(cursor);void load(data.next_cursor);},'outline-button small-button'));
    }catch(e){if(current()&&version===generation){feedback.textContent=e.message;pages.append(button('Retry',()=>load(before),'outline-button small-button'));}}
    finally{if(current()&&version===generation){content.setAttribute('aria-busy','false');reloadButton.disabled=false;}}
  }
  kind.onchange=()=>{previous=[];void load('');};await load('');
}

function questionCard(q){
  const card=node('section','question-card');card.dataset.questionId=q.id;card.tabIndex=-1;card.setAttribute('aria-label',q.question);
  if(q.context){const context=markdown(q.context);context.className='question-context';card.append(context);}
  const title=node('strong','question-title',q.question);card.append(title);
  if(q.status!=='pending'){
    const receipt=node('div','question-receipt');
    if(q.status==='answered'){
      if(q.selected!==null && q.selected!==undefined)receipt.append(node('span','question-letter',String.fromCharCode(65+q.selected)));
      receipt.append(node('span','',q.answer),icon('check',16));
    }else receipt.append(node('span','muted','This question was cancelled.'));
    card.append(receipt);return decisionReceipt(card,{key:'question:'+q.id,title:q.question,outcome:q.status==='answered'?'Answered':'Cancelled',terminal:true});
  }
  const choices=node('div','question-choices');
  const submit=async body=>{
    if(questionPending.has(q.id))return;questionPending.add(q.id);card.setAttribute('aria-busy','true');for(const control of card.querySelectorAll('button,textarea'))control.disabled=true;
    try{
      const saved=await api(q.shared_seq?'/server-chats/'+q.chat_id+'/questions/'+q.shared_seq+'/answer':'/questions/'+q.id+'/answer','POST',body);questionDrafts.delete(q.id);
      for(const entry of chatHistory.values())for(const m of entry.messages)if(m.question?.id===q.id)m.question=saved;
      await refresh(true);
    }finally{questionPending.delete(q.id);state.chatKey='';await renderChat(true,'cached');}
  };
  q.options.forEach((label,i)=>{
    const option=button('',()=>submit({selected:i}),'question-option');option.dataset.questionFocus='option-'+i;
    option.append(node('span','question-letter',String.fromCharCode(65+i)),node('span','',label));choices.append(option);
  });
  const custom=button('Write my own response',()=>{
    questionDrafts.set(q.id,questionDrafts.get(q.id)||'');form.hidden=false;custom.hidden=true;input.focus();
  },'question-custom');custom.dataset.questionFocus='custom';
  const form=node('form','question-response'),input=node('textarea');input.rows=2;input.maxLength=4000;input.required=true;input.placeholder='Your response…';input.setAttribute('aria-label','Your response');input.dataset.questionFocus='input';input.value=questionDrafts.get(q.id)||'';
  input.addEventListener('input',()=>questionDrafts.set(q.id,input.value));
  const send=node('button','primary','Send response');send.type='submit';send.dataset.questionFocus='send';form.append(input,send);form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;perform(()=>submit({custom:input.value.trim()}),send);};
  form.hidden=!questionDrafts.has(q.id);custom.hidden=!form.hidden;card.append(choices,custom,form);
  if(questionPending.has(q.id)){card.setAttribute('aria-busy','true');for(const control of card.querySelectorAll('button,textarea'))control.disabled=true;}
  return decisionReceipt(card,{key:'question:'+q.id,title:q.question,terminal:false});
}
function messageTools(run, events, includeTaskCards=true) {
  const block = node("div");
  const tools = events.filter(
    (e) =>
      ["tool_requested", "tool_result", "approval", "handoff"].includes(
        e.kind,
      ) && e.body.tool !== "react_to_message",
  );
  if (state.general.show_activity === true && tools.some((e) => e.kind === "tool_requested")) {
    const details = node("details", "activity");
    details.open = state.openActivity.has(run.id);
    details.append(node("summary", "", "View activity"));
    const body = node("div", "activity-body");
    for (const e of tools) {
      const row = node("div", "activity-event");
      row.append(
        node("strong", "", connectorActivityLabel(e.body) || e.body.tool || e.kind.replaceAll("_", " ")),
        node(
          "pre",
          "",
          e.body.args
            ? JSON.stringify(e.body.args, null, 2)
            : e.body.text || JSON.stringify(e.body, null, 2),
        ),
      );
      body.append(row);
    }
    details.append(body);
    details.ontoggle = () =>
      details.open
        ? state.openActivity.add(run.id)
        : state.openActivity.delete(run.id);
    block.append(details);
  }
  if(includeTaskCards)block.append(taskCards(run));
  return block;
}
function currentConversationId(){return state.chat?.id || `dm-${state.bot?.id}`;}
const readReceipts=new Map(),readRequests=new Map();let readReceiptTimer;
const unreadBoundaries=new Map();
function captureUnreadBoundary(id){
  conversationHistory(id).openingAttention=true;
  const attention=state.attention.chats[id];
  if(attention?.unread){const previous=unreadBoundaries.get(id);if(previous?.through===attention.cursor&&previous.after===(attention.read_cursor||0)&&previous.first===attention.first_unread_seq)return;unreadBoundaries.set(id,{after:attention.read_cursor||0,through:attention.cursor,seenAt:0,positioned:false,first:attention.first_unread_seq,fetched:false});}
  else unreadBoundaries.delete(id);
}
const unreadObserver=new IntersectionObserver(entries=>{
  for(const item of entries){if(!item.isIntersecting)continue;
    const boundary=unreadBoundaries.get(item.target.dataset.chat);
    if(boundary&&!boundary.seenAt){
      boundary.seenAt=Date.now();const id=item.target.dataset.chat;
      setTimeout(()=>{if(unreadBoundaries.get(id)!==boundary)return;unreadBoundaries.delete(id);if(currentConversationId()===id)void renderChat(true,'cached');},motionAllowed()?7800:0);
    }
    if(boundary)item.target.style.animationDelay=Math.max(0,6000-(Date.now()-boundary.seenAt))+'ms';
    item.target.classList.add('is-seen');unreadObserver.unobserve(item.target);
  }
},{root:$('content'),threshold:1});

function acceptAttention(attention){
  state.attention=attention;
  for(const [id,value] of Object.entries(attention.chats)){
    value.read_cursor=Math.max(value.read_cursor||0,readReceipts.get(id)||0);
    value.unread=value.cursor>value.read_cursor;
  }
}
function addUnreadDot(control,id){
  if(!state.attention.chats[id]?.unread)return;
  const dot=node('span','unread-dot');dot.setAttribute('role','img');dot.setAttribute('aria-label','Unread activity');dot.title='Unread activity';if(control.classList.contains('pinned-bot'))control.prepend(dot);else control.append(dot);
}
function scheduleReadReceipt(){clearTimeout(readReceiptTimer);readReceiptTimer=setTimeout(markVisibleConversationRead,300);}
async function markVisibleConversationRead(){
  const id=currentConversationId(),attention=state.attention.chats[id],entry=chatHistory.get(id),content=$('content');
  if(chatOpening||!attention?.unread||readRequests.has(id)||document.hidden||!document.hasFocus()||document.querySelector('dialog[open]')||!chatScroll.follow||!entry?.loaded||entry.openingAttention||entry.hasAfter||state.renderedChatId!==id)return;
  if(!$('computer-panel').hidden&&$('computer-panel').classList.contains('expanded'))return;
  if(!entry.messages.some(m=>m.seq===attention.latest_message_seq))return;
  const bounds=content.getBoundingClientRect();if(!bounds.width||!bounds.height||content.scrollHeight-content.scrollTop-content.clientHeight>80)return;
  // The floating composer overlaps the bottom of #content. Test the exposed
  // reading area, not the composer, when deciding whether history is obscured.
  const x=bounds.left+bounds.width/2,composer=$('composer-area').getBoundingClientRect();
  const bottom=x>=composer.left&&x<=composer.right?Math.min(bounds.bottom,composer.top):bounds.bottom;
  const y=Math.min(innerHeight-1,bottom-12);
  if(y<=Math.max(0,bounds.top))return;
  const visible=document.elementFromPoint(x,y);
  if(!visible||!content.contains(visible))return;
  const cursor=attention.cursor;readRequests.set(id,cursor);
  try{
    const result=await api('/chats/'+encodeURIComponent(id)+'/read','PUT',{cursor});
    readReceipts.set(id,Math.max(readReceipts.get(id)||0,result.read_cursor));
    const current=state.attention.chats[id];
    if(current){current.read_cursor=Math.max(current.read_cursor,result.read_cursor);if(result.cursor>current.cursor){current.cursor=result.cursor;current.latest_message_seq=result.latest_message_seq;}current.unread=current.cursor>current.read_cursor;}
    renderSidebar();
  }catch{/* Keep the dot until a later visible refresh can save the receipt. */}
  finally{readRequests.delete(id);}
}
window.addEventListener('focus',scheduleReadReceipt);
document.addEventListener('visibilitychange',scheduleReadReceipt);
$('content').addEventListener('scroll',scheduleReadReceipt,{passive:true});
function conversationHistory(id){
  let entry=chatHistory.get(id);
  if(!entry)entry={id,messages:[],loaded:false,hasBefore:false,hasAfter:false,pending:null,scroll:null,error:null};
  chatHistory.delete(id);chatHistory.set(id,entry);
  while(chatHistory.size>CHAT_CACHE_SIZE)chatHistory.delete(chatHistory.keys().next().value);
  return entry;
}
function rememberChatPosition(){
  if(chatOpening)return;
  if(chatScroll.view!==state.renderedChatId)return;
  if(!chatScroll.rendering)captureChatAnchor();
  const entry=chatHistory.get(chatScroll.view);
  if(entry)entry.scroll={follow:chatScroll.follow,anchor:chatScroll.anchor,top:chatScroll.top};
}
async function showCachedConversation(){
  const id=currentConversationId(),entry=chatHistory.get(id),boundary=unreadBoundaries.get(id);
  if(cachedConversationReady(entry,boundary)){
    if(chatOpening)showConversationOpening(id);
    return renderChat(true,'cached');
  }
  showConversationOpening(id);
}
function cachedConversationReady(entry,boundary=unreadBoundaries.get(entry?.id)){
  return entry?.ready&&(!entry.hasBefore||entry.messages.length>=CHAT_PAGE_SIZE)&&(!boundary?.first||entry.messages.some(m=>m.seq===boundary.first));
}
function showConversationOpening(id){
  if(currentConversationId()!==id||chatOpening?.id===id)return;
  $('chat-loading')?.remove();
  const area=$('content'),loading=node('div','chat-loading'),face=character(portrait(state.bot),42);
  loading.id='chat-loading';loading.setAttribute('role','status');loading.setAttribute('aria-live','polite');
  setActivity(face,'working',{immediate:true});
  loading.append(face,node('span','','Loading conversation…'));
  chatOpening={id,loading};chatResize.disconnect();cancelAnimationFrame(chatScroll.frame);chatScroll.frame=0;
  area.replaceChildren();releaseScreenshotUrls();
  area.inert=true;area.setAttribute('aria-busy','true');area.parentElement.classList.add('is-loading');area.after(loading);
}
function finishConversationOpening(id){
  if(!chatOpening||!chatOpening.ready||chatOpening.id!==id||currentConversationId()!==id||state.renderedChatId!==id||chatOpening.failed)return;
  clearConversationOpening();scheduleReadReceipt();
}
function clearConversationOpening(){
  if(!chatOpening)return;
  chatOpening.loading.remove();chatOpening=null;
  const area=$('content');area.inert=false;area.removeAttribute('aria-busy');area.parentElement.classList.remove('is-loading');
}
function failConversationOpening(id,error){
  if(!chatOpening||chatOpening.id!==id||currentConversationId()!==id||chatOpening.failed)return;
  chatOpening.failed=true;const loading=chatOpening.loading;
  loading.classList.add('is-error');loading.replaceChildren(node('span','','Could not load conversation.'),node('span','small',error.message||'Please try again.'),button('Retry',async()=>{
    if(currentConversationId()!==id)return;
    chatOpening=null;showConversationOpening(id);state.chatKey='';await refresh(true);
  },'subtle-button'));
  $('content').setAttribute('aria-busy','false');
}
function messagePage(entry,query={}){
  return api('/chats/'+entry.id+'?'+new URLSearchParams({limit:CHAT_PAGE_SIZE,...query}));
}
function acceptHistoryPage(entry,data){
  entry.pendingWaits=data.pending_waits||[];entry.commands=data.commands||[];entry.sharedWorkers=data.workers||[];
  entry.messages=data.messages.slice(-CHAT_WINDOW_SIZE);entry.loaded=true;
  entry.hasBefore=!!data.page?.has_before;entry.hasAfter=!!data.page?.has_after;entry.error=null;entry.wantLatest=false;
}
async function syncChatHistory(entry){
  if(entry.pending){await entry.pending;return;}
  const query={limit:Math.max(CHAT_PAGE_SIZE,entry.messages.length)};
  if(entry.loaded && entry.messages.length && !(chatScroll.follow && (!entry.hasAfter || entry.wantLatest))){
    query.after=entry.messages[0].seq;query.inclusive=true;
    if(entry.hasAfter)query.before=entry.messages.at(-1).seq;
    else query.limit=CHAT_WINDOW_SIZE;
  }
  const boundary=unreadBoundaries.get(entry.id),opening=boundary&&!boundary.fetched;
  if(opening){delete query.before;query.after=boundary.first||boundary.after;query.inclusive=!!boundary.first;query.limit=CHAT_PAGE_SIZE;}
  entry.pending=(async()=>{
    const data=await messagePage(entry,query);
    if(opening)boundary.fetched=true;
    entry.pendingWaits=data.pending_waits||[];entry.commands=data.commands||[];
    // A reading gesture during a tail refresh takes precedence over removing its anchor.
    const anchor=chatScroll.view===entry.id && !chatScroll.follow && chatScroll.anchor?.key;
    if(!opening && anchor && entry.messages.some(m=>String(m.seq)===anchor) && !data.messages.some(m=>String(m.seq)===anchor)){
      entry.hasAfter=true;return;
    }
    // Refreshing visible messages must not dismiss a failed page's Retry action.
    // Only an explicit retry or navigation to a different range resolves it.
    const pageError=!opening&&!entry.wantLatest?entry.error:null;
    acceptHistoryPage(entry,data);
    if(pageError&&(pageError.direction==='older'?entry.hasBefore:entry.hasAfter))entry.error=pageError;
    // Opening on the latest unread item can return only one message. Include
    // the preceding page before exposing the conversation and its scroll area.
    if((opening||!entry.ready||chatOpening?.id===entry.id)&&entry.hasBefore&&entry.messages.length<CHAT_PAGE_SIZE&&entry.messages.length){
      const older=await messagePage(entry,{before:entry.messages[0].seq,limit:CHAT_PAGE_SIZE-entry.messages.length});
      entry.messages=[...older.messages,...entry.messages].filter((m,i,all)=>all.findIndex(other=>other.seq===m.seq)===i);
      entry.hasBefore=!!older.page?.has_before;
    }
  })();
  try{await entry.pending;}finally{entry.pending=null;}
}
async function loadHistoryPage(direction,fromScroll=false){
  const id=currentConversationId(),entry=chatHistory.get(id);
  if(!entry?.loaded)return;
  // A reader can reach an edge while the background refresh is in flight.
  // Keep that request instead of requiring another scroll after it finishes.
  if(entry.pending){
    try{await entry.pending;}catch{return;}
    if(currentConversationId()!==id||chatHistory.get(id)!==entry||entry.pending||(fromScroll&&entry.error))return;
    const area=$('content');
    if(fromScroll&&(direction==='older'?area.scrollTop>=180:area.scrollHeight-area.scrollTop-area.clientHeight>=180))return;
  }
  if(!(direction==='older'?entry.hasBefore:entry.hasAfter))return;
  if(direction==='older')chatScroll.follow=false;
  captureChatAnchor();entry.error=null;
  const query=direction==='older'?{before:entry.messages[0].seq}:{after:entry.messages.at(-1).seq};
  const control=$('content').querySelector('[data-history="'+direction+'"]');
  if(control){control.textContent='Loading messages…';control.disabled=true;}
  entry.pending=(async()=>{
    const data=await messagePage(entry,query),merged=[...new Map([...entry.messages,...data.messages].map(m=>[m.seq,m])).values()].sort((a,b)=>a.created-b.created || (a.history_order && b.history_order ? a.history_order.localeCompare(b.history_order) : a.seq-b.seq));
    let start=direction==='older'?0:Math.max(0,merged.length-CHAT_WINDOW_SIZE);
    const anchor=chatScroll.view===id && !chatScroll.follow && chatScroll.anchor?.key;
    const index=anchor?merged.findIndex(m=>String(m.seq)===anchor):-1;
    if(index>=0 && (index<start || index>=start+CHAT_WINDOW_SIZE))start=Math.max(0,Math.min(index-25,merged.length-CHAT_WINDOW_SIZE));
    const previousBefore=entry.hasBefore,previousAfter=entry.hasAfter;
    entry.messages=merged.slice(start,start+CHAT_WINDOW_SIZE);
    entry.hasBefore=start>0 || (direction==='older'?!!data.page?.has_before:previousBefore);
    entry.hasAfter=start+CHAT_WINDOW_SIZE<merged.length || (direction==='newer'?!!data.page?.has_after:previousAfter);
  })();
  try{await entry.pending;}catch(error){entry.error={direction,message:error.message};}
  finally{entry.pending=null;}
  if(currentConversationId()===id)await renderChat(true,'page');
}
function historyEdge(entry,direction){
  const failed=entry.error?.direction===direction;
  const b=button(failed?'Could not load messages · Retry':direction==='older'?'Earlier messages':'Newer messages',()=>loadHistoryPage(direction),'history-edge');
  b.dataset.history=direction;if(failed)b.title=entry.error.message;return b;
}
function positionNotice(){
  const composer=$('composer-area'),top=composer?.getBoundingClientRect().top;
  $('notice').style.bottom=Number.isFinite(top)&&!composer.hidden&&top>0?`${Math.max(25,innerHeight-top+10)}px`:'25px';
}
const noticeLayout=new ResizeObserver(positionNotice);noticeLayout.observe($('composer-area'));
window.addEventListener('resize',positionNotice);
function connectorBatches(messages,_boundary,runs=[]){
  const batches=new Map();let batch=[];
  const flush=()=>{if(batch.length>2)batches.set(batch[0].seq,batch);batch=[];};
  for(const m of messages){
    const previous=batch.at(-1);
    // Quiet routine completions are invisible, so they do not divide receipts.
    if(m.kind==='continuation'||!m.text?.trim()||(hiddenCompletionMessage(m)&&!runs.find(r=>r.id===m.run_id)?.error))continue;
    if(!['completed','preparing','approved','ready','executing'].includes(m.connector_artifact?.status)){flush();continue;}
    // Consecutive calls belong together even across scheduled runs and long gaps.
    if(previous&&previous.sender!==m.sender)flush();
    batch.push(m);
  }
  flush();return batches;
}
function connectorMessage(m,id){
  const group=node('article','message-group connector-message');group.dataset.message=String(m.seq);group.tabIndex=-1;
  const receipt=connectorCard(m.connector_artifact,{heading:connectorHeading,button,api,onChange:async()=>{await refresh(true);},onDiscuss:()=>startMessageReply(id,m),botName:state.bots.find(b=>b.id===m.connector_artifact.bot_id)?.name,
    sanitizeHtml:text=>{const fragment=DOMPurify.sanitize(text,{RETURN_DOM_FRAGMENT:true,ALLOWED_TAGS:['p','br','div','span','strong','em','b','i','u','ul','ol','li','blockquote','table','thead','tbody','tr','td','th','a'],ALLOWED_ATTR:['href','title']});for(const a of fragment.querySelectorAll('a')){try{const url=new URL(a.getAttribute('href'));if(!['https:','http:','mailto:'].includes(url.protocol)||url.username||url.password)a.removeAttribute('href');else{a.target='_blank';a.rel='noopener noreferrer';}}catch{a.removeAttribute('href');}}return fragment;}});
  const card=m.connector_artifact;
  // Only requests for a user decision expand automatically; execution receipts
  // occupy a single line until the person asks to inspect them.
  if(['pending','changes_requested'].includes(card.status)){group.append(receipt);return group;}
  const disclosure=node('details','connector-call'),summary=connectorCallSummary(card);
  const entry=conversationHistory(id);entry.openConnectorCalls??=new Set();
  disclosure.open=entry.openConnectorCalls.has(card.id);
  disclosure.ontoggle=()=>{if(disclosure.isConnected)disclosure.open?entry.openConnectorCalls.add(card.id):entry.openConnectorCalls.delete(card.id);};
  const body=node('div','chat-disclosure-body');body.append(receipt);
  disclosure.append(summary,body);animateChatDisclosure(disclosure,body);group.append(disclosure);return group;
}
function queuedMessageWaiting(message){
 const deliveries=message.delivery||[];
 return deliveries.length>0&&deliveries.every(d=>d.status==='queued')&&deliveries.some(d=>
  pausedScreens().some(p=>p.bot_id===d.bot_id)||
  state.allRuns.some(r=>r.bot_id===d.bot_id&&r.id!==d.run_id&&active(r)));
}
function editQueuedMessage(message,chatId){
 const dialog=modal('Edit queued message','queued-message-dialog'),form=node('form'),input=node('textarea'),status=node('p','muted small');input.value=message.text;input.required=true;input.maxLength=64000;input.setAttribute('aria-label','Queued message');input.rows=6;
 const actions=node('div','row-actions'),save=button('Save changes',()=>{},'primary'),cancel=button('Cancel',()=>dialog.close(),'outline-button');save.type='submit';actions.append(cancel,save);form.append(input,status,actions);dialog.append(form);
 let saving=false;
 const available=()=>{const latest=conversationHistory(chatId).messages.find(m=>m.seq===message.seq);return latest?.delivery?.length&&latest.delivery.every(d=>d.status==='queued');};
 const check=()=>{save.disabled=saving||!available();if(!available())status.textContent='This message has started sending. Your unsaved edit is still here to copy.';};
 status.textContent='Recipients and attachments stay the same.';
 const timer=setInterval(check,500);dialog.addEventListener('close',()=>clearInterval(timer),{once:true});
 form.onsubmit=async event=>{event.preventDefault();if(saving||!available())return;saving=true;check();try{await api('/chats/'+encodeURIComponent(chatId)+'/messages/'+message.seq,'PATCH',{expected_text:message.text,text:input.value});dialog.close();await refresh(true);}catch(e){status.textContent=e.message;}finally{saving=false;save.disabled=!available();}};
 input.focus();input.setSelectionRange(input.value.length,input.value.length);
}

function connectorCallSummary(card){
  const brand=connectorBrand(card.connection||card.connector,card.tool),summary=node('summary','connector-call-summary');
  const verbs={preparing:'Preparing',approved:'Queued',ready:'Queued',executing:'Calling',completed:card.email_send?'Sent via':'Called',denied:'Declined',interrupted:'Interrupted',failed:'Failed'};
  const tool=String(card.tool||'').split('__').at(-1);
  // Only known identifier fields belong in the compact receipt, never arbitrary
  // bodies, query contents, credentials or nested connector payloads.
  const target=Object.entries(card.input||{}).find(([key,value])=>/^(id|channel_?id|channel|page_?id|file_?id|document_?id|item_?id|issueIdOrKey|spreadsheet_?id)$/i.test(key)&&['string','number'].includes(typeof value));
  const label=`${verbs[card.status]||card.status} ${brand.name} (${tool}${target?' · ID '+String(target[1]).slice(0,120):''})`;
  summary.title=`${label} · ${card.source||'Connector'} · ${state.bots.find(b=>b.id===card.bot_id)?.name||'Your bot'}`;
  summary.append(connectorLogo(brand),node('span','connector-call-label',label));
  if(['preparing','executing'].includes(card.status)){
    const dots=node('span','connector-call-dots');dots.setAttribute('aria-hidden','true');for(let i=0;i<3;i++)dots.append(node('span','','.'));summary.append(dots);
  }
  summary.append(icon('chevron',12));return summary;
}
function connectorStack(messages,entry){
  const first=messages[0],last=messages.at(-1),key=String(first.seq),group=node('article','connector-stack-group');group.dataset.message=key;
  const details=node('details','connector-stack');details.dataset.connectorStack=key;
  entry.openConnectorStacks??=new Set();details.open=entry.openConnectorStacks.has(key);
  const summary=node('summary','connector-stack-summary'),logos=node('span','connector-stack-logos'),copy=node('span','connector-stack-copy');
  const brands=[...new Map(messages.map(m=>{const c=m.connector_artifact,b=connectorBrand(c.connection||c.connector,c.tool);return[b.key,b];})).values()];
  for(const brand of brands.slice(0,3))logos.append(connectorLogo(brand));
  const title=node('span','',`${messages.length} tool calls`);copy.append(title);
  summary.append(icon('chevron',12),copy,logos);
  summary.title=brands.map(b=>b.name).join(', ');
  const body=node('div','connector-stack-body');for(const m of messages.filter(m=>m!==last)){const card=connectorMessage(m,entry.id);conversationRenderSignatures.set(card,conversationSignature(card));body.append(card);}
  const expansion=node('div','chat-disclosure-body');expansion.append(body);
  details.append(summary,expansion);animateChatDisclosure(details,expansion);details.ontoggle=()=>{if(!details.isConnected)return;details.open?entry.openConnectorStacks.add(key):entry.openConnectorStacks.delete(key);};
  const latest=node('div','connector-stack-current');latest.append(connectorMessage(last,entry.id));
  group.append(details,latest);return group;
}
async function renderSharedChat(chat, force, mode='sync') {
  const entry=conversationHistory(chat.id);
  // Use the refreshed unread cursor on initial load and each explicit visit,
  // without moving a reader when background activity arrives.
  if(mode==='sync'&&(entry.openingAttention||state.renderedChatId!==chat.id))captureUnreadBoundary(chat.id);
  if(chatOpening?.id===chat.id&&chatOpening.failed)return;
  if((state.renderedChatId!==chat.id||chatOpening)&&!cachedConversationReady(entry))showConversationOpening(chat.id);
  if(mode==='cached'&&!cachedConversationReady(entry))return;
  try{await renderPreparedSharedChat(chat,force,mode);}
  catch(error){failConversationOpening(chat.id,error);throw error;}
}
// Keep queued direct-message turns together without rewriting send timestamps or
// storage cursors. Explicit steering remains interleaved with its active turn.
function orderedDirectMessages(messages,runs){
  const ordered=[...messages].sort((a,b)=>a.created-b.created||(a.history_order&&b.history_order?a.history_order.localeCompare(b.history_order):a.seq-b.seq));
  const runMap=new Map(runs.map(r=>[r.id,r])),sources=new Map();
  for(const m of messages)for(const d of m.delivery||[])sources.set(d.run_id,m);
  for(const input of messages.filter(m=>m.sender==='user').sort((a,b)=>a.seq-b.seq)){
    if(input.delivery?.length!==1)continue;
    const delivery=input.delivery[0];
    if(delivery.status==='steered'||delivery.into_run_id)continue;
    const own=runMap.get(delivery.run_id);
    let anchor=-1;
    for(let i=0;i<ordered.length;i++){
      const m=ordered[i];if(m===input)continue;
      if(m.sender==='user'){
        if(m.seq<input.seq&&m.delivery?.some(d=>d.bot_id===delivery.bot_id))anchor=i;
        continue;
      }
      if(m.sender!==delivery.bot_id||!m.run_id||m.run_id===delivery.run_id)continue;
      const source=sources.get(m.run_id),run=runMap.get(m.run_id);
      // Source sequence handles multiple sends in the same second. Older history
      // may omit the source page, in which case only a strictly older run qualifies.
      if(source?source.seq<input.seq:own&&run&&run.created<own.created)anchor=i;
    }
    const current=ordered.indexOf(input);
    if(anchor>current){ordered.splice(current,1);ordered.splice(anchor,0,input);}
  }
  return ordered;
}
async function renderPreparedSharedChat(chat, force, mode='sync') {
  const id=chat.id,entry=conversationHistory(id),liveArea=$('content'),area=node('div');
  if(mode==='sync')await syncChatHistory(entry);
  if(currentConversationId()!==id || !entry.loaded)return;
  const data={messages:entry.messages},visibleRuns=new Set(data.messages.filter(m=>['assistant','result'].includes(m.kind)).map(m=>m.run_id).filter(Boolean));
  const listedRuns=state.allRuns.filter(r=>!chat.shared&&r.chat_id===id && (visibleRuns.has(r.id) || entry.workingRuns?.has(r.id) || (!entry.hasAfter && (active(r)||r.status==='queued'))));
  const wanted=[...new Set([...visibleRuns,...listedRuns.map(r=>r.id)])];
  if(mode!=='cached'){
    const pending=wanted.filter(runId=>{
      const listed=state.allRuns.find(r=>r.id===runId),cached=state.details.get(runId);
      return !cached || active(cached.run) || (listed && (active(listed) || cached.run.status!==listed.status));
    });
    // Old visible results may no longer be in the recent-runs feed.
    for(let i=0;i<pending.length;i+=8){
      if(currentConversationId()!==id)return;
      await Promise.all(pending.slice(i,i+8).map(async runId=>state.details.set(runId,await api('/runs/'+runId))));
    }
  }
  if (currentConversationId() !== id) return;
  const durableReplies=data.messages.some(m=>Object.hasOwn(m,'source_event_seq'));
  if(mode==='sync' && durableReplies && !entry.hasAfter) {
    const persisted=new Set(data.messages.map(m=>m.source_event_seq)),latest=data.messages.at(-1)?.created||0;
    if(listedRuns.some(r=>(state.details.get(r.id)?.events||[]).some(e=>e.kind==='assistant' && e.created>=latest && !persisted.has(e.seq)))) {
      await syncChatHistory(entry);data.messages=entry.messages;
      if(currentConversationId()!==id)return;
    }
  }
  if(mode==='sync')entry.openingAttention=false;
  const runs=wanted.map(runId=>state.allRuns.find(r=>r.id===runId)||state.details.get(runId)?.run).filter(Boolean);
  if(chat.id.startsWith('dm-')&&!chat.shared)data.messages=orderedDirectMessages(data.messages,runs);
  const workers=prepareChatPresentation(entry,runs,data.messages,mode);
  const groupWorkers=chat.shared?sharedConversationWorkers(chat,entry.sharedWorkers||[],state.allRuns):workers.map(r=>({...r,label:state.activities[r.bot_id]?.run_id===r.id?state.activities[r.bot_id].label:undefined,participant:r.bot_id,name:state.bots.find(b=>b.id===r.bot_id)?.name||'Bot'}));
  const keep=new Set(runs.map(r=>r.id));
  for(const [runId,detail] of state.details){if(state.details.size<=200)break;if(!keep.has(runId)&&!active(detail.run))state.details.delete(runId);}
  const key = JSON.stringify([
    id,
    data.messages,
    entry.pendingWaits,entry.commands,groupWorkers,unreadBoundaries.get(id)?.through,
    chat.shared?state.allRuns.filter(r=>r.chat_id===id&&active(r)).map(r=>[r.id,r.bot_id,r.status,stoppingTasks.has(r.id)]):null,
    entry.hasBefore,entry.hasAfter,entry.error,state.general.show_activity === true,state.general.name,
    state.bots.map(b=>[b.id,b.name,b.profile]),
    runs,
    workers.map(r=>r.id),[...entry.finishing.keys()],
    state.approvals,
    state.userTasks,
    runs.map((r) => state.details.get(r.id)?.events),
  ]);
  if (state.chatKey === key && state.renderedChatId===id) return;
  state.chatKey = key;
  state.renderedChatId = id;
  beginChatRender(id);
  unreadObserver.disconnect();
  if(entry.hasBefore)area.append(historyEdge(entry,'older'));
  if (!data.messages.length && !runs.length && !entry.pendingWaits?.length && !entry.commands?.length) {
    const empty = node("div", "empty"),
      avatars = chat.id.startsWith('dm-')?buddy(state.bot,55):participantStack(chat,'tile');
    empty.append(
      avatars,
      node(
        "h1",
        "",
        chat.id.startsWith("dm-") ? `Hey, I'm ${state.bot.name}.` : chat.name,
      ),
      node(
        "p",
        "",
        (chat.shared||chat.members.length > 1)
          ? "A place to think and work together. Use @ to bring someone in."
          : profile(state.bot).description || "What can I take off your plate?",
      ),
    );
    area.append(empty);
    reconcileConversation(liveArea,area);
    endChatRender();
    return;
  }

  let sequenceAvatar = null, previousSender = null,
    previousTime = 0;
  const boundary=unreadBoundaries.get(id);let unreadInserted=false;
  const batches=connectorBatches(data.messages,boundary,runs),artifactBatches=artifactUpdateBatches(data.messages),stacked=new Set();
  for (const m of data.messages) {
    if(stacked.has(m.seq)||m.kind==='continuation')continue;
    if (!m.text?.trim()) continue;
    if(hiddenCompletionMessage(m) && !runs.find(r=>r.id===m.run_id)?.error)continue;
    if(boundary&&!unreadInserted&&m.kind!=='connector_artifact'&&(chat.shared?!m.mine:m.sender!=='user')&&m.sender!=='system'&&m.seq>boundary.after&&m.seq<=boundary.through){
      unreadInserted=true;
      const divider=node('div','unread-divider','New');divider.dataset.chat=id;divider.setAttribute('role','separator');divider.setAttribute('aria-label','New activity since your last visit');
      if(boundary.seenAt&&Date.now()-boundary.seenAt>8000)divider.classList.add('has-faded');
      area.append(divider);unreadObserver.observe(divider);
    }
    if(m.kind==='connection_card'&&validConnectionCard(m.text)){
      const group=node('article','message-group connection-message');group.dataset.message=String(m.seq);group.append(chatConnectionCard(m.text));area.append(group);previousSender=null;continue;
    }
    if(m.visual_panel){
      const group=node('article','message-group visual-message');group.dataset.message=String(m.seq);
      group.append(visualPanel(m.visual_panel,{...workflowOptions(chat.id,m.visual_panel),onDiscuss:pick=>{const text=`Let's discuss ${pick.name} (${pick.url}) from the saved comparison “${m.visual_panel.title}” (panel ${pick.panel_key}, product ${pick.product_id}).`; $('prompt').value=text;resizeComposer();$('prompt').dispatchEvent(new Event('input',{bubbles:true}));$('prompt').focus();}}));
      area.append(group);previousSender=null;continue;
    }
    if(m.workspace_artifact&&m.artifact_action==='updated'){
      const batch=artifactBatches.get(m.seq),group=node('article','message-group artifact-update-message');group.dataset.message=String(m.seq);
      const options={baseUrl:state.status.public_url||location.origin};
      if(batch){for(const item of batch)stacked.add(item.seq);const details=node('details','artifact-update-stack'),summary=node('summary');
        entry.openArtifactStacks??=new Set();details.open=entry.openArtifactStacks.has(String(m.seq));
        summary.append(artifactUpdateRow(batch.at(-1).workspace_artifact,{...options,label:batch.length+' artifact updates ·'}));
        const body=node('div','artifact-update-stack-body');for(const item of batch)body.append(artifactUpdateRow(item.workspace_artifact,options));
        details.append(summary,body);details.addEventListener('toggle',()=>{if(details.isConnected){if(details.open)entry.openArtifactStacks.add(String(m.seq));else entry.openArtifactStacks.delete(String(m.seq));}});group.append(details);
      }else group.append(artifactUpdateRow(m.workspace_artifact,options));
      area.append(group);previousSender=null;continue;
    }
    if(m.workspace_artifact){const group=node('article','message-group');group.dataset.message=String(m.seq);group.append(workspaceArtifactCard(m.workspace_artifact,{api,markdown,baseUrl:state.status.public_url||location.origin}));area.append(group);previousSender=null;continue;}
    if(m.connector_artifact){
      const batch=batches.get(m.seq);if(batch)for(const item of batch)stacked.add(item.seq);
      area.append(batch?connectorStack(batch,entry):connectorMessage(m,id));previousSender=null;continue;
    }
    if (m.planning) {
      const group=node('article','message-group planning-message');group.dataset.message=String(m.seq);
      group.append(m.kind==='checklist'?checklistCard(m.planning):reminderCard(m.planning,m.kind==='reminder'));
      area.append(group);previousSender=null;continue;
    }
    if (m.kind === 'workspace_import' && m.workspace_import) {
      const group=node('article','message-group');group.dataset.message=String(m.seq);group.append(workspaceUI.card(m.workspace_import));area.append(group);previousSender=null;continue;
    }
    if (m.kind === 'bot_draft' && m.draft) {
      const group = node('article','message-group');group.dataset.message=String(m.seq);group.append(botDraftCard(m.draft));area.append(group);
      previousSender=null;continue;
    }
    if (m.kind === "collaboration" && m.linked_chat_id) {
      const target = state.chats.find(c => c.id === m.linked_chat_id);
      if (target) {
        const link = button("", () => chooseChat(target), "collaboration-link");
        link.dataset.message=String(m.seq);
        link.append(icon("network", 18), node("span", "", m.text), icon("chevron", 14));
        area.append(link);
        previousSender=null;
      }
      continue;
    }
    if (m.created - previousTime > 1800) {
      area.append(
        node(
          "div",
          "chat-timestamp",
          new Date(m.created * 1000).toLocaleString(undefined, {timeZone:botTimezone(),
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
        ),
      );
      previousSender = null;
    }
    previousTime = m.created;
    const statusRun=runs.find(r=>r.id===m.run_id)||state.details.get(m.run_id)?.run;
    const statusNotice=m.status_notice||(m.kind==='notice'?{label:'Status',text:m.text}:m.kind==='result'&&statusRun&&['failed','cancelled','interrupted'].includes(statusRun.status)?{label:statusRun.status==='cancelled'?'Task stopped':statusRun.status==='interrupted'?'Task interrupted':'Task failed',text:statusRun.error||m.text}:null);
    if(statusNotice){
      const recovered=!!statusNotice.continued_by;
      let group=recovered?[...area.querySelectorAll('.chat-status-group')].find(n=>n.dataset.recovery===m.run_id):null;
      if(!group){
        group=node('article','chat-status-group');group.dataset.message=String(m.seq);if(m.run_id)group.dataset.run=m.run_id;
        if(recovered){
          group.dataset.recovery=m.run_id;
          group.append(taskRecoveryHistory());
        }
        area.append(group);
      }
      const content=recovered?node('div','recovery-message'):group;
      if(recovered){group.tabIndex=-1;content.dataset.message=String(m.seq);content.tabIndex=-1;group.querySelector('.task-recovery-body').append(content);}
      content.append(chatStatusNotice(statusNotice.label,statusNotice.text));
      if(m.files?.length)content.append(fileLinks(m.files));
      if(m.kind==='result'){
        renderAttachments(content,m.attachments||state.details.get(m.run_id)?.attachments||[]);
        if(statusRun){content.append(messageTools(statusRun,state.details.get(statusRun.id)?.events||[]));if(!recovered&&['failed','cancelled','interrupted'].includes(statusRun.status))content.append(continueTaskButton(statusRun));}
      }
      previousSender=null;sequenceAvatar=null;continue;
    }
    const group = node("article", "message-group");
    group.dataset.message = String(m.seq);
    if (m.run_id) group.dataset.run = m.run_id;
    const participant=chat.shared?chat.participants.find(p=>p.id===m.sender):null;
    const bot = participant?.kind==='bot'?{...participant,profile:participant.avatar}:state.bots.find((b) => b.id === m.sender),
      isUser = chat.shared?m.mine===true:m.sender === "user";
    const groupMessage=!isUser&&!chat.id.startsWith('dm-');
    if(groupMessage)group.classList.add('group-message');
    if(previousSender!==m.sender)sequenceAvatar=null;
    if (groupMessage && previousSender !== m.sender) {
      const who = node("div", "message-author");
      if (bot) {
        const avatar=buddy(bot,32);avatar.classList.add('message-avatar');sequenceAvatar=avatar;
        who.append(senderName(bot,avatar));
      } else if(participant?.kind==='person'){sequenceAvatar=serverChatsUI.avatar(participant,32);sequenceAvatar.classList.add('message-avatar');who.append(node('strong','',participant.name));}else who.append(node('strong','',m.sender_name||'Former member'));
      who.append(
        node("span", "muted", clock(m.created)),
      );
      group.append(who);
    }
    group.classList.toggle("same-author", previousSender === m.sender);
    previousSender = m.sender;
    const attachmentOnly=isUser&&m.files?.length&&m.text==='Please review the attached files.';
    const row = node("div", "message-row " + (isUser ? "user" : "assistant"));
    if (m.kind === 'question' && m.question) {
      row.append(questionCard(m.question));
    } else if (m.kind === "handoff") {
      const bubble=markdown(m.text,true);bubble.classList.add('handoff-bubble');row.append(bubble);
    } else if (isUser) {
      const bubble = node("div", "message-bubble");
      if(m.command?.command){const badge=node("span","message-command-badge","/"+m.command.command);badge.title="Saved workflow · "+(m.command.source||"Skill");bubble.append(badge);}
      const formatted=markdown(m.text,true,true);
      if(quietCompletionMarker(m.text))formatted.textContent=m.text;
      if(!attachmentOnly){bubble.append(...formatted.childNodes);foldLongMessage(bubble,String(m.seq),entry);}
      else {bubble.classList.add("attachment-only");bubble.append(fileLinks(m.files));}
      for(const delivery of m.delivery||[]) {
        const recipient=state.bots.find(b=>b.id===delivery.bot_id)?.name||'Bot';
        const working=state.allRuns.find(r=>r.bot_id===delivery.bot_id&&r.chat_id===chat.id&&active(r));
        const text=delivery.status==='steered'?`${recipient} · included in this task${['failed','interrupted','cancelled'].includes(delivery.task_status)?' · task stopped':''}`:delivery.status==='queued'&&working&&!m.command?.command?`${recipient} · ${delivery.steer_requested?'will receive this after the current action':'queued for the next task'}`:'';
        if(text)bubble.append(node('span','message-delivery',text));
        if(delivery.status==='queued'&&working&&!m.command?.command&&delivery.run_id&&!delivery.steer_requested){const controls=node('div','message-steering');const steer=button('Steer now',async()=>{await api('/runs/'+encodeURIComponent(delivery.run_id)+'/steer','POST',{run_id:working.id});await refresh(true);},'subtle-button');steer.title='Send to '+recipient+' after the current action, without stopping the task';steer.setAttribute('aria-label','Steer '+recipient+' with this message');controls.append(steer);group.prepend(controls);}
      }
      row.append(bubble);
    } else row.append(markdown(m.text));
    const bubble=row.lastElementChild;
    if(!isUser&&m.kind!=='question')foldLongMessage(bubble,String(m.seq),entry);
    if(m.reply_to)bubble.prepend(quotedMessage(chat.id,m.reply_to));
    if(m.reactions?.length)bubble.append(messageReactions(chat.id,m));
    if(['message','assistant','result','handoff','question'].includes(m.kind)){
      group.tabIndex=0;group.dataset.messageFocus='group';
      const actions=messageActions(chat.id,m);if(attachmentOnly)actions.querySelector('[data-message-action="copy"]')?.remove();row.classList.add('has-message-actions');
      if(isUser&&!chat.shared&&queuedMessageWaiting(m)){
        const edit=iconButton('edit','Edit queued message',()=>editQueuedMessage(m,chat.id));edit.dataset.messageFocus='edit';edit.dataset.messageAction='edit';actions.append(edit);actions.classList.add('has-queued-edit');
      }
      if(isUser)row.prepend(actions);else row.append(actions);
    }
    group.append(row);
    // Moving one avatar along the sequence leaves its name at the first message.
    // Anchor to the bubble so wrapped actions cannot pull it below the message.
    if(groupMessage&&sequenceAvatar)bubble.append(sequenceAvatar);
    if (m.files?.length&&!attachmentOnly) group.append(fileLinks(m.files));
    if (m.kind === "result") {
      renderAttachments(group, m.attachments || state.details.get(m.run_id)?.attachments || []);
      const run =
        runs.find((r) => r.id === m.run_id) || state.details.get(m.run_id)?.run;
      if (run) {
        group.insertBefore(taskCards(run),row);
        group.append(messageTools(run, state.details.get(run.id)?.events || [],false));
      }
    }
    area.append(group);
  }

  if(chat.shared&&!entry.hasAfter)for(const run of state.allRuns.filter(r=>r.chat_id===id&&active(r))){const cards=taskCards(run);if(cards.children.length)area.append(cards);}
  if(entry.hasAfter)area.append(historyEdge(entry,'newer'));
  for (const run of workers
    .filter(() => !entry.hasAfter)
    .reverse()) {
    const bot = state.bots.find((b) => b.id === run.bot_id),
      group = node("article", "message-group"),
      line = chat.id.startsWith("dm-") ? workLine(bot, run) : null;
    group.dataset.run = run.id;
    const cards=taskCards(run);if(cards.children.length)group.append(cards);if(line)group.append(line);
    const events = state.details.get(run.id)?.events || [];
    const persistedEvents = new Set(data.messages.filter(m => m.run_id === run.id).map(m => m.source_event_seq).filter(Number.isInteger));
    for (const e of events.filter((e) => !durableReplies && e.kind === "assistant" && !persistedEvents.has(e.seq))) {
      const row = node("div", "message-row assistant");
      if(e.body.status_notice==='provider_error'){group.append(chatStatusNotice('Provider error',e.body.text));continue;}
      const bubble=markdown(e.body.text);foldLongMessage(bubble,`event:${run.id}:${e.seq}`,entry);row.append(bubble);
      group.append(row);
    }
    renderAttachments(group, state.details.get(run.id)?.attachments || []);
    const tools=messageTools(run,events,false);if(tools.children.length)group.append(tools);
    if(group.children.length)area.append(group);
  }
  if(!entry.hasAfter&&!chat.id.startsWith('dm-')){
    const items=visibleGroupWorkers(groupWorkers);
    if(items.length)area.append(groupActivity(items,{node,elapsed:elapsedTime,control:item=>{
      const member=chat.shared?chat.participants?.find(p=>p.id===item.participant):null;
      const run=chat.shared?state.allRuns.find(r=>r.chat_id===id&&r.bot_id===member?.bot_id&&active(r)):state.allRuns.find(r=>r.id===item.id);
      if(!run||(chat.shared&&member?.account!==chat.me?.replace(/^person:/,'')))return null;
      return taskStopButton(state.bots.find(b=>b.id===run.bot_id)||{name:item.name},run);
    },avatar:(item,size)=>{
      if(chat.shared){const member=chat.participants?.find(p=>p.id===item.participant);return serverChatsUI.avatar(member||{kind:'bot',name:item.name},size);}
      return buddy(state.bots.find(b=>b.id===item.participant)||{name:item.name},size,false);
    }}));
  }
  if(!entry.hasAfter && entry.commands?.length){
    const owners=[...new Set(entry.commands.map(job=>job.bot_id))];
    for(const owner of owners){
      const jobs=entry.commands.filter(job=>job.bot_id===owner),bot=state.bots.find(b=>b.id===owner);
      const group=node('div','command-wait');group.dataset.message='command-wait-'+owner;
      const details=node('details','command-progress');details.dataset.command=owner;
      const summary=node('summary',''),label=`${!chat.id.startsWith('dm-')&&bot?bot.name+' · ':''}Waiting for ${jobs.length===1?jobs[0].title:jobs.length+' commands'}`;
      if(bot){const avatar=buddy(bot,22,false);const working=state.allRuns.some(r=>r.bot_id===owner&&active(r));setActivity(avatar,working?reaction(owner).action:'waiting',{immediate:true});summary.append(avatar);}
      summary.append(node('span','command-wait-label',label),icon('chevron',12));summary.title=label;details.append(summary);
      const body=node('div','command-progress-body');details.append(body);
      for(const job of jobs){
        const row=node('div','command-wait-row'),stale=!job.seen||Date.now()/1000-job.seen>20;
        const status=job.stopping?'stopping':stale?'waiting for connection':job.status==='starting'?'starting':elapsedTime(job.progress?.elapsed_seconds||0);
        const text=node('span','command-wait-title',job.title);text.title=job.title;row.append(text,node('span','command-wait-status',status));
        const stop=button('',async()=>{stop.disabled=true;try{await api('/commands/'+job.id+'/stop','POST',{});await refresh();}catch(error){stop.disabled=false;notice(error.message||String(error));}},'icon-button command-stop','close');
        stop.setAttribute('aria-label','Stop '+job.title);stop.title='Stop this command';stop.disabled=job.stopping===true;row.append(stop);body.append(row);
      }
      animateChatDisclosure(details,body);group.append(details);area.append(group);
    }
  }
  if(!entry.hasAfter)for(const wait of entry.pendingWaits||[]){
    const helper=state.bots.find(b=>b.id===wait.bot_id),requester=state.bots.find(b=>b.id===wait.requester_bot_id);
    if(!helper)continue;
    const group=node('article','message-group collaboration-wait'),line=node('div','collaboration-wait-row');
    group.dataset.waitRun=wait.run_id;group.dataset.message='collaboration-wait-'+wait.parent_run_id+'-'+wait.run_id;
    const label=(requester?.name||'A teammate')+' is waiting on '+helper.name;
    line.title=label;
    if(requester){const avatar=buddy(requester,24);avatar.setAttribute('aria-hidden','true');line.append(avatar);}
    const text=node('span','collaboration-wait-label');text.append(node('strong','',requester?.name||'A teammate'),document.createTextNode(' is waiting on '),node('strong','',helper.name));line.append(text);
    const helperAvatar=buddy(helper,24);helperAvatar.setAttribute('aria-hidden','true');line.append(helperAvatar);
    if(wait.chat_id!==id){const open=iconButton('arrow','Open chat with '+helper.name,async()=>{const target=state.chats.find(c=>c.id===wait.chat_id);if(target)await chooseChat(target);});open.classList.add('collaboration-open');line.append(open);}
    const stop=iconButton('close','Stop task for '+(requester?.name||'requester'),async()=>{await api('/runs/'+wait.parent_run_id+'/cancel','POST',{});await refresh();});stop.classList.add('collaboration-stop');line.append(stop);
    group.append(line);area.append(group);
  }
  // Human handoffs belong where they were requested, not beneath the live
  // worker or the final answer. Keep one stable card as its status changes.
  const placedHumanTasks=new Set();
  for(const card of [...area.querySelectorAll('[data-user-task]')]){
    const task=state.userTasks.find(t=>t.id===card.dataset.userTask);
    if(!task)continue;
    if(placedHumanTasks.has(task.id)){card.remove();continue;}
    placedHumanTasks.add(task.id);
    const event=(state.details.get(task.run_id)?.events||[]).find(e=>e.kind==='user_action'&&e.body?.id===task.id);
    const later=data.messages.find(m=>{
      if(m.run_id===task.run_id&&m.kind==='result')return true;
      if(m.run_id===task.run_id&&event&&Number.isInteger(m.source_event_seq))return m.source_event_seq>event.seq;
      return m.created>task.created;
    });
    const anchor=(later&&[...area.children].find(n=>n.dataset.message===String(later.seq)))
      ||[...area.children].find(n=>n.dataset.run===task.run_id&&!n.dataset.message);
    const group=node('article','message-group human-handoff-message');
    group.dataset.message='human-task-'+task.id;group.append(card);
    area.insertBefore(group,anchor||null);
  }
  reconcileConversation(liveArea,area);
  const artifactTurns=data.messages.filter(m=>m.sender==='user'||m.mine===true||(chat.shared&&chat.participants?.some(p=>p.id===m.sender&&p.kind==='person'))).map(m=>String(m.seq));
  for(const card of liveArea.querySelectorAll('[data-workspace-artifact]'))card.advanceArtifactTurns?.(artifactTurns);
  for(const seq of entry.replyArrivals.keys()){const group=[...liveArea.children].find(n=>n.dataset.message===String(seq));if(group){revealReply(group,entry.replyArrivals.get(seq));entry.replyArrivals.delete(seq);}}
  releaseScreenshotUrls(true);
  for(const divider of liveArea.querySelectorAll('.unread-divider'))unreadObserver.observe(divider);
  for(const finish of entry.finishing.values())finishingWork(entry,finish);
  endChatRender();
}
const conversationRenderSignatures=new WeakMap();
function conversationSignature(node){
  if(node.classList.contains("group-activity"))return node.dataset.activitySignature;
  if(!node.querySelector('.connector-call,[data-file-signature],[data-visual-signature],[data-decision-signature],[data-shard-signature]'))return node.outerHTML;
  const copy=node.cloneNode(true);for(const receipt of copy.querySelectorAll('[data-decision-signature]')){const marker=document.createElement('span');marker.dataset.decisionSignature=receipt.dataset.decisionSignature;receipt.replaceWith(marker);}for(const call of copy.querySelectorAll('.connector-call'))call.removeAttribute('open');
  // Saved/download progress is local UI state, not a changed chat message.
  // Keep its card and any open preview mounted when incoming messages render.
  for(const panel of copy.querySelectorAll('[data-visual-signature]')){const marker=document.createElement('span');marker.dataset.visualSignature=panel.dataset.visualSignature;panel.replaceWith(marker);}
  for(const file of copy.querySelectorAll('[data-file-signature]')){const marker=document.createElement('span');marker.dataset.fileSignature=file.dataset.fileSignature;file.replaceWith(marker);}
  for(const shard of copy.querySelectorAll('[data-shard-signature]')){const marker=document.createElement('span');marker.dataset.shardSignature=shard.dataset.shardSignature;shard.replaceWith(marker);}
  return copy.outerHTML;
}
function preserveShardMessage(previous,next){
  const before=previous.querySelector('.message-bubble'),after=next.querySelector('.message-bubble');
  if(!before||!after)return false;
  const oldShards=[...before.querySelectorAll('[data-shard-signature]')],newShards=[...after.querySelectorAll('[data-shard-signature]')];
  if(!oldShards.length||oldShards.length!==newShards.length||oldShards.some((s,i)=>s.parentElement!==before||newShards[i].parentElement!==after||s.dataset.shardSignature!==newShards[i].dataset.shardSignature))return false;
  // Preserve the iframe's parent as well as its node: reparenting reloads the document.
  const a=previous.cloneNode(true),b=next.cloneNode(true);a.querySelector('.message-bubble').replaceChildren();b.querySelector('.message-bubble').replaceChildren();if(a.outerHTML!==b.outerHTML)return false;
  for(const child of [...before.childNodes])if(!oldShards.includes(child))child.remove();
  let cursor=before.firstChild,index=0;
  for(const child of [...after.childNodes]){if(newShards.includes(child)){cursor=oldShards[index++].nextSibling;}else before.insertBefore(child,cursor);}
  return true;
}
function connectorStackFormation(target,desired){
  if(!motionAllowed())return [];
  const rows=[...target.children],formations=[];
  for(const group of desired.children){
    if(!group.classList.contains('connector-stack-group')||group.querySelector('.connector-stack').open)continue;
    const index=rows.findIndex(n=>n.dataset.message===group.dataset.message);
    if(index<0||!rows[index].classList.contains('connector-message'))continue;
    const ids=new Set([...group.querySelectorAll('.connector-message')].map(n=>n.dataset.message)),prior=[];
    for(const row of rows.slice(index)){if(!row.classList.contains('connector-message')||!ids.has(row.dataset.message))break;prior.push(row);}
    if(prior.length<2||prior.some(n=>n.querySelector('details[open]')))continue;
    const first=prior[0].getBoundingClientRect(),last=prior.at(-1).getBoundingClientRect();
    if(first.bottom<0&&last.top<0||first.top>innerHeight)continue;
    const ghosts=prior.map(row=>{const summary=row.querySelector('.connector-call-summary'),rect=summary.getBoundingClientRect(),copy=summary.cloneNode(true);copy.className='connector-collapse-row';copy.removeAttribute('tabindex');return {copy,top:rect.top-first.top,height:rect.height};});
    formations.push({group,ghosts,height:last.bottom-first.top,top:first.top,focused:prior.some(row=>row.contains(document.activeElement))});
  }
  return formations;
}
function animateConnectorFormation({group,ghosts,height,top,focused}){
  const summary=group.querySelector('.connector-stack-summary'),current=group.querySelector('.connector-stack-current'),rect=group.getBoundingClientRect(),layer=node('div','connector-collapse-ghosts');
  layer.setAttribute('aria-hidden','true');layer.inert=true;group.classList.add('is-forming');
  const duration=360,easing='cubic-bezier(.2,.8,.2,1)',motions=[];
  for(const {copy,top,height} of ghosts){copy.style.top=top+'px';copy.style.height=height+'px';layer.append(copy);motions.push(copy.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:`translateY(${-top}px) scale(.96)`}],{duration:220,easing,fill:'both'}));}
  group.append(layer);if(focused)summary.focus({preventScroll:true});
  motions.push(summary.animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,delay:100,easing,fill:'both'}));
  motions.push(current.animate([{opacity:0,transform:`translateY(${Math.max(8,height-rect.height)}px)`},{opacity:1,transform:'translateY(0)'}],{duration:260,delay:100,easing,fill:'both'}));
  let control;
  const finish=()=>{for(const motion of motions)motion.cancel();layer.remove();group.classList.remove('is-forming');group.removeEventListener('pointerdown',interrupt,true);group.removeEventListener('keydown',interrupt,true);delete group.finishConnectorFormation;};
  const interrupt=()=>control?.finish();group.addEventListener('pointerdown',interrupt,true);group.addEventListener('keydown',interrupt,true);
  control=trackMotion(group.animate([{height:height+'px',transform:`translateY(${top-rect.top}px)`},{height:rect.height+'px',transform:'translateY(0)'}],{duration,easing,fill:'both'}),duration,finish);
  group.finishConnectorFormation=()=>control.finish();
}
function connectorAdvance(group,next){
  const current=group.querySelector('.connector-stack-current'),incoming=next.querySelector('.connector-stack-current');
  if(!motionAllowed()||group.querySelector('.connector-stack').open||current.querySelector('details[open]')||current.firstElementChild?.dataset.message===incoming.firstElementChild?.dataset.message)return null;
  // A burst can advance the newest row before the initial collapse has settled.
  // Finish that layout first so only one set of moving rows owns the group.
  group.finishConnectorFormation?.();group.finishConnectorAdvance?.();
  const source=current.querySelector('.connector-call-summary'),rect=source.getBoundingClientRect(),box=group.getBoundingClientRect();
  if(rect.bottom<0||rect.top>innerHeight)return null;
  const copy=source.cloneNode(true);copy.className='connector-collapse-row';copy.style.top=(rect.top-box.top)+'px';copy.style.height=rect.height+'px';
  return ()=>{
    const layer=node('div','connector-collapse-ghosts');layer.inert=true;layer.setAttribute('aria-hidden','true');layer.append(copy);group.append(layer);group.classList.add('is-advancing');
    const target=group.querySelector('.connector-stack-summary').getBoundingClientRect(),duration=320,easing='cubic-bezier(.2,.8,.2,1)';
    const outgoing=copy.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:`translateY(${target.top-rect.top}px) scale(.96)`}],{duration:240,easing,fill:'both'});
    const arriving=current.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,delay:80,easing,fill:'both'});
    const interrupt=()=>group.finishConnectorAdvance?.();group.addEventListener('pointerdown',interrupt,true);group.addEventListener('keydown',interrupt,true);
    const finish=()=>{outgoing.cancel();arriving.cancel();layer.remove();group.classList.remove('is-advancing');group.removeEventListener('pointerdown',interrupt,true);group.removeEventListener('keydown',interrupt,true);delete group.finishConnectorAdvance;};
    const control=trackMotion(group.animate([{opacity:1},{opacity:1}],{duration}),duration,finish);group.finishConnectorAdvance=()=>control.finish();
  };
}
function reconcileConversation(target,desired){
  const formations=connectorStackFormation(target,desired);
  for(const next of desired.querySelectorAll('.command-progress')){
    const previous=[...target.querySelectorAll('.command-progress')].find(p=>p.dataset.command===next.dataset.command);
    if(previous)next.open=previous.open&&!previous.classList.contains('is-collapsing');
  }
  const old=new Map([...target.children].filter(n=>n.dataset.message).map(n=>[n.dataset.message,n]));
  const nodes=[...desired.children].map(next=>{
    const artifact=next.querySelector('.workspace-artifact[data-workspace-artifact]');
    if(artifact){const previous=[...target.children].find(n=>n.querySelector('.workspace-artifact[data-workspace-artifact]')?.dataset.workspaceArtifact===artifact.dataset.workspaceArtifact);if(previous){previous.dataset.message=next.dataset.message;const data=conversationHistory(currentConversationId()).messages.find(m=>String(m.seq)===next.dataset.message)?.workspace_artifact;if(data)void previous.querySelector('[data-workspace-artifact]').syncArtifact(data);return previous;}}
    const signature=conversationSignature(next),previous=old.get(next.dataset.message);
    if(previous&&conversationRenderSignatures.get(previous)===signature)return previous;
    if(previous?.classList.contains('group-activity')&&next.classList.contains('group-activity')){transitionGroupActivity(previous,next,motionAllowed(),a=>trackMotion(a,280));conversationRenderSignatures.set(previous,signature);return previous;}
    if(previous?.classList.contains('connector-stack-group')&&next.classList.contains('connector-stack-group')){
      const advance=connectorAdvance(previous,next);
      const before=previous.querySelector('.connector-stack'),after=next.querySelector('.connector-stack');
      before.querySelector('summary').replaceChildren(...after.querySelector('summary').childNodes);
      reconcileConversation(before.querySelector('.connector-stack-body'),after.querySelector('.connector-stack-body'));
      reconcileConversation(previous.querySelector('.connector-stack-current'),next.querySelector('.connector-stack-current'));advance?.();
      conversationRenderSignatures.set(previous,signature);return previous;
    }
    const beforeHistory=previous?.querySelector('.task-recovery-history'),afterHistory=next.querySelector('.task-recovery-history');
    if(beforeHistory&&afterHistory)afterHistory.open=beforeHistory.open;
    if(previous&&preserveShardMessage(previous,next)){conversationRenderSignatures.set(previous,signature);return previous;}
    conversationRenderSignatures.set(next,signature);return next;
  });
  const keep=new Set(nodes);for(const child of [...target.children])if(!keep.has(child))child.remove();
  let cursor=target.firstChild;
  for(const next of nodes){if(next===cursor){cursor=cursor.nextSibling;continue;}target.insertBefore(next,cursor);}
  for(const formation of formations)animateConnectorFormation(formation);
  observeLongMessages(target);
  continueLoops(target);
}
function animateChatDisclosure(history,body,falling=false){
  const summary=history.querySelector(':scope>summary');
  let motion=null,expanded=false,cards=[];
  summary.onclick=e=>{
    e.preventDefault();
    expanded=motion?!expanded:!history.open;
    // Opening older diagnostics is a reading gesture, not new chat activity.
    // Disable bottom-follow before ResizeObserver sees the changing height.
    chatScroll.follow=false;captureChatAnchor();
    const start=history.open?body.getBoundingClientRect().height:0;
    const starts=falling?[...body.children].map(n=>({opacity:getComputedStyle(n).opacity,transform:getComputedStyle(n).transform})):[];
    motion?.cancel();motion=null;cards.forEach(a=>a.cancel());cards=[];
    if(falling){if(!expanded&&body.contains(document.activeElement))summary.focus({preventScroll:true});body.inert=!expanded;}
    history.classList.toggle('is-collapsing',!expanded);
    history.open=true;
    const finish=()=>{
      history.open=expanded;history.classList.remove('is-collapsing');motion=null;cards.forEach(a=>a.cancel());cards=[];
    };
    if(!motionAllowed()){finish();return;}
    if(falling)for(const [i,card] of [...body.children].entries()){const from=start?starts[i]:{opacity:0,transform:'translateY(-12px)'};cards.push(card.animate([from,{opacity:expanded?1:0,transform:expanded?'translateY(0)':'translateY(-12px)'}],{duration:220,delay:Math.min(expanded?i:body.children.length-1-i,6)*22,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'}));}
    const duration=falling?380:200,easing=falling&&!expanded?'cubic-bezier(.8,0,.8,.2)':'cubic-bezier(.2,.8,.2,1)';
    const animation=body.animate([{height:start+'px'},{height:(expanded?body.scrollHeight:0)+'px'}],{duration,easing,fill:'both'});
    motion=trackMotion(animation,duration,complete=>{if(complete)finish();});
  };
}
function taskRecoveryHistory(){
  const history=node('details','task-recovery-history'),summary=node('summary'),body=node('div','task-recovery-body chat-disclosure-body');
  summary.append(icon('chevron',14),node('span','','Previous attempt · continued'));
  history.append(summary,body);animateChatDisclosure(history,body);
  return history;
}
function showContinuationConfirmation(){notice('Continuing task');$('notice').classList.add('continuation-confirmation');}
function continueTaskButton(run){
  if(run.error==='Connection issue - 5 retries failed.'){
    let sending=false;
    const retry=button('Retry',async()=>{
      if(sending)return;sending=true;retry.disabled=true;
      try{await api('/runs/'+encodeURIComponent(run.id)+'/continue','POST',{});await refresh(true);showContinuationConfirmation();}
      finally{sending=false;retry.disabled=false;}
    },'outline-button provider-retry-button','refresh');return retry;
  }
  return button('Continue task',()=>{
    const dialog=modal('Continue task','text-dialog continue-task-dialog');
    dialog.append(node('p','',run.error||'This task stopped before completion.'),node('p','muted','The bot will review what already completed and continue the remaining work. Previously declined actions stay declined.'));
    const preview=node('details','continue-task-preview');preview.append(node('summary','','Original request'),node('p','',run.prompt));dialog.append(preview);
    const submit=button('Continue',async()=>{
      submit.disabled=true;
      try{
        await api('/runs/'+encodeURIComponent(run.id)+'/continue','POST',{});
        dialog.close();await refresh(true);showContinuationConfirmation();
      }catch(error){submit.disabled=false;throw error;}
    },'primary');
    const actions=node('div','continue-task-actions');actions.append(submit);dialog.append(actions);
  },'subtle-button continue-task-trigger');
}
function chatStatusNotice(label,text) {
  if(text==='Connection issue - 5 retries failed.'){
    const status=node('div','provider-retry-notice',text);status.setAttribute('role','status');return status;
  }
  const notice=node('div','chat-status-notice');
  notice.append(node('span','chat-status-label',label),node('span','chat-status-copy',text));
  return notice;
}
function botDraftCard(draft) {
  const card=node('article','bot-draft-card'),bot=draft.bot,info=node('div','bot-draft-info');
  card.dataset.draft=draft.id;
  info.append(node('span','eyebrow',draft.created_bot_id?'Teammate created':'New teammate'),node('strong','',bot.name),node('span','muted',bot.profile.label));
  const header=node('div','bot-draft-header');header.append(character(portrait(bot),58),info);
  card.append(header,node('p','',bot.profile.description));
  const actions=node('div','bot-draft-actions');
  if(draft.created_bot_id) actions.append(button('Open chat',async()=>{const bot=state.bots.find(b=>b.id===draft.created_bot_id);if(bot)await chooseBot(bot);},'outline-button'));
  else actions.append(button('Create',async()=>{
    const created=await api('/bot-drafts/'+draft.id+'/create','POST',{});
    botArrivals.set(created.id,Date.now());await refresh(true);notice(created.name+' joined your team.');
  },'primary'),button('Details',()=>newBot(draft),'outline-button'));
  card.append(actions);return decisionReceipt(card,{key:'bot-draft:'+draft.id,title:bot.name,outcome:'Teammate created',terminal:!!draft.created_bot_id});
}

// Marketplace search is served from the user's Composio project, never a static app list.
async function openMarketplace(initial = "") {
  const d = modal("Marketplace", "marketplace-dialog");
  d.id = "marketplace-dialog";
  let status;try{status=await api("/composio");}catch(e){d.append(node("p","run-error",e.message),button("Try again",()=>{d.close();return openMarketplace(initial);},"outline-button"));return;}
  if (!d.isConnected) return;
  if (!status.configured) {
    const empty = node("div", "marketplace-empty");
    empty.append(
      icon("marketplace", 36),
      node("h3", "", "Connect your apps"),
      node(
        "p",
        "muted",
        "Add your Composio project to browse the marketplace and connect apps for all your bots.",
      ),
      button(
        "Connect Composio",
        () => {
          d.close();
          return openSettings("connections");
        },
        "primary",
      ),
    );
    d.append(empty);
    return;
  }
  const head = node("div", "marketplace-controls"),
    installed = button(
      `${status.apps.length} added`,
      async () => {
        ++generation;clearTimeout(state.marketTimer);status=await api('/composio');
        installed.textContent=status.apps.length+' added';results.removeAttribute('aria-busy');results.replaceChildren();
        for (const app of status.apps) results.append(marketApp(app));
        if(!status.apps.length)results.append(actionMessage('No connected apps yet.',[button('Browse all apps',()=>{search.input.value='';return load();},'outline-button')]));
      },
      "outline-button",
    );
  const search = field("Search apps", initial, "input", {
    type: "search",
    placeholder: "Search Composio apps…",
  });
  head.append(installed, search.label);
  d.append(head);
  const featured=node('details','connector-featured');featured.append(node('summary','','Popular apps with detailed chat cards'));
  const choices=node('div','connector-featured-choices');for(const profile of connectorCatalog){const choice=button(profile.name,()=>{clearTimeout(state.marketTimer);search.input.value=profile.name;return load();},'outline-button');choice.prepend(connectorLogo({key:profile.id,name:profile.name}));choice.title=profile.description;choices.append(choice);}featured.append(node('p','muted small','Browse available connections. Each app needs its own connected account and permissions.'),choices);d.append(featured);
  const results = node("div", "marketplace-grid");
  d.append(results);
  let generation = 0;
  async function load(cursor = "", append = false) {
    const g = ++generation;
    if (!append) {results.replaceChildren();for(let i=0;i<6;i++)results.append(node("div","market-skeleton"));results.setAttribute("aria-busy","true");}
    try {
      const data = await api(
        "/marketplace?search=" +
          encodeURIComponent(search.input.value) +
          "&cursor=" +
          encodeURIComponent(cursor),
      );
      if (g !== generation || !d.isConnected) return;
      if (!append) results.replaceChildren();
      results.querySelector(".market-more")?.remove();
      const known=new Set([...results.querySelectorAll("[data-app-id]")].map(n=>n.dataset.appId));
      for (const app of data.items) if(!known.has(app.id)){results.append(marketApp(app));known.add(app.id);}
      if (!data.items.length && !append)
        results.append(
          node("p", "muted", "No matching apps. Try a different name."),
        );
      if (data.next_cursor)
        results.append(
          button(
            "Load more",
            () => load(data.next_cursor, true),
            "outline-button market-more",
          ),
        );
    } catch (e) {
      if (g === generation)
        results.replaceChildren(actionMessage(e.message,[button('Try again',()=>load(),'outline-button','refresh'),button('Connection settings',()=>{d.close();return openSettings('connections');},'subtle-button')],'run-error'));
    } finally {
      if(g===generation)results.removeAttribute('aria-busy');
    }
  }
  if (!status.configured) {
    results.append(
      node(
        "p",
        "muted",
        "Connect your Composio project to browse the live app catalog.",
      ),
      button(
        "Set up Composio",
        () => {
          d.close();
          return openSettings("connections");
        },
        "primary",
      ),
    );
  } else {
    search.input.oninput = () => {
      ++generation;
      clearTimeout(state.marketTimer);
      state.marketTimer = setTimeout(() => load(), 250);
    };
    await load();
  }
  d.addEventListener('connections-changed',()=>perform(async()=>{status=await api('/composio');if(!d.isConnected)return;installed.textContent=status.apps.length+' added';await load();}));
  function marketApp(app) {
    const box = node("article", "market-app"),
      logo = node(
        "span",
        "app-monogram",
        (app.name || app.id).slice(0, 2).toUpperCase(),
      ),
      text = node("div", "market-app-text");
    text.append(
      node("strong", "", app.name || app.id),
      node(
        "p",
        "muted small",
        app.description ||
          app.account?.status.toLowerCase() ||
          "Connect this app",
      ),
    );
    if (app.logo) {
      try {
        const u = new URL(app.logo);
        if (u.protocol === "https:" && !u.username && !u.password) {
          const image = node("img");
          image.src = u.href;
          image.alt = "";
          image.loading = "lazy";
          image.referrerPolicy = "no-referrer";
          image.onerror = () => image.remove();
          logo.replaceChildren(image);
        }
      } catch {}
    }
    box.dataset.appId=app.id;
    const details = button("", () => openAppDetails(app), "market-app-open");
    details.append(logo, text);
    box.append(
      details,
      button(
        appAccounts(app).length ? "Added" : "Add",
        () => appAccounts(app).length ? openAppDetails(app) : onboardApp(app),
        appAccounts(app).length ? "subtle-button added-app" : "outline-button",
      ),
    );
    return box;
  }
}
// Connection cards read current account metadata; chat stores only a toolkit id.
const connectionCardMetadata=new Map();
let connectionCardAccounts;
function validConnectionCard(raw){try{const value=JSON.parse(raw);return !!value&&/^[a-zA-Z0-9_-]{1,160}$/.test(value.toolkit||'');}catch{return /^[a-zA-Z0-9_-]{1,160}$/.test(raw);}}
function chatConnectionCard(raw){
  let request={};try{request=JSON.parse(raw);}catch{}const toolkit=request.toolkit||raw;
  const complete=request.question_id?async account=>{await api('/composio/'+toolkit+'/complete-connection','POST',{account_id:account.id,question_id:request.question_id});card.dataset.completed='true';status.textContent='Connected';status.className='connection-state connected';footer.replaceChildren(node('span','muted small','Connected · setup continuing'));}:null;
  const onboarding={accountName:request.account_name||'',onConnected:complete};
  const card=node('section','chat-connection-card');card.dataset.connectionToolkit=toolkit;
  const brand=connectorBrand(toolkit),head=node('div','chat-connection-head'),copy=node('div','chat-connection-copy');
  const title=button(brand.name,()=>openAppDetails({id:toolkit}),'chat-connection-title');
  const description=node('p','muted small','Loading connection…'),status=node('span','connection-state','Checking');
  copy.append(title,description);head.append(connectorLogo(brand),copy,status);
  const footer=node('div','chat-connection-accounts');card.append(head,footer);
  if(request.completed){status.textContent=request.declined?'Not now':'Connected';description.textContent=request.account_name||'Account setup';footer.append(button('Manage accounts',()=>openAppDetails({id:toolkit}),'subtle-button'));return card;}
  let revision=0;
  async function render(force=false){
    if(card.dataset.completed==='true')return;
    const ticket=++revision;
    try{
      if(force||!connectionCardAccounts||Date.now()-connectionCardAccounts.at>5000)connectionCardAccounts={at:Date.now(),promise:api('/composio')};
      if(!connectionCardMetadata.has(toolkit))connectionCardMetadata.set(toolkit,api('/marketplace/'+encodeURIComponent(toolkit)).catch(()=>null));
      const [inventory,detail]=await Promise.all([connectionCardAccounts.promise,connectionCardMetadata.get(toolkit)]);
      if(ticket!==revision||!card.isConnected)return;
      const accounts=appAccounts((inventory.apps||[]).find(a=>a.id===toolkit)||{}),app={...detail,id:toolkit,name:detail?.name||brand.name,accounts};
      title.textContent=app.name;description.textContent=(detail?.description||'Accounts connected to Kindred')+(Number.isFinite(detail?.tools_count)?' · '+detail.tools_count+' tools':'');description.title=description.textContent;
      if(detail?.logo){try{const url=new URL(detail.logo);if(url.protocol==='https:'&&!url.username&&!url.password){const image=node('img');image.alt='';image.referrerPolicy='no-referrer';image.onload=()=>{if(ticket===revision&&card.isConnected)head.firstChild.replaceChildren(image);};image.src=url.href;}}catch{}}
      const active=accounts.filter(a=>a.status==='ACTIVE').length,attention=accounts.length-active;
      status.textContent=attention?'Needs sign-in':active?'Connected':'Not connected';status.className='connection-state '+(attention?'needs-auth':active?'connected':'');
      footer.replaceChildren();
      for(const account of accounts){
        const connected=account.status==='ACTIVE',name=account.name||'default';
        const chip=button(name,()=>complete&&connected?complete(account):connected?openAppDetails(app):repairChatConnection(app,account,onboarding),'connection-account-chip '+(connected?'connected':'needs-auth'),connected?'check':'refresh');
        chip.setAttribute('aria-label',connected&&complete?'Use '+name:connected?name+' · Connected · Manage account':'Reconnect '+name);chip.title=connected?'Manage '+name:'Sign in again to '+name;footer.append(chip);
      }
      footer.append(button(accounts.length?'Add another account':'Add account',()=>onboardApp(app,null,onboarding),'subtle-button connection-add','plus'));

      if(!inventory.configured){status.textContent='Setup needed';description.textContent='Add your Composio key in Connections, then return here to connect this account.';footer.replaceChildren(button('Set up connections',()=>openSettings('connections'),'subtle-button','link'));}
      if(request.question_id&&card.dataset.completed!=='true')footer.append(button('Not now',async()=>{await api('/questions/'+request.question_id+'/answer','POST',{selected:1});card.dataset.completed='true';footer.replaceChildren(node('span','muted small','Not now'));},'subtle-button'));
    }catch(e){if(ticket!==revision||!card.isConnected)return;status.textContent='Unavailable';description.textContent='Couldn’t load connection status.';footer.replaceChildren(button('Retry',()=>render(true),'subtle-button','refresh'));}
  }
  card.refreshConnection=()=>render();
  requestAnimationFrame(()=>{if(card.isConnected)void render();});
  return card;
}
function repairChatConnection(app,account,onboarding={}){
  if(account.status==='INITIATED')return onboardApp(app,account,onboarding);
  const d=modal('Reconnect '+(account.name||app.name),'connector-dialog');
  d.append(node('p','', 'This connection needs a fresh sign-in. Add a replacement account, then select it for any affected routines. Your existing account is kept until you remove it.'),button('Add replacement account',()=>{d.close();return onboardApp(app,null,onboarding);},'primary'));
}
function appAccounts(app) { return app.accounts || (app.account ? [app.account] : []); }
function connectionsChanged() {
  connectionCardAccounts=null;connectionCardMetadata.clear();
  document.querySelectorAll('.chat-connection-card').forEach(card=>card.refreshConnection?.());
  document.querySelector('#marketplace-dialog')?.dispatchEvent(new Event('connections-changed'));
  document.querySelectorAll('.app-detail-dialog').forEach(d=>d.dispatchEvent(new Event('connections-changed')));
  if(state.settings==='connections'&&$('settings-dialog').open)perform(settingsConnections);
}
function authPopup() {
  if(window.__KINDRED_DESKTOP_VERSION)return null;
  const popup=window.open('about:blank','_blank','popup,width=540,height=740');
  if(popup){popup.opener=null;popup.document.title='Connect account';popup.document.body.textContent='Preparing sign-in…';}
  return popup;
}
function openAuthLink(url,popup) {
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname==='composio.dev'||u.hostname.endsWith('.composio.dev')))throw new Error('The provider returned an unexpected sign-in address.');
  if(popup&&!popup.closed)popup.location.replace(u.href);
  else window.open(u.href,'_blank','noopener,noreferrer');
  return u.href;
}
async function onboardApp(app, existing=null, onboarding={}) {
  const d=modal(existing?'Authenticate '+existing.name:'Add '+(app.name||app.id)+' account','connector-dialog');
  const body=node('div','connector-body'),feedback=node('p','inline-feedback');feedback.setAttribute('role','status');d.append(body);
  let timer,attempts=0;
  d.addEventListener('close',()=>clearTimeout(timer));
  function showError(e){feedback.textContent=e.message;feedback.classList.add('error');}
  function waiting(link,name) {
    const a=node('a','outline-button oauth-link','Open sign-in again');a.href=link.redirect_url;a.target='_blank';a.rel='noopener noreferrer';
    const check=async()=>{const result=await api('/composio/'+app.id+'/check','POST',{account_id:link.account_id});
      if(result.status==='ACTIVE'){clearTimeout(timer);if(onboarding.onConnected)await onboarding.onConnected({...result,id:link.account_id});body.replaceChildren(node('p','account-connected','Connected'),node('p','',name+' is ready to use.'),button('Done',()=>{d.close();connectionsChanged();},'primary'));connectionsChanged();return true;}
      feedback.textContent=result.status==='INITIATED'?'Waiting for sign-in…':'Connection status: '+result.status.toLowerCase()+'. You can manage this account from the app details.';return false;};
    body.replaceChildren(node('h3','',name),node('p','muted','Finish signing in in the window that opened.'),a,button('Check connection',async()=>{try{await check();}catch(e){showError(e);}},'primary'),feedback);
    connectionsChanged();
    async function poll(){if(!d.isConnected||++attempts>36)return;try{if(await check())return;}catch(e){showError(e);return;}timer=setTimeout(poll,5000);}
    timer=setTimeout(poll,2500);
  }
  if(existing) {
    const start=async()=>{const popup=authPopup();try{const link=await api('/composio/'+app.id+'/authenticate','POST',{account_id:existing.id});openAuthLink(link.redirect_url,popup);waiting(link,existing.name);}catch(e){popup?.close();body.replaceChildren(node('p','muted','Continue signing in to '+existing.name+'.'),button('Try again',start,'primary'),feedback);showError(e);}};
    body.append(node('p','muted','Opening sign-in…'),feedback);await start();return;
  }
  const form=node('form','account-connect-form');
  const name=field('Account name',onboarding.accountName||'','input',{required:true,maxLength:80,placeholder:'Personal, work, household…',autoComplete:'off'});
  if(!onboarding.accountName)form.append(node('p','muted','Give this account a name so your bots can tell it apart.'));form.append(name.label);
  const google=['gmail','googlecalendar','googledrive'].includes(app.id);
  const access=select(google?[['read','Read-only'],['ask','Read and write']]:[['ask','Read and write']],google?'read':'ask');
  access.setAttribute('aria-label','Access');
  const label=node('label','','Access');label.append(access);form.append(label,node('p','muted small',app.id==='gmail'?'Changes follow your bot’s approval setting.':'Changes follow the bot’s approval setting. Full access skips prompts; the permissions granted at sign-in still apply.'));
  if(app.id==='gmail'){
    label.firstChild.textContent='Bot access';
    form.append(node('p','muted small gmail-auth-disclosure','Google grants Composio full Gmail access plus contacts and profile access. Bot access above is enforced by Kindred. Use custom OAuth for narrower Google permissions.'));
  }
  let authConfig=null;
  if(!google||app.id==='gmail'){
    const advanced=node('details','oauth-help');advanced.append(node('summary','','Use a custom auth configuration'));
    authConfig=select([['','Composio default']],'');authConfig.setAttribute('aria-label','Authentication configuration');
    const configError=node('p','run-error');configError.hidden=true;advanced.append(authConfig,configError);form.append(advanced);
    const choices=authConfig;let loaded=false,loading=false;
    advanced.ontoggle=async()=>{if(!advanced.open||loaded||loading)return;loading=true;configError.hidden=true;
      try{const data=await api('/marketplace/'+app.id+'/configs');if(!choices.isConnected)return;for(const c of data.items)choices.append(new Option(c.name||c.id,c.id));loaded=true;}
      catch(e){if(choices.isConnected){configError.textContent=e.message;configError.hidden=false;}}finally{loading=false;}
    };
  }
  const submit=node('button','primary wide','Continue to sign in');submit.type='submit';form.append(submit,feedback);body.append(form);
  form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity()||submit.disabled)return;const popup=authPopup();perform(async()=>{try{
    const link=await api('/composio/'+app.id+'/connect','POST',{name:name.input.value.trim(),permission:access.value,auth_config_id:authConfig?.value||''});
    openAuthLink(link.redirect_url,popup);waiting(link,name.input.value.trim());
  }catch(e){popup?.close();showError(e);}},submit);};
  name.input.focus();
}
async function refreshResources() {
  const targets = [...document.querySelectorAll("[data-resources]")].filter(
    (n) => n.offsetParent !== null,
  );
  if (!targets.length || state.resourcesLoading) return;
  state.resourcesLoading = true;
  try {
    const r = await api("/computer/resources");
    const size = (n) => (n / 1024 ** 3).toFixed(1) + " GB";
    for (const target of targets) {
      target.replaceChildren(node("h3", "", "Resources"));
      for (const [label, percent, detail] of [
        ["CPU", r.cpu_percent, `${r.cpus} vCPU · ${r.cpu_percent.toFixed(1)}%`],
        [
          "Memory",
          (100 * r.memory_used) / r.memory_total,
          `${size(r.memory_used)} / ${size(r.memory_total)}`,
        ],
        [
          "Disk",
          (100 * r.disk_used) / r.disk_total,
          `${size(r.disk_used)} / ${size(r.disk_total)}`,
        ],
      ]) {
        const row = node("div", "resource-row"),
          title = node("div");
        title.append(node("span", "", label), node("span", "muted", detail));
        const meter = node("progress");
        meter.max = 100;
        meter.value = percent;
        meter.setAttribute("aria-label", label + " usage");
        row.append(title, meter);
        target.append(row);
      }
      target.append(
        node(
          "p",
          "muted small",
          `Uptime ${Math.floor(r.uptime_seconds / 3600)}h ${Math.floor((r.uptime_seconds % 3600) / 60)}m · Updated ${clock(r.sampled_at)}`,
        ),
      );
    }
    renderComputerRoutines();
  } catch (e) {
    for (const n of targets)
      n.replaceChildren(
        node("p", "muted small", "Resources unavailable: " + e.message),
      );
  } finally {
    state.resourcesLoading = false;
  }
}
Object.defineProperty($("prompt"), "value", {
  get() {
    return composerText(this);
  },
  set(v) {
    this.replaceChildren(document.createTextNode(v));
    resizeComposer();
    commandsUI?.refresh();
  },
});
composerLists=createComposerLists($("prompt"),chip=>{
  // Native list formatting can omit the decorative SVG; retain the live chip.
  if(!chip.querySelector('.character')){const bot=state.bots.find(b=>b.id===chip.dataset.mention);if(bot)chip.replaceChildren(...mentionBadge(bot).childNodes);}
});
commandsUI=createCommandsUI({editor:$("prompt"),composer:$("composer"),api,
  connected:()=>!!state.token,unavailable:()=>state.chat?.shared?'Workspace commands are available in private bot chats.':'',onDraft:saveDraft,openLibrary:()=>openSettings("skills")});
document.addEventListener('paste',async e=>{
  const target=e.target instanceof Element?e.target:null;
  if($('composer-area').hidden||document.querySelector('dialog[open]')||!composerChatId())return;
  if(target?.closest('input,textarea,[contenteditable="true"]')&&!target.closest('#prompt'))return;
  const destination=attachmentDestination();
  e.preventDefault();
  let clipboardFiles=transferFiles(e.clipboardData);
  const pastedText=e.clipboardData?.getData('text/plain')||'';
  if(!clipboardFiles.length&&!pastedText){try{clipboardFiles=await clipboardImages();}catch(error){notice('Could not paste image: '+(error.message||error),true);return;}}
  if(clipboardFiles.length){
    const images=clipboardFiles.map((file,index)=>file.type.startsWith('image/')?new File([file],`Screenshot ${new Date().toISOString().slice(0,19).replaceAll(':','-')}${index?' '+(index+1):''}.${({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'})[file.type]||'png'}`,{type:file.type}):file);
    void perform(()=>queueFiles(images,destination));return;
  }
  if(destination.chatId!==composerChatId()||destination.token!==state.token)return;
  const text = pastedText.slice(0,64000),sel=getSelection();
  if(!sel)return;
  let r=sel.rangeCount?sel.getRangeAt(0):null;
  if(!r||!$('prompt').contains(r.commonAncestorContainer)){r=document.createRange();r.selectNodeContents($('prompt'));r.collapse(false);}
  r.deleteContents();
  const n = document.createTextNode(text);
  r.insertNode(n);
  r.setStartAfter(n);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
  updateMentions();
  resizeComposer();
  wakeCuriousBot();
  $("prompt").dispatchEvent(new Event('input',{bubbles:true}));
});
$("new-menu").append(
  button(
    "New bot",
    () => {
      $("new-menu").hidden = true;
      newBot();
    },
    "menu-item",
    "plus",
  ),
  button("New chat", () => editChat(), "menu-item", "chat"),
);
function mountArtifactNavigation(sidebar,leave){
 const footer=document.querySelector('#sidebar .sidebar-bottom')||document.querySelector('.sidebar-bottom');
 const placeholder=document.createComment('Sidebar navigation');footer.before(placeholder);
 const entry=$('artifacts-button'),originalClick=entry.onclick,originalContents=[...entry.childNodes];
 closeIdentityMenu();entry.replaceChildren(icon('chat'),node('span','','Chats'));entry.onclick=leave;
 sidebar.append(footer);
 return ()=>{closeIdentityMenu();entry.replaceChildren(...originalContents);entry.onclick=originalClick;placeholder.replaceWith(footer);};
}
let artifactWorkspace=null,artifactWorkspaceToken=null;
function syncArtifactRoute(){
 const legacy=new URLSearchParams(location.hash.slice(1)).get('artifact'),match=location.pathname.match(/^\/artifacts(?:\/([^/]+))?\/?$/),requested=!!match||!!legacy;
 if(artifactWorkspace&&artifactWorkspaceToken!==state.token){artifactWorkspace.dispose();artifactWorkspace=null;}
 if(!state.token)return;
 if(!requested){if(artifactWorkspace){if(!artifactWorkspace.canLeave()){history.pushState({},'',artifactWorkspace.selected?'/artifacts/'+encodeURIComponent(artifactWorkspace.selected):'/artifacts');return;}artifactWorkspace.dispose();artifactWorkspace=null;}return;}
 if(!artifactWorkspace){artifactWorkspaceToken=state.token;artifactWorkspace=artifactStudio({api,markdown,mountNavigation:mountArtifactNavigation,authorBadge:(artifact,leave,currentKey)=>{if(artifact.created_by!=='bot')return null;const bot=state.bots.find(b=>b.id===artifact.bot_id);if(!bot)return null;const key=JSON.stringify([bot.name,profile(bot)]);if(key===currentKey)return {key};const element=mentionBadge(bot,false);element.classList.add('mention-link');element.tabIndex=0;element.setAttribute('role','link');element.setAttribute('aria-label','Open '+bot.name);const open=()=>{if(leave())void chooseBot(state.bots.find(b=>b.id===bot.id)||bot);};element.onclick=e=>{e.stopPropagation();open();};element.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};return {element,key};},baseUrl:state.status.public_url||location.origin,chats:state.chats,initialChatId:currentConversationId(),onExit:()=>{artifactWorkspace=null;history.pushState({},'', '/');},onNavigate:id=>{const path=id?'/artifacts/'+encodeURIComponent(id):'/artifacts';if(location.pathname!==path||location.hash)history.pushState({},'',path);}});$('app').append(artifactWorkspace.root);}
 const id=match?.[1]?decodeURIComponent(match[1]):legacy||null;
 if(artifactWorkspace.selected!==id)void artifactWorkspace.open(id);
}
window.addEventListener('popstate',syncArtifactRoute);
window.addEventListener('hashchange',syncArtifactRoute);
$('artifacts-button').onclick=()=>{history.pushState({},'','/artifacts');syncArtifactRoute();};
$('artifacts-button').replaceChildren(icon('folder'),node('span','','Artifacts'));
$("marketplace-button").onclick = () => perform(openMarketplace);
document.addEventListener("click", (e) => {
  if (!e.target.closest("#new-menu,#new-bot")) $("new-menu").hidden = true;
});
setInterval(() => {
  if (state.token && !document.hidden) refreshResources();
}, 5000);

function normalizePromptMentions() {
  const editor = $("prompt"),
    walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT),
    nodes = [];
  let n;
  while ((n = walker.nextNode()))
    if (!n.parentElement.closest("[data-mention]")) nodes.push(n);
  for (const t of nodes) {
    const replacement = renderMentions(t.textContent);
    if (replacement.querySelector("[data-mention]"))
      t.replaceWith(...replacement.childNodes);
  }
}

function saveDraft() {
  state.drafts ??= new Map();
  state.drafts.set(state.chat?.id || `dm-${state.bot?.id}`, $("prompt").value);
}
function restoreDraft() {
  $("prompt").value =
    state.drafts?.get(state.chat?.id || `dm-${state.bot?.id}`) || "";
  normalizePromptMentions();
  resizeComposer();
  $("mention-options").hidden = true;
  renderReplyDraft();
}

// Dialog backdrops dismiss without requiring the user to scroll to a close button.
let backdropDown = null;
document.addEventListener("pointerdown", (e) => {
  backdropDown = e.target instanceof HTMLDialogElement ? e.target : null;
});
document.addEventListener("click", (e) => {
  const d = e.target;
  if (d === backdropDown && d instanceof HTMLDialogElement) {
    const r = d.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      d.close();
  }
  backdropDown = null;
  if (!e.target.closest("#identity-menu,#identity-button"))
    closeIdentityMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeIdentityMenu(true);
});
window.addEventListener("online", () => {
  if (!$("computer-panel").hidden) perform(connectDesktop);
});
function closeIdentityMenu(restoreFocus=false){
  const menu=$('identity-menu');if(!menu)return;
  const focused=menu.contains(document.activeElement);menu.remove();$('identity-button').setAttribute('aria-expanded','false');
  if(restoreFocus&&focused)$('identity-button').focus();
}
function toggleIdentityMenu() {
  if ($("identity-menu")) {
    closeIdentityMenu();
    return;
  }
  const menu = node("div", "identity-menu");
  menu.id = "identity-menu";
  menu.setAttribute("role", "menu");
  menu.append(
    button(
      "Settings",
      () => {
        closeIdentityMenu();
        return openSettings();
      },
      "identity-menu-item",
      "settings",
    ),
  );
  if(window.__KINDRED_DESKTOP && state.updateRelease)menu.append(button("Update Kindred client",()=>{closeIdentityMenu();return clientUpdateAction();},"identity-menu-item","download"));
  const branch=node('div','usage-branch'),entry=button('Usage',()=>perform(showUsage),'identity-menu-item','clock'),fly=node('div','usage-flyout provider-usage-list');
  entry.append(icon('chevron',14));entry.setAttribute('aria-haspopup','menu');entry.setAttribute('aria-expanded','false');fly.hidden=true;branch.append(entry,fly);menu.append(branch);
  let catalogSignature='';
  function place(panel,anchor,width) {
    const r=anchor.getBoundingClientRect(),w=Math.min(width,innerWidth-24);
    panel.style.position='fixed';panel.style.width=w+'px';panel.style.right='auto';
    let left=r.right-2,bottom=Math.max(12,innerHeight-r.bottom);
    if(left+w>innerWidth-12)left=r.left-w+2;
    if(left<12){left=Math.max(12,Math.min(r.left,innerWidth-w-12));bottom=Math.max(12,innerHeight-r.top);}
    panel.style.left=left+'px';panel.style.bottom=bottom+'px';panel.style.maxHeight=Math.max(120,Math.min(560,innerHeight-bottom-12))+'px';
  }
  function showUsage() {
    fly.hidden=false;entry.setAttribute('aria-expanded','true');place(fly,branch,210);
      const providers=state.providerAccounts||[];
      const connected=providers.filter(p=>p.connected||p.has_usage);
      const signature=JSON.stringify(connected.map(p=>[p.id,p.name,p.connected,p.has_usage]));
      if(signature===catalogSignature||fly.contains(document.activeElement))return;
      catalogSignature=signature;fly.replaceChildren();
      if(!connected.length)fly.append(node('p','muted small',state.providerAccounts?'No providers connected. Add one in Settings → Connections.':'Provider status will appear here when connected.'));
      for(const provider of connected) {
        const group=node('div','usage-branch'),item=button(provider.name,()=>provider.kind==='api'?openProviderUsage(provider):open(),'identity-menu-item'),detail=node('div','usage-flyout provider-usage-detail');
        item.append(icon('chevron',14));item.setAttribute('aria-haspopup',provider.kind==='api'?'dialog':'true');item.setAttribute('aria-expanded','false');
        if(!provider.connected)item.title='Disconnected · recorded usage available';
        detail.hidden=true;group.append(item,detail);fly.append(group);
        let fetched=false,busy=false,skipFocus=false;
        async function open() {
          for(const other of fly.querySelectorAll('.provider-usage-detail'))if(other!==detail){other.hidden=true;other.previousElementSibling?.setAttribute('aria-expanded','false');}
          detail.hidden=false;item.setAttribute('aria-expanded','true');place(detail,group,provider.kind==='api'?390:330);
          if(fetched||busy)return;busy=true;
          try {await renderProviderUsage(detail,provider);fetched=true;}catch(e){detail.replaceChildren(node('p','muted small',e.message));}finally{busy=false;}
        }
        group.onmouseenter=()=>perform(open);item.onfocus=()=>{if(skipFocus){skipFocus=false;return;}perform(open);};
        group.addEventListener('keydown',e=>{if(e.key==='Escape'||e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();detail.hidden=true;item.setAttribute('aria-expanded','false');skipFocus=document.activeElement!==item;item.focus();}else if(e.key==='ArrowRight'){e.preventDefault();perform(open);}});
      }
  }
  menu.addEventListener('providersupdated',()=>{if(!fly.hidden)showUsage();});
  fly.addEventListener('focusout',()=>queueMicrotask(()=>{if(menu.isConnected&&!fly.hidden&&!fly.contains(document.activeElement))showUsage();}));
  branch.onmouseenter=()=>perform(showUsage);entry.onfocus=()=>perform(showUsage);
  branch.onmouseleave=()=>{if(!branch.contains(document.activeElement)){fly.hidden=true;entry.setAttribute('aria-expanded','false');}};
  document.body.append(menu);
  $("identity-button").setAttribute("aria-expanded","true");
  const anchor = $("identity-button").getBoundingClientRect();
  menu.style.left = anchor.left + "px";
  menu.style.bottom = innerHeight - anchor.top + 8 + "px";
}
function renderCodexUsage(fly,data) {
      const account = data.account;
      if (account?.type !== "chatgpt") {
        fly.append(
          node("strong", "", "No subscription connected"),
          node("p", "muted small", "Sign in under Settings → Connections."),
        );
        return;
      }
      const plan = account.planType
        ? account.planType.replaceAll("_", " ")
        : "subscription";
      fly.append(
        node(
          "strong",
          "usage-plan",
          "ChatGPT " + plan.replace(/\b\w/g, (c) => c.toUpperCase()),
        ),
      );
      const buckets = data.limits?.rateLimitsByLimitId;
      const entries =
        buckets && Object.keys(buckets).length
          ? Object.entries(buckets)
          : [["Codex", data.limits?.rateLimits]];
      let shown = 0;
      for (const [key, bucket] of entries) {
        if (!bucket) continue;
        if (entries.length > 1)
          fly.append(
            node(
              "p",
              "muted small",
              bucket.limitName || (key === "codex" ? "Codex" : key),
            ),
          );
        const windows = [bucket.primary, bucket.secondary].filter(Boolean);
        for (const minutes of [300, 10080])
          if (!windows.some((w) => w.windowDurationMins === minutes)) {
            const unavailable = node("div", "usage-line usage-unavailable");
            unavailable.append(
              node("span", "", minutes === 300 ? "5 hours" : "Weekly"),
              node("span", "muted", "Not reported"),
            );
            fly.append(unavailable);
          }
        for (const w of windows) {
          if (!w || typeof w.usedPercent !== "number") continue;
          const remaining = Math.max(0, Math.min(100, 100 - w.usedPercent)),
            mins = w.windowDurationMins;
          const label =
            mins === 300
              ? "5 hours"
              : mins === 10080
                ? "Weekly"
                : mins
                  ? `${mins / 60} hours`
                  : "Usage window";
          const row = node("div", "usage-window"),
            line = node("div", "usage-line");
          line.append(
            node("span", "", label),
            node("strong", "", `${Math.round(remaining)}% remaining`),
          );
          const meter = node("div", "usage-meter"),
            fill = node("i");
          fill.style.width = remaining + "%";
          meter.append(fill);
          row.append(line, meter);
          if (w.resetsAt)
            row.append(
              node(
                "p",
                "muted small",
                "Resets " +
                  new Date(w.resetsAt * 1000).toLocaleString(undefined, {timeZone:botTimezone(),
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  }),
              ),
            );
          fly.append(row);
          shown++;
        }
      }
      if (!shown)
        fly.append(
          node("p", "muted small", "Usage limits are currently unavailable."),
        );
      fly.append(node("p", "muted small", "Shared across your subscription."));
}
async function renderProviderUsage(root,provider) {
  root.replaceChildren(node('strong','usage-plan',provider.name));
  if(provider.id==='codex') {const data=await api('/codex/usage','POST',{});root.replaceChildren();renderCodexUsage(root,data);return;}
  if(provider.kind==='subscription') {
    let data;
    try{data=await api('/provider-cli/'+provider.id+'/usage','POST',{});}
    catch{data={usage_message:'Account limits are temporarily unavailable.'};}
    const account=node('section','usage-account');
    for(const w of data.windows || []) {
      const used=Number(w.used),limit=Number(w.limit),row=node('div','usage-window');
      row.append(node('div','usage-line',w.label+' · '+(limit>0?Math.max(0,Math.round((1-used/limit)*100))+'% remaining':'Not reported')));
      if(w.reset_hint)row.append(node('p','muted small',w.reset_hint));account.append(row);
    }
    if(!data.windows?.length)account.append(node('p','muted small',data.usage_url?'Account limits are available on the provider’s website.':data.usage_message||'Account limits are not reported.'));
    if(data.usage_url){const link=node('a','usage-provider-link',provider.id==='claude-code'?'View Claude usage':'View '+provider.name+' usage');link.href=data.usage_url;link.target='_blank';link.rel='noopener noreferrer';link.append(icon('link',14));account.append(link);}
    root.append(account);
  }
  const quota=[...root.childNodes],cached=usageSnapshots.get(provider.id);
  const paint=data=>{
    root.replaceChildren(...quota);
    const history=node('section','usage-recorded');
    history.append(node('strong','usage-section-title','In Kindred'));
    if(!data.bots.length)history.append(node('p','muted small','No requests recorded yet.'));
    else history.append(usageTable(sortUsageBots(data.bots,provider.kind==='api'?'cost':'tokens',true).slice(0,5),provider,false));
    if(data.bots.length||provider.kind==='api')history.append(button(data.bots.length>5?'View all '+data.bots.length+' bots':'View usage details',()=>openProviderUsage(provider),'usage-view-all'));
    if(data.bots.length>5)history.append(node('p','muted small','Top 5 by '+(provider.kind==='api'?'known cost.':'recorded tokens.')));
    root.append(history);
  };
  if(cached?.data)paint(cached.data);
  else root.append(node('p','muted small','Loading usage…'));
  try{paint(await recordedProviderUsage(provider));}catch(e){if(!cached?.data)throw e;root.append(node('p','muted small','Showing saved usage. '+e.message));}
}
const usageMoney=value=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4}).format(value||0);
const usageNumber=value=>Number(value||0).toLocaleString();
const usageTokens=b=>Number(b.input_tokens||0)+Number(b.output_tokens||0);
const usageCost=b=>Number(b.reported_cost||0)+Number(b.estimated_cost||0);
const usageKnownCost=b=>Number(b.reported_requests||0)+Number(b.estimated_requests||0)>0;
const usageStatus=b=>b.status|| (b.profile?.archived?'archived':'active');
function sortUsageBots(bots,key,descending) {
  const value=b=>({cost:usageCost(b),tokens:usageTokens(b),input:b.input_tokens||0,output:b.output_tokens||0,cached:b.cached_tokens||0,requests:b.requests||0,recent:b.last_used_at||b.since||0,name:b.name||''})[key];
  return [...bots].sort((a,b)=>{
    if(key==='cost'&&usageKnownCost(a)!==usageKnownCost(b))return usageKnownCost(a)?-1:1;
    const delta=key==='name'?String(value(a)).localeCompare(String(value(b)),undefined,{sensitivity:'base'}):value(a)-value(b);
    return delta*(descending?-1:1)||(a.name||'').localeCompare(b.name||'')||String(a.bot_id||'').localeCompare(String(b.bot_id||''));
  });
}
function usageIdentity(b) {
  const wrap=node('div','usage-bot-identity'),label=node('div','usage-bot-label'),avatar=character({...portrait(b),animated:false},32);
  avatar.setAttribute('aria-hidden','true');label.append(node('strong','',b.name||'Deleted bot'));
  const status=usageStatus(b);if(status!=='active')label.append(node('span','usage-bot-status',status==='deleted'?'Deleted':'Archived'));
  wrap.append(avatar,label);return wrap;
}
function usageCostCell(b) {
  const cost=node('td','usage-cost');
  if(b.reported_requests>0)cost.append(node('div','',usageMoney(b.reported_cost)+' reported'));
  if(b.estimated_requests>0)cost.append(node('div','',usageMoney(b.estimated_cost)+' est.'));
  if(b.unpriced_requests)cost.append(node('div','muted',usageNumber(b.unpriced_requests)+' unpriced'));
  if(!cost.children.length)cost.textContent='Not reported';return cost;
}
function usageTable(bots,provider,full) {
  const table=node('table',full?'usage-history-table':'bot-usage-table'),head=node('tr');
  for(const label of ['Bot','Tokens',...(provider.kind==='api'?['USD']:[]),...(full?['Requests / last used']:[])]){const th=node('th','',label);th.scope='col';head.append(th);}
  const thead=node('thead');thead.append(head);table.append(thead);const body=node('tbody');
  for(const b of bots){
    const row=node('tr'),name=node('td'),tokens=node('td','usage-tokens');row.dataset.botId=b.bot_id||'';row.dataset.status=usageStatus(b);name.append(usageIdentity(b));
    tokens.append(node('div','',usageNumber(usageTokens(b))+(b.unreported_tokens?' + unknown':'')));
    const breakdown=usageNumber(b.input_tokens)+' input · '+usageNumber(b.output_tokens)+' output · '+usageNumber(b.cached_tokens)+' cached input';
    tokens.title=breakdown;if(full)tokens.append(node('div','muted small',breakdown));row.append(name,tokens);
    if(provider.kind==='api')row.append(usageCostCell(b));
    if(full){const last=node('td','usage-last'),stamp=b.last_used_at||b.since;last.append(node('div','',usageNumber(b.requests)+' requests'));if(stamp){const when=node('time','muted small',new Date(stamp*1000).toLocaleDateString(undefined,{timeZone:botTimezone()}));when.dateTime=new Date(stamp*1000).toISOString();when.title=new Date(stamp*1000).toLocaleString(undefined,{timeZone:botTimezone()});last.append(when);}row.append(last);}
    body.append(row);
  }
  table.append(body);return table;
}
async function openProviderUsage(provider) {
  $('identity-menu')?.remove();
  if($('provider-usage-dialog'))return;
  const dialog=node('dialog','provider-usage-dialog');dialog.id='provider-usage-dialog';dialog.setAttribute('aria-labelledby','provider-usage-title');
  const header=node('header','dialog-header'),title=node('h2','',provider.name+' usage');title.id='provider-usage-title';
  header.append(title,iconButton('close','Close usage',()=>dialog.close()));
  const summary=node('div','usage-history-summary'),toolbar=node('div','usage-history-toolbar'),content=node('div','usage-history-content'),count=node('p','usage-history-count muted small'),footer=node('div','usage-history-footer'),status=node('p','muted small');status.setAttribute('role','status');
  const search=node('input');search.type='search';search.placeholder='Search bots';search.setAttribute('aria-label','Search bots');
  function select(label,choices){const wrap=node('label','usage-filter'),text=node('span','muted small',label),input=node('select');input.setAttribute('aria-label',label);for(const [id,name] of choices){const option=node('option','',name);option.value=id;input.append(option);}wrap.append(text,input);toolbar.append(wrap);return input;}
  toolbar.append(search);
  const sort=select('Sort by',[...(provider.kind==='api'?[['cost','Cost']]:[]),['tokens','Total tokens'],['input','Input tokens'],['output','Output tokens'],['cached','Cached tokens'],['requests','Requests'],['recent','Last used'],['name','Name']]);
  let descending=true,data=usageSnapshots.get(provider.id)?.data;
  const direction=iconButton('arrow-down','Sort ascending',()=>{descending=!descending;render();});direction.classList.add('usage-sort-direction');toolbar.append(direction);
  const filter=select('Bot status',[['all','All bots'],['active','Active'],['archived','Archived'],['deleted','Deleted']]);
  const refresh=button('Refresh usage',()=>load(true),'subtle-button');footer.append(status,refresh);
  dialog.append(header,summary,toolbar,count,content,footer);document.body.append(dialog);
  dialog.addEventListener('close',()=>{dialog.remove();$('identity-button').focus();},{once:true});dialog.showModal();
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(control=>control.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  const summaryMetric=(label,value)=>{const box=node('div','usage-summary-metric');box.append(node('span','muted small',label),node('strong','',value));summary.append(box);};
  function render(){
    direction.setAttribute('aria-label',descending?'Sort ascending':'Sort descending');direction.title=descending?'Largest first · sort ascending':'Smallest first · sort descending';direction.textContent=descending?'↓':'↑';
    if(!data){content.replaceChildren(node('p','muted','Loading usage…'));return;}
    summary.replaceChildren();
    const total=data.bots.reduce((a,b)=>{for(const k of Object.keys(a))a[k]+=Number(b[k]||0);return a;},{input_tokens:0,output_tokens:0,reported_cost:0,estimated_cost:0,reported_requests:0,estimated_requests:0,unpriced_requests:0,unreported_tokens:0,requests:0});
    summaryMetric('Recorded tokens',usageNumber(usageTokens(total))+(total.unreported_tokens?' + unknown':''));
    if(provider.kind==='api'){
      summaryMetric('Reported cost',total.reported_requests?usageMoney(total.reported_cost):'Not reported');
      summaryMetric('Estimated cost',total.estimated_requests?usageMoney(total.estimated_cost):'None recorded');
    }else summary.classList.add('usage-subscription-summary');
    summaryMetric('Requests',usageNumber(total.requests)+(provider.kind==='api'&&total.unpriced_requests?' · '+usageNumber(total.unpriced_requests)+' unpriced':''));
    const query=search.value.trim().toLocaleLowerCase(),rows=sortUsageBots(data.bots.filter(b=>(filter.value==='all'||usageStatus(b)===filter.value)&&(!query||(b.name||'').toLocaleLowerCase().includes(query))),sort.value,descending);
    count.textContent=rows.length+' of '+data.bots.length+' bots · Totals include all recorded bots';
    content.replaceChildren(rows.length?usageTable(rows,provider,true):node('p','usage-empty muted',data.bots.length?'No bots match these filters.':'No recorded Kindred usage yet.'));
  }
  function showFreshness(error=''){
    const snapshot=usageSnapshots.get(provider.id),when=snapshot?.updated?new Date(snapshot.updated).toLocaleTimeString([],{timeZone:botTimezone(),hour:'numeric',minute:'2-digit'}):'';
    status.textContent=error?(data?'Showing saved usage. ':'')+error:(when?'Updated '+when+'. ':'')+(data?.scope||'Recorded Kindred requests since usage tracking began. Provider billing is authoritative.')+(provider.kind==='api'?' Cost sorting combines reported and estimated amounts; unpriced requests are excluded.':'');
  }
  async function load(force=false){
    try{const next=await recordedProviderUsage(provider,force);if(!dialog.isConnected)return;data=next;render();showFreshness();}catch(e){if(!dialog.isConnected)return;if(!data)content.replaceChildren(node('p','muted','Usage could not be loaded. Try Refresh usage.'));showFreshness(e.message);}
  }
  search.oninput=render;sort.onchange=()=>{descending=sort.value!=='name';render();};filter.onchange=render;
  render();showFreshness();await load();
}
$("marketplace-button").replaceChildren(
  icon("marketplace"),
  document.createTextNode("Marketplace"),
);

async function restartDraftKey(){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(state.token||""));
  return "kindred-update-resume-"+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
}
async function updateKindred(){
  if(window.__KINDRED_DESKTOP&&state.token)await nativeInvoke('start_desktop',{token:state.token});
  saveDraft();
  const key=await restartDraftKey();
  state.updateResumeKey=key;
  localStorage.setItem(key,JSON.stringify(conversationSnapshot()));
  if(window.__KINDRED_LINUX_UPDATER&&!window.__KINDRED_SERVER_UPDATER)return nativeInvoke('open_linux_update',{});
  // Native navigation is intercepted before leaving the chat. Using the same
  // view also avoids WebKit popup restrictions after asynchronous draft saving.
  window.open("kindred-update://check",['linux','macos'].includes(window.__KINDRED_DESKTOP?.platform)?'_self':'_blank');
}

addEventListener('kindred-before-client-restart',async()=>{
  saveDraft();state.updateResumeKey=await restartDraftKey();
  localStorage.setItem(state.updateResumeKey,JSON.stringify(conversationSnapshot()));
});
addEventListener("beforeunload",()=>{
  if(!state.updateResumeKey)return;
  saveDraft();localStorage.setItem(state.updateResumeKey,JSON.stringify(conversationSnapshot()));
});
function conversationSnapshot(){
  saveDraft();
  return {drafts:[...state.drafts],replies:[...state.replyDrafts],sends:[...state.pendingSends],files:[...pendingFiles].map(([id,files])=>[id,files.filter(f=>!f.loading)]),selection:{bot:state.bot?.id,chat:state.chat?.id}};
}
function persistConversation(){
  if(!state.reloadResumeKey)return;
  try{sessionStorage.setItem(state.reloadResumeKey,JSON.stringify(conversationSnapshot()));}catch{/* Storage failure cannot block sending or navigation. */}
}
addEventListener('pagehide',()=>{
  pageSuspended=true;
  persistConversation();
  for(const request of pendingApiRequests)request.abort('pagehide');
});
addEventListener('pageshow',e=>{pageSuspended=false;if(e.persisted&&state.token)void perform(()=>refresh(true));});

// Every finite UI effect must settle even if a webview drops its finish event.
// Cancellation for a new interaction discards the old destination; cancellation
// by the browser, reduced motion or backgrounding settles the current destination.
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)'),activeMotion=new Set(),paneMotion=new WeakMap();
function motionAllowed() { return !document.hidden && document.hasFocus() && !state.general.reduced_motion && document.documentElement.dataset.motion!=='off' && !motionPreference.matches; }
function trackMotion(animation,duration,settled=()=>{}) {
  let timer,done=false;
  const settle=complete=>{
    if(done)return;done=true;clearTimeout(timer);activeMotion.delete(control);
    animation.onfinish=null;animation.oncancel=null;animation.cancel();settled(complete);
  };
  const control={cancel:()=>settle(false),finish:()=>settle(true)};
  activeMotion.add(control);animation.onfinish=control.finish;animation.oncancel=control.finish;
  timer=setTimeout(control.finish,duration+120);
  return control;
}
function settleMotion(){if(!motionAllowed())for(const motion of [...activeMotion])motion.finish();}
// Status loops share the document clock. A routine render that recreates their
// dots or label continues the current pulse instead of restarting it.
const statusLoops=new Set(['provider-retry-dot','connector-call-dot','group-working-pulse','working-glimmer']);
function continueLoops(root){
  if(!root?.getAnimations)return;
  for(const loop of root.getAnimations({subtree:true}))if(statusLoops.has(loop.animationName)&&loop.startTime!==0)loop.startTime=0;
}
motionPreference.addEventListener('change',settleMotion);
document.addEventListener('visibilitychange',settleMotion);
window.addEventListener('blur',()=>{for(const motion of [...activeMotion])motion.finish();});
new MutationObserver(settleMotion).observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
function panePose(panel){const style=getComputedStyle(panel);return {opacity:style.opacity,transform:style.transform};}
function showPane(panel) {
  const prior=paneMotion.get(panel),start=panel.hidden?{opacity:0,transform:'translateX(24px)'}:panePose(panel);
  const animate=panel.hidden||!!prior;prior?.cancel();panel.hidden=false;panel.inert=false;
  if(animate&&motionAllowed())paneMotion.set(panel,trackMotion(panel.animate([start,{opacity:1,transform:'translateX(0)'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'}),240,()=>paneMotion.delete(panel)));
}
function hidePane(panel) {
  if(panel.id==='computer-panel')finishComputerTransition();
  if(panel.id==='details-panel'&&state.view==='artifacts'){$('details-content').replaceChildren();state.view='details';state.panelKey='';}
  const start=panePose(panel);paneMotion.get(panel)?.cancel();
  if(panel.hidden) return;
  if(panel.contains(document.activeElement))$(panel.id==='computer-panel'?'show-computer':'bot-details')?.focus({preventScroll:true});
  panel.inert=true;
  if(!motionAllowed()) {panel.hidden=true;return;}
  paneMotion.set(panel,trackMotion(panel.animate([start,{opacity:0,transform:'translateX(24px)'}],{duration:170,easing:'ease-in'}),170,complete=>{paneMotion.delete(panel);if(complete)panel.hidden=true;}));
}
let computerTransition=null;
function refitComputer(){if(state.rfb)state.rfb.scaleViewport=true;}
function finishComputerTransition(){computerTransition?.();refitComputer();}
window.addEventListener('resize',finishComputerTransition);
function setComputerExpanded(expanded) {
  const panel=$('computer-panel'),screen=$('desktop'),before=panel.getBoundingClientRect(),screenBefore=screen.getBoundingClientRect(),changed=panel.classList.contains('expanded')!==expanded;
  finishComputerTransition();
  if(changed)panel.getAnimations().forEach(a=>a.cancel());
  panel.classList.toggle('expanded',expanded);
  const after=panel.getBoundingClientRect(),screenAfter=screen.getBoundingClientRect();
  if(changed&&before.width&&after.width&&motionAllowed()){
    // Animate real dimensions: scaling the ancestor makes noVNC apply the scale
    // again when it measures the canvas, causing a shrunken frame and a flash.
    const panelStyle=panel.style.cssText,screenStyle=screen.style.cssText;
    let spacer=null;
    if(['static','relative'].includes(getComputedStyle(panel).position)){
      spacer=node('div');spacer.setAttribute('aria-hidden','true');spacer.style.cssText=`flex:none;width:${after.width}px;`;panel.before(spacer);
    }
    Object.assign(panel.style,{position:'fixed',inset:'auto',left:after.x+'px',top:after.y+'px',width:after.width+'px',height:after.height+'px',minWidth:'0',maxWidth:'none',zIndex:'20',overflow:'hidden'});
    Object.assign(screen.style,{flex:'none',height:screenAfter.height+'px',minHeight:'0'});
    const timing={duration:320,easing:'cubic-bezier(.22,1,.36,1)'},rect=r=>({left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
    const animation=panel.animate([rect(before),rect(after)],timing),screenAnimation=screen.animate([{height:screenBefore.height+'px'},{height:screenAfter.height+'px'}],timing);
    let frame;
    const fit=()=>{refitComputer();frame=requestAnimationFrame(fit);};frame=requestAnimationFrame(fit);
    const cleanup=()=>{computerTransition=null;cancelAnimationFrame(frame);screenAnimation.cancel();panel.style.cssText=panelStyle;screen.style.cssText=screenStyle;spacer?.remove();refitComputer();};
    computerTransition=trackMotion(animation,timing.duration,cleanup).finish;
  }else refitComputer();
  $('computer-expand').setAttribute('aria-label',expanded?'Collapse computer':'Expand computer');
  $('computer-expand').title=expanded?'Collapse computer':'Expand computer';
  $('computer-expand').replaceChildren(icon(expanded?'chevrons-right':'expand'));
}
function avatarMenu(bot) {
  const wrap=node('div','avatar-menu');
  wrap.dataset.botId=bot.id;
  const trigger=button('',()=>wrap.classList.toggle('menu-open'),'avatar-customize');
  trigger.title="Edit avatar";
  trigger.setAttribute('aria-label','Customize '+bot.name);trigger.append(character(portrait(bot),82));
  const menu=node('div','avatar-popover');
  menu.append(node('strong','','Customize'));
  const shapeChoices=node('div','shape-options quick-shapes');
  shapeChoices.setAttribute('role','group');shapeChoices.setAttribute('aria-label','Shape');
  const choose=async patch=>{wrap.classList.add('menu-open');await saveAvatarChoice(bot,patch);};
  for(const shape of shapes) {
    const b=button('',()=>choose({shape}),'shape-option');
    b.onclick=()=>perform(()=>choose({shape}));
    b.title=shape;b.setAttribute('aria-label',shape);b.dataset.shape=shape;shapeChoices.append(b);
  }
  const swatches=node('div','quick-colors');
  swatches.setAttribute('role','group');swatches.setAttribute('aria-label','Color');
  for(const [name,color] of colors) {
    const b=button('',()=>choose({color}),'color-option');
    b.onclick=()=>perform(()=>choose({color}));
    b.dataset.color=color;
    b.style.backgroundColor=color==='#ffffff'?'var(--fg)':color;b.title=name;b.setAttribute('aria-label',name);swatches.append(b);
  }
  wrap.updateProfile=updated=>{
    bot=updated;const p=portrait(bot);
    trigger.setAttribute('aria-label','Customize '+bot.name);replaceCharacter(trigger,p,82);
    for(const b of shapeChoices.children) {
      const selected=b.dataset.shape===p.shape;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));
      b.replaceChildren(character({...p,name:'',shape:b.dataset.shape,animated:false},44));
    }
    for(const b of swatches.children) {
      const selected=b.dataset.color===p.color;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));
    }
  };
  wrap.updateProfile(bot);
  menu.append(shapeChoices,swatches);
  wrap.append(trigger,menu);return wrap;
}
function routineAssignee(id) {
  const bot=state.bots.find(b=>b.id===id),row=node('span','routine-assignee muted small');
  if(bot){const avatar=buddy(bot,22);avatar.setAttribute('aria-hidden','true');row.append(avatar);}
  row.append(node('span','',bot?.name||'Assigned bot'));
  return row;
}
function scheduledRoutineCard(r,showBot=false){
  const row=node('div','routine-card'),copy=node('div','routine-copy');row.classList.toggle('is-disabled',!r.enabled);
  copy.append(button(r.name,()=>editRoutine(r),'routine-name'),node('span','muted small',(r.enabled?'':r.run_at&&r.last_run?'One-time check '+r.last_run.status+' · ':'Paused · ')+routineScheduleLabel(r)));
  if(showBot){
    row.classList.add('routine-card-assigned');
    const bot=state.bots.find(b=>b.id===r.bot_id),avatar=node('span','routine-avatar');
    avatar.title=bot?.name||'Assigned bot';avatar.setAttribute('role','img');avatar.setAttribute('aria-label',avatar.title);avatar.tabIndex=0;
    if(bot)avatar.append(buddy(bot,38));else avatar.append(icon('bot',28));
    const label=node('span','routine-avatar-tooltip',avatar.title);label.setAttribute('role','tooltip');avatar.append(label);row.append(avatar);
  }
  if(r.provider_inbox)copy.append(node('span','muted small',(r.provider_inbox.name||'Connected inbox')+' · scheduled AI review'));
  if(r.enabled&&r.next_run)copy.append(node('span','muted small','Next: '+new Date(r.next_run*1000).toLocaleString(undefined,{timeZone:r.schedule?.timezone||botTimezone(),timeZoneName:'short'})));
  row.append(copy);const actions=node('div','row-actions');
  const reload=async()=>{await refresh();renderComputerRoutines();if(state.settings==='routines'&&$('settings-dialog').open)await settingsRoutines();};
  actions.append(button('Run now',async()=>{await api('/routines/'+r.id+'/run','POST',{});notice('Routine queued.');await reload();},'outline-button','play'),button(r.enabled?'Pause':'Enable',async()=>{if(!r.enabled&&r.run_at&&r.run_at<=Date.now()/1000){editRoutine(r);return;}await api('/routines/'+r.id,'PATCH',{enabled:!r.enabled});await reload();},'outline-button',r.enabled?'pause':'play'),iconButton('trash','Delete routine',async()=>{if(!confirm('Delete routine “'+r.name+'”?'))return;await api('/routines/'+r.id,'DELETE');await reload();}));
  row.append(actions);return row;
}
function renderComputerRoutines() {
  const root=$('computer-routines'),routines=state.routines.filter(r=>r.bot_id===screenBotId());
  const key=JSON.stringify([screenBotId(),routines]);if(root.dataset.key===key)return;root.dataset.key=key;
  const head=node('div','section-toolbar');head.append(node('h3','','Routines'),iconButton('plus','Create routine',()=>editRoutine()));root.replaceChildren(head);
  for(const r of routines) {
    if(r.trigger!=='activity'){root.append(scheduledRoutineCard(r));continue;}
    const row=node('div','routine-card'),copy=node('div','routine-copy');row.classList.toggle('is-disabled',!r.enabled);
    copy.append(button(r.name,()=>openActivityRoutine(r),'routine-name'),node('span','muted small',(r.enabled?'':'Paused · ')+'Constant'));
    if(r.monitor.error)copy.append(node('span','run-error small',r.monitor.error));
    const actions=node('div','row-actions');
    actions.append(button('Details',()=>openSettings('routines')),button(r.enabled?'Pause':'Resume',async()=>{if(r.enabled)await api('/inbox-monitors/'+r.id+'/pause','POST',{});else await api('/inbox-monitors','POST',inboxWatchInput(r.monitor,{enabled:true}));await refresh();renderComputerRoutines();}));
    row.append(copy,actions);root.append(row);
  }
}
async function openAppDetails(app) {
  const d=modal(app.name||app.id,'app-detail-dialog');
  const head=d.querySelector('header');head.prepend(button('Marketplace',()=>{d.close();if(!$('marketplace-dialog')?.open)return openMarketplace();},'subtle-button','back'));
  const content=node('div','app-detail-content');d.append(content);
  async function render() {
    try{const [status,detail]=await Promise.all([api('/composio'),app.description?Promise.resolve(app):api('/marketplace/'+encodeURIComponent(app.id))]);
      if(!d.isConnected)return;
      app={...detail,accounts:appAccounts(status.apps.find(a=>a.id===app.id)||{accounts:[]})};
      content.replaceChildren();
      const hero=node('div','app-detail-hero');hero.append(node('span','app-monogram',(app.name||app.id).slice(0,2).toUpperCase()),node('h2','',app.name||app.id));
      if(app.logo){try{const u=new URL(app.logo);if(u.protocol==='https:'&&!u.username&&!u.password){const img=node('img');img.src=u.href;img.alt='';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();hero.firstChild.replaceChildren(img);}}catch{}}
      content.append(hero,node('p','app-full-description',app.description||'The provider has not supplied a description.'));
      const heading=node('h3','account-section-label','Accounts'),rows=node('div','account-list');content.append(heading,rows);
      for(const account of app.accounts) {
        const row=node('div','account-row');row.dataset.accountId=account.id;
        const top=node('div','account-row-top'),options=node('div','account-options');options.hidden=true;
        const name=button(account.name||'default',()=>renameAccount(app,account),'account-name','edit');name.setAttribute('aria-label','Rename '+(account.name||'default'));
        top.append(name,node('span','account-status '+(account.status==='ACTIVE'?'connected':''),account.status==='ACTIVE'?'Connected':account.status==='INITIATED'?'Needs auth':account.status.toLowerCase()));
        if(account.status==='INITIATED')top.append(button('Authenticate',()=>onboardApp(app,account),'subtle-button account-auth'));
        else if(account.status!=='ACTIVE')top.append(button('Reconnect',()=>repairChatConnection(app,account),'subtle-button account-auth','refresh'));
        top.append(iconButton('more','Options for '+(account.name||'default'),()=>{options.hidden=!options.hidden;}));
        const actions=node('div','account-actions'),feedback=node('p','account-feedback small');feedback.hidden=true;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
        const runAccountAction=async(action)=>{
          if(row.dataset.busy==='true')return;
          row.dataset.busy='true';row.setAttribute('aria-busy','true');
          const controls=[...row.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
          feedback.hidden=false;feedback.classList.remove('run-error');feedback.textContent='Working…';
          try{await action();}catch(e){feedback.classList.add('run-error');feedback.textContent=e.message||'Could not update this connection. Try again.';}
          finally{delete row.dataset.busy;row.removeAttribute('aria-busy');controls.forEach(b=>b.disabled=false);}
        };
        options.append(node('p','muted small',account.permission==='read'?'Read-only access':'Read and write · follows bot approvals'),actions,feedback);
        actions.append(button('Check connection',()=>runAccountAction(async()=>{await api('/composio/'+app.id+'/check','POST',{account_id:account.id});connectionsChanged();}),'subtle-button','refresh'));
        if(['gmail','googlecalendar','googledrive'].includes(app.id)&&account.status==='ACTIVE')actions.append(button('Test API',()=>runAccountAction(async()=>{const result=await api('/composio/'+app.id+'/test','POST',{account_id:account.id});feedback.textContent=result.message;}),'subtle-button'));
        actions.append(button('Disconnect',()=>confirmDisconnectAccount(app,account,render),'subtle-button danger-text'));
        row.append(top,options);rows.append(row);
      }
      rows.append(button('Add another account',()=>onboardApp(app),'add-account','plus'));
      if(Number.isFinite(app.tools_count))content.append(node('p','muted small app-tool-count',app.tools_count+' available tools'));
      const connected=app.accounts.filter(a=>a.status==='ACTIVE');
      if(connected.length)content.append(connectionTools(app,connected));
    }catch(e){content.replaceChildren(node('p','run-error',e.message),button('Try again',render,'outline-button'));}
  }
  d.addEventListener('connections-changed',()=>perform(render));
  content.append(node('p','muted','Loading app…'));await render();
}
function confirmDisconnectAccount(app,account,reload) {
  const d=modal('Disconnect account?','text-dialog disconnect-account-dialog');
  const feedback=node('p','small');feedback.hidden=true;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const actions=node('div','disconnect-account-actions');let busy=false;
  const cancel=button('Cancel',()=>d.close(),'subtle-button');
  const confirm=button('Disconnect account',async()=>{
    if(busy)return;busy=true;confirm.disabled=true;cancel.disabled=true;
    const close=d.querySelector('header button[aria-label="Close"]');if(close)close.disabled=true;
    feedback.hidden=false;feedback.className='small muted';feedback.textContent='Disconnecting…';
    try{await api('/composio/'+app.id+'/disconnect','POST',{account_id:account.id});d.close();await reload();connectionsChanged();}
    catch(e){feedback.className='small run-error';feedback.textContent=e.message||'Could not disconnect. Try again.';}
    finally{busy=false;confirm.disabled=false;cancel.disabled=false;if(close)close.disabled=false;}
  },'danger-button');
  d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  actions.append(cancel,confirm);d.append(node('p','', 'Disconnect “'+(account.name||'default')+'” from '+(app.name||app.id)+'?'),feedback,actions);cancel.focus();
}
function renameAccount(app,account) {
  const d=modal('Rename account','rename-account-dialog'),form=node('form');
  const name=field('Account name',account.name||'default','input',{required:true,maxLength:80});
  const save=node('button','primary','Save');save.type='submit';form.append(name.label,save);d.append(form);
  form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;perform(async()=>{await api('/composio/'+app.id+'/rename','POST',{account_id:account.id,name:name.input.value.trim()});d.close();connectionsChanged();},save);};name.input.focus();name.input.select();
}
function connectionTools(app,accounts){
  const details=node('details','connection-tools');details.append(node('summary','','Explore available tools'));
  const choice=select(accounts.map(a=>[a.id,a.name||'default']),accounts[0].id);choice.setAttribute('aria-label','Tools for account');
  if(accounts.length>1)details.append(choice);
  const search=field('Search tools','','input',{type:'search',placeholder:'Find an action…'}),list=node('div','connector-tool-list');details.append(search.label,list);
  let generation=0,timer;
  async function load(){const ticket=++generation;list.replaceChildren(node('p','muted','Loading tools…'));try{const data=await api('/marketplace/'+encodeURIComponent(app.id)+'/tools?account_id='+encodeURIComponent(choice.value)+'&search='+encodeURIComponent(search.input.value));if(ticket!==generation||!details.isConnected)return;list.replaceChildren();for(const tool of data.items){const row=node('details','connector-tool');row.append(node('summary','',tool.name||tool.slug),node('p','',tool.description||''),node('span','muted small',tool.requires_approval?'Uses bot approval setting':'Read-only'));list.append(row);}if(!data.items.length)list.append(node('p','muted','No matching tools available for this connection.'));if(data.next_cursor)list.append(node('p','muted small','Showing the first results. Refine your search to find a specific tool.'));}catch(e){if(ticket===generation)list.replaceChildren(node('p','run-error',e.message),button('Try again',load,'outline-button'));}}
  details.ontoggle=()=>{if(details.open&&!list.children.length)perform(load);};choice.onchange=()=>perform(load);search.input.oninput=()=>{++generation;clearTimeout(timer);timer=setTimeout(load,250);};return details;
}

function validateTeaching(form, inputs) {
  for(const input of inputs){
    input.setCustomValidity(input.value.trim()?'':'Describe this part of the lesson before continuing.');
    input.addEventListener('input',()=>input.setCustomValidity(''),{once:true});
  }
  return form.reportValidity();
}
async function resumeTeaching(t) {
  if(state.teaching!==t)return;
  if(!state.desktopControlRequested||!state.status.takeover)await toggleControl();
  await waitForDesktop();
  if(state.teaching!==t)return;
  if(!state.desktopControlRequested||!state.status.takeover)throw new Error('Take control before resuming.');
  t.paused=false;renderTeaching();
}
async function startTeaching() {
  const d=modal('Teach a task','teach-dialog'),form=node('form');
  const name=field('Skill name','','input',{required:true,maxLength:100,placeholder:'Prepare the weekly report'});
  const goal=field('What should your bot learn?','','textarea',{required:true,rows:3,maxLength:2000,placeholder:'Describe the outcome and when to use this skill.'});
  const start=node('button','primary','Start teaching');
  form.append(name.label,goal.label,node('p','muted small','Demonstrate on the computer, then use Add step to explain what to do and why. Your reviewed instructions become a reusable skill and /command, shared by bots in this profile. Clicks and screenshots help you review; they are not replayed or saved. Typed text is omitted. Pause before signing in or showing sensitive information.'),start);d.append(form);
  form.onsubmit=e=>{e.preventDefault();if(!validateTeaching(form,[name.input,goal.input]))return;perform(async()=>{
    const status=await api('/status');state.status=status;state.statusEpoch=(state.statusEpoch||0)+1;
    if(state.allRuns.some(r=>r.bot_id===screenBotId()&&active(r)))throw new Error('Stop the current task before teaching.');
    if(!state.status.takeover||!state.desktopControlRequested){state.startingTeaching=true;try{await toggleControl();}finally{state.startingTeaching=false;}if(!state.status.takeover||!state.desktopControlRequested)return;}
    await waitForDesktop();
    state.teaching={botId:screenBotId(),name:name.input.value.trim(),goal:goal.input.value.trim(),steps:[],pending:[],paused:false};
    d.close();renderScreenPicker();renderTeaching();updateDesktopState();
  },start);};
}
function renderTeaching() {
  const bar=$('teaching-bar'),t=state.teaching;bar.hidden=!t;bar.replaceChildren();if(!t)return;
  const label=node('span','teaching-status',(t.paused?'Paused':'Recording')+' · '+t.steps.length+(t.steps.length===1?' step':' steps'));label.setAttribute('role','status');
  bar.append(label,button(t.paused?'Resume':'Pause',async()=>{if(t.paused)await resumeTeaching(t);else{t.paused=true;renderTeaching();}}),button('Add step',()=>addTeachingStep(),'outline-button','plus'),button('Finish',reviewTeaching,'primary'),iconButton('trash','Discard lesson',()=>discardTeaching()));
}
function recordTeaching(action) {
  const t=state.teaching;if(!t||t.paused||!state.desktopConnected||!state.status.takeover||t.botId!==screenBotId())return;
  if(t.pending.length>=150){t.paused=true;renderTeaching();notice('Add a step before continuing the demonstration.');return;}
  if(action==='Typed text (omitted)'&&t.pending.at(-1)===action)return;
  if(action.startsWith('Scroll')&&t.pending.at(-1)===action)return;
  t.pending.push(action);
}
let teachingPointer=null;
$('desktop').addEventListener('pointerdown',e=>{if(e.target.tagName!=='CANVAS')return;teachingPointer={x:e.clientX,y:e.clientY,button:e.button};},true);
$('desktop').addEventListener('pointerup',e=>{
  if(e.target.tagName!=='CANVAS'||!teachingPointer)return;
  const c=e.target,b=c.getBoundingClientRect(),p=teachingPointer;teachingPointer=null;
  const point=(x,y)=>Math.round((x-b.x)*c.width/b.width)+', '+Math.round((y-b.y)*c.height/b.height);
  const dragged=Math.hypot(p.x-e.clientX,p.y-e.clientY)>8;
  recordTeaching(dragged?'Drag from ('+point(p.x,p.y)+') to ('+point(e.clientX,e.clientY)+')':(p.button===2?'Right-click':'Click')+' at ('+point(e.clientX,e.clientY)+')');
},true);
$('desktop').addEventListener('wheel',e=>recordTeaching('Scroll '+(e.deltaY>0?'down':'up')), {capture:true,passive:true});
$('desktop').addEventListener('keydown',e=>{
  if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){recordTeaching('Typed text (omitted)');return;}
  if(['Shift','Control','Alt','Meta','CapsLock','Dead','Process','Unidentified'].includes(e.key))return;
  // A printable shortcut is identified by its physical key; typed content is never stored.
  const key=e.key.length===1?e.code:e.key;
  recordTeaching('Key '+[e.ctrlKey?'Ctrl':'',e.metaKey?'Meta':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',key].filter(Boolean).join('+'));
},true);
function teachingSnapshot() {
  const canvas=$('desktop').querySelector('.desktop-canvas canvas');if(!canvas)return '';
  try {const thumb=document.createElement('canvas');thumb.width=480;thumb.height=Math.round(480*canvas.height/canvas.width);thumb.getContext('2d').drawImage(canvas,0,0,thumb.width,thumb.height);return thumb.toDataURL('image/jpeg',.65);}catch{return '';}
}
function addTeachingStep(finishing=false) {
  const t=state.teaching;if(!t)return;
  if(t.steps.length>=40)throw new Error('This lesson has 40 steps. Finish it before starting another.');
  const wasPaused=t.paused;t.paused=true;renderTeaching();
  const d=modal('Describe this step','teach-dialog'),form=node('form');
  const note=field('What did you do, and why?','','textarea',{required:true,rows:4,maxLength:3000,placeholder:'For example: Open Reports and choose the current week. Use the week’s date, not a fixed value.'});
  const snapshot=teachingSnapshot();if(snapshot){const img=node('img','teaching-snapshot');img.src=snapshot;img.alt='Current screen, kept only for this review';form.append(img);}
  const save=node('button','primary','Add step');form.append(note.label,save);d.append(form);
  form.onsubmit=e=>{e.preventDefault();if(state.teaching!==t||!validateTeaching(form,[note.input]))return;t.steps.push({note:note.input.value.trim(),actions:[...t.pending],snapshot});t.pending=[];d.close();if(finishing)reviewTeaching();else{t.paused=wasPaused;renderTeaching();updateDesktopState();}};
  note.input.focus();
}
function reviewTeaching() {
  const t=state.teaching;if(!t)return;t.paused=true;renderTeaching();
  if(t.pending.length||!t.steps.length){addTeachingStep(true);return;}
  const d=modal('Review your lesson','teach-review'),form=node('form');
  const name=field('Skill name',t.name,'input',{required:true,maxLength:100});
  const goal=field('When to use this skill',t.goal,'textarea',{required:true,rows:2,maxLength:2000});
  form.append(name.label,goal.label,node('p','muted small','These are the instructions your bots will reuse, including in future chats. Name the controls, inputs and checks they need; use changing dates or values instead of copying this demonstration’s examples. Screenshots and recorded actions are discarded when saved.'));
  const inputs=[];
  for(const [i,step] of t.steps.entries()) {
    const row=node('section','teaching-step');
    if(step.snapshot){const img=node('img','teaching-snapshot');img.src=step.snapshot;img.alt='Step '+(i+1)+' reference';row.append(img);}
    const instruction=field('Step '+(i+1),step.note,'textarea',{required:true,rows:3,maxLength:3000});inputs.push(instruction.input);instruction.input.oninput=()=>step.note=instruction.input.value;
    row.append(instruction.label);
    if(step.actions.length){const log=node('details');log.append(node('summary','muted small','Recorded actions ('+step.actions.length+')'),node('pre','teaching-log',step.actions.join('\n')));row.append(log);}
    form.append(row);
  }
  const outcome=field('How should the bot verify success?',t.outcome||'','textarea',{required:true,rows:2,maxLength:2000,placeholder:'Describe the result to check.'});
  name.input.oninput=()=>t.name=name.input.value;goal.input.oninput=()=>t.goal=goal.input.value;outcome.input.oninput=()=>t.outcome=outcome.input.value;
  const save=node('button','primary','Save skill & return control');
  form.append(outcome.label,save,button('Keep teaching',async()=>{await resumeTeaching(t);d.close();}),button('Discard lesson',()=>discardTeaching(d),'danger-text'));
  d.append(form);form.onsubmit=e=>{e.preventDefault();if(!validateTeaching(form,[name.input,goal.input,...inputs,outcome.input]))return;perform(async()=>{
    const body='When to use: '+goal.input.value.trim()+'\n\nProcedure:\n'+inputs.map((input,i)=>(i+1)+'. '+input.value.trim()).join('\n\n')+'\n\nVerify success: '+outcome.input.value.trim()+'\n\nUse the current interface and verify each result. Ask the user to sign in when needed. Follow the workspace approval policy for external actions.';
    if(new TextEncoder().encode(body).length>48000)throw new Error('Shorten this lesson to fit the 48 KB skill limit.');
    const existing=await api('/skills');if(existing.some(s=>s.name===name.input.value.trim())&&!confirm('Replace the existing skill with this name?'))return;
    // Description is byte-bounded like the API, including multi-byte names/goals.
    let description='';for(const char of goal.input.value.trim()){if(new TextEncoder().encode(description+char).length>600)break;description+=char;}
    const saved=await api('/skills','POST',{name:name.input.value.trim(),body,description});
    commandsUI?.invalidate();
    state.teaching=null;renderTeaching();renderScreenPicker();d.close();
    try{if(state.status.takeover)await toggleControl();notice('Skill saved as /'+saved.command+'. Ask your bot to use it, or find it in Settings → Skills.');}catch(e){notice('Skill saved as /'+saved.command+'. Return computer control when ready: '+e.message);}
    updateDesktopState();
  },save);};
}
window.addEventListener('beforeunload',e=>{if(state.teaching){e.preventDefault();e.returnValue='';}});

// Close modals without waiting for animation. A compositor animation can leave a
// transparent modal intercepting input when WebKit's animation never finishes.
// Let the dialog's own unsaved-change and in-flight guards handle cancel first.
document.addEventListener('cancel',e=>{if(e.target instanceof HTMLDialogElement){const dialog=e.target;setTimeout(()=>{if(!e.defaultPrevented&&dialog.open)dialog.close();},0);}},true);

function waitForDesktop() {
  if(state.desktopConnected)return Promise.resolve();
  const rfb=state.rfb;if(!rfb)return Promise.reject(new Error('Open the live computer before teaching.'));
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);rfb.removeEventListener('connect',connected);rfb.removeEventListener('disconnect',disconnected);};
    const connected=()=>{cleanup();resolve();};
    const disconnected=()=>{cleanup();reject(new Error('The computer disconnected. Reconnect before teaching.'));};
    const timer=setTimeout(()=>{cleanup();reject(new Error('The computer is still connecting. Try teaching again once connected.'));},15000);
    rfb.addEventListener('connect',connected);rfb.addEventListener('disconnect',disconnected);
  });
}

function discardTeaching(dialog) {
  if(!confirm('Discard this unsaved lesson?'))return;
  state.teaching=null;dialog?.close();renderTeaching();renderScreenPicker();updateDesktopState();notice('Lesson discarded. You still have computer control.');
}

const avatarQueues=new Map();
function queueAvatarWrite(id,write){const next=(avatarQueues.get(id)||Promise.resolve()).catch(()=>{}).then(write);avatarQueues.set(id,next);return next;}
function saveAvatarChoice(bot,patch){
  const previous=avatarQueues.get(bot.id)||Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{const current=state.bots.find(b=>b.id===bot.id)||bot;state.botWriteEpoch=(state.botWriteEpoch||0)+1;const updated=await api('/bots/'+bot.id,'PUT',{...current,preserve_text:true,profile:{...profile(current),...patch}});state.botWriteEpoch++;state.bots=state.bots.map(b=>b.id===bot.id?updated:b);if(state.bot?.id===bot.id)state.bot=updated;renderSidebar();renderHeader();state.panelKey='';if(state.view==='details')renderDetails();await renderChat(true,'cached');});
  avatarQueues.set(bot.id,next);return next;
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.avatar-menu'))document.querySelectorAll('.avatar-menu.menu-open').forEach(n=>n.classList.remove('menu-open'));});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.avatar-menu.menu-open').forEach(n=>n.classList.remove('menu-open'));$('new-menu').hidden=true;}});
const chatScroll={view:null,follow:true,anchor:null,top:0,rendering:false,frame:0};
function captureChatAnchor(){
  const area=$('content'),top=area.getBoundingClientRect().top;
  const visible=[...area.querySelectorAll(':scope > [data-message], :scope > [data-run]')].find(n=>n.getBoundingClientRect().bottom>top+1);
  chatScroll.top=area.scrollTop;
  chatScroll.anchor=visible?{key:visible.dataset.message,run:visible.dataset.run,offset:visible.getBoundingClientRect().top-top}:null;
}
function restoreChatPosition(){
  const area=$('content');
  if(chatScroll.follow)area.scrollTop=area.scrollHeight;
  else {
    const a=chatScroll.anchor;
    const target=a&&[...area.children].find(n=>a.key?n.dataset.message===a.key:n.dataset.run===a.run);
    area.scrollTop=target?area.scrollTop+target.getBoundingClientRect().top-area.getBoundingClientRect().top-a.offset:chatScroll.top;
  }
  chatScroll.top=area.scrollTop;updateJumpLatest();
}
function scheduleChatPosition(){
  if(chatScroll.frame)return;
  chatScroll.frame=requestAnimationFrame(()=>{chatScroll.frame=0;restoreChatPosition();chatScroll.rendering=false;finishConversationOpening(chatScroll.view);});
}
const chatResize=new ResizeObserver(scheduleChatPosition);
function beginChatRender(view){
  const focused=document.activeElement;
  // Retained connector editors keep their own focus; only restore named message actions.
  messageActionFocus=chatScroll.view===view && focused?.dataset.messageFocus && focused.closest('[data-message]') ? {seq:focused.closest('[data-message]').dataset.message,control:focused.dataset.messageFocus}:null;
  questionFocus=focused?.closest('.question-card') && chatScroll.view===view?{id:focused.closest('.question-card').dataset.questionId,target:focused.dataset.questionFocus,start:focused.selectionStart,end:focused.selectionEnd}:null;
  if(chatScroll.view!==view){
    const saved=chatHistory.get(view)?.scroll;
    chatScroll.view=view;chatScroll.follow=saved?.follow??true;chatScroll.anchor=saved?.anchor??null;chatScroll.top=saved?.top??0;
  }
  else if(!chatScroll.follow&&!chatOpening)captureChatAnchor();
  cancelAnimationFrame(chatScroll.frame);chatScroll.frame=0;
  chatScroll.rendering=true;chatResize.disconnect();
}
function endChatRender(){
  const id=currentConversationId(),entry=chatHistory.get(id);
  if(state.renderedChatId===id){if(entry)entry.ready=true;if(chatOpening?.id===id)chatOpening.ready=true;}
  const boundary=unreadBoundaries.get(currentConversationId()),divider=$('content').querySelector('.unread-divider');
  if(boundary&&!boundary.positioned&&divider){
    boundary.positioned=true;chatScroll.follow=false;
    let target=divider.nextElementSibling;while(target&&!target.dataset.message&&!target.dataset.run)target=target.nextElementSibling;
    chatScroll.anchor=target?{key:target.dataset.message,run:target.dataset.run,offset:target.getBoundingClientRect().top-divider.getBoundingClientRect().top+20}:null;
    chatScroll.top=Math.max(0,divider.offsetTop-$('content').offsetTop-20);
  }
  scheduleReadReceipt();
  chatResize.observe($('content'));
  for(const child of $('content').children)chatResize.observe(child);
  restoreChatPosition();
  if(!chatHistory.get(currentConversationId())?.hasAfter&&$('content').scrollHeight-$('content').scrollTop-$('content').clientHeight<80)chatScroll.follow=true;
  scheduleChatPosition();
  if(messageActionFocus){const group=$('content').querySelector('[data-message="'+messageActionFocus.seq+'"]');(group?.querySelector('[data-message-focus="'+messageActionFocus.control+'"]')||group)?.focus({preventScroll:true});messageActionFocus=null;}
  positionMessageMenu();
  if(questionFocus){const card=[...$('content').querySelectorAll('.question-card')].find(c=>c.dataset.questionId===questionFocus.id),control=card&&[...card.querySelectorAll('[data-question-focus]')].find(n=>n.dataset.questionFocus===questionFocus.target);(control||card)?.focus({preventScroll:true});if(control?.tagName==='TEXTAREA'&&questionFocus.start!==null)control.setSelectionRange(questionFocus.start,questionFocus.end);questionFocus=null;}
}
function followChatLatest(){
  chatScroll.follow=true;chatScroll.anchor=null;
  const entry=chatHistory.get(currentConversationId());if(entry)entry.wantLatest=true;
  scheduleChatPosition();
}
$('content').addEventListener('scroll',()=>{
  if(chatOpening||chatScroll.rendering)return;
  const area=$('content');
  if(Math.abs(area.scrollTop-chatScroll.top)<1)return;
  const entry=chatHistory.get(currentConversationId());
  chatScroll.follow=!entry?.hasAfter && area.scrollHeight-area.scrollTop-area.clientHeight<80;
  captureChatAnchor();
  if(entry?.loaded && !entry.error){
    if(area.scrollTop<180 && entry.hasBefore)void perform(()=>loadHistoryPage('older',true));
    else if(area.scrollHeight-area.scrollTop-area.clientHeight<180 && entry.hasAfter)void perform(()=>loadHistoryPage('newer',true));
  }
},{passive:true});
// A wheel/touch/key gesture takes precedence over a pending image/layout correction.
function readingGesture(e){
  if(chatOpening)return;
  if(e.type==='wheel'&&e.deltaY>=0)return;
  if(e.type==='keydown'&&!['ArrowUp','PageUp','Home'].includes(e.key))return;
  chatScroll.follow=false;chatScroll.rendering=false;captureChatAnchor();
  cancelAnimationFrame(chatScroll.frame);chatScroll.frame=0;
}
for(const name of ['wheel','touchstart','keydown'])$('content').addEventListener(name,readingGesture,{passive:true});
const jumpLatest=button('Latest messages',async()=>{followChatLatest();await renderChat(true);$('prompt').focus({preventScroll:true});},'jump-latest','chevron');jumpLatest.hidden=true;$('composer-area').append(jumpLatest);
function updateJumpLatest(){const area=$('content');jumpLatest.hidden=!chatHistory.get(currentConversationId())?.hasAfter && area.scrollHeight-area.scrollTop-area.clientHeight<150;}
$('content').addEventListener('scroll',updateJumpLatest,{passive:true});new MutationObserver(updateJumpLatest).observe($('content'),{childList:true,subtree:true});

const pendingFiles=new Map(),pendingPreviewUrls=new WeakMap(),uploadPreviewCache=new Map();
function releasePendingPreview(file){const url=pendingPreviewUrls.get(file);if(url){URL.revokeObjectURL(url);pendingPreviewUrls.delete(file);}}
function uploadPreview(file){
  const key=state.token+'|'+file.id;
  if(!uploadPreviewCache.has(key)){
    const token=state.token,promise=fetch('/api/'+(file.shared?'server-uploads/':'uploads/')+encodeURIComponent(file.id),{headers:{Authorization:'Bearer '+token},cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('Image unavailable');const blob=await response.blob();if(blob.size>8*1024*1024)throw new Error('Image too large');return new Blob([blob],{type:file.mime});});
    uploadPreviewCache.set(key,promise);promise.catch(()=>uploadPreviewCache.delete(key));if(uploadPreviewCache.size>16)uploadPreviewCache.delete(uploadPreviewCache.keys().next().value);
  }
  return uploadPreviewCache.get(key);
}
function imageUpload(file){return /^image\/(png|jpeg|gif|webp)$/.test(file.mime||'');}
function fillUploadImage(image,file){void uploadPreview(file).then(blob=>{if(!image.isConnected)return;const url=URL.createObjectURL(blob);screenshotUrls.add(url);image.src=url;image.onerror=()=>{URL.revokeObjectURL(url);screenshotUrls.delete(url);image.remove();};}).catch(()=>image.remove());}

const filePicker=node('input');filePicker.type='file';filePicker.multiple=true;filePicker.hidden=true;document.body.append(filePicker);
const fileChips=node('div','composer-files');fileChips.hidden=true;$('composer').prepend(fileChips);
const composerMenu=node('div','composer-menu');composerMenu.hidden=true;composerMenu.id='composer-menu';composerMenu.setAttribute('role','menu');$('composer-area').append(composerMenu);
const attachAction=button('Attach files',()=>{closeComposerMenu();filePicker.click();},'composer-menu-item','paperclip');
const teachAction=button('Teach a task',async()=>{closeComposerMenu();await openComputer();if(state.teaching)await reviewTeaching();else await startTeaching();},'composer-menu-item','record');
for(const item of [attachAction,teachAction])item.setAttribute('role','menuitem');
composerMenu.append(attachAction,teachAction);
$('composer-actions').setAttribute('aria-haspopup','menu');$('composer-actions').setAttribute('aria-controls',composerMenu.id);
function composerChatId(){return state.chat?.id || (state.bot?`dm-${state.bot.id}`:'');}
function closeComposerMenu(){composerMenu.hidden=true;$('composer-actions').setAttribute('aria-expanded','false');}
function positionComposerMenu(){
  if(composerMenu.hidden)return;
  const area=$('composer-area').getBoundingClientRect(),trigger=$('composer-actions').getBoundingClientRect();
  const left=Math.max(8,Math.min(trigger.left,window.innerWidth-composerMenu.offsetWidth-8));
  composerMenu.style.left=(left-area.left)+'px';
  composerMenu.style.bottom=(area.bottom-trigger.top+6)+'px';
}
new ResizeObserver(positionComposerMenu).observe($('composer-area'));
window.addEventListener('resize',positionComposerMenu);
function toggleComposerMenu(){
  if(!composerMenu.hidden){closeComposerMenu();return;}
  teachAction.hidden=!!state.chat?.shared;composerMenu.hidden=false;positionComposerMenu();$('composer-actions').setAttribute('aria-expanded','true');attachAction.focus({preventScroll:true});
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#composer-menu,#composer-actions'))closeComposerMenu();});
composerMenu.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeComposerMenu();$('composer-actions').focus({preventScroll:true});}
  if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const items=[attachAction,teachAction],index=items.indexOf(document.activeElement);items[(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus({preventScroll:true});}
});
function renderPendingFiles(){
  const files=pendingFiles.get(composerChatId())||[],key=JSON.stringify(files);
  if(fileChips.dataset.key!==key){stopComposerMotion();fileChips.dataset.key=key;}
  fileChips.replaceChildren();fileChips.hidden=!files.length;
  $('composer').classList.toggle('has-files',files.length>0);resizeComposer();
  for(const file of files){
    const chip=node('span','composer-file'),preview=pendingPreviewUrls.get(file);
    if(preview||imageUpload(file)){
      chip.classList.add('composer-image');const image=node('img','composer-file-preview');image.alt=file.name;
      if(preview)image.src=preview;else fillUploadImage(image,file);
      const open=button('',async()=>{
        const blob=preview?await (await fetch(preview)).blob():await uploadPreview(file),url=URL.createObjectURL(blob),dialog=modal(file.name,'screenshot-dialog'),full=node('img');
        full.src=url;full.alt=file.name;dialog.append(full);dialog.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});
      },'composer-image-open');open.setAttribute('aria-label','Enlarge image: '+file.name);open.append(image,icon('search',18));chip.append(open);
      if(file.loading){const progress=node('span','composer-image-progress','Uploading…');progress.setAttribute('role','status');chip.append(progress);}
    }else {chip.append(icon('paperclip',14),node('span','',file.name+(file.loading?' · Uploading…':'')));}
    if(!file.loading)chip.append(iconButton('close','Remove '+file.name,async()=>{await api((file.shared?'/server-uploads/':'/uploads/')+file.id,'DELETE');const index=files.indexOf(file);if(index>=0)files.splice(index,1);releasePendingPreview(file);renderPendingFiles();}));
    fileChips.append(chip);
  }
}
function attachmentDestination(){return {chatId:composerChatId(),token:state.token,shared:!!state.chat?.shared};}
function transferFiles(data){const files=[...(data?.files||[])];return files.length?files:[...(data?.items||[])].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);}
function nativeAttachment(value){const bytes=Uint8Array.from(atob(value.data),c=>c.charCodeAt(0)),extension=value.name?.split('.').pop().toLowerCase(),type=value.mime||({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'})[extension]||'';return new File([bytes],value.name||'Screenshot.png',{type});}
async function clipboardImages(){
  // Some webviews expose an image only through the OS clipboard, not ClipboardEvent.files.
  if(window.__KINDRED_NATIVE_ATTACHMENTS){const value=await window.__TAURI__.core.invoke('read_clipboard_image');if(value)return [nativeAttachment(value)];}
  if(navigator.clipboard?.read){const items=await navigator.clipboard.read(),files=[];for(const item of items){const type=item.types.find(t=>/^image\/(png|jpeg|webp|gif)$/.test(t));if(type)files.push(new File([await item.getType(type)],'Screenshot.'+({['image/jpeg']:'jpg'}[type]||type.split('/')[1]),{type}));}if(files.length)return files;}
  return [];
}
let fileDragDepth=0,nativeFileDrag=false,nativeDropFinished=0;
const isFileDrag=e=>[...(e.dataTransfer?.types||[])].some(t=>t.toLowerCase()==='files')||[...(e.dataTransfer?.items||[])].some(i=>i.kind==='file')||!!e.dataTransfer?.files?.length;
const clearFileDrag=()=>{fileDragDepth=0;$('composer').classList.remove('file-drag-over');};
document.addEventListener('dragover',e=>{if(isFileDrag(e))e.preventDefault();});
document.addEventListener('drop',e=>{if(isFileDrag(e))e.preventDefault();clearFileDrag();});
const chatDrop=$('content').closest('.conversation');
chatDrop.addEventListener('dragenter',e=>{if(window.__KINDRED_NATIVE_ATTACHMENTS||!isFileDrag(e)||document.querySelector('dialog[open]')||!composerChatId())return;e.preventDefault();fileDragDepth++;$('composer').classList.add('file-drag-over');});
chatDrop.addEventListener('dragover',e=>{if(isFileDrag(e)){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
chatDrop.addEventListener('dragleave',e=>{if(!window.__KINDRED_NATIVE_ATTACHMENTS&&isFileDrag(e)&&--fileDragDepth<=0)clearFileDrag();});
chatDrop.addEventListener('drop',e=>{if(!isFileDrag(e))return;e.preventDefault();clearFileDrag();if(document.querySelector('dialog[open]')||nativeFileDrag||performance.now()<nativeDropFinished)return;const files=transferFiles(e.dataTransfer);void perform(()=>queueFiles(files));});
window.addEventListener('kindred-native-file-drop',e=>{
 if(!window.__KINDRED_NATIVE_ATTACHMENTS)return;
 const d=e.detail||{},hit=Number.isFinite(d.x)&&Number.isFinite(d.y)?document.elementFromPoint(d.x,d.y):null,accepted=hit?.closest('.conversation')&&!$('composer-area').hidden&&!document.querySelector('dialog[open]')&&composerChatId();
 if(d.kind==='leave'||!accepted){nativeFileDrag=false;clearFileDrag();return;}
 if(d.kind==='over'){nativeFileDrag=true;$('composer').classList.add('file-drag-over');return;}
 if(d.kind==='drop'){nativeFileDrag=false;nativeDropFinished=performance.now()+250;clearFileDrag();const destination=attachmentDestination();void perform(async()=>{const files=await window.__TAURI__.core.invoke('read_dropped_files',{ticket:d.ticket});await queueFiles(files.map(nativeAttachment),destination);});}
});
window.addEventListener('blur',clearFileDrag);
document.addEventListener('keydown',e=>{if(e.key==='Escape')clearFileDrag();});
filePicker.addEventListener('change',()=>{const chosen=[...filePicker.files];filePicker.value='';void perform(()=>queueFiles(chosen));});
async function queueFiles(chosen,destination=attachmentDestination()){

  if(!chosen.length)return;
  const {chatId,token,shared}=destination;
  if(token!==state.token)throw new Error('The account changed before the attachment was ready.');
  if(!chatId)throw new Error('Choose a conversation first.');
  const files=pendingFiles.get(chatId)||[];
  if(files.length+chosen.length>5)throw new Error('Attach up to five files per message.');
  if(chosen.some(f=>f.size>8*1024*1024))throw new Error('Files are limited to 8 MB each.');
  const placeholders=chosen.map(file=>({name:file.name,loading:true}));files.push(...placeholders);pendingFiles.set(chatId,files);
  for(let i=0;i<chosen.length;i++){if(/^image\/(png|jpeg|gif|webp)$/.test(chosen[i].type)){const url=URL.createObjectURL(chosen[i]);pendingPreviewUrls.set(placeholders[i],url);}}
  renderPendingFiles();
  for(let i=0;i<chosen.length;i++){
    const placeholder=placeholders[i];
    try{
      const bytes=new Uint8Array(await chosen[i].arrayBuffer());let binary='';
      for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
      if(state.token!==token)throw new Error('The account changed before this file finished uploading.');
      const uploaded=await api(shared?'/server-uploads':'/uploads','POST',{chat_id:chatId,name:chosen[i].name,data:btoa(binary)});
      Object.assign(placeholder,uploaded,{loading:false});
    }catch(e){const index=files.indexOf(placeholder);if(index>=0)files.splice(index,1);releasePendingPreview(placeholder);notice(placeholder.name+': '+e.message,true);}
    renderPendingFiles();
  }
}
function fileLinks(files){
  const row=node('div','message-files');
  for(const file of files){
    const download=button(file.name,async()=>{
      const response=await fetch('/api/'+(file.shared?'server-uploads/':'uploads/')+encodeURIComponent(file.id),{headers:{Authorization:'Bearer '+state.token},cache:'no-store'});
      if(!response.ok)throw new Error('This file could not be downloaded.');
      const url=URL.createObjectURL(await response.blob()),a=node('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    },'message-file','paperclip');
    if(imageUpload(file)){
      download.title=file.name;
      const figure=node('figure','message-file-image'),image=node('img');image.alt=file.name;
      const open=button('',async()=>{const blob=await uploadPreview(file),url=URL.createObjectURL(blob),dialog=modal(file.name,'screenshot-dialog'),full=node('img');full.src=url;full.alt=file.name;dialog.append(full);dialog.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});},'uploaded-image-open');open.setAttribute('aria-label','Open image: '+file.name);open.append(image);figure.append(open,download);row.append(figure);fillUploadImage(image,file);
    }else row.append(download);
  }
  return row;
}

function pendingHumanTask(botId=screenBotId()) {
  return state.userTasks.find(t=>t.bot_id===botId && t.status==='pending' && state.allRuns.some(r=>r.id===t.run_id&&r.status==='awaiting_user'));
}
async function finishHumanTask(task, outcome='done') {
  if(state.teaching)throw new Error('Finish or discard the lesson before returning control.');
  if(task.bot_id!==screenBotId())throw new Error('Open this bot’s computer before returning its subtask.');
  state.statusEpoch=(state.statusEpoch||0)+1;
  const result=await api('/user-tasks/'+encodeURIComponent(task.id)+'/complete','POST',{bot_id:task.bot_id,run_id:task.run_id,outcome});
  setComputerExpanded(false);
  state.desktopControlRequested=false;
  disconnectDesktop();
  await refresh(true);
  if(!$('computer-panel').hidden)await connectDesktop();
  return result;
}
async function openHumanComputer(task, takeOver=false) {
  if(state.teaching)throw new Error('Finish or discard the lesson before opening another subtask.');
  const bot=state.bots.find(b=>b.id===task.bot_id);
  if(!bot)throw new Error('This bot is no longer available.');
  state.screenBotId=task.bot_id;
  await openComputer(false,true);
  if(takeOver && !(state.status.takeover && state.desktopControlRequested))await toggleControl();
}
function taskCards(run) {
  const block=node('div','task-cards');
  const receipts=state.details.get(run.id)?.approvals;
  const approvals=receipts || state.approvals.filter(a=>a.run_id===run.id);
  for(const a of approvals)if(!a.args?.artifact_id)block.append(approvalCard(a,run));
  for(const t of state.userTasks.filter(t=>t.run_id===run.id).reverse()) {
    const box=node('div','task-card human-task');box.dataset.userTask=t.id;
    const title=node('div','task-card-title');title.append(icon('computer',15),node('strong','',t.title||'Computer'));
    const pending=t.status==='pending'&&run.status==='awaiting_user';
    const done=t.status==='resumed';
    title.append(node('span','task-badge '+(done?'done':''),done?(t.outcome==='skipped'?'Skipped':'Done'):t.status==='ready'?'Resuming':pending?'Waiting for you':'Expired'));
    box.append(title,node('p','task-instructions',t.instructions));
    if(t.authentication){
      const auth=t.authentication,codeMethod=['sms','email','authenticator'].includes(auth.method);
      title.querySelector('strong').textContent=(codeMethod?'Two-factor authentication code for ':auth.method==='signin'?'Sign in to ':'Verify sign-in to ')+auth.service;
      if(auth.destination)box.append(node('p','muted small',auth.destination));
      if(pending&&codeMethod){
        const form=node('form','verification-code-form'),input=document.createElement('input');
        const expected=Number.isInteger(auth.code_length)&&auth.code_length>=4&&auth.code_length<=16?auth.code_length:null;
        input.type='text';input.autocomplete='one-time-code';input.spellcheck=false;input.autocapitalize='off';input.minLength=expected||4;input.maxLength=expected||16;input.required=true;input.pattern=expected?`[A-Za-z0-9]{${expected}}`:'[A-Za-z0-9]{4,16}';
        input.setAttribute('aria-label',`${expected?expected+'-character ':''}Verification code for ${auth.service}`);
        const entry=node('div','verification-code-entry'),slots=node('div','verification-code-slots');slots.setAttribute('aria-hidden','true');
        entry.append(slots,input);
        const renderSlots=()=>{
          const count=expected||Math.max(6,Math.min(16,input.value.length)),position=input.selectionStart??input.value.length;
          entry.style.setProperty('--code-columns',Math.min(count,8));
          slots.replaceChildren(...Array.from({length:count},(_,i)=>{
            const slot=node('span','verification-code-slot',input.value[i]||'');
            slot.classList.toggle('is-current',i===Math.min(position,count-1));
            slot.classList.toggle('is-selected',i>=position&&i<(input.selectionEnd??position));return slot;
          }));
        };
        for(const event of ['input','keyup','click','select','focus'])input.addEventListener(event,renderSlots);
        input.addEventListener('paste',e=>{
          const value=e.clipboardData?.getData('text/plain');if(value==null)return;
          e.preventDefault();input.setRangeText(value.replace(/\s/g,''),input.selectionStart??0,input.selectionEnd??input.value.length,'end');renderSlots();
        });
        renderSlots();
        const submit=document.createElement('button');submit.type='submit';submit.className='outline-button';submit.textContent='Submit code';
        const feedback=node('p','muted small');feedback.setAttribute('role','status');
        form.append(entry,submit);box.append(form,feedback,node('p','muted small','The code is sent directly to the computer. Your bot will verify sign-in and continue.'));
        form.onsubmit=e=>{e.preventDefault();if(submit.disabled||!form.reportValidity())return;
          let code=input.value;input.value='';renderSlots();submit.disabled=true;
          perform(async()=>{try{
            await api('/user-tasks/'+encodeURIComponent(t.id)+'/code','POST',{bot_id:t.bot_id,run_id:t.run_id,code});
            feedback.textContent='Code submitted. Verifying sign-in…';
            await refresh(true);
          }finally{code='';submit.disabled=false;}},submit);
        };
      }
    }

    const actions=node('div','task-card-actions');
    actions.append(button(pending?'Take over':'Open computer',()=>openHumanComputer(t,pending),'outline-button','computer'));
    if(pending)actions.append(button('Skip this step',async()=>{await openHumanComputer(t);await finishHumanTask(t,'skipped');},'subtle-button'));
    box.append(actions);block.append(decisionReceipt(box,{key:'human:'+t.id,title:t.title||'Computer',outcome:done?(t.outcome==='skipped'?'Skipped':'Completed'):'Expired',terminal:done||t.status==='expired'}));
  }
  return block;
}
const CONNECTOR_ICONS = {"confluence":{"path":"M.87 18.257c-.248.382-.53.875-.763 1.245a.764.764 0 0 0 .255 1.04l4.965 3.054a.764.764 0 0 0 1.058-.26c.199-.332.454-.763.733-1.221 1.967-3.247 3.945-2.853 7.508-1.146l4.957 2.337a.764.764 0 0 0 1.028-.382l2.364-5.346a.764.764 0 0 0-.382-1 599.851 599.851 0 0 1-4.965-2.361C10.911 10.97 5.224 11.185.87 18.257zM23.131 5.743c.249-.405.531-.875.764-1.25a.764.764 0 0 0-.256-1.034L18.675.404a.764.764 0 0 0-1.058.26c-.195.335-.451.763-.734 1.225-1.966 3.246-3.945 2.85-7.508 1.146L4.437.694a.764.764 0 0 0-1.027.382L1.046 6.422a.764.764 0 0 0 .382 1c1.039.49 3.105 1.467 4.965 2.361 6.698 3.246 12.392 3.029 16.738-4.04z","color":"#1868DB"},"jira":{"path":"M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z","color":"#1868DB"},"atlassian":{"path":"M7.12 11.084a.683.683 0 00-1.16.126L.075 22.974a.703.703 0 00.63 1.018h8.19a.678.678 0 00.63-.39c1.767-3.65.696-9.203-2.406-12.52zM11.434.386a15.515 15.515 0 00-.906 15.317l3.95 7.9a.703.703 0 00.628.388h8.19a.703.703 0 00.63-1.017L12.63.38a.664.664 0 00-1.196.006z","color":"#1868DB"},"gmail":{"path":"M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z","color":"#EA4335"},"googledrive":{"path":"M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z","color":"#4285F4"},"googlecalendar":{"path":"M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5l4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z","color":"#4285F4"},"hubspot":{"path":"M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.193v.067a2.196 2.196 0 001.252 1.973l.013.006v2.852a6.22 6.22 0 00-2.969 1.31l.012-.01-7.828-6.095A2.497 2.497 0 104.3 4.656l-.012.006 7.697 5.991a6.176 6.176 0 00-1.038 3.446c0 1.343.425 2.588 1.147 3.607l-.013-.02-2.342 2.343a1.968 1.968 0 00-.58-.095h-.002a2.033 2.033 0 102.033 2.033 1.978 1.978 0 00-.1-.595l.005.014 2.317-2.317a6.247 6.247 0 104.782-11.134l-.036-.005zm-.964 9.378a3.206 3.206 0 113.215-3.207v.002a3.206 3.206 0 01-3.207 3.207z","color":"#FF7A59"},"quickbooks":{"path":"M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm.642 4.1335c.9554 0 1.7296.776 1.7296 1.7332v9.0667h1.6c1.614 0 2.9275-1.3156 2.9275-2.933 0-1.6173-1.3136-2.9333-2.9276-2.9333h-.6654V7.3334h.6654c2.5722 0 4.6577 2.0897 4.6577 4.667 0 2.5774-2.0855 4.6666-4.6577 4.6666H12.642zM7.9837 7.333h3.3291v12.533c-.9555 0-1.73-.7759-1.73-1.7332V9.0662H7.9837c-1.6146 0-2.9277 1.316-2.9277 2.9334 0 1.6175 1.3131 2.9333 2.9277 2.9333h.6654v1.7332h-.6654c-2.5725 0-4.6577-2.0892-4.6577-4.6665 0-2.5771 2.0852-4.6666 4.6577-4.6666Z","color":"#2CA01C"},"quickbooksonline":{"path":"M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm.642 4.1335c.9554 0 1.7296.776 1.7296 1.7332v9.0667h1.6c1.614 0 2.9275-1.3156 2.9275-2.933 0-1.6173-1.3136-2.9333-2.9276-2.9333h-.6654V7.3334h.6654c2.5722 0 4.6577 2.0897 4.6577 4.667 0 2.5774-2.0855 4.6666-4.6577 4.6666H12.642zM7.9837 7.333h3.3291v12.533c-.9555 0-1.73-.7759-1.73-1.7332V9.0662H7.9837c-1.6146 0-2.9277 1.316-2.9277 2.9334 0 1.6175 1.3131 2.9333 2.9277 2.9333h.6654v1.7332h-.6654c-2.5725 0-4.6577-2.0892-4.6577-4.6665 0-2.5771 2.0852-4.6666 4.6577-4.6666Z","color":"#2CA01C"},"outlook":{"path":"M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V10.85l1.24.72h.01q.1.07.18.18.07.12.07.25zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83q-.68-.3-1.55-.3-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z","color":"#0078D4"},"microsoftoutlook":{"path":"M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V10.85l1.24.72h.01q.1.07.18.18.07.12.07.25zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83q-.68-.3-1.55-.3-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z","color":"#0078D4"},"monday":{"viewBox":"10 16 26 18","paths":[{"path":"M14.1414 31.6061C13.0802 31.6052 12.1032 31.0526 11.5896 30.1629C11.076 29.2732 11.1068 28.1866 11.67 27.3249L16.9249 19.2872C17.4647 18.412 18.4576 17.8863 19.5182 17.9141C20.5788 17.942 21.5402 18.519 22.0291 19.4213C22.518 20.3235 22.4574 21.4088 21.8709 22.2559L16.6191 30.2937C16.0849 31.1115 15.1484 31.6076 14.1414 31.6061Z","color":"#FB275D"},{"path":"M23.0947 31.6061C22.0352 31.6052 21.0598 31.0539 20.547 30.1663C20.0343 29.2788 20.065 28.1947 20.6273 27.3351L25.872 19.3164C26.4033 18.4285 27.3997 17.8902 28.4683 17.9138C29.5369 17.9375 30.5063 18.5192 30.9941 19.4298C31.482 20.3403 31.4101 21.4334 30.8068 22.2781L25.562 30.2968C25.0299 31.1108 24.0977 31.6055 23.0947 31.6061Z","color":"#FFCC00"},{"path":"M31.8237 31.6222C33.4286 31.6222 34.7297 30.3234 34.7297 28.7213C34.7297 27.1191 33.4286 25.8203 31.8237 25.8203C30.2187 25.8203 28.9177 27.1191 28.9177 28.7213C28.9177 30.3234 30.2187 31.6222 31.8237 31.6222Z","color":"#00CA72"}]},"mondaycom":{"viewBox":"10 16 26 18","paths":[{"path":"M14.1414 31.6061C13.0802 31.6052 12.1032 31.0526 11.5896 30.1629C11.076 29.2732 11.1068 28.1866 11.67 27.3249L16.9249 19.2872C17.4647 18.412 18.4576 17.8863 19.5182 17.9141C20.5788 17.942 21.5402 18.519 22.0291 19.4213C22.518 20.3235 22.4574 21.4088 21.8709 22.2559L16.6191 30.2937C16.0849 31.1115 15.1484 31.6076 14.1414 31.6061Z","color":"#FB275D"},{"path":"M23.0947 31.6061C22.0352 31.6052 21.0598 31.0539 20.547 30.1663C20.0343 29.2788 20.065 28.1947 20.6273 27.3351L25.872 19.3164C26.4033 18.4285 27.3997 17.8902 28.4683 17.9138C29.5369 17.9375 30.5063 18.5192 30.9941 19.4298C31.482 20.3403 31.4101 21.4334 30.8068 22.2781L25.562 30.2968C25.0299 31.1108 24.0977 31.6055 23.0947 31.6061Z","color":"#FFCC00"},{"path":"M31.8237 31.6222C33.4286 31.6222 34.7297 30.3234 34.7297 28.7213C34.7297 27.1191 33.4286 25.8203 31.8237 25.8203C30.2187 25.8203 28.9177 27.1191 28.9177 28.7213C28.9177 30.3234 30.2187 31.6222 31.8237 31.6222Z","color":"#00CA72"}]},"googledocs":{"path":"M14.727 6.727H14V0H4.91c-.905 0-1.637.732-1.637 1.636v20.728c0 .904.732 1.636 1.636 1.636h14.182c.904 0 1.636-.732 1.636-1.636V6.727h-6zm-.545 10.455H7.09v-1.364h7.09v1.364zm2.727-3.273H7.091v-1.364h9.818v1.364zm0-3.273H7.091V9.273h9.818v1.363zM14.727 6h6l-6-6v6z","color":"#4285F4"},"googlesheets":{"path":"M11.318 12.545H7.91v-1.909h3.41v1.91zM14.728 0v6h6l-6-6zm1.363 10.636h-3.41v1.91h3.41v-1.91zm0 3.273h-3.41v1.91h3.41v-1.91zM20.727 6.5v15.864c0 .904-.732 1.636-1.636 1.636H4.909a1.636 1.636 0 0 1-1.636-1.636V1.636C3.273.732 4.005 0 4.909 0h9.318v6.5h6.5zm-3.273 2.773H6.545v7.909h10.91v-7.91zm-6.136 4.636H7.91v1.91h3.41v-1.91z","color":"#34A853"},"googleslides":{"path":"M16.09 15.273H7.91v-4.637h8.18v4.637zm1.728-8.523h2.91v15.614c0 .904-.733 1.636-1.637 1.636H4.909a1.636 1.636 0 0 1-1.636-1.636V1.636C3.273.732 4.005 0 4.909 0h9.068v6.75h3.841zm-.363 2.523H6.545v7.363h10.91V9.273zm-2.728-5.979V6h6.001l-6-6v3.294z","color":"#FBBC04"},"googletasks":{"path":"M11.383.617C5.097.617 0 5.714 0 12c0 6.286 5.097 11.383 11.383 11.383 6.286 0 11.38-5.097 11.38-11.383a11.34 11.34 0 0 0-.878-4.389l-3.203 3.203c.062.387.1.782.1 1.186a7.398 7.398 0 1 1-7.4-7.398c1.499 0 2.889.448 4.054 1.214l2.857-2.857a11.325 11.325 0 0 0-6.91-2.342zm9.674.756c-.292 0-.583.112-.805.334-2.97 2.965-5.934 5.934-8.9 8.902L9.596 8.854a1.139 1.139 0 0 0-1.61 0l-1.775 1.773a1.139 1.139 0 0 0 0 1.61l4.166 4.163a1.421 1.421 0 0 0 2.012 0L23.666 5.121a1.136 1.136 0 0 0 0-1.61l-1.805-1.804a1.136 1.136 0 0 0-.804-.334z","color":"#4285F4"},"googlechat":{"path":"M1.637 0C.733 0 0 .733 0 1.637v16.5c0 .904.733 1.636 1.637 1.636h3.955v3.323c0 .804.97 1.207 1.539.638l3.963-3.96h11.27c.903 0 1.636-.733 1.636-1.637V5.592L18.408 0Zm3.955 5.592h12.816v8.59H8.455l-2.863 2.863Z","color":"#34A853"},"googlemeet":{"path":"M5.53 2.13 0 7.75h5.53zm.398 0v5.62h7.608v3.65l5.47-4.45c-.014-1.22.031-2.25-.025-3.46-.148-1.09-1.287-1.47-2.236-1.36zM23.1 4.32c-.802.295-1.358.995-2.047 1.49-2.506 2.05-4.982 4.12-7.468 6.19 3.025 2.59 6.04 5.18 9.065 7.76 1.218.671 1.428-.814 1.328-1.64v-13a.828.828 0 0 0-.877-.825zM.038 8.15v7.7h5.53v-7.7zm13.577 8.1H6.008v5.62c3.864-.006 7.737.011 11.58-.009 1.02-.07 1.618-1.12 1.468-2.07v-2.51l-5.47-4.68v3.65zm-13.577 0c.02 1.44-.041 2.88.033 4.31.162.948 1.158 1.43 2.047 1.31h3.464v-5.62z","color":"#00897B"},"googleforms":{"path":"M14.727 6h6l-6-6v6zm0 .727H14V0H4.91c-.905 0-1.637.732-1.637 1.636v20.728c0 .904.732 1.636 1.636 1.636h14.182c.904 0 1.636-.732 1.636-1.636V6.727h-6zM7.91 17.318a.819.819 0 1 1 .001-1.638.819.819 0 0 1 0 1.638zm0-3.273a.819.819 0 1 1 .001-1.637.819.819 0 0 1 0 1.637zm0-3.272a.819.819 0 1 1 .001-1.638.819.819 0 0 1 0 1.638zm9 6.409h-6.818v-1.364h6.818v1.364zm0-3.273h-6.818v-1.364h6.818v1.364zm0-3.273h-6.818V9.273h6.818v1.363z","color":"#7248B9"},"zoom":{"path":"M5.033 14.649H.743a.74.74 0 0 1-.686-.458.74.74 0 0 1 .16-.808L3.19 10.41H1.06A1.06 1.06 0 0 1 0 9.35h3.957c.301 0 .57.18.686.458a.74.74 0 0 1-.161.808L1.51 13.59h2.464c.585 0 1.06.475 1.06 1.06zM24 11.338c0-1.14-.927-2.066-2.066-2.066-.61 0-1.158.265-1.537.686a2.061 2.061 0 0 0-1.536-.686c-1.14 0-2.066.926-2.066 2.066v3.311a1.06 1.06 0 0 0 1.06-1.06v-2.251a1.004 1.004 0 0 1 2.013 0v2.251c0 .586.474 1.06 1.06 1.06v-3.311a1.004 1.004 0 0 1 2.012 0v2.251c0 .586.475 1.06 1.06 1.06zM16.265 12a2.728 2.728 0 1 1-5.457 0 2.728 2.728 0 0 1 5.457 0zm-1.06 0a1.669 1.669 0 1 0-3.338 0 1.669 1.669 0 0 0 3.338 0zm-4.82 0a2.728 2.728 0 1 1-5.458 0 2.728 2.728 0 0 1 5.457 0zm-1.06 0a1.669 1.669 0 1 0-3.338 0 1.669 1.669 0 0 0 3.338 0z","color":"#0B5CFF"},"salesforce":{"path":"M10.006 5.415a4.195 4.195 0 013.045-1.306c1.56 0 2.954.9 3.69 2.205.63-.3 1.35-.45 2.1-.45 2.85 0 5.159 2.34 5.159 5.22s-2.31 5.22-5.176 5.22c-.345 0-.69-.044-1.02-.104a3.75 3.75 0 01-3.3 1.95c-.6 0-1.155-.15-1.65-.375A4.314 4.314 0 018.88 20.4a4.302 4.302 0 01-4.05-2.82c-.27.062-.54.076-.825.076-2.204 0-4.005-1.8-4.005-4.05 0-1.5.811-2.805 2.01-3.51-.255-.57-.39-1.2-.39-1.846 0-2.58 2.1-4.65 4.65-4.65 1.53 0 2.85.705 3.72 1.8","color":"#00A1E0"},"microsoftteams":{"path":"M20.625 8.127q-.55 0-1.025-.205-.475-.205-.832-.563-.358-.357-.563-.832Q18 6.053 18 5.502q0-.54.205-1.02t.563-.837q.357-.358.832-.563.474-.205 1.025-.205.54 0 1.02.205t.837.563q.358.357.563.837.205.48.205 1.02 0 .55-.205 1.025-.205.475-.563.832-.357.358-.837.563-.48.205-1.02.205zm0-3.75q-.469 0-.797.328-.328.328-.328.797 0 .469.328.797.328.328.797.328.469 0 .797-.328.328-.328.328-.797 0-.469-.328-.797-.328-.328-.797-.328zM24 10.002v5.578q0 .774-.293 1.46-.293.685-.803 1.194-.51.51-1.195.803-.686.293-1.459.293-.445 0-.908-.105-.463-.106-.85-.329-.293.95-.855 1.729-.563.78-1.319 1.336-.756.557-1.67.861-.914.305-1.898.305-1.148 0-2.162-.398-1.014-.399-1.805-1.102-.79-.703-1.312-1.664t-.674-2.086h-5.8q-.411 0-.704-.293T0 16.881V6.873q0-.41.293-.703t.703-.293h8.59q-.34-.715-.34-1.5 0-.727.275-1.365.276-.639.75-1.114.475-.474 1.114-.75.638-.275 1.365-.275t1.365.275q.639.276 1.114.75.474.475.75 1.114.275.638.275 1.365t-.275 1.365q-.276.639-.75 1.113-.475.475-1.114.75-.638.276-1.365.276-.188 0-.375-.024-.188-.023-.375-.058v1.078h10.875q.469 0 .797.328.328.328.328.797zM12.75 2.373q-.41 0-.78.158-.368.158-.638.434-.27.275-.428.639-.158.363-.158.773 0 .41.158.78.159.368.428.638.27.27.639.428.369.158.779.158.41 0 .773-.158.364-.159.64-.428.274-.27.433-.639.158-.369.158-.779 0-.41-.158-.773-.159-.364-.434-.64-.275-.275-.639-.433-.363-.158-.773-.158zM6.937 9.814h2.25V7.94H2.814v1.875h2.25v6h1.875zm10.313 7.313v-6.75H12v6.504q0 .41-.293.703t-.703.293H8.309q.152.809.556 1.5.405.691.985 1.19.58.497 1.318.779.738.281 1.582.281.926 0 1.746-.352.82-.351 1.436-.966.615-.616.966-1.43.352-.815.352-1.752zm5.25-1.547v-5.203h-3.75v6.855q.305.305.691.452.387.146.809.146.469 0 .879-.176.41-.175.715-.48.304-.305.48-.715t.176-.879Z","color":"#6264A7"},"notion":{"path":"M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z","color":"#888888"},"asana":{"path":"M18.78 12.653c-2.882 0-5.22 2.336-5.22 5.22s2.338 5.22 5.22 5.22 5.22-2.34 5.22-5.22-2.336-5.22-5.22-5.22zm-13.56 0c-2.88 0-5.22 2.337-5.22 5.22s2.338 5.22 5.22 5.22 5.22-2.338 5.22-5.22-2.336-5.22-5.22-5.22zm12-6.525c0 2.883-2.337 5.22-5.22 5.22-2.882 0-5.22-2.337-5.22-5.22 0-2.88 2.338-5.22 5.22-5.22 2.883 0 5.22 2.34 5.22 5.22z","color":"#F06A6A"},"trello":{"path":"M21.147 0H2.853A2.86 2.86 0 000 2.853v18.294A2.86 2.86 0 002.853 24h18.294A2.86 2.86 0 0024 21.147V2.853A2.86 2.86 0 0021.147 0zM10.34 17.287a.953.953 0 01-.953.953h-4a.954.954 0 01-.954-.953V5.38a.953.953 0 01.954-.953h4a.954.954 0 01.953.953zm9.233-5.467a.944.944 0 01-.953.947h-4a.947.947 0 01-.953-.947V5.38a.953.953 0 01.953-.953h4a.954.954 0 01.953.953z","color":"#0052CC"},"github":{"path":"M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12","color":"#888888"},"zendesk":{"path":"M12.914 2.904V16.29L24 2.905H12.914zM0 2.906C0 5.966 2.483 8.45 5.543 8.45s5.542-2.484 5.543-5.544H0zm11.086 4.807L0 21.096h11.086V7.713zm7.37 7.84c-3.063 0-5.542 2.48-5.542 5.543H24c0-3.06-2.48-5.543-5.543-5.543z","color":"#68B5A9"}};
CONNECTOR_ICONS.slack={paths:[
  {color:'#36C5F0',path:'M9 1a2 2 0 0 0 0 4h2V3a2 2 0 0 0-2-2M3 6a2 2 0 0 0 0 4h6a2 2 0 0 0 0-4Z'},
  {color:'#2EB67D',path:'M23 9a2 2 0 0 0-4 0v2h2a2 2 0 0 0 2-2M18 3a2 2 0 0 0-4 0v6a2 2 0 0 0 4 0Z'},
  {color:'#ECB22E',path:'M15 23a2 2 0 0 0 0-4h-2v2a2 2 0 0 0 2 2M21 18a2 2 0 0 0 0-4h-6a2 2 0 0 0 0 4Z'},
  {color:'#E01E5A',path:'M1 15a2 2 0 0 0 4 0v-2H3a2 2 0 0 0-2 2M6 21a2 2 0 0 0 4 0v-6a2 2 0 0 0-4 0Z'}
]};
function instructionApprovalCard(a,run){
  const card=node('section','approval-card instruction-review');card.setAttribute('aria-label','Review instruction change');
  const target=a.args.bot_name||state.bots.find(b=>b.id===a.args.bot_id)?.name||'teammate';
  card.append(node('h3','','Update '+target+'’s instructions'),node('p','muted small',a.status==='pending'?'Your one-time approval is required, including with Full access. Applies to future tasks.':a.status==='approved'?'Approved for this change. Updated instructions apply to future tasks.':'This instruction change was not approved.'));
  const changes=compactChanges(a.args.expected_instructions||'',a.args.instructions||'');animateWorkflowDetails(changes);card.append(changes);
  if(a.status==='pending'){const actions=node('div','row-actions');for(const[label,approved]of[['Allow',true],['Decline',false]])actions.append(button(label,async()=>{await api('/approvals/'+a.id,'POST',{approved});await refresh(true);},approved?'primary small-button':'outline-button'));card.append(actions);}else {
    const receipt=node('p','instruction-decision '+(a.status==='approved'?'approved':'muted'));
    if(a.status==='approved')receipt.append(icon('check',16));
    receipt.append(node('span','',a.status==='approved'?'Allowed for this change':a.status==='denied'?'Declined':a.status));
    card.append(receipt);
  }
  return decisionReceipt(card,{key:'approval:'+a.id,title:'Update '+target+'’s instructions',outcome:a.status==='approved'?'Allowed':a.status==='denied'?'Declined':'Expired',terminal:a.status!=='pending'});
}
function chatEditApprovalCard(a,run){
  const card=node('section','approval-card instruction-review chat-edit-review'),before=a.args.before||{},after=a.args.after||{};
  card.setAttribute('aria-label','Review chat changes');
  card.append(node('h3','','Update '+(a.args.chat_name||'chat')));
  for(const[key,label]of[['name','Name'],['description','Description']]){
    if(before[key]===after[key])continue;
    const section=node('div','chat-edit-field'),comparison=node('div','chat-edit-comparison');
    for(const[caption,value]of[['Current',before[key]],['Proposed',after[key]]]){const column=node('div');column.append(node('span','muted small',caption),node('p','',value||'No description'));comparison.append(column);}
    section.append(node('strong','',label),comparison);card.append(section);
  }
  const names=new Map((a.args.people||[]).map(p=>[p.id,p.name]));
  const added=(after.members||[]).filter(id=>!(before.members||[]).includes(id)),removed=(before.members||[]).filter(id=>!(after.members||[]).includes(id));
  for(const[label,ids]of[['Add members',added],['Remove members',removed]])if(ids.length){const section=node('div','chat-edit-field');section.append(node('strong','',label),node('p','',ids.map(id=>names.get(id)||id).join(', ')));card.append(section);}
  if(added.length)card.append(node('p','muted small','Added members can read the existing shared conversation.'));
  if(a.status==='pending'){
    const actions=node('div','row-actions');for(const[label,approved]of[['Allow changes',true],['Decline',false]])actions.append(button(label,async()=>{await api('/approvals/'+a.id,'POST',{approved});await refresh(true);},approved?'primary small-button':'outline-button'));card.append(actions);
  }
  return decisionReceipt(card,{key:'approval:'+a.id,title:'Update '+(a.args.chat_name||'chat'),outcome:a.status==='approved'?'Allowed':a.status==='denied'?'Declined':'Expired',terminal:a.status!=='pending'});
}
function approvalCard(a,run) {
  if(a.tool==='chat_update')return chatEditApprovalCard(a,run);
  if(a.tool==='bot_instructions_update')return instructionApprovalCard(a,run);
  if(['claude_connector','codex_connector','connector_execute','connector_configure'].includes(a.tool))return connectorApprovalCard(a,run);
  const box=node('div','task-card approval');box.dataset.approval=a.id;
  const status=a.status||'pending',pending=status==='pending';
  const title=node('div','task-card-title');
  title.append(node('strong','',pending?'Permission needed':'Task permission'),node('span','task-badge '+(status==='approved'?'done':''),status==='approved'?'Allowed once':status==='denied'?'Declined':status==='expired'?'Expired':'Needs your okay'));
  const labels={inbox_monitor_save:'Save an inbox routine',guest_exec:'Run a command',computer_open_url:'Open a page',computer_click:'Click on the computer',computer_type:'Enter text',computer_key:'Press a key',computer_scroll:'Scroll',routine_create:'Create a routine',routine_update:'Update a routine',routine_control:'Manage a routine',share_file:'Share a file in chat'};
  const action=(a.tool==='claude_connector'||a.tool==='codex_connector')?(a.args.tool_name||'Connected app action').split('__').pop():a.tool==='connector_execute'?(a.args.tool_slug||'Connected app action').toLowerCase().replaceAll('_',' '):labels[a.tool]||a.tool.replaceAll('_',' ');
  const connectorTool=a.tool==='claude_connector'||a.tool==='codex_connector',connectorSource=connectorSourceLabel(a.args.source||(a.tool==='claude_connector'?'claude':a.tool==='codex_connector'?'codex':''));
  const caption=connectorTool?`Uses ${a.args.connection?.replace(/^claude.ai /,'')||'a connector'} · via this workspace’s ${connectorSource} account. ${a.args.approval_reason||''}`:a.tool==='connector_execute'?`Uses ${a.args.toolkit} · ${a.args.account_name||a.args.account_id||'connected account'} · via Kindred`:a.tool==='routine_create'?(a.args.trigger==='activity'?'Creates a Constant inbox routine':'Creates a scheduled task'):a.tool==='inbox_monitor_save'?'Saves a Constant inbox routine':`Runs on ${state.bots.find(b=>b.id===run.bot_id)?.name||'your bot'}’s computer`;
  box.append(title,node('p','task-description',action),node('p','muted small',caption));
  const details=node('details','task-details');details.append(node('summary','','Show the details'),node('pre','',JSON.stringify(a.args,null,2)));box.append(details);
  if(pending){const actions=node('div','task-card-actions');for(const [label,approved]of [['Allow once',true],['Decline',false]])actions.append(button(label,async()=>{await api('/approvals/'+a.id,'POST',{approved});await refresh(true);},approved?'primary small-button':'outline-button'));box.append(actions);}
  return decisionReceipt(box,{key:'approval:'+a.id,title:action,outcome:status==='approved'?'Allowed':status==='denied'?'Declined':'Expired',terminal:!pending});
}
function connectorBrand(connection='',tool='') {
  const raw=connection.replace(/^claude.ai /,'');
  const normalized=raw.toLowerCase().replace(/[^a-z0-9]/g,'');
  let key=normalized==='atlassian'?(/jira/i.test(tool)?'jira':'confluence'):normalized;
  if(['googleworkspace','google'].includes(key)){const t=tool.toLowerCase().replace(/[^a-z0-9]/g,'');key=connectorCatalog.find(p=>(p.id.startsWith('google')||p.id==='gmail')&&t.includes(p.id))?.id||key;}
  const profile=connectorCatalog.find(p=>p.id===key||p.aliases.includes(key));
  return {key:profile?.id||key,name:profile?.name||raw||'Connected app'};
}
function connectorLogo(brand) {
  const box=node('span','connector-logo');box.setAttribute('aria-hidden','true');
  const asset=CONNECTOR_ICONS[brand.key];
  if(asset){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',asset.viewBox||'0 0 24 24');for(const shape of asset.paths||[asset]){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',shape.path);path.setAttribute('fill',shape.color);svg.append(path);}box.append(svg);}
  else if(brand.name.startsWith('All '))box.append(icon('link',23));
  else box.textContent=brand.name.slice(0,2).toUpperCase();
  return box;
}
function connectorHeading(name,source,tool='') {
  const brand=connectorBrand(name,tool),row=node('div','connector-heading'),heading=node('strong','',`${brand.name} (via ${source})`);heading.setAttribute('role','heading');heading.setAttribute('aria-level','4');row.append(connectorLogo(brand),heading);return row;
}
function connectorSourceLabel(source='') {
  const key=String(source).toLowerCase();
  return key==='claude-account'||key==='claude-code'||key==='claude'?'Claude':key==='codex'||key==='codex-app'||key==='codex-account'?'Codex':key==='kindred'?'Kindred':source||'Provider';
}
function connectorActivityLabel(body) {
  const args=body.args||{};
  if(body.tool==='claude_connector'||body.tool==='codex_connector')return `${connectorBrand(args.connection,args.tool_name).name} (via ${connectorSourceLabel(args.source||(body.tool==='claude_connector'?'claude':'codex'))})`;
  if(body.tool==='connector_execute'&&args.toolkit)return `${connectorBrand(args.toolkit,args.tool_slug).name} (via Kindred)`;
  if(body.tool==='connector_configure')return 'Connector settings';
  return '';
}
function connectorApprovalCard(a,run) {
  const box=node('div','task-card approval connector-approval');box.dataset.approval=a.id;
  const args=a.args||{},status=a.status||'pending',pending=status==='pending',config=a.tool==='connector_configure',preference=config&&args.request==='source_preference';
  const title=node('div','task-card-title');title.append(node('span','connector-eyebrow',preference?'Connector preference':'Connector approval'),node('span','task-badge '+(status==='approved'?'done':''),status==='approved'?'Approved':status==='denied'?'Denied':status==='expired'?'Expired':'Needs your okay'));box.append(title);
  const bot=state.bots.find(b=>b.id===run.bot_id)?.name||'This bot';
  let choices=[];
  if(preference){
    const names=(args.duplicates||[]).map(d=>connectorBrand(d.name||d.service).name);
    box.append(node('strong','',args.source?`Prefer ${args.source==='ask'?'asking each time':['provider','claude','codex'].includes(args.source)?'provider connections':'Kindred connections'}?`:'Which connections should I prefer?'),node('p','task-description',names.length?`${names.join(', ')} ${names.length===1?'is':'are'} connected through multiple sources. Which source should ${bot} use by default?`:`Save a connection preference for ${bot}.`),node('p','muted small','You can still name another source in a message. This preference is saved for this bot and does not grant permission. A denied choice never falls back to another source.'));
    const logos=node('div','connector-duplicates');for(const d of args.duplicates||[]){const sources=(d.sources||[d.source||'provider','kindred']).map(connectorSourceLabel).join(' + ');logos.append(connectorHeading(d.name||d.service,sources));}box.append(logos);
    choices=args.source?[['Save preference',true,args.source],['Deny',false,'']]:[['Prefer provider',true,'provider'],['Prefer Kindred',true,'kindred'],['Ask when needed',true,'ask']];
  }else if(config&&args.request==='email_sending'){
    const name=args.connection||args.toolkit;
    box.append(connectorHeading(name,connectorSourceLabel(args.origin||'kindred')),node('p','task-description',`Let ${bot} send emails without asking each time?`),node('p','muted small','Applies only to supported email send/reply actions through this specific account. Other connector permissions stay as they are. You can revoke this under the bot’s Connectors settings or ask the bot to require approval again.'));
    choices=args.forced?[['Allow once',true,''],['Keep asking',false,'']]:[['Allow email sending',true,''],['Keep asking',false,'']];
  }else if(config){
    const all=args.connector_key==='*';
    const source=connectorSourceLabel(args.source||args.origin),sourceNoun=source==='Kindred'?'Kindred':'provider';
    box.append(connectorHeading(all?'All connectors':args.connection,source),node('p','task-description',all?`Let ${bot} use all connectors from this ${sourceNoun} account?`:`Always allow ${bot} to use ${args.connection}?`),node('p','muted small',all?`One confirmation covers all current and future connectors on this ${sourceNoun} account, for this bot. Includes actions that read or change connected content. You can revoke access in the bot’s settings.`:'Allows future actions, including changes, through this entire connection for this bot. You can revoke access in the bot’s settings.'));
    if(all){const names=node('p','connector-scope small',(args.connections||[]).map(c=>c.display_name).join(' · '));box.append(names);}
    choices=[['Yes (always allow)',true,'always_allow'],['Deny',false,'']];
  }else{
    const source=connectorSourceLabel(args.source||(a.tool==='claude_connector'?'claude':a.tool==='codex_connector'?'codex':a.tool==='connector_execute'?'kindred':'')),claude=source==='Claude',connection=claude?args.connection:args.toolkit||args.connection,tool=claude?args.tool_name:args.tool_slug||args.tool_name;
    box.append(connectorHeading(connection,source,tool));
    const leaf=(tool||'Use connected app').split('__').pop(),friendly={searchConfluenceUsingCql:'Search Confluence',searchJiraIssuesUsingJql:'Search Jira',getAccessibleAtlassianResources:'Find your Atlassian sites',atlassianUserInfo:'Read your Atlassian profile',getConfluenceSpaces:'List Confluence spaces',getConfluencePage:'Read a Confluence page'};
    const action=friendly[leaf]||leaf.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/\s+/g,' ').trim();
    box.append(node('p','task-description',action.charAt(0).toUpperCase()+action.slice(1)),node('p','muted small',args.forced?`${source} or this connector requires your approval for this specific action.`:`Allow this action once, or always allow ${bot} to use the entire ${connection?.replace(/^claude.ai /,'')||'selected'} connection, including changes.`));
    if(!claude)box.append(node('p','muted small',`Account: ${args.account_name||args.account_id||'Connected account'}`));
    choices=args.forced?[['Allow once',true,''],['Deny',false,'']]:[['Always allow',true,'always_allow'],['Allow once',true,''],['Deny',false,'']];
    const details=node('details','task-details');details.append(node('summary','','Action details'),node('pre','',JSON.stringify(claude?args.input:args.arguments,null,2)));box.append(details);
  }
  if(pending){const actions=node('div','task-card-actions');for(const [label,approved,choice] of choices)actions.append(button(label,async()=>{await api('/approvals/'+a.id,'POST',{approved,choice});await refresh(true);},approved?'primary small-button':'outline-button'));box.append(actions);}
  return decisionReceipt(box,{key:'approval:'+a.id,title:box.querySelector('.task-description')?.textContent||'Connector approval',outcome:status==='approved'?'Allowed':status==='denied'?'Declined':'Expired',terminal:!pending});
}
const expandedBotConnectors=new Set();
function botConnectorPreferences(bot) {
  const root=node('details','bot-connector-preferences'),heading=node('summary','bot-connectors-heading');heading.append(node('h3','','Connectors'));
  root.open=expandedBotConnectors.has(bot.id);
  root.ontoggle=()=>{if(root.isConnected)root.open?expandedBotConnectors.add(bot.id):expandedBotConnectors.delete(bot.id);};
  const content=node('div');root.append(heading,content);let provider=bot.provider,revision=0;
  const refresh=iconButton('refresh','Refresh connectors',async()=>{try{let result;if(provider==='claude-code')result=await api('/provider-cli/claude-code/connectors','POST',{});else if(provider==='codex')result=await api('/codex/connectors','POST',{});if(result?.warning)notice(connectorRefreshMessage(result.warning,connectorSourceLabel(provider)),true);await load();}catch(e){await load();throw new Error(connectorRefreshMessage(e,connectorSourceLabel(provider)));}});heading.append(refresh);refresh.hidden=!['claude-code','codex'].includes(provider);
  refresh.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();});
  async function render(value){
    content.replaceChildren();const claude=provider==='claude-code';refresh.hidden=!['claude-code','codex'].includes(provider);
    {
      const label=node('label','','Preferred source'),chosen=value.preferred_source==='unconfigured'?'':value.preferred_source,normalized=['claude','codex'].includes(chosen)?'provider':chosen;
      const input=select([['','Choose when duplicates appear'],['provider','Prefer provider'],['kindred','Prefer Kindred'],['ask','Ask when needed']],normalized);label.append(input);content.append(label);
      input.onchange=()=>{if(input.value)void perform(async()=>{try{await save({source:input.value});}catch(e){input.value=normalized;throw e;}},input);};
    }
    async function savePermission(origin,account,connector,allow){return save({request:'permission',origin,account_key:account,connector_key:connector,always_allow:allow});}
    function permissionRow(name,source,account,connector,allowed,status='',emailPolicy=null,persistence=true,execution=true){
      const group=node('div','connector-permission-group'),row=node('div','connector-setting-row'),info=node('div'),meta=node('div','connector-connection-meta');info.append(connectorHeading(name,source));if(connector==='*')info.querySelector('strong').textContent=name;if(status)meta.append(node('span','connector-connection-state',status));
      meta.append(node('span','connector-permission-state',persistence?(allowed?'Always allowed':'Ask before acting'):'Per-call approval'));info.append(meta);
      const toggle=switchField(`Always allow ${name} via ${source}`,persistence&&allowed);toggle.label.classList.add('connector-permission-toggle');toggle.input.disabled=!persistence;toggle.input.onchange=()=>void perform(async()=>{try{await savePermission(source==='Claude'?'claude-account':source==='Codex'?'codex-account':'kindred',account,connector,toggle.input.checked);}catch(e){toggle.input.checked=allowed;throw e;}},toggle.input);row.append(info,toggle.label);group.append(row);content.append(group);
      if(!persistence&&!execution)group.append(node('p','muted small connector-connection-error','No callable tools. Refresh or reconnect.'));
      if(emailPolicy!==null){const label=node('label','connector-email-policy','Email sending'),policy=select([['inherit','Use connection setting'],['ask','Ask before sending'],['allow','Allow without asking']],emailPolicy);policy.setAttribute('aria-label',`Email sending via ${name} (${source})`);if(!persistence)policy.querySelector('option[value="allow"]').disabled=true;label.append(policy);group.append(label);
        policy.onchange=()=>void perform(async()=>{try{const origin=source==='Claude'?'claude-account':source==='Codex'?'codex-account':'kindred';if(policy.value==='inherit'){await save({request:'email_sending_reset',origin,account_key:account,connector_key:connector});}else{await save({request:'email_sending',origin,account_key:account,connector_key:connector,connection:name,toolkit:source==='Kindred'?connector:undefined,always_allow:policy.value==='allow'});}}catch(e){policy.value=emailPolicy;throw e;}},policy);
      }
    }
    const providerConnections=value.provider_connections||[...(value.claude_connections||[]).map(c=>({...c,source:c.source||'claude'})),...(value.codex_connections||[]).map(c=>({...c,source:c.source||'codex'}))];
    const seenProvider=new Set(),providerRows=providerConnections.filter(c=>{const k=[c.source||c.origin,c.connector_key,c.name,c.display_name].join('|');if(seenProvider.has(k))return false;seenProvider.add(k);return true;});
    if(value.provider_account_key&&value.provider_source&&value.provider_permission_persistence_available!==false)permissionRow(`All ${connectorSourceLabel(value.provider_source)} connectors`,connectorSourceLabel(value.provider_source),value.provider_account_key,'*',value.provider_all_allowed,'Current + future');
    else if(value.claude_account_key)permissionRow('All Claude connectors','Claude',value.claude_account_key,'*',value.claude_all_allowed,'Current + future');
    for(const c of providerRows){const source=connectorSourceLabel(c.source||c.origin);permissionRow(c.display_name||c.name,source,c.account_key||value.provider_account_key,c.connector_key,c.always_allow,c.status==='needs-auth'?`Reconnect in ${source}`:c.execution_available===false?'Unavailable':(c.status==='connected'?'Connected':c.status)||'Connected',c.email_sending??null,c.permission_persistence_available!==false,c.execution_available!==false);}
    let accounts=0;
    for(const app of value.apps||[])for(const account of app.accounts||[]){accounts++;permissionRow(app.name||app.id,'Kindred',account.id,app.id,account.always_allow,`${account.name||'Connected account'} · ${account.permission==='read'?'Read only':account.status}`,account.email_sending??null);}
    if(!providerConnections.length&&!accounts)content.append(node('p','muted small','No Kindred connectors are connected yet.'),button('Manage connections',()=>openSettings('connections'),'outline-button','link'));
    if(value.duplicates?.length)content.append(node('p','muted small','Available through multiple sources: '+value.duplicates.map(d=>d.name).join(', ')));
  }
  async function load(){const ticket=++revision;try{const value=await api('/bots/'+bot.id+'/connectors');if(ticket===revision)await render(value);}catch(e){if(ticket===revision)content.replaceChildren(node('p','run-error',e.message));}}
  async function save(value){const ticket=++revision;const result=await api('/bots/'+bot.id+'/connectors','PUT',value);if(ticket===revision)await render(result);}
  root.setProvider=(next,saved)=>{if(next!==provider){provider=next;refresh.hidden=!['claude-code','codex'].includes(provider);revision++;content.replaceChildren();if(!saved){content.append(node('p','muted small','Saving provider…'));return;}}if(saved)void load();};
  void load();return root;
}
$('done-subtask').onclick=()=>perform(async()=>{const task=pendingHumanTask();if(task)await finishHumanTask(task);},$('done-subtask'));

// Persistent image attachments use authenticated fetches; tokens never enter URLs.
const screenshotCache = new Map(), screenshotUrls = new Set();
async function screenshotBlob(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Invalid screenshot attachment");
  if (!screenshotCache.has(id)) {
    const token=state.token;
    const request=fetch('/api/attachments/'+id,{headers:{Authorization:'Bearer '+token},cache:'no-store'})
      .then(async response=>{
        if(!response.ok)throw new Error('Screenshot unavailable. Try again.');
        const blob=await response.blob();
        if(blob.type!=='image/png'||blob.size>5*1024*1024)throw new Error('Invalid screenshot response');
        if(state.token!==token)throw new Error('Connection changed');
        return blob;
      }).catch(error=>{screenshotCache.delete(id);throw error;});
    screenshotCache.set(id,request);
    if(screenshotCache.size>24)screenshotCache.delete(screenshotCache.keys().next().value);
  }
  return screenshotCache.get(id);
}
function releaseScreenshotUrls(keepVisible=false) {
  const visible=keepVisible?new Set([...document.querySelectorAll('img[src],a[href]')].map(n=>n.src||n.href)):new Set();
  for(const url of screenshotUrls)if(!visible.has(url)){URL.revokeObjectURL(url);screenshotUrls.delete(url);}
}
function renderAttachments(target, attachments) {
  for(let index=0;index<attachments.length;index++) {
    const attachment=attachments[index];
    if(attachment.kind==='file'){
      let end=index+1;while(end<attachments.length&&attachments[end].kind==='file')end++;
      if(end-index>3){
        const stack=node('details','document-stack'),summary=node('summary','document-stack-summary'),copy=node('span','document-stack-copy'),body=node('div','document-stack-body chat-disclosure-body');
        copy.append(node('strong','',(end-index)+' files'),node('span','muted',attachments.slice(index,end).map(a=>a.name||a.title||'File').join(' · ')));
        summary.append(icon('paperclip',18),copy,icon('chevron',16));stack.append(summary,body);
        for(let at=index;at<end;at++)renderAttachments(body,[attachments[at]]);
        body.inert=true;animateChatDisclosure(stack,body,true);target.append(stack);index=end-1;continue;
      }
      target.append(fileCard(attachment,{getBlob:async id=>{
        const token=state.token,response=await fetch('/api/deliverables/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
        if(!response.ok)throw new Error('This file could not be downloaded. Try again.');const blob=await response.blob();if(state.token!==token)throw new Error('Connection changed');if(blob.size>8*1024*1024)throw new Error('File exceeds the chat download limit');return blob;
      },nativeSave:window.__KINDRED_FILE_DELIVERY?id=>nativeInvoke('save_chat_file',{id}):null,nativeReveal:window.__KINDRED_FILE_DELIVERY?receipt=>nativeInvoke('reveal_chat_file',{receipt}):null,notice,renderMarkdown:markdown}));continue;
    }
    const figure=node('figure','screenshot-attachment'),frame=node('div','screenshot-frame'),image=node('img'),caption=node('figcaption');
    const open=button('',async()=>{
      const url=URL.createObjectURL(await screenshotBlob(attachment.id));
      const dialog=modal(attachment.title||'Screenshot','screenshot-dialog');
      const full=node('img');full.src=url;full.alt=attachment.title||'Screenshot';dialog.append(full);
      dialog.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});
    },'screenshot-open');
    open.setAttribute('aria-label','Open screenshot: '+(attachment.title||'Screenshot'));
    image.alt=attachment.title||'Screenshot';open.append(image);
    const download=node('a','screenshot-download');download.append(icon('download',16));download.setAttribute('aria-label','Download screenshot');download.title='Download screenshot';download.tabIndex=0;download.download='kindred-screenshot.png';download.hidden=true;
    frame.append(open,download);caption.append(node('span','',attachment.title||'Screenshot'));figure.append(frame,caption);target.append(figure);
    const load=async()=>{
      try {
        const blob=await screenshotBlob(attachment.id);
        if(!figure.isConnected)return;
        const url=URL.createObjectURL(blob);screenshotUrls.add(url);image.src=url;download.href=url;download.hidden=false;
      } catch(error) {
        if(!figure.isConnected)return;
        const retry=button('Reload screenshot',async()=>{retry.remove();await load();},'subtle-button');
        caption.append(retry);image.alt=error.message;
      }
    };
    // The figure is inserted into the live conversation at the end of this render.
    queueMicrotask(load);
  }
}

const nativeInvoke=(command,args={})=>window.__TAURI__.core.invoke(command,args).catch(error=>{throw new Error(typeof error==="string"?error:error?.message||"Desktop command failed");});
async function copyText(text) {
  try {if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}}catch{}
  // Older webviews can still copy from a user-initiated action without the
  // asynchronous Clipboard API. Keep the editor selection and keyboard focus.
  const focused=document.activeElement,selection=getSelection(),ranges=[];
  for(let i=0;i<(selection?.rangeCount||0);i++)ranges.push(selection.getRangeAt(i).cloneRange());
  const input=node('textarea','clipboard-copy');input.value=text;input.readOnly=true;
  (document.querySelector('dialog[open]')||document.body).append(input);
  try {input.select();if(!document.execCommand('copy'))throw new Error('Could not copy. Select the text and copy it manually.');}
  finally {input.remove();focused?.focus({preventScroll:true});selection?.removeAllRanges();for(const range of ranges)selection?.addRange(range);}
}
document.addEventListener('click',event=>{
  const artifactLink=event.target.closest?.('a.workspace-artifact-link');
  if(artifactLink&&!event.defaultPrevented&&event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){
    const id=artifactLink.closest('[data-workspace-artifact]')?.dataset.workspaceArtifact;
    if(id){event.preventDefault();history.pushState({},'', '/artifacts/'+encodeURIComponent(id));syncArtifactRoute();return;}
  }
  if(!window.__KINDRED_EXTERNAL_LINKS||event.defaultPrevented||event.button!==0)return;
  const link=event.target.closest?.('a[href]');if(!link||link.hasAttribute('download'))return;
  let url;try{url=new URL(link.href);}catch{return;}
  if(!['https:','http:'].includes(url.protocol)||(url.origin===location.origin&&link.target!=='_blank'))return;
  // WKWebView may route a normal external click through its navigation policy
  // instead of its popup callback. Explicit IPC keeps sign-in outside the app.
  event.preventDefault();void perform(()=>nativeInvoke('open_external_url',{url:url.href}));
});
function initDesktopChrome() {
  const isMac=window.__KINDRED_DESKTOP?.platform==='macos'||(!window.__KINDRED_DESKTOP&&/Mac/.test(navigator.platform));
  const shortcut=document.querySelector('.search kbd');if(shortcut)shortcut.textContent=isMac?'⌘ K':'Ctrl K';
  $('search')?.setAttribute('aria-keyshortcuts',isMac?'Meta+K':'Control+K');
  if(!window.__KINDRED_DESKTOP)return;
  if(window.__KINDRED_NATIVE_FRAME)return;
  const mac=window.__KINDRED_DESKTOP.platform==='macos',linux=window.__KINDRED_DESKTOP.platform==='linux';
  if(linux)document.documentElement.classList.add('linux-desktop');
  document.documentElement.classList.add('native-desktop');
  if(mac)document.documentElement.classList.add('mac-desktop');
  if(mac&&window.__KINDRED_MAC_OVERLAY)document.documentElement.classList.add('mac-overlay');
  const bar=node('header','desktop-titlebar'+(mac?' macos':''));bar.setAttribute('aria-label','Window title bar');
  const title=node('span','desktop-window-title','Kindred'),controls=node('div','window-controls');
  async function action(name) {
    const maximized=await nativeInvoke('window_action',{action:name});
    const max=controls.querySelector('[data-window-action="maximize"]');
    if(max){max.title=maximized?'Restore window':'Maximize window';max.setAttribute('aria-label',max.title);max.classList.toggle('maximized',maximized);}
  }
  const specs=mac&&window.__KINDRED_MAC_OVERLAY?[]:mac?[['close','Close window'],['minimize','Minimize window'],['fullscreen','Toggle full screen']]:[['minimize','Minimize window'],['maximize','Maximize window'],['close','Close window']];
  for(const [name,label] of specs) {
    const control=button('',()=>action(name),'window-control window-'+name);control.dataset.windowAction=name;control.title=label;control.setAttribute('aria-label',label);
    const mark=node('span','window-symbol',name==='close'?'×':name==='minimize'?'−':name==='fullscreen'?'+':'□');control.append(mark);controls.append(control);
  }
  bar.append(title,controls);document.body.prepend(bar);
  // Delegate so headers mounted after startup (such as Artifacts) also work.
  const dragSelector=mac||linux?'.desktop-titlebar,.sidebar-top,.conversation-header,.artifact-workbench-header,.artifact-library-brand-row':'.desktop-titlebar,.artifact-workbench-header,.artifact-library-brand-row';
  const draggable=event=>{
    if(event.target.closest?.('button,a,input,textarea,select,[contenteditable],[role="button"],[role="link"]'))return false;
    if(event.target.closest?.(dragSelector))return true;
    // Include the sidebar's top padding, without making the library list draggable.
    const sidebar=event.target.closest?.('.artifact-studio-library');
    return event.target===sidebar&&event.clientY<sidebar.querySelector('.artifact-library-brand-row').getBoundingClientRect().bottom;
  };
  document.addEventListener('mousedown',event=>{if(event.button===0&&event.detail===1&&draggable(event))void nativeInvoke('window_action',{action:'drag'}).catch(()=>{});});
  document.addEventListener('dblclick',event=>{if(event.button===0&&draggable(event))void action('maximize');});
  window.addEventListener('resize',()=>void action('state').catch(()=>{}));
}
async function enableNotifications() {
  if(window.__KINDRED_DESKTOP){await nativeInvoke('start_desktop',{token:state.token});return;}
  if(!('Notification' in window)){notice('This browser does not support notifications. Use the desktop app.');return;}
  const permission=await Notification.requestPermission();
  if(permission!=='granted')notice('Notifications are blocked in your browser settings.');
  else {await pollBrowserNotifications();notice('Notifications enabled on this device.');}
}
function desktopNotificationControl() {
  const root=node('div','desktop-notification-control'),status=node('p','muted small settings-device-status');
  status.setAttribute('role','status');status.hidden=true;
  const setStatus=text=>{status.textContent=text;status.hidden=!text;};
  let tested=false,notchEnabled=false,notchToggle=null;
  const describe=async()=>{
    try {
      const value=await nativeInvoke('notification_status');
      if(value.notch?.supported&&window.__KINDRED_DESKTOP?.platform==='macos'&&!notchToggle){
        notchEnabled=value.notch.enabled===true;
        notchToggle=settingSwitch('Notch notifications',notchEnabled);
        notchToggle.label.dataset.devicePreference='true';
        notchToggle.input.onchange=async()=>{
          const enabled=notchToggle.input.checked;notchToggle.input.disabled=true;
          try{await nativeInvoke('set_notch_notifications',{enabled});notchEnabled=enabled;}
          catch(e){notchToggle.input.checked=notchEnabled;notice(e.message||String(e),true);}
          finally{notchToggle.input.disabled=false;}
        };
        const help=node('p','muted small settings-device-status','Replaces system banners and appears even during macOS Focus.');
        root.append(notchToggle.label,help);
      }

      if(window.__KINDRED_DESKTOP?.platform==='macos'&&!value.notch?.supported&&!root.querySelector('.notch-update-required'))root.append(node('p','muted small notch-update-required','Notch notifications require Mac client 0.51.0 or newer. Desktop app on this device: '+(installedClientVersion()||'Unknown')+'. Update the client to enable them.'));
      if(!tested)setStatus(value.error||(!value.enabled?'Sign in to enable notifications.':''));
    } catch(e) {if(!tested)setStatus('Could not check desktop notifications: '+(e.message||String(e))); }
  };
  const test=button('Test notification',async()=>{
    tested=true;test.disabled=true;setStatus('Sending…');
    try {
      await nativeInvoke('test_notification');
      setStatus(notchEnabled?'Notch test sent.':'Test sent to the system.');
    } catch(e) {setStatus('Test notification failed: '+(e.message||String(e)));}
    finally {test.disabled=false;}
  },'subtle-button');
  test.setAttribute('aria-label','Test notification');
  root.append(settingRow('Desktop notifications',test),status);void describe();return root;
}
let browserNotificationCursor=null,browserNotificationBusy=false;
let browserSoundContext,browserSoundBuffer,browserSoundLast=-Infinity;
function unlockBrowserNotificationSound(){
  if(window.__KINDRED_DESKTOP||!window.AudioContext)return;
  try{browserSoundContext ||= new AudioContext();if(browserSoundContext.state==='suspended')void browserSoundContext.resume().catch(()=>{});}catch{}
}
window.addEventListener('pointerdown',unlockBrowserNotificationSound,{passive:true});
window.addEventListener('keydown',unlockBrowserNotificationSound,{passive:true});
async function playBrowserNotificationSound(current){
  if(window.__KINDRED_DESKTOP||browserSoundContext?.state!=='running'||!current())return;
  try{
    browserSoundBuffer ||= fetch('/audio/kindred-pop.wav').then(async r=>{if(!r.ok)throw Error('Sound unavailable');return browserSoundContext.decodeAudioData(await r.arrayBuffer());}).catch(e=>{browserSoundBuffer=null;throw e;});
    const buffer=await browserSoundBuffer,now=performance.now();
    if(!current()||now-browserSoundLast<750||browserSoundContext.state!=='running')return;
    browserSoundLast=now;const source=browserSoundContext.createBufferSource();source.buffer=buffer;source.connect(browserSoundContext.destination);source.onended=()=>source.disconnect();source.start();
  }catch{/* Browser autoplay or sound failure must not discard the notification. */}
}
async function pollBrowserNotifications() {
  if(window.__KINDRED_DESKTOP||!state.token||browserNotificationBusy||!('Notification' in window)||Notification.permission!=='granted')return;
  browserNotificationBusy=true;
  try {
    const token=state.token;
    const data=await api('/notifications'+(browserNotificationCursor===null?'':'?after='+browserNotificationCursor));
    if(token!==state.token)return;
    for(const item of data.items||[]) {
      const eligible=()=>token===state.token&&Notification.permission==='granted'&&state.general.notifications!=='none'&&state.bots.find(b=>b.id===item.bot_id)?.profile?.notifications!==false;
      if(!eligible()){browserNotificationCursor=item.id;continue;}
      let portrait;
      const portraitRequest=new AbortController(),portraitTimer=setTimeout(()=>portraitRequest.abort(),3000);
      try{
        const response=await fetch('/api/bots/'+encodeURIComponent(item.bot_id)+'/avatar.png',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:portraitRequest.signal});
        if(response.ok){const blob=await response.blob();if(blob.type==='image/png'&&blob.size<=32768)portrait=URL.createObjectURL(blob);}
      }catch{/* A portrait failure must not discard the message. */}finally{clearTimeout(portraitTimer);}
      if(token!==state.token){if(portrait)URL.revokeObjectURL(portrait);return;}
      if(!eligible()){if(portrait)URL.revokeObjectURL(portrait);browserNotificationCursor=item.id;continue;}
      let n;try{n=new Notification(item.title,{body:item.body,tag:'kindred-'+item.id,icon:portrait||'/favicon.svg',silent:true});}catch(error){if(portrait)URL.revokeObjectURL(portrait);throw error;}
      browserNotificationCursor=item.id;
      void playBrowserNotificationSound(eligible);
      if(portrait){n.onclose=()=>URL.revokeObjectURL(portrait);setTimeout(()=>URL.revokeObjectURL(portrait),60000);}
      n.onclick=()=>{if(token!==state.token){n.close();return;}window.focus();n.close();void openNotificationChat(item);};
    }
    browserNotificationCursor=data.cursor;
  } catch { /* Retry on the next poll after a temporary connection failure. */ }
  finally {browserNotificationBusy=false;}
}
setInterval(()=>void pollBrowserNotifications(),4000);
async function openNotificationChat(item){
  const token=state.token;
  return perform(async()=>{await refresh();if(token!==state.token)return;const chat=state.chats.find(c=>c.id===item.chat_id);if(chat)await chooseChat(chat);else{const bot=state.bots.find(b=>b.id===item.bot_id);if(bot)await chooseBot(bot);}});
}
if(window.__KINDRED_DESKTOP&&window.__TAURI__?.event?.listen){
  void window.__TAURI__.event.listen('kindred-notification-open',event=>void openNotificationChat(event.payload));
}
// Message actions live beside the bubble; their menu survives history refreshes.
const reactionChoices=[['👍','Thumbs up'],['❤️','Heart'],['😂','Laugh'],['🎉','Celebrate'],['👀','Eyes'],['🙏','Thanks'],['✅','Check'],['🤔','Thinking'],['😮','Surprised'],['😢','Sad'],['🔥','Fire'],['💯','Hundred'],['👎','Thumbs down'],['🙌','Raised hands'],['✨','Sparkles'],['💡','Idea']];
const reactionPending=new Set();
let messageActionFocus=null,messageMenu=null,messageMenuContext=null;
const replyPreview=node('div','composer-reply');replyPreview.hidden=true;replyPreview.id='composer-reply';$('composer').prepend(replyPreview);
function plainMessage(text){return markdown(text||'').textContent.replace(/\s+/g,' ').trim();}
let composerMotion=[],composerGhost=null,composerReplyChat=null,composerTransition=null;
function stopComposerMotion(){
  const transition=composerTransition;composerTransition=null;transition?.cancel();
  for(const animation of composerMotion)animation.cancel();composerMotion=[];
  composerGhost?.remove();composerGhost=null;$('composer').classList.remove('is-morphing');
}
function changeComposerReply(update,animate){
  const form=$('composer'),parts=[$('prompt'),$('composer-actions'),$('composer-hint'),$('send')];
  const before=form.getBoundingClientRect(),positions=parts.map(n=>n.getBoundingClientRect());
  const quoteBounds=replyPreview.getBoundingClientRect(),quoteOpacity=getComputedStyle(replyPreview).opacity;
  const outgoing=!replyPreview.hidden?replyPreview.cloneNode(true):null;
  stopComposerMotion();update();resizeComposer();
  if(!animate||!motionAllowed()||document.documentElement.dataset.motion==='off')return;
  const after=form.getBoundingClientRect(),duration=320,easing='cubic-bezier(.22,1,.36,1)';
  const play=(n,frames,ms=duration)=>{const a=n.animate(frames,{duration:ms,easing,fill:'forwards'});composerMotion.push(a);return a;};
  if(Math.abs(before.height-after.height)<1)return;
  form.classList.add('is-morphing');
  const resize=play(form,[{height:before.height+'px'},{height:after.height+'px'}]);
  for(let i=0;i<parts.length;i++){
    const end=parts[i].getBoundingClientRect(),dx=positions[i].left-end.left,
      dy=(positions[i].top-before.bottom)-(end.top-form.getBoundingClientRect().bottom);
    play(parts[i],[{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}]);
  }
  if(!replyPreview.hidden)play(replyPreview,[{opacity:outgoing?quoteOpacity:0,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}]);
  else if(outgoing){
    outgoing.removeAttribute('id');outgoing.removeAttribute('aria-label');outgoing.setAttribute('aria-hidden','true');outgoing.inert=true;
    outgoing.classList.add('composer-reply-ghost');
    outgoing.style.cssText=`left:${quoteBounds.left-before.left-1}px;width:${quoteBounds.width}px;bottom:${before.bottom-quoteBounds.bottom-1}px`;
    form.append(outgoing);composerGhost=outgoing;
    play(outgoing,[{opacity:quoteOpacity,transform:'translateY(0)'},{opacity:0,transform:'translateY(5px)'}],150);
  }
  composerTransition=trackMotion(resize,duration,()=>stopComposerMotion());
}
// Content edits and viewport changes need their natural dimensions immediately.
$('prompt').addEventListener('input',stopComposerMotion);
window.addEventListener('resize',stopComposerMotion);
function renderReplyDraft(){
  const chatId=composerChatId(),quote=state.replyDrafts.get(chatId);
  if(quote)$('prompt').setAttribute('data-placeholder','Reply…');
  else $('prompt').setAttribute('data-placeholder','Message '+(state.chat?.name||state.bot?.name||'your bot'));
  const key=JSON.stringify([chatId,quote]);if(replyPreview.dataset.key===key)return;replyPreview.dataset.key=key;
  const animate=composerReplyChat===chatId;composerReplyChat=chatId;
  changeComposerReply(()=>{
  $('composer').classList.toggle('is-replying',!!quote);
  replyPreview.replaceChildren();replyPreview.hidden=!quote;if(!quote)return;
  const name=quote.sender==='user'?'you':state.chat?.participants?.find(p=>p.id===quote.sender)?.name||state.bots.find(b=>b.id===quote.sender)?.name||'this message';
  const excerpt=node('span','composer-reply-text',quote.text);excerpt.title=quote.text;
  replyPreview.setAttribute('aria-label','Replying to '+name);replyPreview.append(icon('reply',15),excerpt,iconButton('close','Cancel reply',()=>{state.replyDrafts.delete(composerChatId());renderReplyDraft();$('prompt').focus({preventScroll:true});}));
  },animate);
}
function startMessageReply(chatId,message){
  if(composerChatId()!==chatId)return;
  state.replyDrafts.set(chatId,{seq:message.seq,sender:message.sender,text:plainMessage(message.text).slice(0,500)});
  closeMessageMenu();renderReplyDraft();$('prompt').focus({preventScroll:true});
}
function messageActions(chatId,message){
  const actions=node('div','message-actions');actions.setAttribute('role','toolbar');actions.setAttribute('aria-label','Message actions');
  const react=iconButton('smile','React to message',()=>openMessageMenu(chatId,message,'react')),
    reply=iconButton('reply','Reply to message',()=>startMessageReply(chatId,message)),
    copy=iconButton('copy','Copy message',async()=>{
      await copyText(message.text);copy.replaceChildren(icon('check'));copy.title='Copied';copy.setAttribute('aria-label','Copied');notice('Copied.');
      setTimeout(()=>{if(copy.isConnected){copy.replaceChildren(icon('copy'));copy.title='Copy message';copy.setAttribute('aria-label','Copy message');}},1600);
    });
  for(const [control,name] of [[react,'react'],[reply,'reply'],[copy,'copy']]){control.dataset.messageFocus=name;control.dataset.messageAction=name;}
  for(const control of [react]){control.setAttribute('aria-haspopup','menu');control.setAttribute('aria-expanded',String(messageMenuContext?.chatId===chatId&&messageMenuContext.seq===message.seq&&messageMenuContext.kind===control.dataset.messageAction));}
  actions.append(react,reply,copy);
  const created=new Date(Number(message.created)*1000);
  if(Number.isFinite(created.getTime())){
    const timestamp=node('time','message-action-time',clock(message.created));timestamp.dateTime=created.toISOString();
    timestamp.title=created.toLocaleString(undefined,{timeZone:botTimezone(),dateStyle:'full',timeStyle:'long'});timestamp.setAttribute('aria-label',timestamp.title);
    actions.append(timestamp);
  }
  return actions;
}
function closeMessageMenu(restore=false){
  const old=messageMenuContext;messageMenu?.remove();messageMenu=null;messageMenuContext=null;
  for(const n of document.querySelectorAll('.message-menu-open'))n.classList.remove('message-menu-open');
  for(const n of document.querySelectorAll('.message-actions [aria-expanded]'))n.setAttribute('aria-expanded','false');
  if(restore&&old)setTimeout(()=>{if(composerChatId()===old.chatId)$('content').querySelector('[data-message="'+old.seq+'"] [data-message-action="'+old.kind+'"]')?.focus({preventScroll:true});},0);
}
function positionMessageMenu(){
  if(!messageMenuContext)return;
  const {chatId,seq,kind}=messageMenuContext;
  const group=$('content').querySelector('[data-message="'+seq+'"]'),anchor=group?.querySelector('[data-message-action="'+kind+'"]');
  if(composerChatId()!==chatId||!anchor){closeMessageMenu();return;}
  group.classList.add('message-menu-open');anchor.setAttribute('aria-expanded','true');
  const r=anchor.getBoundingClientRect(),bounds=messageMenu.getBoundingClientRect();
  messageMenu.style.left=Math.max(8,Math.min(r.left,innerWidth-bounds.width-8))+'px';
  messageMenu.style.top=Math.max(8,r.bottom+bounds.height+8<=innerHeight?r.bottom+7:r.top-bounds.height-7)+'px';
}
function openMessageMenu(chatId,message,kind){
  if(messageMenuContext?.seq===message.seq&&messageMenuContext.kind===kind){closeMessageMenu();return;}
  closeMessageMenu();messageMenuContext={chatId,seq:message.seq,kind};
  messageMenu=node('div','message-action-menu '+(kind==='react'?'emoji-menu':''));messageMenu.setAttribute('role','menu');messageMenu.setAttribute('aria-label',kind==='react'?'Choose a reaction':'Message options');
  if(kind==='react')for(const [emoji,label] of reactionChoices){
    const item=button(emoji,async()=>{await setMessageReaction(chatId,message.seq,emoji);closeMessageMenu(true);},'emoji-choice');
    item.title=label;item.setAttribute('aria-label',label);item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String(message.reactions?.some(r=>r.user&&r.emoji===emoji)||false));messageMenu.append(item);
  }
  messageMenu.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMessageMenu(true);return;}
    const items=[...messageMenu.querySelectorAll('button')],at=items.indexOf(document.activeElement),step=kind==='react'?4:1;
    let next;if(e.key==='Home')next=0;else if(e.key==='End')next=items.length-1;else if(e.key==='ArrowRight')next=at+1;else if(e.key==='ArrowLeft')next=at-1;else if(e.key==='ArrowDown')next=at+step;else if(e.key==='ArrowUp')next=at-step;
    if(next!==undefined){e.preventDefault();items[(next+items.length)%items.length].focus();}
    if(e.key==='Tab')closeMessageMenu(true);
  });
  document.body.append(messageMenu);positionMessageMenu();messageMenu.querySelector('button')?.focus({preventScroll:true});
}
async function setMessageReaction(chatId,seq,emoji){
  const key=chatId+':'+seq;if(reactionPending.has(key))return;reactionPending.add(key);
  const entry=chatHistory.get(chatId),message=entry?.messages.find(m=>m.seq===seq),mine=message?.reactions?.find(r=>r.user)?.emoji;
  const selected=mine===emoji?null:emoji;
  try{
    await api('/chats/'+chatId+'/messages/'+seq+'/reaction','PUT',{emoji:selected});
    if(message){message.reactions=(message.reactions||[]).filter(r=>!r.user);if(selected)message.reactions.push({user:true,emoji:selected});}
    state.chatKey='';if(currentConversationId()===chatId)await renderChat(true,'cached');
  }finally{reactionPending.delete(key);}
}
function messageReactions(chatId,message){
  const badges=node('div','message-reactions'),groups=new Map();
  for(const r of message.reactions){if(!groups.has(r.emoji))groups.set(r.emoji,[]);groups.get(r.emoji).push(r);}
  for(const [emoji,people] of groups){
    const mine=people.some(r=>r.user),names=people.map(r=>r.user?'You':r.name||state.bots.find(b=>b.id===r.bot_id)?.name||'Bot');
    const badge=button('',()=>setMessageReaction(chatId,message.seq,emoji),'reaction-badge'+(mine?' own-reaction':''));badge.append(node('span','',emoji));if(people.length>1)badge.append(node('span','reaction-count',people.length));
    badge.title=names.join(', ')+' reacted '+emoji;badge.setAttribute('aria-label',(mine?'Remove your':'React with')+' '+emoji+' · '+badge.title);badge.setAttribute('aria-pressed',String(mine));badge.dataset.messageFocus='reaction-'+reactionChoices.findIndex(r=>r[0]===emoji);badges.append(badge);
  }
  return badges;
}
function quotedMessage(chatId,quote){
  const jump=button('',()=>jumpToMessage(chatId,quote.seq),'message-quote');jump.setAttribute('aria-label','View message from '+quote.author);
  const content=node('span','message-quote-content');content.append(node('strong','',quote.author),node('span','',plainMessage(quote.text)));
  jump.append(icon('reply',15),content);return jump;
}
async function jumpToMessage(chatId,seq){
  closeMessageMenu();if(currentConversationId()!==chatId)return;
  let target=$('content').querySelector('[data-message="'+seq+'"]');
  if(!target){
    const entry=conversationHistory(chatId);if(entry.pending)await entry.pending;
    const data=await messagePage(entry,{before:seq,inclusive:true});
    if(currentConversationId()!==chatId)return;
    chatScroll.follow=false;chatScroll.anchor=null;acceptHistoryPage(entry,data);state.chatKey='';await renderChat(true,'cached');
    target=$('content').querySelector('[data-message="'+seq+'"]');
  }
  if(!target){notice('The original message is unavailable.',true);return;}
  const recovery=target.closest('.task-recovery-history')||target.querySelector('.task-recovery-history');if(recovery)recovery.open=true;
  const stack=target.matches('.connector-stack-group')?target.querySelector('.connector-stack'):target.closest('.connector-stack');
  if(stack){stack.open=true;conversationHistory(chatId).openConnectorStacks?.add(stack.dataset.connectorStack);}
  const call=target.querySelector('.connector-call');if(call){call.open=true;conversationHistory(chatId).openConnectorCalls?.add(target.querySelector('[data-connector-artifact]')?.dataset.connectorArtifact);}
  chatScroll.follow=false;target.scrollIntoView({block:'center',behavior:'instant'});target.focus({preventScroll:true});captureChatAnchor();target.classList.add('quoted-highlight');setTimeout(()=>target.classList.remove('quoted-highlight'),1600);
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.message-action-menu,.message-actions'))closeMessageMenu();});
$('content').addEventListener('scroll',()=>positionMessageMenu());window.addEventListener('resize',()=>positionMessageMenu());
initDesktopChrome();

dictationUI=createDictationUI({editor:$("prompt"),send:$("send"),composer:$("composer"),api,nativeInvoke,chatId:composerChatId,hasFiles:()=>!!pendingFiles.get(composerChatId())?.length,notice,icon});

function workflowOptions(chatId,panel){return {
 onReady:animateWorkflowDetails,
 onRespond:async input=>{const saved=await api('/chats/'+encodeURIComponent(chatId)+'/panels/'+encodeURIComponent(panel.id)+'/respond','POST',input);void refresh();return saved;},
 avatar:(id,name)=>{const b=state.bots.find(b=>b.id===id);return b?buddy(b,22):node('span','workflow-initial',name.slice(0,1));},
 onChat:async id=>{const c=state.chats.find(c=>c.id===id);if(c)await chooseChat(c);else notice('This conversation is no longer available.');},
 onMonitor:()=>openSettings('routines'),
 fileCard:file=>{const holder=node('div');renderAttachments(holder,[file]);return holder;}
};}

function animateWorkflowDetails(root){for(const details of root.querySelectorAll('.workflow-details')){const body=node('div','chat-disclosure-body');for(const child of [...details.children])if(child.tagName!=='SUMMARY')body.append(child);details.append(body);animateChatDisclosure(details,body);}}

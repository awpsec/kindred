// Exercise JavaScript emitted by the real Foundation-only Swift bridge. This
// tests transport/security behavior; UIKit category mapping needs a Mac test.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const scripts = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
function page({origin='https://kindred.example.com', embedded=false, token=null}={}) {
  const session = new Map(token ? [['kindred-token',token]] : []);
  const local = new Map([['kindred-token','stale'],['draft','Keep this draft']]);
  const events=[];
  const window={location:{origin},scrollY:42,
    sessionStorage:{getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v)},
    localStorage:{removeItem:k=>local.delete(k)},
    dispatchEvent:event=>events.push({event,scaleAtDispatch:window.__KINDRED_SYSTEM_TEXT_SCALE})};
  window.self=window;window.top=embedded?{}:window;
  const context=vm.createContext({window,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}});
  return {window,session,local,events,run:key=>vm.runInContext(scripts[key],context)};
}
const p=page();p.run('bootstrap');p.run('large');
assert.equal(p.window.__KINDRED_MOBILE_PLATFORM,'ios');
assert.equal(p.window.__KINDRED_SYSTEM_TEXT_SCALE,1);
assert.equal(p.events[0].event.type,'kindred-system-text-size');
for(const name of ['small','accessibility','large']) {
  p.run(name);
  const last=p.events.at(-1);
  assert.equal(last.scaleAtDispatch,last.event.detail.scale,'global is set before event listeners run');
}
p.run('accessibility');
assert.equal(p.window.__KINDRED_SYSTEM_TEXT_SCALE,53/17,'AX value is continuous, not snapped or capped');
assert.equal(p.session.get('kindred-token'),'ab12'.repeat(16));
assert.equal(p.local.get('draft'),'Keep this draft');
assert.equal(p.window.scrollY,42);
assert.equal(p.window.pageZoom,undefined,'bridge does not zoom the layout/canvas');
for(const name of ['invalid','infinite','negative']) {p.run(name);assert.equal(p.window.__KINDRED_SYSTEM_TEXT_SCALE,1);}
for(const options of [{origin:'https://other.example.com'},{origin:'http://kindred.example.com'},
    {origin:'https://kindred.example.com:8443'},{embedded:true}]) {
  const rejected=page(options);rejected.run('bootstrap');rejected.run('accessibility');
  assert.equal(rejected.window.__KINDRED_SYSTEM_TEXT_SCALE,undefined,'origin/frame mismatch must not receive scale');
  assert.equal(rejected.events.length,0);
  assert.equal(rejected.local.get('kindred-token'),'stale','mismatch must not touch credentials');
}
for(const platform of [undefined,'android','desktop']) {
  const other=page();other.window.__KINDRED_MOBILE=true;other.window.__KINDRED_MOBILE_PLATFORM=platform;
  other.run('accessibility');assert.equal(other.events.length,0);
}
// Navigation can happen between native URL inspection and JS execution.
p.window.location.origin='https://other.example.com';const count=p.events.length;
p.run('accessibility');assert.equal(p.events.length,count);
// Reload/account reconstruction starts with the latest setting; bootstrap must
// still preserve a newer token rotated by the page.
const reloaded=page({token:'rotated-valid-token'});reloaded.run('bootstrap');reloaded.run('accessibility');
assert.equal(reloaded.window.__KINDRED_SYSTEM_TEXT_SCALE,53/17);
assert.equal(reloaded.session.get('kindred-token'),'rotated-valid-token');
assert.equal(reloaded.local.get('kindred-token'),undefined);
console.log('Native text-size scripts: initial/live/latest scale, exact origin/main frame, iOS isolation and unchanged sessions/drafts passed.');

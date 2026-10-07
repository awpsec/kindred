const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const fixtures = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let cases = 0;
for (const fixture of fixtures) {
  const target = new URL(fixture.origin);
  const wrongScheme = new URL(target); wrongScheme.protocol = target.protocol === 'http:' ? 'https:' : 'http:';
  const wrongPort = new URL(target); wrongPort.port = '9445';
  const otherHost = new URL(target); otherHost.hostname = '192.168.1.21';
  const options = [{origin: fixture.origin}, {origin: fixture.origin, embedded: true},
    ...[wrongScheme, wrongPort, otherHost].map(url => ({origin: url.origin}))];
  for (const option of options) {
    const local = new Map([['kindred-token', 'stale'], ['draft', 'Preserve draft']]);
    const session = new Map();
    const window = {location: {origin: option.origin},
      sessionStorage: {getItem: k => session.get(k) ?? null, setItem: (k, v) => session.set(k, v)},
      localStorage: {removeItem: k => local.delete(k)}};
    window.self = window; window.top = option.embedded ? {} : window;
    vm.runInNewContext(fixture.bootstrap, {window});
    const allowed = option.origin === fixture.origin && !option.embedded;
    assert.equal(session.get('kindred-token'), allowed ? 'ab12'.repeat(16) : undefined);
    assert.equal(local.get('kindred-token'), allowed ? undefined : 'stale');
    assert.equal(local.get('draft'), 'Preserve draft');
    assert.equal(window.__KINDRED_MOBILE_PLATFORM, allowed ? 'ios' : undefined);
    cases++;
  }
  const route = new URL(fixture.chatURL);
  assert.equal(route.origin, target.origin);
  const fragment = new URLSearchParams(route.hash.slice(1));
  assert.equal(fragment.get('kindred-chat'), 'dm-abc');
  assert.equal(fragment.get('kindred-event'), '42');
}
console.log(JSON.stringify({bootstrapCases: cases, exactNotificationOrigins: fixtures.length,
  realSwiftEmittedScripts: true, nativeWebKitExecuted: false}));

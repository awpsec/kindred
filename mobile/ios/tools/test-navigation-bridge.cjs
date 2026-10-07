const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const scripts = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let cases = 0;
for (const [phase, source] of Object.entries(scripts)) {
  for (const variant of ['valid', 'foreign', 'iframe', 'android', 'absent', 'reject']) {
    const received = [];
    const w = { innerWidth: 400, innerHeight: 800, location: { origin: variant === 'foreign' ? 'https://other.example' : 'https://kindred.example' },
      __KINDRED_MOBILE_PLATFORM: variant === 'android' ? 'android' : 'ios' };
    w.self = w; w.top = variant === 'iframe' ? {} : w;
    if (variant !== 'absent') w.__KINDRED_EDGE_BACK = payload => { received.push(payload); return variant !== 'reject'; };
    const result = vm.runInNewContext(`(function(){${source}})()`, {window:w});
    assert.equal(result, variant === 'valid', `${phase}/${variant} return`);
    assert.equal(received.length, ['valid','reject'].includes(variant) ? 1 : 0, `${phase}/${variant} calls`);
    if (received.length) {
      const p = received[0];
      assert.equal(p.phase, phase); assert.equal(p.revision, 42);
      assert.equal(p.id.toLowerCase(), '12345678-1234-1234-1234-123456789abc');
      assert.equal(p.commit, phase === 'finish');
      assert.equal(p.x, 10); assert.equal(p.y, 400);
      assert.equal(p.progress, phase === 'update' ? 0 : .35);
    }
    cases++;
  }
}
console.log(JSON.stringify({cases, pass:true, nativeUIKit:false}));

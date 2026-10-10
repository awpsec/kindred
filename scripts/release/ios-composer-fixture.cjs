// Serve the exact checked-out shared UI over a disposable loopback TLS fixture.
'use strict';
const fs = require('node:fs'), path = require('node:path'), https = require('node:https');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const [cert, key] = process.argv.slice(2);
if (!cert || !key || process.argv.length !== 4) throw new Error('Expected certificate and private-key paths');
process.env.KINDRED_TEST_SECURITY_HEADERS = '1';
const fixture = require(path.join(root, 'tools/frontend/fixtures/desktop.cjs'));
const handlers = fixture.server.listeners('request');
if (handlers.length !== 1) throw new Error('Expected one original desktop fixture request handler');
const hashes = Object.fromEntries(fs.readdirSync(path.join(root, 'ui')).filter(name => /\.(js|css|html|txt)$/.test(name)).sort().map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'ui', name))).digest('hex')]));
const server = https.createServer({cert: fs.readFileSync(cert), key: fs.readFileSync(key)}, (req, res) => {
  const route = new URL(req.url, 'https://localhost:8765').pathname;
  // Synthetic fixture metadata only: omit query, headers, body and certificate data.
  res.once('finish', () => console.log(JSON.stringify({event: 'request-finished', method: req.method, path: route, status: res.statusCode})));
  if (req.url === '/fixture/ready') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({fixture: 'composer-uikit', origin: 'https://localhost:8765', ui_sha256: hashes}));
  }
  handlers[0](req, res);
});
server.on('tlsClientError', error => console.log(JSON.stringify({event: 'tls-client-error', code: error.code || 'unknown'})));
server.on('error', error => {console.error(error.message); process.exit(1);});
server.listen(8765, '127.0.0.1', () => console.log('Composer UIKit fixture ready on loopback TLS'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));

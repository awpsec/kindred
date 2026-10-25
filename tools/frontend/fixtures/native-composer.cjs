// Disposable loopback HTTPS fixture for app-hosted ComposerUIKitTests.
// Usage: node tools/frontend/fixtures/native-composer.cjs /path/to/tls-directory
// The directory must contain localhost.key and localhost.crt; never use live keys.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const {server: desktop} = require('./desktop.cjs');
const directory = process.argv[2];
if (!directory) throw new Error('Pass the disposable localhost certificate directory');
const ui = path.resolve(__dirname, '../../../ui');
const manifest = Object.fromEntries(['style.css', 'progress.css', 'app.js', 'dictation.js', 'commands.js'].map(name => [name,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(ui, name))).digest('hex')]));
const handler = desktop.listeners('request')[0];
const server = https.createServer({
  key: fs.readFileSync(path.join(directory, 'localhost.key')),
  cert: fs.readFileSync(path.join(directory, 'localhost.crt')),
}, (request, response) => {
  if (new URL(request.url, 'https://localhost:8765').pathname === '/fixture/ready') {
    response.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    response.end(JSON.stringify({ui_sha256: manifest}));
    return;
  }
  handler(request, response).catch(error => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
    console.error(error.message);
  });
});
server.listen(8765, 'localhost', () => console.log(JSON.stringify({ready: true, ui_sha256: manifest})));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));

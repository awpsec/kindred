// Compatibility entry point; all identity exports use the approved source.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.env.KINDRED_PYTHON || 'python3',
  [path.resolve(__dirname, '../branding/generate.py'), '--target', 'desktop'],
  { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

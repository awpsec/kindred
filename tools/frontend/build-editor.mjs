import {build} from 'esbuild';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
await build({absWorkingDir:root,entryPoints:['editor-vendor.mjs'],bundle:true,minify:true,format:'esm',target:'es2022',outfile:'../../ui/editor-vendor.js',legalComments:'linked'});
const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));let notices='Bundled editor dependency licenses; exact versions in tools/frontend/package-lock.json.\n';
for(const [folder,pkg] of Object.entries(lock.packages)){if(!folder||pkg.dev)continue;let files;try{files=await readdir(join(root,folder));}catch{continue;}for(const f of files.filter(n=>/^(license|licence|copying|notice)([.\-_]|$)/i.test(n))){notices+=`\n--- ${folder} ${pkg.version} ---\n`+await readFile(join(root,folder,f),'utf8')+'\n';}}
await writeFile(join(root,'../../third-party/artifact-editor-LICENSES.txt'),notices);

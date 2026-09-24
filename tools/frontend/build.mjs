import {build} from 'esbuild';
import {remoteCursorPlugin} from './remote-cursor-plugin.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
await build({absWorkingDir:root,entryPoints:['vendor.mjs'],plugins:[remoteCursorPlugin],bundle:true,minify:true,format:'esm',target:'es2022',outfile:'../../ui/vendor.js',legalComments:'linked'});
const react=await build({absWorkingDir:root,entryPoints:['artifact-react.mjs'],bundle:true,minify:true,format:'iife',target:'es2022',write:false,define:{'process.env.NODE_ENV':'"production"'},legalComments:'inline'});
await build({absWorkingDir:root,stdin:{contents:`import * as Babel from '@babel/standalone';export const transform=Babel.transform;export const runtime=${JSON.stringify(react.outputFiles[0].text)};`,resolveDir:root},bundle:true,minify:true,format:'esm',target:'es2022',outfile:'../../ui/artifact-vendor.js',legalComments:'linked'});
await build({absWorkingDir:root,entryPoints:['document-worker.mjs'],alias:{crypto:'./empty.mjs',fs:'./empty.mjs',stream:'readable-stream'},inject:['./document-polyfills.mjs'],bundle:true,minify:true,format:'iife',platform:'browser',target:'es2022',outfile:'../../ui/document-worker.js',legalComments:'linked'});
await build({absWorkingDir:root,entryPoints:['document-vendor.mjs'],bundle:true,minify:true,format:'esm',target:'es2022',outfile:'../../ui/document-vendor.js',legalComments:'linked'});
await build({absWorkingDir:root,entryPoints:['node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],bundle:true,minify:true,format:'esm',target:'es2022',outfile:'../../ui/pdf-worker.js',legalComments:'linked'});
// Keep redistributable license texts alongside the locally bundled renderers.
const {readFile,readdir,writeFile}=await import('node:fs/promises');
const {join}=await import('node:path');
const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
let notices='Local document preview dependencies. Exact versions: tools/frontend/package-lock.json.\n';
for(const [folder,pkg] of Object.entries(lock.packages)){
 if(!folder||pkg.dev)continue;
 const directory=join(root,folder);let names;try{names=await readdir(directory);}catch{continue;}
 for(const name of names.filter(n=>/^(licen[sc]e|copying|notice)([.\-_]|$)/i.test(n))){
  try{notices+=`\n--- ${folder} ${pkg.version} (${name}) ---\n`+await readFile(join(directory,name),'utf8')+'\n';}catch{}
 }
}
await writeFile(join(root,'../../third-party/document-preview-LICENSES.txt'),notices);

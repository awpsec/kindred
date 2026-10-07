// Parse the actual HTTP response graph; do not mistake bundled string literals for imports.
const vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const base=new URL(process.argv[2]);assert.equal(base.protocol,'http:');assert(['127.0.0.1','localhost','[::1]'].includes(base.hostname));
 const html=await fetch(base).then(async response=>{assert.equal(response.status,200);return response.text();});
 const pending=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(item=>new URL(item[1],base).href),visited=new Set();
 while(pending.length){
  const address=pending.pop();if(visited.has(address))continue;visited.add(address);
  const response=await fetch(address);assert.equal(response.status,200,'startup module '+new URL(address).pathname);
  assert((response.headers.get('content-type')||'').includes('javascript'),'JavaScript MIME required: '+address);
  const source=await response.text(),module=new vm.SourceTextModule(source,{identifier:address});
  for(const specifier of module.dependencySpecifiers){const target=new URL(specifier,address);assert.equal(target.origin,base.origin);pending.push(target.href);}
 }
 assert(visited.has(new URL('/standalone-access.js',base).href),'transitive standalone dependency must be checked');
 assert(visited.size>=28,'nonempty actual module graph required');
 console.log(JSON.stringify({passed:true,nodes:visited.size,paths:[...visited].map(address=>new URL(address).pathname).sort()}));
})().catch(error=>{console.error(error);process.exit(1);});

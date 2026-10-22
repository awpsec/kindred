// Generate static native toolbar silhouettes from the same neutral web artwork.
// Run after changing the catalog/renderer. --check verifies the committed asset.
import fs from 'node:fs';
import {createMotionEngine,resolveBody,projectGeometry} from '../../ui/avatar-runtime/grok-avatar-engine.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../../ui/avatar-runtime/catalog.json',import.meta.url)));
const artwork={};
for(const body of catalog.bodies){
 const engine=createMotionEngine({body:resolveBody(body)});engine.pause();engine.seek(0);engine.holdFace(null);engine.setExpression('neutral');
 for(let i=0;i<60;i++)engine.advance(.1);
 const geometry=projectGeometry(engine.frame(),resolveBody(body),100);
 const extent=Math.max(...geometry.body.flat().flat().map(value=>Math.abs(value-50)));
 const scale=Math.min(4/3,48/extent);
 const points=loops=>loops.map(loop=>loop.map(pair=>pair.map(value=>Math.round((50+(value-50)*scale)*100)/100)));
 artwork[body]={body:points(geometry.body),eyes:points(geometry.eyes)};
}
// Old profiles are still valid. Current catalog names take precedence.
for(const [old,body] of Object.entries(catalog.legacyBodies))if(!artwork[old])artwork[old]=artwork[body];
const output=JSON.stringify(artwork)+'\n',target=new URL('../../mobile/ios/KindredCompanion/Views/BotToolbarArtwork.json',import.meta.url);
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==output)throw Error('Native toolbar artwork is stale');console.log('Native toolbar artwork matches the web catalog');}
else fs.writeFileSync(target,output);

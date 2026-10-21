// Reproducible front-pose notification geometry from the exact bundled engine.
import fs from 'node:fs';
import {createMotionEngine,resolveBody,createAppearance,renderSvg} from '../../ui/avatar-runtime/grok-avatar-engine.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../../ui/avatar-runtime/catalog.json',import.meta.url)));
const out={};
for(const body of catalog.bodies){out[body]={};for(const expression of catalog.expressions){const engine=createMotionEngine({body:resolveBody(body)});engine.holdFace(expression==='neutral'?null:expression);for(let t=0;t<120;t++)engine.advance(1/60);out[body][expression]=renderSvg(engine.frame(),createAppearance('#ABCDEF'),128,'portrait');}}
fs.writeFileSync(new URL('../../ui/avatar-runtime/portraits.json',import.meta.url),JSON.stringify(out)+'\n');
console.log(JSON.stringify({bodies:Object.keys(out).length,portraits:catalog.bodies.length*catalog.expressions.length}));

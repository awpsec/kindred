import fs from 'node:fs';import assert from 'node:assert/strict';
import * as A from '../../ui/avatar-runtime/grok-avatar-engine.mjs';
const c=JSON.parse(fs.readFileSync(new URL('../../ui/avatar-runtime/catalog.json',import.meta.url)));
const advance=(e,s,t)=>{for(let n=0;n<t;n+=1/60){s?.advance(1/60);e.advance(1/60);}};
let count=0;
for(const body of c.bodies)for(const state of Object.keys(A.animationStates)){const e=A.createMotionEngine({body:A.resolveBody(body)}),s=A.createStateController(e,state,{seed:42,firstPhase:0});for(const t of [0,1.5]){advance(e,s,t);const svg=A.renderSvg(e.frame(),A.createAppearance('#2A92FE'),128,'matrix');assert(!/NaN|Infinity|undefined/.test(svg),body+'/'+state);}count++;}
for(const clip of A.motionRecipes){const e=A.createMotionEngine({body:A.resolveBody('heart')});e.load(clip,{transition:'cut'});advance(e,null,clip.duration+.5);assert(!/NaN|undefined/.test(A.renderSvg(e.frame(),A.createAppearance('#123456'),128,'clip')));}
const supplied=Object.fromEntries(c.morphs.map(name=>[name,true]));
for(const name of Object.keys(supplied)){const e=A.createMotionEngine({body:A.resolveBody('heart')});e.setMorph(name);advance(e,null,3);assert(!/NaN|undefined/.test(A.renderSvg(e.frame(),A.createAppearance('#123456'),128,'morph')));e.setMorph(null);advance(e,null,3);assert.equal(e.frame().morph,null);}
const portraits=JSON.parse(fs.readFileSync(new URL('../../ui/avatar-runtime/portraits.json',import.meta.url)));
for(const body of c.bodies)for(const expression of c.expressions){assert(portraits[body][expression].startsWith('<svg'));assert(!portraits[body][expression].includes('NaN'));}
assert.equal(c.bodies.length,25);assert.equal(count,1325);assert(!c.bodies.includes('pumpkin'));
console.log(JSON.stringify({shapeStates:count,svgSamples:count*2,clips:A.motionRecipes.length,morphs:Object.keys(supplied).length,portraits:225}));

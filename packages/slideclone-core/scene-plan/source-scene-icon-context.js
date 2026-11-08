// @ts-check
"use strict";
const {types}=require('node:util');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** @param {unknown} value @returns {value is Box} */
function box(value){return record(value)&&[value.x,value.y,value.w,value.h].every(v=>typeof v==='number'&&Number.isFinite(v))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0
 &&Number(value.x)+Number(value.w)<=16384&&Number(value.y)+Number(value.h)<=16384;}
/** @param {unknown} value @param {number} limit @returns {value is Box[]} */
function boxes(value,limit){return Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=limit
 &&Reflect.ownKeys(value).length===value.length+1&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p)&&value.every(box);}
/** Propose scan context from spatial peers, never their text or paint. Oversized
 * semantic cards cannot suppress the bounded icon/caption context. The resulting
 * rectangle grants no body, matte, glyph or drawing authority.
 * @param {unknown} seed @param {unknown} scope @param {unknown} texts @param {unknown} containers @returns {Box|null} */
function sceneIconBackdropHint(seed,scope,texts,containers){
 if(!box(seed)||!box(scope)||!boxes(texts,10000)||!boxes(containers,88)
  ||seed.x<scope.x||seed.y<scope.y||seed.x+seed.w>scope.x+scope.w||seed.y+seed.h>scope.y+scope.h)
  throw new TypeError('Scene icon context controls are invalid');
 const cx=seed.x+seed.w/2,cy=seed.y+seed.h/2;
 const parents=containers.filter(p=>p.w*p.h<=262144&&p.x<=cx&&p.x+p.w>cx&&p.y<=cy&&p.y+p.h>cy)
  .sort((a,b)=>a.w*a.h-b.w*b.h);
 if(parents[0])return {...parents[0]}; const rx=Math.min(28,Math.max(12,Math.round(seed.w*.35))),ry=Math.min(28,Math.max(12,Math.round(seed.h*.35))),touching=containers.filter(p=>p.w*p.h<=262144&&!(p.x===scope.x&&p.y===scope.y&&p.w===scope.w&&p.h===scope.h)&&Math.min(seed.x+seed.w+rx,p.x+p.w)>Math.max(seed.x-rx,p.x)&&Math.min(seed.y+seed.h+ry,p.y+p.h)>Math.max(seed.y-ry,p.y)).sort((a,b)=>a.w*a.h-b.w*b.h); if(touching[0])return {...touching[0]};
 const peers=texts.filter(t=>t.x>=seed.x&&t.x+t.w<=scope.x+scope.w&&t.y<seed.y+seed.h&&t.y+t.h>seed.y);
 if(!peers.length)return null;
 const x=Math.min(seed.x,...peers.map(t=>t.x)),y=Math.min(seed.y,...peers.map(t=>t.y));
 const hint={x,y,w:Math.max(seed.x+seed.w,...peers.map(t=>t.x+t.w))-x,h:Math.max(seed.y+seed.h,...peers.map(t=>t.y+t.h))-y};
 return hint.w*hint.h<=262144?hint:null;
}
module.exports={sceneIconBackdropHint};

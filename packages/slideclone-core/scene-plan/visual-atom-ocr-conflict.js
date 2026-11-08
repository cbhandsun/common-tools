// @ts-check
'use strict';
const {types}=require('node:util');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>'value'in d);}
/** @param {unknown} v @returns {v is {x:number,y:number,w:number,h:number}} */
function box(v){return record(v)&&[v.x,v.y,v.w,v.h].every(n=>typeof n==='number'&&Number.isFinite(n))
 &&Number(v.x)>=0&&Number(v.y)>=0&&Number(v.w)>0&&Number(v.h)>0&&Number.isFinite(Number(v.x)+Number(v.w))&&Number.isFinite(Number(v.y)+Number(v.h));}
/** Source OCR geometry reserves semantic text before speculative visual-atom
 * emission. Complete containment rejects a competing guess; it grants neither
 * source-pixel ownership nor erasure or completion. A containing card, an
 * independent icon, a crossing connector and unknown OCR remain untouched.
 * There is no fixed glyph size: titles and scaled pages obey the same rule.
 * @param {unknown} input */
function createOcrAtomConflictFilter(input){
 if(!Array.isArray(input)||types.isProxy(input)||input.length>10000||Object.getPrototypeOf(input)!==Array.prototype
  ||Reflect.ownKeys(input).length!==input.length+1||Object.values(Object.getOwnPropertyDescriptors(input)).some(d=>!('value'in d)))
  throw new TypeError('OCR atom conflict controls are invalid');
 /** @type {{x:number,y:number,w:number,h:number}[]} */const frames=[];
 for(const item of /** @type {unknown[]} */(input)){
  if(!record(item)||!record(item.source)||typeof item.text!=='string'||!item.text.trim()||item.text.length>16000
   ||typeof item.source.confidence!=='number'||!Number.isFinite(item.source.confidence)||item.source.confidence<.7||item.source.confidence>1)continue;
  const frame=item.source.evidenceBox??item.box;if(!box(frame))continue;
  frames.push({...frame});
 }
 /** @param {unknown} atom */
 return atom=>{
  if(!record(atom)||typeof atom.kind!=='string'||!['native-rect-candidate','native-ellipse-candidate','connector-line-candidate','grid-line-candidate'].includes(atom.kind)||!box(atom.box))return false;
  const b=atom.box;
  return frames.some(f=>b.x>=f.x&&b.y>=f.y&&b.x+b.w<=f.x+f.w&&b.y+b.h<=f.y+f.h);
 };
}
module.exports={createOcrAtomConflictFilter};

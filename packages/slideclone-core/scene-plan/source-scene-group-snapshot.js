// @ts-check
"use strict";
const {record,list}=require('./source-scene-group-containment');
/** Rendering snapshots never evaluate accessors or traverse cycles. The
 * existing IR tree limit bounds work; a failed snapshot grants nothing.
 * @param {unknown} item */
function sceneGroupSnapshot(item){
 if(!record(item)||!record(item.source)||item.style!==undefined&&!record(item.style))return null;
 const value=Object.fromEntries(['id','type','box','rotation','style','font','text','runs','positionedRuns','assetPath'].map(key=>[key,item[key]]));
 let remaining=30000;const active=new Set();
 /** @param {unknown} entry @param {number} depth @returns {boolean} */const safe=(entry,depth)=>{
  if(--remaining<0||depth>16)return false;
  if(entry===null||entry===undefined||typeof entry==='string'||typeof entry==='boolean')return true;
  if(typeof entry==='number')return Number.isFinite(entry);
  if(!record(entry)&&!list(entry)||active.has(entry))return false;
  active.add(entry);const valid=Object.values(entry).every(child=>safe(child,depth+1));active.delete(entry);return valid;
 };
 return safe(value,0)?JSON.stringify(value):null;
}
module.exports={sceneGroupSnapshot};

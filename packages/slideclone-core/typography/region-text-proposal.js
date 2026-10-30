// @ts-check
"use strict";
const {types}=require('node:util');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>typeof k==='string')
 &&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value'in p);}
/** @param {unknown} v @param {string[]} keys @returns {asserts v is Record<string,unknown>} */
function fields(v,keys){if(!record(v)||Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k)))fail();}
/** @returns {never} */
function fail(){throw new TypeError('Region text proposal is invalid');}
/** @param {unknown} v @param {number} min @param {number} max */
function number(v,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)return fail();return v;}
/** @param {unknown} v */
function identity(v){if(typeof v!=='string'||!/^\p{L}[\p{L}\p{N}_-]{0,95}$/u.test(v))return fail();return v;}
/** @param {unknown} v @param {number} max */
function content(v,max){
 if(typeof v!=='string'||v.length>max||!v.trim()||/[\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069\ufffe\uffff]/u.test(v))return fail();
 return v.normalize('NFC').trim();
}
/** @param {unknown} v @returns {Box} */
function box(v){fields(v,['x','y','w','h']);return {x:number(v.x,0,100000),y:number(v.y,0,100000),w:number(v.w,.01,100000),h:number(v.h,.01,100000)};}
/** @param {Box} a @param {Box} b */
const contains=(a,b)=>b.x>=a.x-1e-6&&b.y>=a.y-1e-6&&b.x+b.w<=a.x+a.w+1e-6&&b.y+b.h<=a.y+a.h+1e-6;
/** @param {unknown} v @param {number} max @returns {unknown[]} */
function list(v,max){if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>max
 ||Object.values(Object.getOwnPropertyDescriptors(v)).some(p=>!('value'in p))
 ||Reflect.ownKeys(v).length!==v.length+1||Array.from({length:v.length},(_,i)=>i).some(i=>!Object.hasOwn(v,i)))return fail();return v;}
/** Parse a regional model proposal into native text candidates. OCR is evidence,
 * not an exhaustive inventory. The result is NOT a source receipt or a semantic
 * completeness claim. Callers must render and compare the entire affected area
 * before adoption, and independently admit source ownership in the Worker.
 * All coordinates are slide points; no inferred or invisible owner is created.
 * @param {unknown} raw @param {unknown} context */
function parseRegionTextProposals(raw,context){
 fields(raw,['regionId','additions']);fields(context,['regionId','bounds','owners','existing']);
 const regionId=identity(context.regionId),bounds=box(context.bounds);
 if(raw.regionId!==regionId)fail();
 const owners=new Map(list(context.owners,256).map(row=>{fields(row,['id','box']);const b=box(row.box);if(!contains(bounds,b))fail();return [identity(row.id),b];}));
 if(owners.size!==/** @type {unknown[]} */(context.owners).length)fail();
 const existing=list(context.existing,1024).map(row=>{fields(row,['text','box']);return {text:content(row.text,4096),box:box(row.box)};});
 const seen=new Set();
 return list(raw.additions,32).map(row=>{
  fields(row,['id','ownerId','text','box','font']);fields(row.font,['family','sizePt','color','bold']);
  const id=identity(row.id),ownerId=identity(row.ownerId),owner=owners.get(ownerId),b=box(row.box),text=content(row.text,512);
  if(seen.has(id)||!owner||!contains(bounds,b)||!contains(owner,b))fail();seen.add(id);
  const color=row.font.color;if(typeof color!=='string'||!/^#[0-9a-f]{6}$/iu.test(color)||typeof row.font.bold!=='boolean')fail();
  const family=content(row.font.family,128),sizePt=number(row.font.sizePt,4,400);
  // Same content at another location is valid. Overlapping duplicate proposals
  // and OCR references are not: they would render the same characters twice.
  if(existing.some(t=>t.text===text&&Math.min(t.box.x+t.box.w,b.x+b.w)>Math.max(t.box.x,b.x)
   &&Math.min(t.box.y+t.box.h,b.y+b.h)>Math.max(t.box.y,b.y)))fail();
  existing.push({text,box:b});
  return {id:`region-text-${id}`,role:'body',text,box:b,
   font:{family,sizePt,color,weight:row.font.bold?'bold':'regular',align:'left',valign:'middle'},
   style:{visibility:'visible',wrap:false,fit:'none'},
   source:{sourceProposal:true,sourceProvenanceVerified:false,sceneRegionId:regionId,nativeComponentGroupId:ownerId}};
 });
}
module.exports={parseRegionTextProposals};

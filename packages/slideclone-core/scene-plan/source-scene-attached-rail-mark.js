// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{box:import('./source-scene-plan').Box,points:Point[]}} Component */
/** Propose only observed rail cells of a component with an outward branch.
 * This helper grants no paint, erasure, enclosure or port authority. The
 * source consumer still proves all four corners and every selected glyph cell.
 * @param {unknown} input @returns {Component[]} */
function attachedSceneRailMarks(input){
 if(!record(input)||!list(input.components)||!list(input.marks)||!list(input.textMasks)||!box(input.hint)
  ||!Number.isSafeInteger(input.side)||Number(input.side)<0||Number(input.side)>3||!record(input.work)
  ||!Number.isSafeInteger(input.work.checks)||Number(input.work.checks)<0||typeof input.work.exhausted!=='boolean'
  ||input.components.length>262144||input.marks.length<2||input.marks.length>262144
  ||input.textMasks.length>10000||input.textMasks.some(m=>!box(m)))throw new TypeError('Attached rail controls are invalid');
 let population=0;
 for(const c of input.components){
  if(!record(c)||!box(c.box)||!list(c.points)||!c.points.length||c.points.length>262144)
   throw new TypeError('Attached rail source is invalid');
  const bounds=c.box;
  if(c.points.some(p=>!record(p)||![p.x,p.y].every(n=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<16384)
    ||Number(p.x)<bounds.x||Number(p.y)<bounds.y||Number(p.x)>=bounds.x+bounds.w||Number(p.y)>=bounds.y+bounds.h))
   throw new TypeError('Attached rail source is invalid');
  population+=c.points.length;if(population>262144)throw new RangeError('Attached rail source exceeds its window');
 }
 const observed=new Set(input.components);
 if(input.marks.some(c=>!observed.has(c)))throw new TypeError('Attached rail marks are not observed');
 const components=/** @type {Component[]} */(input.components),marks=/** @type {Component[]} */(input.marks);
 const side=Number(input.side),horizontal=side<2,increasing=side===1||side===3;
 const masks=/** @type {import('./source-scene-plan').Box[]} */(input.textMasks);
 const work=/** @type {{checks:number,exhausted:boolean}} */(input.work),hint=input.hint;
 const low=marks.reduce((v,c)=>Math.min(v,horizontal?c.box.y:c.box.x),Infinity);
 const high=marks.reduce((v,c)=>Math.max(v,horizontal?c.box.y+c.box.h-1:c.box.x+c.box.w-1),-Infinity);
 const spans=marks.map(c=>({start:horizontal?c.box.x:c.box.y,end:horizontal?c.box.x+c.box.w:c.box.y+c.box.h})).sort((a,b)=>a.start-b.start);
 /** @type {Component[]} */const result=[];
 const markSet=new Set(marks);
 if(work.exhausted)return [];
 for(const c of components){
  if(markSet.has(c))continue;
  /** @type {Point[]} */const selected=[];let outside=false,invalid=false;
  for(const p of c.points){
   if(++work.checks>4000000){work.exhausted=true;return [];}
   if(masks.some(m=>{
    if(++work.checks>4000000){work.exhausted=true;return true;}
    return p.x>=m.x&&p.y>=m.y&&p.x<m.x+m.w&&p.y<m.y+m.h;
   })){invalid=true;break;}
   if(work.exhausted)return [];
   const across=horizontal?p.y:p.x;
   if(across>=low&&across<=high)selected.push(p);
   else if(increasing?across>high:across<low)outside=true;
   else {invalid=true;break;}
  }
  if(work.exhausted)return [];
  if(invalid||!outside||selected.length<4)continue;
  const extent=selected.reduce((b,p)=>({x0:Math.min(b.x0,p.x),y0:Math.min(b.y0,p.y),x1:Math.max(b.x1,p.x),y1:Math.max(b.y1,p.y)}),
   {x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity});
  const bounds={x:extent.x0,y:extent.y0,w:extent.x1+1-extent.x0,h:extent.y1+1-extent.y0};
  const start=horizontal?bounds.x:bounds.y,end=start+(horizontal?bounds.w:bounds.h);
  if(bounds.w>hint.w*.5||bounds.h>hint.h*.5||(horizontal?bounds.w<bounds.h:bounds.h<bounds.w))continue;
  // A branch may explain only an actual gap between independently observed
  // marks. Decorations near a corner cannot supply a missing source corner.
  const gap=spans.some((s,i)=>{
   if(++work.checks>4000000){work.exhausted=true;return false;}
   const next=spans[i+1];return next&&next.start>s.end&&start<next.start&&end>s.end;
  });
  if(work.exhausted)return [];
  if(!gap)continue;
  result.push({box:bounds,points:selected.map(p=>({...p}))});
 }
 return result;
}
module.exports={attachedSceneRailMarks};

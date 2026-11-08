// @ts-check
'use strict';
const {sceneNativeIconBinding}=require('./source-scene-native-icon');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
const {readNativeFreeformSegments,encodeNativeFreeformPath}=require('./native-freeform-path');
const {freeformResidualMasks}=require('./residual-freeform-mask');
const {record,list,box:validBox}=require('./source-scene-group-containment');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{parentId:string,ids:string[],snapshots:string[],paintSnapshots:string[]}} Proof */
/** Exact path-codec equivalence is permitted; no geometry or paint is omitted.
 * @param {unknown} shape */
function canonical(shape){
 if(!record(shape)||shape.type!=='freeform'||!record(shape.style)||!record(shape.source)
  ||shape.source.editable!==true||shape.source.pictorialVectorized!==true||shape.source.semanticPictorialNative!==true
  ||shape.style.stroke!=='none'||typeof shape.style.fill!=='string'||!/^#[a-f0-9]{6}$/iu.test(shape.style.fill)
  ||shape.style.opacity!==undefined&&shape.style.opacity!==1||shape.style.visibility==='hidden'
  ||Reflect.ownKeys(shape.style).some(k=>!['fill','stroke','strokeWidthPt','freeformSegments','freeformPath','opacity','visibility'].includes(String(k))))return null;
 /** @type {Record<string,unknown>} */const style={...shape.style,freeformPath:encodeNativeFreeformPath(readNativeFreeformSegments(shape.style))};
 delete style.freeformSegments;
 return sceneGroupSnapshot({...shape,style});
}
/** Capture only the exact complete native output of the source icon compiler.
 * A renderer is used to prove the source glyph survives the representation;
 * geometry receipt alone cannot certify a vectorizer that dropped that glyph.
 * @param {{image:import('../png').PngImage,compiled:unknown,parentId:string,cells:number[],slideSize:{widthPt:number,heightPt:number},budget:{used:number}}} input
 * @returns {Proof|null} */
function captureNativeGlyphIcon({image,compiled,parentId,cells,slideSize,budget}){
 const binding=sceneNativeIconBinding(image,compiled);
 if(!binding||binding.id!==parentId||!record(compiled)||!record(compiled.icon)||!validBox(compiled.icon.box)
  ||!list(compiled.shapes)||!compiled.shapes.length||compiled.shapes.length>32||!cells.length)return null;
 const parts=compiled.shapes,box=compiled.icon.box,sx=image.width/slideSize.widthPt,sy=image.height/slideSize.heightPt;
 const x0=Math.round(box.x*sx),y0=Math.round(box.y*sy),w=Math.round(box.w*sx),h=Math.round(box.h*sy),area=w*h;
 if(w<=0||h<=0||area>262144||x0<0||y0<0||x0+w>image.width||y0+h>image.height)return null;
 if(budget.used+area*(parts.length+1)>4000000)throw new RangeError('Scene crop pixel budget exceeded');
 budget.used+=area*(parts.length+1);
 const paint=new Uint8Array(area*4);
 /** @type {string[]} */const ids=[];
 /** @type {string[]} */const snapshots=[];
 for(const shape of parts){
  const digest=canonical(shape);
  if(!digest||!record(shape)||typeof shape.id!=='string'||!validBox(shape.box)||!record(shape.style))return null;
  ids.push(shape.id);snapshots.push(digest);
  const b=shape.box,local={...shape,box:{x:b.x*sx-x0,y:b.y*sy-y0,w:b.w*sx,h:b.h*sy}};
  // Native shape positions may contain binary ULPs around exact source edges.
  for(const k of['x','y','w','h']){
   const key=/** @type {keyof Box} */(k),v=local.box[key],n=Math.round(v);
   if(Math.abs(v-n)<=8*Number.EPSILON*Math.max(image.width,image.height))local.box[key]=n;
  }
  const masks=freeformResidualMasks(local,{width:w,height:h},{w,h});
  const fill=String(shape.style.fill),rgb=[1,3,5].map(i=>Number.parseInt(fill.slice(i,i+2),16));
  for(const mask of masks)for(let y=mask.y;y<mask.y+mask.h;y++)for(let x=mask.x;x<mask.x+mask.w;x++)paint.set([...rgb,255],(y*w+x)*4);
 }
 if(new Set(ids).size!==ids.length)return null;
 for(const cell of cells){
  const x=cell%image.width-x0,y=Math.floor(cell/image.width)-y0;
  if(x<0||y<0||x>=w||y>=h)return null;
  const p=(y*w+x)*4;
  if(paint[p+3]!==255||[0,1,2].some(c=>Math.abs((paint[p+c]??0)-(image.rgba[cell*4+c]??0))>42))return null;
 }
 return {parentId,ids,snapshots,paintSnapshots:parts.map(shape=>canonical({.../** @type {Record<string,unknown>} */(shape),id:'glyph-member'})??'')};
}
/** Bind final normal-pipeline paint to the captured complete native icon.
 * No serialized report can supply this proof. Reject lost, duplicate, hidden,
 * raster-replaced or edited members; source metadata alone is not proof.
 * @param {unknown} page @param {Proof} proof */
function finalNativeGlyphIcon(page,proof){
 if(!record(page)||!list(page.shapes)||!list(page.images))return null;
 const selected=page.shapes.filter(s=>record(s)&&(typeof s.id==='string'&&proof.ids.includes(s.id)||s.source&&record(s.source)&&s.source.sceneInventoryId===proof.parentId
  ||proof.paintSnapshots.includes(canonical({...s,id:'glyph-member'})??'')));
 if(selected.length!==proof.ids.length||page.images.some(s=>record(s)&&(s.id===`scene-icon-${proof.parentId}`
  ||record(s.source)&&s.source.sceneInventoryId===proof.parentId)))return null;
 const ordered=proof.ids.map((id,i)=>{const parts=selected.filter(s=>record(s)&&s.id===id);return parts.length===1&&canonical(parts[0])===proof.snapshots[i]?parts[0]:null;});
 return ordered.every(Boolean)?ordered:null;
}
module.exports={captureNativeGlyphIcon,finalNativeGlyphIcon};

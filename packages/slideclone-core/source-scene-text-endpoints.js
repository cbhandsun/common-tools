// @ts-check
'use strict';
const {record,list,box:validBox}=require('./source-scene-group-containment');
const {sourceLabelIdentity}=require('./source-label-identity');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
const crypto=require('node:crypto');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id:string,regionId:string,labelRef:string,box:Box,members?:{labelRef:string,box:Box}[],reviewed?:true}} TextEndpoint */
/** Source OCR references nominate logical text endpoints only. They are not
 * objects in the physical census and never grant opaque paint or glyph erase.
 * @param {unknown} value
 * @param {{widthPx:number,heightPx:number,labelRefs?:readonly string[],labelBoxes?:readonly Box[]}} source
 * @param {import('./source-scene-plan').Region[]} regions
 * @returns {TextEndpoint|null} */
function parseSceneTextEndpoint(value,source,regions){
 if(!Array.isArray(value))return null;
 if(list(value)&&value.length===2&&value[0]==='labels'){
  const indices=value[1];
  if(!list(indices)||indices.length<2||indices.length>8||new Set(indices).size!==indices.length)
   throw new TypeError('Scene text endpoint members are invalid');
  const members=indices.map(index=>parseSceneTextEndpoint(['label',index],source,regions));
  if(members.some(m=>!m)||new Set(members.map(m=>m?.regionId)).size!==1)
   throw new TypeError('Scene text endpoint member scope is invalid');
  const valid=/** @type {TextEndpoint[]} */(members);
  valid.sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x||a.labelRef.localeCompare(b.labelRef));
  const x=Math.min(...valid.map(m=>m.box.x)),y=Math.min(...valid.map(m=>m.box.y));
  const box={x,y,w:Math.max(...valid.map(m=>m.box.x+m.box.w))-x,h:Math.max(...valid.map(m=>m.box.y+m.box.h))-y};
  if(source.labelBoxes?.some((b,i)=>!indices.includes(i)&&b.x<box.x+box.w&&b.x+b.w>box.x&&b.y<box.y+box.h&&b.y+b.h>box.y))
   throw new TypeError('Scene text endpoint contains an unselected label');
  const labelRef=sourceLabelIdentity(box,source),id='text-group-'+crypto.createHash('sha256').update(valid.map(m=>m.labelRef).join(':')).digest('hex').slice(0,24);
  return {id,regionId:valid[0]?.regionId??'',labelRef,box,members:valid.map(m=>({labelRef:m.labelRef,box:{...m.box}}))};
 }
 if(!list(value)||value.length!==2||value[0]!=='label'||!Number.isSafeInteger(value[1])||Number(value[1])<0||Number(value[1])>=512)
  throw new TypeError('Scene text endpoint reference is invalid');
 const index=Number(value[1]),ref=source.labelRefs?.[index],box=source.labelBoxes?.[index];
 if(typeof ref!=='string'||!/^label-[a-f0-9]{24}$/u.test(ref)||!validBox(box)
  ||source.labelRefs?.filter(r=>r===ref).length!==1||sourceLabelIdentity(box,source)!==ref)
  throw new TypeError('Scene text endpoint source is invalid');
 const owners=regions.filter(r=>contains(r.box,box)).sort((a,b)=>a.box.w*a.box.h-b.box.w*b.box.h);
 const owner=owners[0];
 if(!owner||owners[1]&&owner.box.w*owner.box.h===owners[1].box.w*owners[1].box.h)
  throw new TypeError('Scene text endpoint owner is invalid');
 return {id:'text-'+ref.slice(6),regionId:owner.id,labelRef:ref,box:{...box}};
}
/** @param {Box} a @param {Box} b */
function contains(a,b){return b.x>=a.x&&b.y>=a.y&&b.x+b.w<=a.x+a.w+1e-6&&b.y+b.h<=a.y+a.h+1e-6;}
/** Retain the trusted OCR catalog for bounded later reference review. Invalid,
 * duplicate or unowned frames cannot become candidate endpoints. This creates
 * no physical objects and never changes the observed relation census.
 * @param {Parameters<typeof parseSceneTextEndpoint>[1]} source
 * @param {import('./source-scene-plan').Region[]} regions */
function sourceSceneTextEndpointCatalog(source,regions){
 /** @type {TextEndpoint[]} */const result=[];
 if(source.labelRefs===undefined||source.labelBoxes===undefined)return result;
 if(!list(source.labelRefs)||!list(source.labelBoxes)||source.labelRefs.length>512||source.labelBoxes.length>512)
  throw new TypeError('Scene text endpoint catalog is invalid');
 for(let index=0;index<source.labelRefs.length;index++){
  try{const endpoint=parseSceneTextEndpoint(['label',index],source,regions);if(endpoint)result.push(endpoint);}
  catch(error){if(!(error instanceof TypeError&&/^Scene (?:text endpoint|source label)/u.test(error.message)))throw error;}
 }
 return result;
}
/** @typedef {import('./source-scene-region-program').NativeLabel} NativeLabel */
/** @type {WeakMap<object,{pixels:Uint8Array,width:number,height:number,box:Box,sourceBoxes:Box[],texts:NativeLabel[],snapshots:string[]}>} */
const bindings=new WeakMap();
/** Bind only ONE actual existing, unchanged native text box to its OCR frame.
 * Split/duplicate labels remain unsupported rather than acquiring a fake body.
 * @param {{width:number,height:number,rgba:Uint8Array}} image
 * @param {TextEndpoint[]} endpoints @param {NativeLabel[]} texts
 * @param {{widthPt:number,heightPt:number}} slideSize */
function bindSceneTextEndpoints(image,endpoints,texts,slideSize){
 if(!record(image)||!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<1||image.height<1
  ||image.width>16384||image.height>16384||image.width*image.height>40000000||!Buffer.isBuffer(image.rgba)||image.rgba.length!==image.width*image.height*4
  ||!record(slideSize)||![slideSize.widthPt,slideSize.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000)
  ||!list(endpoints)||endpoints.length>512||endpoints.some(e=>!record(e)||!validBox(e.box)||typeof e.id!=='string'||typeof e.labelRef!=='string')
  ||!list(texts)||texts.length>10000||texts.some(t=>!record(t)||typeof t.text!=='string'||!validBox(t.box)||t.source!==undefined&&!record(t.source)))
  throw new TypeError('Scene text endpoint binding input is invalid');
 const nodes=new Map(),rejected=[];
 for(const endpoint of endpoints){
  if(endpoint.members!==undefined){
   const members=endpoint.members;
   if(endpoint.reviewed!==true||!list(members)||members.length<2||members.length>8||members.some(m=>!record(m)||typeof m.labelRef!=='string'||!validBox(m.box))
    ||new Set(members.map(m=>m.labelRef)).size!==members.length){rejected.push({id:endpoint.id,reason:'text-endpoint-member-review'});continue;}
   const dimensions={widthPx:image.width,heightPx:image.height},x=Math.min(...members.map(m=>m.box.x)),y=Math.min(...members.map(m=>m.box.y));
   const union={x,y,w:Math.max(...members.map(m=>m.box.x+m.box.w))-x,h:Math.max(...members.map(m=>m.box.y+m.box.h))-y};
   const expected='text-group-'+crypto.createHash('sha256').update(members.map(m=>m.labelRef).join(':')).digest('hex').slice(0,24);
   if(endpoint.id!==expected||endpoint.labelRef!==sourceLabelIdentity(union,dimensions)
    ||['x','y','w','h'].some(k=>union[/** @type {keyof Box} */(k)]!==endpoint.box[/** @type {keyof Box} */(k)])){
    rejected.push({id:endpoint.id,reason:'text-endpoint-member-binding'});continue;
   }
   const foreign=texts.some(t=>{
    if(members.some(m=>m.labelRef===t.source?.ocrLabelRef))return false;
    const b=t.source?.ocrLabelBox??t.source?.evidenceBox;if(!validBox(b))return false;
    const px=b.x*image.width/slideSize.widthPt,py=b.y*image.height/slideSize.heightPt;
    return px<union.x+union.w&&px+b.w*image.width/slideSize.widthPt>union.x&&py<union.y+union.h&&py+b.h*image.height/slideSize.heightPt>union.y;
   });
   if(foreign){rejected.push({id:endpoint.id,reason:'text-endpoint-unselected-label'});continue;}
   const bound=bindSceneTextEndpoints(image,members.map((m,i)=>({id:'member-'+i,regionId:endpoint.regionId,labelRef:m.labelRef,box:m.box})),texts,slideSize);
   const actual=[...bound.nodes.values()].map(n=>bindings.get(n.portFrame)).flatMap(b=>b?.texts??[]);
   if(bound.rejected.length||actual.length!==members.length){rejected.push({id:endpoint.id,reason:'text-endpoint-native-binding'});continue;}
   // The envelope is a LOGICAL destination selected in two observations. It
   // grants no physical port, fill, erasure or ownership of the interline gap.
   const token=Object.freeze({}),first=actual[0];if(!first)continue;
   bindings.set(token,{pixels:image.rgba,width:image.width,height:image.height,box:{...union},sourceBoxes:members.map(m=>({...m.box})),texts:actual,snapshots:actual.map(t=>sceneGroupSnapshot(t)??'')});
   nodes.set(endpoint.id,{id:first.id,box:{...union},portFrame:token});continue;
  }
  const rows=texts.filter(t=>record(t.source)&&t.source.ocrLabelRef===endpoint.labelRef);
  const text=rows.length===1?rows[0]:undefined,source=text?.source;
  const actual=source?.evidenceBox;
  const evidence=source?.ocrLabelBox??source?.evidenceBox;
  const pixels=validBox(evidence)?{x:evidence.x*image.width/slideSize.widthPt,y:evidence.y*image.height/slideSize.heightPt,
   w:evidence.w*image.width/slideSize.widthPt,h:evidence.h*image.height/slideSize.heightPt}:null;
  const snapshot=text?sceneGroupSnapshot(text):null;
  if(!text||typeof text.id!=='string'||!text.id||!text.text.trim()||!validBox(text.box)||source?.segmentedOcrLineId!==undefined
   ||texts.filter(t=>t.id===text.id).length!==1
   ||!pixels||!validBox(actual)||!validBox(evidence)||['x','y','w','h'].some(k=>evidence[/** @type {keyof Box} */(k)]!==actual[/** @type {keyof Box} */(k)])
   ||sourceLabelIdentity(pixels,{widthPx:image.width,heightPx:image.height})!==endpoint.labelRef
   ||sourceLabelIdentity(endpoint.box,{widthPx:image.width,heightPx:image.height})!==endpoint.labelRef||snapshot===null){
   rejected.push({id:endpoint.id,reason:'text-endpoint-native-binding'});continue;
  }
  const token=Object.freeze({});
  bindings.set(token,{pixels:image.rgba,width:image.width,height:image.height,box:{...endpoint.box},sourceBoxes:[{...endpoint.box}],texts:[text],snapshots:[snapshot]});
  nodes.set(endpoint.id,{id:text.id,box:{...endpoint.box},portFrame:token});
 }
 return {nodes,rejected};
}
/** A logical capability is deliberately separate from physical body ports.
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {unknown} token @param {Box} box */
function hasSceneTextEndpoint(image,token,box){
 const b=token!==null&&typeof token==='object'?bindings.get(token):undefined;
 return !!b&&record(image)&&b.pixels===image.rgba&&b.width===image.width&&b.height===image.height&&validBox(box)
  &&['x','y','w','h'].every(k=>b.box[/** @type {keyof Box} */(k)]===box[/** @type {keyof Box} */(k)])
  &&b.texts.every((text,i)=>sceneGroupSnapshot(text)===b.snapshots[i]);
}
/** Observation exclusion only: the actual bound OCR rectangle, not a physical
 * perimeter or an output paint mask. No existing body-port API accepts it.
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {unknown} token @param {Box} box
 * @param {Box} window @param {{checks:number}} work */
function sceneTextEndpointObservationMask(image,token,box,window,work){
 if(!hasSceneTextEndpoint(image,token,box))return null;
 if(![window.x,window.y,window.w,window.h].every(Number.isSafeInteger)||window.w*window.h>262144||work.checks+window.w*window.h>4000000)return null;
 work.checks+=window.w*window.h;const mask=new Uint8Array(window.w*window.h);
 for(let y=0;y<window.h;y++)for(let x=0;x<window.w;x++)if(x+window.x>=box.x&&x+window.x<box.x+box.w&&y+window.y>=box.y&&y+window.y<box.y+box.h)mask[y*window.w+x]=1;
 return mask;
}
/** @param {{width:number,height:number,rgba:Uint8Array}} image @param {unknown} token @param {Box} box @param {number} axis @param {string} side */
function sceneTextEndpointProjectedPort(image,token,box,axis,side){
 if(!hasSceneTextEndpoint(image,token,box)||!Number.isFinite(axis))return null;
 const horizontal=side==='left'||side==='right';
 if(!['left','right','top','bottom'].includes(side)||axis<(horizontal?box.y:box.x)||axis>(horizontal?box.y+box.h:box.x+box.w))return null;
 return horizontal?{x:side==='right'?box.x+box.w:box.x,y:axis}:{x:axis,y:side==='bottom'?box.y+box.h:box.y};
}
/** Final grouping cannot silently replace or split a previously bound label.
 * @param {unknown} token @param {NativeLabel[]} texts */
function survivingSceneTextEndpoint(token,texts){
 const b=token!==null&&typeof token==='object'?bindings.get(token):undefined;
 return !!b&&b.texts.every((member,i)=>{const rows=texts.filter(t=>t.id===member.id);return rows.length===1&&sceneGroupSnapshot(rows[0])===b.snapshots[i];});
}
/** Actual text members, never an invisible replacement node.
 * @param {unknown} token */
function sceneTextEndpointNativeIds(token){const b=token!==null&&typeof token==='object'?bindings.get(token):undefined;
 return b&&b.texts.every((t,i)=>sceneGroupSnapshot(t)===b.snapshots[i])?b.texts.flatMap(t=>typeof t.id==='string'?[t.id]:[]):[];}
/** Only actual member OCR frames may stop being unrelated text obstacles.
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {unknown} token @param {Box} box @param {Box} candidate */
function sceneTextEndpointHasMemberBox(image,token,box,candidate){
 const b=token!==null&&typeof token==='object'?bindings.get(token):undefined;
 // The native obstacle catalog round-trips px -> pt -> px. At non-binary
 // scales this can change 610 to 610.0000000000001. Bound only floating-point
 // representation error (four ULPs); this is not a source geometry allowance.
 return validBox(candidate)&&hasSceneTextEndpoint(image,token,box)&&!!b&&b.sourceBoxes.some(frame=>['x','y','w','h'].every(k=>{
  const a=frame[/** @type {keyof Box} */(k)],c=candidate[/** @type {keyof Box} */(k)];
  return Math.abs(a-c)<=Number.EPSILON*4*Math.max(1,Math.abs(a),Math.abs(c));
 }));
}
/** Anchor offsets use the ACTUAL final native text frame, not the OCR glyph
 * rectangle used for source observation. This changes no source shaft point.
 * @param {unknown} token @param {string} id @param {{width:number,height:number,point:{x:number,y:number},side:string}} controls */
function sceneTextEndpointNativeAnchor(token,id,{width,height,point,side}){
 const b=token!==null&&typeof token==='object'?bindings.get(token):undefined;
 const text=b?.texts[0];
 if(!b||!text||b.width!==width||b.height!==height||text.id!==id||!b.texts.every((t,i)=>sceneGroupSnapshot(t)===b.snapshots[i])
  ||![point.x,point.y].every(Number.isFinite)||!['left','right','top','bottom'].includes(side))return null;
 const box=text.box,inside=point.x>=box.x&&point.x<=box.x+box.w&&point.y>=box.y&&point.y<=box.y+box.h;
 const outside=side==='left'?point.x<=box.x:side==='right'?point.x>=box.x+box.w:side==='top'?point.y<=box.y:point.y>=box.y+box.h;
 if(!inside&&!outside)side=point.x<box.x?'left':point.x>box.x+box.w?'right':point.y<box.y?'top':'bottom';
 const horizontal=side==='left'||side==='right';
 const position=Math.max(0,Math.min(1,horizontal?(point.y-box.y)/box.h:(point.x-box.x)/box.w));
 const base=horizontal?{x:side==='right'?box.x+box.w:box.x,y:box.y+position*box.h}
  :{x:box.x+position*box.w,y:side==='bottom'?box.y+box.h:box.y};
 const tangential=horizontal?point.y-base.y:point.x-base.x;
 return {elementId:id,side,position,dxPt:point.x-base.x,dyPt:point.y-base.y,...(!inside?{siteOffsetKind:tangential!==0?'source-visible-diagonal-gap':'source-visible-gap'}:{})};
}
module.exports={parseSceneTextEndpoint,sourceSceneTextEndpointCatalog,bindSceneTextEndpoints,hasSceneTextEndpoint,sceneTextEndpointObservationMask,sceneTextEndpointProjectedPort,survivingSceneTextEndpoint,sceneTextEndpointNativeAnchor,sceneTextEndpointNativeIds,sceneTextEndpointHasMemberBox};

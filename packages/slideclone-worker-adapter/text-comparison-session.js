// @ts-check
"use strict";
const {types}=require('node:util');
const {rotatedTextEnvelope}=require('../slideclone-core/ocr/ocr-text-quadrilateral');
const {readPng}=require('../slideclone-core/png');
const {isCandidateVerificationCacheEntry}=require('./candidate-verification-cache');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{widthPt:number,heightPt:number}} Size */
/** @typedef {{id:string,kind:string,role:string,box:Box,[key:string]:unknown}} Region */
/** @typedef {{id:string,pageIndex:number,kind:string,role:string,box:Box,severity:number,pixelDiffRatio:number,foregroundMissingRatio:number}} Metric */
/** @typedef {{root:string,sources:string[],regions:Region[][],slideSize:Size,sizes:{width:number,height:number}[],entry:import('./candidate-verification-cache').VerificationCacheEntry,isCurrent:()=>boolean}} State */
/** @typedef {{reference:State,before:readonly Metric[],after:readonly Metric[]}} Pair */
/** @typedef {{quality:unknown,entry:unknown,isCurrent:()=>boolean,root:string,sources:string[],deck:unknown,regions:unknown,metrics:unknown[]}} Capture */
/** @typedef {{referenceQuality:unknown,root:string,sources:string[],deck:unknown,regions:unknown,renderedImages:readonly string[],metrics:unknown[]}} Comparison */
/** @type {WeakMap<object,State>} */const origins=new WeakMap();
/** @type {WeakMap<object,Pair>} */const pairs=new WeakMap();
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value'in p);}
/** @param {unknown} quality @returns {unknown[]|null} */
function rows(quality){return record(quality)&&Array.isArray(quality.componentLocalMetrics)&&!types.isProxy(quality.componentLocalMetrics)?quality.componentLocalMetrics:null;}
/** @param {unknown} v @returns {v is unknown[]} */
function array(v){return Array.isArray(v)&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Array.prototype
 &&Reflect.ownKeys(v).length===v.length+1&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value'in p);}
/** @param {unknown} b @returns {b is Box} */
function box(b){return record(b)&&[b.x,b.y,b.w,b.h].every(Number.isFinite)&&Number(b.x)>=0&&Number(b.y)>=0&&Number(b.w)>0&&Number(b.h)>0;}
/** @param {unknown} deck @returns {Size} */
function slideSize(deck){
 if(!record(deck)||!record(deck.slideSize)||![deck.slideSize.widthPt,deck.slideSize.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0))throw new TypeError('paired text size is invalid');
 return {widthPt:Number(deck.slideSize.widthPt),heightPt:Number(deck.slideSize.heightPt)};
}
/** @param {readonly unknown[]} input @param {Size} size @returns {Box} */
function union(input,size){
 if(input.some(b=>!box(b)))throw new TypeError('paired text bounds are invalid');
 const boxes=/** @type {Box[]} */(input);
 const x=Math.max(0,Math.min(...boxes.map(b=>b.x))),y=Math.max(0,Math.min(...boxes.map(b=>b.y)));
 const right=Math.min(size.widthPt,Math.max(...boxes.map(b=>b.x+b.w))),bottom=Math.min(size.heightPt,Math.max(...boxes.map(b=>b.y+b.h)));
 if(right<=x||bottom<=y)throw new TypeError('paired text bounds are empty');
 return {x,y,w:right-x,h:bottom-y};
}
/** @param {unknown} deck @param {unknown} regions @returns {Region[][]} */
function textRegions(deck,regions){
 const size=slideSize(deck);
 if(!record(deck)||!array(deck.pages)||deck.pages.length>20||!array(regions)||regions.length!==deck.pages.length)
  throw new TypeError('paired text pages are invalid');
 const pages=deck.pages;
 return regions.map((page,index)=>{
  const sourcePage=pages[index];if(!record(sourcePage)||!array(page)||page.length>5000)throw new TypeError('paired text page is invalid');
  const texts=sourcePage.textBoxes??[];if(!array(texts)||texts.length>2000||texts.some(t=>!record(t)
   ||t.source!==undefined&&!record(t.source)||t.style!==undefined&&!record(t.style)))throw new TypeError('paired text inventory is invalid');
  const seen=new Set();return page.filter(r=>record(r)&&r.kind==='text'&&r.role==='text').map(r=>{
   if(!record(r)||typeof r.id!=='string'||!box(r.box)||seen.has(r.id))throw new TypeError('paired text identity is ambiguous');seen.add(r.id);
   const text=texts.find(t=>record(t)&&t.id===r.id);if(!record(text)||!box(text.box))throw new TypeError('paired text geometry is invalid');
   /** @type {unknown[]} */const boxes=[r.box,text.box];const rotated=rotatedTextEnvelope(text);
   if(rotated)boxes.push(rotated);
   if(record(text.source)&&text.source.evidenceBox!==undefined)boxes.push(text.source.evidenceBox);
   const bounds=union(boxes,size),outline=record(text.style)?text.style.textOutlineWidthPt??0:0;
   if(typeof outline!=='number'||!Number.isFinite(outline)||outline<0||outline>64)throw new TypeError('paired text outline is invalid');
   const x=Math.max(0,bounds.x-outline),y=Math.max(0,bounds.y-outline);
   return {...r,id:r.id,kind:'text',role:'text',box:union([{x,y,w:bounds.x+bounds.w+outline-x,h:bounds.y+bounds.h+outline-y}],size)};
  });
 });
}
/** Private comparison evidence is bound to the actual reference observation.
 * Copied or caller-provided numeric rows cannot fabricate a paired comparison.
 * @param {unknown} baselineQuality @param {unknown} candidateQuality */
function pairedTextMetrics(baselineQuality,candidateQuality){
 const before=rows(baselineQuality),after=rows(candidateQuality),pair=after&&pairs.get(after);
 if(!pair||!before||origins.get(before)!==pair.reference)return null;
 if(!pair.reference.isCurrent())throw new Error('paired text reference is stale');
 return {before:pair.before,after:pair.after};
}
/** Uses the existing bounded rendered-snapshot cache, with no extra rendering.
 * The two comparisons share the original 100M component-pixel bound, including
 * the candidate's already evaluated regions. Source and snapshot identities
 * must remain valid; stale/evicted evidence cannot authorize rollback decisions.
 */
/** @param {unknown} options */
function createTextComparisonSession(options){
 if(!record(options)||!record(options.snapshotCache)||typeof options.snapshotCache.replay!=='function'||typeof options.compareRegions!=='function'||!record(options.settings)
  ||options.settings.threshold!==24||options.settings.foregroundTolerancePx!==2||options.settings.foregroundToleranceDelta!==54)
  throw new TypeError('paired text comparison dependencies are invalid');
 const snapshotCache=/** @type {{replay:(input:unknown)=>readonly string[]|null}} */(options.snapshotCache);
 const compareRegions=/** @type {(source:ReturnType<typeof readPng>,generated:ReturnType<typeof readPng>,regions:Region[],size:Size,settings:Record<string,number>)=>unknown} */(options.compareRegions);
 const settings={threshold:24,foregroundTolerancePx:2,foregroundToleranceDelta:54};
 /** @type {WeakMap<object,State>} */const remembered=new WeakMap();
 /** @param {unknown} from @param {unknown} to @param {unknown} referenceQuality */
 function copyEvidence(from,to,referenceQuality){
  const a=rows(from),b=rows(to);if(!a||!b)return;
  const state=remembered.get(a);if(state){remembered.set(b,state);origins.set(b,state);}
  const pair=pairs.get(a),reference=rows(referenceQuality);
  if(pair&&reference&&origins.get(reference)===pair.reference)pairs.set(b,pair);
 }
 return {
  copyEvidence,
  /** @param {unknown} referenceQuality @param {string} root @param {string[]} sources @param {unknown} deck */
  validateReference(referenceQuality,root,sources,deck){
   const key=rows(referenceQuality),reference=key&&remembered.get(key);if(!reference)return;
   if(reference.root!==root||JSON.stringify(reference.sources)!==JSON.stringify(sources)
    ||JSON.stringify(reference.slideSize)!==JSON.stringify(slideSize(deck))||!reference.isCurrent())throw new Error('paired text reference is stale');
  },
  /** @param {Capture} input */
  remember({quality,entry,isCurrent,root,sources,deck,regions,metrics}){
   const key=rows(quality);if(!key||!isCandidateVerificationCacheEntry(entry)||!regions)return;
   const sizes=metrics.map(m=>record(m)?m.sourceSize:null);
   if(sizes.some(s=>!record(s)||![s.width,s.height].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=16384)))return;
   const state={root,sources:[...sources],regions:textRegions(deck,regions),slideSize:slideSize(deck),sizes:/** @type {{width:number,height:number}[]} */(sizes.map(s=>({.../** @type {Record<string,number>} */(s)}))),entry,isCurrent};
   remembered.set(key,state);origins.set(key,state);
  },
  /** @param {Comparison} input @returns {Pair|null} */
  compare({referenceQuality,root,sources,deck,regions,renderedImages,metrics}){
   const key=rows(referenceQuality),reference=key&&remembered.get(key);if(!reference||!regions)return null;
   const size=slideSize(deck);
   if(reference.root!==root||JSON.stringify(reference.sources)!==JSON.stringify(sources)
    ||JSON.stringify(reference.slideSize)!==JSON.stringify(size)||!reference.isCurrent())
    throw new Error('paired text reference is stale');
   const current=textRegions(deck,regions);
   const common=current.map((page,index)=>page.flatMap(region=>{
    const previous=reference.regions[index]?.find(r=>r.id===region.id);if(!previous)return [];
    // Both sides use the same source foreground interpretation and full union.
    return [{...previous,box:union([previous.box,region.box],size)}];
   }));
   if(!common.some(page=>page.length))return null;
   let pixels=0;
   for(const metric of metrics){const used=record(metric)&&record(metric.componentQuality)?metric.componentQuality.evaluatedPixels:null;
    if(typeof used!=='number'||!Number.isSafeInteger(used)||used<0)throw new TypeError('paired text comparison accounting is unavailable');pixels+=used;}
   for(let index=0;index<common.length;index++){
    const raster=reference.sizes[index];if(!raster)throw new TypeError('paired text raster is missing');
    for(const region of common[index]??[]){
     pixels+=2*Math.ceil(region.box.w*raster.width/size.widthPt)*Math.ceil(region.box.h*raster.height/size.heightPt);
     if(pixels>100000000)throw new RangeError('paired text comparison exceeds the pixel safety limit');
    }
   }
   const baselineImages=snapshotCache.replay({root,entry:reference.entry});
   if(!baselineImages)throw new Error('paired text snapshot is unavailable');
   /** @type {Metric[]} */const before=[];
   /** @type {Metric[]} */const after=[];
   for(let index=0;index<common.length;index++){
    const page=common[index];if(!page?.length)continue;
    const sourceFile=sources[index];if(typeof sourceFile!=='string')throw new TypeError('paired text source is missing');
    const source=readPng(sourceFile);
    for(const {images,result} of [{images:baselineImages,result:before},{images:renderedImages,result:after}]){
     const imageFile=images[index];if(typeof imageFile!=='string')throw new TypeError('paired text rendering is missing');
     const comparison=compareRegions(source,readPng(imageFile),page,size,settings);
     if(!record(comparison)||!array(comparison.local)||comparison.local.length>5000)throw new Error('paired text comparison failed');
     for(const region of page){
      const matches=comparison.local.filter(r=>record(r)&&r.id===region.id);
      if(matches.length!==1)throw new Error('paired text comparison is incomplete');
      const row=matches[0];if(!record(row))throw new Error('paired text comparison is incomplete');
      if(![row.pixelDiffRatio,row.foregroundMissingRatio].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)||typeof row.severity!=='number'||!Number.isFinite(row.severity)||row.severity<0||row.severity>10)
       throw new Error('paired text comparison metrics are invalid');
      result.push(Object.freeze({id:region.id,severity:row.severity,pixelDiffRatio:Number(row.pixelDiffRatio),foregroundMissingRatio:Number(row.foregroundMissingRatio),box:Object.freeze({...region.box}),pageIndex:index,kind:'text',role:'text'}));
     }
    }
   }
   if(!reference.isCurrent())throw new Error('paired text reference changed');
   return {reference,before:Object.freeze(before),after:Object.freeze(after)};
  },
  /** @param {unknown} quality @param {Pair|null} pair */
  bind(quality,pair){const key=rows(quality);if(key&&pair)pairs.set(key,pair);}
 };
}
module.exports={createTextComparisonSession,pairedTextMetrics};

// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
const {observeCaptionRoute}=require('../routing/source-caption-route-observation');
const {sourceSceneRouteSite}=require('./source-scene-route');
const {thinSourceRoute,sourceRouteTerminalMask,sourceRouteConnectedPairs,sourceRoutePath}=require('../routing/source-route-centerline');
const {verifyMeasuredScenePort}=require('./source-scene-port-evidence');
const {sourceCaptionRouteStroke}=require('../routing/source-caption-route-stroke');
const {stageSceneGlyphOwnership,commitSceneGlyphOwnership,sceneGlyphOcclusionMatches}=require('./source-scene-glyph-occlusion');
/** @typedef {NonNullable<ReturnType<typeof observeCaptionRoute>>} Observation */
/** @typedef {NonNullable<ReturnType<typeof measureCaptionFragments>>} Fit */
/** @type {WeakMap<object,{from:string,to:string,direction:string,width:number,height:number}>} */const proofs=new WeakMap();
/** Prove both complete physical fragments independently. The caption gap is
 * a logical association, never an observed continuous shaft or painted line.
 * @param {Observation} o */
function measureCaptionFragments(o){
 const {image,from,to,window,raster,mask,work,caption,texts,budget}=o,width=window.w,height=window.h;
 /** @param {number} i @param {typeof from} n */
 const site=(i,n)=>{
  const x=i%width+window.x,y=Math.floor(i/width)+window.y,b=n.box;
  work.checks+=4;if(work.checks>4000000||x<b.x-2||x>b.x+b.w+2||y<b.y-2||y>b.y+b.h+2)return null;
  return sourceSceneRouteSite(i,width,window,image,n,work);
 };
 const terminals=sourceRouteTerminalMask(mask,width,height,i=>site(i,from),i=>site(i,to),work);if(!terminals)return null;
 const skeleton=thinSourceRoute(mask,width,height,work,terminals);if(!skeleton)return null;
 /** @type {NonNullable<ReturnType<typeof sourceSceneRouteSite>>[][]} */const contacts=[[],[]];
 /** @type {{index:number}[]} */const free=[];
 for(let i=0;i<skeleton.length;i++)if(skeleton[i]){
  const a=site(i,from),b=site(i,to);if(a)contacts[0]?.push(a);if(b)contacts[1]?.push(b);
  const x=i%width,y=Math.floor(i/width);let neighbors=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){
   if(++work.checks>4000000)return null;
   const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<width&&yy<height&&skeleton[yy*width+xx])neighbors++;
  }
  if(neighbors===1)free.push({index:i});
 }
 const sites=contacts.flat();
 const ends=free.filter(p=>!sites.some(s=>Math.hypot(p.index%width-s.index%width,Math.floor(p.index/width)-Math.floor(s.index/width))<=12));
 if(work.checks>4000000||ends.length<2||contacts.some(c=>!c.length))return null;
 const fragments=[];
 for(const [index,n]of [from,to].entries()){
  const pairs=sourceRouteConnectedPairs(skeleton,width,height,contacts[index]??[],ends,work);if(!pairs?.length)return null;
  const arrow=index===0?['backward','both'].includes(o.direction):['forward','both'].includes(o.direction);
  const candidates=[];
  for(const [contact,end]of pairs){
   const path=sourceRoutePath(skeleton,width,height,contact.index,end.index,work);if(!path||path.length<8)continue;
   const stroke=sourceCaptionRouteStroke({path,mask,rgba:raster.rgba,width,height,arrow,work});if(!stroke)continue;
   if(!verifyMeasuredScenePort({image,token:n.portFrame,box:n.box,point:contact.point,side:contact.side,color:stroke.terminalColor,textMasks:texts,budget}))continue;
   candidates.push({contact,end,stroke,path});
  }
  const first=candidates[0];if(!first)return null;
  if(candidates.some(c=>c.contact.side!==first.contact.side||c.end.index!==first.end.index||Math.hypot(c.contact.point.x-first.contact.point.x,c.contact.point.y-first.contact.point.y)>2))return null;
  candidates.sort((a,b)=>b.path.length-a.path.length);
  const selected=candidates[0];if(!selected)return null;
  const {contact,end,stroke}=selected;
  const points=stroke.points.map(p=>({x:p.x+window.x,y:p.y+window.y}));points[0]=contact.point;
  fragments.push({...stroke,points,contact,end:end.index,arrow});
 }
 const a=fragments[0],b=fragments[1];if(!a||!b||a.end===b.end)return null;
 const p=a.points.at(-1),q=b.points.at(-1),pa=a.points.at(-2),qb=b.points.at(-2);if(!p||!q||!pa||!qb)return null;
 const horizontal=Math.abs(p.x-q.x)>Math.abs(p.y-q.y),along=(/** @type {{x:number,y:number}} */v)=>horizontal?v.x:v.y;
 const across=(/** @type {{x:number,y:number}} */v)=>horizontal?v.y:v.x,gap=Math.abs(along(p)-along(q));
 if(gap<8||gap>512||Math.abs(across(p)-across(q))>1.5
  ||Math.abs(across(p)-across(pa))>1.5||Math.abs(across(q)-across(qb))>1.5
  ||(along(p)-along(pa))*(along(q)-along(p))<=0||(along(q)-along(qb))*(along(p)-along(q))<=0)return null;
 const low=Math.min(along(p),along(q)),high=Math.max(along(p),along(q)),axis=(across(p)+across(q))/2;
 const captionLow=horizontal?caption.x:caption.y,captionHigh=captionLow+(horizontal?caption.w:caption.h);
 if(captionLow<low||captionHigh>high||axis<(horizontal?caption.y:caption.x)||axis>(horizontal?caption.y+caption.h:caption.x+caption.w))return null;
 if(o.others.some(c=>horizontal?c.x<high&&c.x+c.w>low&&c.y<axis+3&&c.y+c.h>axis-3:c.y<high&&c.y+c.h>low&&c.x<axis+3&&c.x+c.w>axis-3))return null;
 const rgb=(/** @type {string} */s)=>[1,3,5].map(i=>Number.parseInt(s.slice(i,i+2),16));
 if(rgb(a.color).some((v,i)=>Math.abs(v-(rgb(b.color)[i]??0))>18)||Math.abs(a.widthPx-b.widthPx)>1)return null;
 const parts=fragments.reduce((sum,f)=>sum+f.points.length*2-2,0);
 if(parts>32||work.checks>4000000)return null;
 return {fragments,caption:{...caption},parts};
}
/** Private source/glyph proofs survive only within this measured invocation.
 * @param {unknown} input @returns {{fit:Fit|null,reason:string}} */
function measureSourceSceneCaptionRoute(input){
 if(!record(input)||!record(input.image)||!record(input.budget))throw new TypeError('Caption route controls are invalid');
 const source=input.image,budget=input.budget;
 const matches=sceneGlyphOcclusionMatches(input.glyphOcclusion,/** @type {import('../png').PngImage} */(source),/** @type {{used:number}} */(budget));
 if(!matches){observeCaptionRoute(input);return {fit:null,reason:'caption-private-glyphs'};}
 const staged=stageSceneGlyphOwnership(input.glyphOcclusion,()=>{const observation=observeCaptionRoute(input);return observation?measureCaptionFragments(observation):null;});
 const fit=staged.value;
 if(!fit||!commitSceneGlyphOwnership(input.glyphOcclusion,staged.receipt))return {fit:null,reason:'caption-source-evidence'};
 const o=/** @type {{from:{id:string},to:{id:string},direction:string,image:{width:number,height:number}}} */(input);
 for(const fragment of fit.fragments){
  for(const point of fragment.points)Object.freeze(point);Object.freeze(fragment.points);
  Object.freeze(fragment.contact.point);Object.freeze(fragment.contact.offset);Object.freeze(fragment.contact);Object.freeze(fragment);
 }
 Object.freeze(fit.fragments);Object.freeze(fit.caption);Object.freeze(fit);
 proofs.set(fit,{from:o.from.id,to:o.to.id,direction:o.direction,width:o.image.width,height:o.image.height});
 return {fit,reason:'source-caption-route-confirmed'};
}
/** @param {unknown} fit @param {{from:string,to:string,direction:string,width:number,height:number}} binding */
function isMeasuredSceneCaptionRoute(fit,binding){const p=fit!==null&&typeof fit==='object'?proofs.get(fit):undefined;
 return !!p&&p.from===binding.from&&p.to===binding.to&&p.direction===binding.direction&&p.width===binding.width&&p.height===binding.height;}
module.exports={measureSourceSceneCaptionRoute,isMeasuredSceneCaptionRoute};

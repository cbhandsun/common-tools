// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
const {captureSceneEdgeReview,readSceneEdgeChoice}=require('./source-scene-edge-choice-review');
const {captureSceneIconSemanticReview,confirmSceneIconSemanticReview}=require('./source-scene-icon-semantic-review');
const {sourceSceneTextBoxes}=require('./source-scene-text-frame');
const {parseSourceRouteChoice,parseSourceRouteCatalog}=require('../routing/source-shared-route-choice');
const {rebindRetainedSceneRouteSteps}=require('./source-scene-retained-route-rebinding');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{collection:'objects'|'regions',kind:string,point:Point,sourceBox?:import('./source-scene-plan').Box}} Endpoint */
/** @typedef {{object:Endpoint,textStartBox:import('./source-scene-plan').Box,observationWindow:import('./source-scene-plan').Box,textStartsWith:string,expectedComponents:number}} IconSelection */
/** @typedef {{sourceHash:string,widthPx:number,heightPx:number,reviewId:string,routes:{from:Endpoint,to:Endpoint,direction:string,steps:{id:string,reversed:boolean}[],catalog?:import('../routing/source-shared-route-choice').Catalog}[],icon:IconSelection|null}} RetainedReview */
const invalid=()=>new TypeError('Retained scene review is invalid');
/** Exact data-only records. No provider accessors or proxy traps execute.
 * @param {unknown} value @param {string[]} keys @returns {Record<string,unknown>} */
function fields(value,keys){
 if(!record(value)||Reflect.ownKeys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k)))throw invalid();
 return value;
}
/** Only the trusted host's retained decision store calls this parser. A record
 * narrows semantic identity on the SAME source; it grants no source ownership,
 * erasure, geometry budget, approval or successful materialization.
 * @param {unknown} value @returns {RetainedReview} */
function parseRetainedSceneReview(value){
 const row=fields(value,['sourceHash','widthPx','heightPx','reviewId','routes','icon']);
 if(typeof row.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(row.sourceHash)
  ||typeof row.reviewId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(row.reviewId)
  ||typeof row.widthPx!=='number'||typeof row.heightPx!=='number'
  ||![row.widthPx,row.heightPx].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||row.widthPx*row.heightPx>40000000||!list(row.routes)||row.routes.length>48)throw invalid();
 const width=row.widthPx,height=row.heightPx;
 /** @param {unknown} value @returns {Endpoint} */
 const endpoint=value=>{
  const e=fields(value,['collection','kind','point',...(record(value)&&Object.hasOwn(value,'sourceBox')?['sourceBox']:[])]),p=fields(e.point,['x','y']);
  if(e.collection!=='objects'&&e.collection!=='regions'||typeof e.kind!=='string'
   ||!['container','card','icon','group','diagram','section'].includes(e.kind)
   ||typeof p.x!=='number'||typeof p.y!=='number'||![p.x,p.y].every(Number.isFinite)
   ||p.x<0||p.y<0||p.x>=width||p.y>=height)throw invalid();
  let sourceBox;
  if(Object.hasOwn(e,'sourceBox')){
   const b=fields(e.sourceBox,['x','y','w','h']);
   if(!box(b)||b.x+b.w>width||b.y+b.h>height||p.x<=b.x||p.y<=b.y||p.x>=b.x+b.w||p.y>=b.y+b.h)throw invalid();
   sourceBox={x:b.x,y:b.y,w:b.w,h:b.h};
  }
  return {collection:e.collection,kind:e.kind,point:{x:p.x,y:p.y},...(sourceBox?{sourceBox}:{})};
 };
 /** @param {unknown} value */
 const sourceBox=value=>{
  const b=fields(value,['x','y','w','h']);
  if(!box(b)||!Object.values(b).every(Number.isSafeInteger)||b.x+b.w>width||b.y+b.h>height)throw invalid();
  return {x:b.x,y:b.y,w:b.w,h:b.h};
 };
 const routes=row.routes.map(value=>{
  const r=fields(value,['from','to','direction','steps',...(record(value)&&Object.hasOwn(value,'catalog')?['catalog']:[])]);
  if(typeof r.direction!=='string'||!['forward','backward','both','undirected'].includes(r.direction)
   ||!list(r.steps)||r.steps.length<1||r.steps.length>15)throw invalid();
  const steps=r.steps.map(value=>{const s=fields(value,['id','reversed']);
   if(typeof s.id!=='string'||!/^ink-[a-f0-9]{24}$/u.test(s.id)||typeof s.reversed!=='boolean')throw invalid();
   return {id:s.id,reversed:s.reversed};});
  if(new Set(steps.map(s=>s.id)).size!==steps.length)throw invalid();
  const catalog=Object.hasOwn(r,'catalog')?parseSourceRouteCatalog(r.catalog):undefined;
  if(catalog&&(catalog.sourceHash!==row.sourceHash||catalog.widthPx!==width||catalog.heightPx!==height
   ||steps.some(s=>!catalog.edges.some(e=>e.id===s.id))))throw invalid();
  return {from:endpoint(r.from),to:endpoint(r.to),direction:r.direction,steps,...(catalog?{catalog}:{})};
 });
 if(new Set(routes.map(r=>JSON.stringify([r.from,r.to,r.direction]))).size!==routes.length)throw invalid();
 let icon=null;
 if(row.icon!==null){
  const i=fields(row.icon,['object','textStartBox','observationWindow','textStartsWith','expectedComponents']);
  if(typeof i.textStartsWith!=='string'||!i.textStartsWith.trim()||i.textStartsWith.length>32
   ||[...i.textStartsWith].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)
   ||typeof i.expectedComponents!=='number'||!Number.isSafeInteger(i.expectedComponents)||i.expectedComponents<1||i.expectedComponents>32)throw invalid();
  const object=endpoint(i.object);if(object.collection!=='objects'||object.kind!=='icon')throw invalid();
  icon={object,textStartBox:sourceBox(i.textStartBox),observationWindow:sourceBox(i.observationWindow),textStartsWith:i.textStartsWith,expectedComponents:i.expectedComponents};
 }
 return {sourceHash:row.sourceHash,widthPx:width,heightPx:height,reviewId:row.reviewId,routes,icon};
}
/** Resolve by the host's retained SOURCE point, never a previous model ID or
 * nearest-box guess. A retained physical envelope also permits a card/container
 * representation change, within two source pixels on EVERY edge. All eligible
 * collections are checked together; duplicates reject, with no nearest winner.
 * @param {import('./source-scene-plan').ScenePlan} plan @param {Endpoint} endpoint */
function resolveEndpoint(plan,endpoint){
 const envelope=endpoint.sourceBox,physical=envelope&&['container','card'].includes(endpoint.kind);
 const rows=physical?[...plan.objects,...plan.regions]:plan[endpoint.collection];
 const candidates=rows.filter(row=>(physical?['container','card'].includes(row.kind):row.kind===endpoint.kind)
  &&endpoint.point.x>row.box.x&&endpoint.point.y>row.box.y
  &&endpoint.point.x<row.box.x+row.box.w&&endpoint.point.y<row.box.y+row.box.h
  &&(!envelope||[row.box.x-envelope.x,row.box.y-envelope.y,
   row.box.x+row.box.w-envelope.x-envelope.w,row.box.y+row.box.h-envelope.y-envelope.h].every(delta=>Math.abs(delta)<=2)));
 if(candidates.length!==1)throw new TypeError('Retained scene review identity is unavailable');
 const candidate=candidates[0];if(!candidate)throw invalid();return candidate.id;
}
/** Atomic semantic restoration at the existing final compiler boundary. Every
 * current catalog, path, source pixel and private icon receipt is revalidated.
 * Neither the caller's plan nor its text is mutated on success or failure.
 * @param {import('./source-scene-compiler').CompileInput} input @param {unknown} value */
function applyRetainedSceneReview(input,value){
 if(!record(input)||!record(input.plan)||!record(input.page)||!record(input.slideSize))throw invalid();
 const review=parseRetainedSceneReview(value),original=input.plan;
 if(!list(original.objects)||original.objects.length>176||!list(original.regions)||original.regions.length>48
  ||!list(original.relations)||original.relations.length>48
  ||[...original.objects,...original.regions].some(row=>!record(row)||!box(row.box))
  ||original.relations.some(row=>!record(row)))throw invalid();
 if(review.sourceHash!==original.sourceHash||review.widthPx!==original.widthPx||review.heightPx!==original.heightPx)
  throw new TypeError('Retained scene review source is unavailable');
 const choices=new Map(),work={checks:0};
 for(const route of review.routes){
  const from=resolveEndpoint(original,route.from),to=resolveEndpoint(original,route.to);
  const relations=original.relations.filter(r=>r.fromId===from&&r.toId===to&&r.direction===route.direction);
  if(relations.length!==1)throw new TypeError('Retained scene review relation is unavailable');
  const relation=relations[0];if(!relation||choices.has(relation.id))throw invalid();
  const control=captureSceneEdgeReview(original,relation,{sharedRoutes:{pathChoices:input.sourceRouteCatalogs??[]}});
  if(!control)throw new TypeError('Retained scene review source network is unavailable');
  const steps=route.catalog?rebindRetainedSceneRouteSteps(route.steps,route.catalog,control.catalog,work):route.steps;
  const choice=readSceneEdgeChoice(steps,control);if(!choice)throw invalid();
  if(relation.sourcePathChoice!==undefined&&JSON.stringify(parseSourceRouteChoice(relation.sourcePathChoice))!==JSON.stringify(choice))
   throw new TypeError('Retained scene review conflicts with the current path');
  choices.set(relation.id,choice);
 }
 const plan={...original,relations:original.relations.map(r=>choices.has(r.id)?{...r,sourcePathChoice:choices.get(r.id)}:r)};
 let sourceIconReview=input.sourceIconReview;
 if(review.icon){
  if(sourceIconReview!==undefined)throw new TypeError('Retained scene icon review is already present');
  const i=review.icon,objectId=resolveEndpoint(plan,i.object);
  const sx=plan.widthPx/input.slideSize.widthPt,sy=plan.heightPx/input.slideSize.heightPt;
  const texts=sourceSceneTextBoxes(input.page.textBoxes,{width:plan.widthPx,height:plan.heightPx},input.slideSize)
   .filter(t=>t.text.startsWith(i.textStartsWith)&&i.textStartBox.x>=t.box.x*sx&&i.textStartBox.y>=t.box.y*sy
    &&i.textStartBox.x+i.textStartBox.w<=(t.box.x+t.box.w)*sx&&i.textStartBox.y+i.textStartBox.h<=(t.box.y+t.box.h)*sy);
  if(texts.length!==1||!texts[0]?.id)throw new TypeError('Retained scene icon text is unavailable');
  const control=captureSceneIconSemanticReview({sourceFile:input.sourceFile,plan,objectId,textId:texts[0].id,textBoxes:input.page.textBoxes,
   slideSize:input.slideSize,textStartBox:i.textStartBox,observationWindow:i.observationWindow});
  sourceIconReview=confirmSceneIconSemanticReview(control,{choice:'independent-leading-icon',textStartsWith:i.textStartsWith,expectedComponents:i.expectedComponents});
 }
 return {...input,plan,...(sourceIconReview!==undefined?{sourceIconReview}:{})};
}
module.exports={parseRetainedSceneReview,applyRetainedSceneReview,resolveRetainedSceneEndpoint:resolveEndpoint};

// @ts-check
'use strict';
const {detectSceneVisualCandidates}=require('./source-scene-visual-candidates');
const {selectSceneCandidates}=require('./source-scene-candidate-selection');
const {extractSceneStrokeGraph}=require('./source-scene-stroke-graph');
const {bindSceneStrokeRelations}=require('./source-scene-stroke-binding');
const {extractSceneResidualCandidates}=require('./source-scene-residual-candidates');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {[number,[number,number,number,number]]} GraphicLocator */
/** Fixed budget: two classification batches worth of locations (pre-registered). */
const GRAPHIC_LOCATION_BUDGET=64;
/** Source-measured ink envelopes offered to the global planner as optional
 * location aids, replacing free estimation of pictorial boxes. A locator is
 * NOT an object, class, owner, relation or permission: it may be fragmented,
 * merged or text. Plan admission, reviews and the compiler stay authoritative.
 * Detector capacity overflow omits the aid (recorded) instead of truncating.
 * @param {{image:{width:number,height:number,rgba:Uint8Array},sourceHash:string,textBoxes:Box[]}} input */
function sourceSceneGraphicLocations({image,sourceHash,textBoxes}){
 const {width,height}=image;
 // OCR boxes may be fractional; round OUTWARD and clip so deferral never shrinks.
 const integerText=textBoxes.map(b=>{
  const x=Math.max(0,Math.floor(b.x)),y=Math.max(0,Math.floor(b.y)),r=Math.min(width,Math.ceil(b.x+b.w)),bottom=Math.min(height,Math.ceil(b.y+b.h));
  return {x,y,w:r-x,h:bottom-y};
 }).filter(b=>b.w>0&&b.h>0);
 let catalog;
 // The detector scans at most 4M pixels; larger pages run without the aid.
 if(width*height>4000000)return {locations:/** @type {GraphicLocator[]} */([]),candidateIds:/** @type {string[]} */([]),
  evidence:{method:'graphic-locations-v1',omitted:'raster-capacity',budget:GRAPHIC_LOCATION_BUDGET,sourceAuthorized:false}};
 try{catalog=detectSceneVisualCandidates({image,sourceHash});}
 catch(error){
  if(error instanceof RangeError)return {locations:/** @type {GraphicLocator[]} */([]),candidateIds:/** @type {string[]} */([]),
   evidence:{method:'graphic-locations-v1',omitted:'detector-capacity',budget:GRAPHIC_LOCATION_BUDGET,sourceAuthorized:false}};
  throw error;
 }
 const selected=selectSceneCandidates(catalog,{budget:Math.min(GRAPHIC_LOCATION_BUDGET,Math.max(1,catalog.candidates.length)),textBoxes:integerText});
 const candidates=catalog.candidates.length?selected.catalog.candidates:[];
 /** @type {GraphicLocator[]} */
 const locations=candidates.map((c,index)=>[index,[Math.floor(c.box.y*1000/height),Math.floor(c.box.x*1000/width),
  Math.min(1000,Math.ceil((c.box.y+c.box.h)*1000/height)),Math.min(1000,Math.ceil((c.box.x+c.box.w)*1000/width))]]);
 return {locations,candidateIds:candidates.map(c=>c.id),
  evidence:{method:'graphic-locations-v1',budget:GRAPHIC_LOCATION_BUDGET,detector:catalog.evidence,selection:selected.evidence,offered:locations.length,sourceAuthorized:false}};
}
const GRAPHIC_LOCATION_PROMPT=' GRAPHIC CANDIDATE LOCATIONS are untrusted source-measured ink envelopes [candidateIndex,box_2d] in the same normalized frame. They may be fragments, merged neighbours, connectors or text, and they are NOT objects, classes, owners, relations or permissions. Never add, keep or classify an object merely because a candidate exists. When an independently visible icon, node, badge or container closely matches ONE candidate, copy that candidate box_2d [ymin,xmin,ymax,xmax] in exact order (0<=ymin<ymax<=1000, 0<=xmin<xmax<=1000, never transpose ymin/xmin) and verify it lies inside its declared ownerId/regionId box; otherwise estimate from the image. Small hollow circular bullets inside list cards are icons (unitCode 5), not containers. Only emit a relation or count it in visibleRelations when BOTH endpoints exist as two distinct object/region IDs or two distinct ["label",originalIndex] OCR boxes (fromId!==toId); an inline arrow inside a single merged OCR line or an open decorative stroke without two distinct endpoints is NOT a relation (keep visibleRelations=0 for that card and emit no relation tuple for it). Never repeat any text already covered by OCR candidate locations in missingText (return [] when all visible text is already covered by OCR). Graphic candidate locations: ';
/** Bind admitted plan relations to physical stroke skeleton edges as review
 * evidence. Never grants source ownership or overrides compiler validation.
 * @param {{image:{width:number,height:number,rgba:Uint8Array},sourceHash:string,textBoxes:Box[],plan:import('./source-scene-plan').ScenePlan}} input */
function sourceSceneStrokeBindings({image,sourceHash,textBoxes,plan}){
 const {width,height}=image;
 if(width*height>4000000)return {bindings:/** @type {ReturnType<typeof bindSceneStrokeRelations>} */([]),
  evidence:{method:'stroke-binding-v1',omitted:'raster-capacity',sourceAuthorized:false}};
 const integerText=textBoxes.map(b=>{
  const x=Math.max(0,Math.floor(b.x)),y=Math.max(0,Math.floor(b.y)),r=Math.min(width,Math.ceil(b.x+b.w)),bottom=Math.min(height,Math.ceil(b.y+b.h));
  return {x,y,w:r-x,h:bottom-y};
 }).filter(b=>b.w>0&&b.h>0);
 let graph;
 try{graph=extractSceneStrokeGraph({image,sourceHash,textBoxes:integerText});}
 catch(error){
  if(error instanceof RangeError)return {bindings:/** @type {ReturnType<typeof bindSceneStrokeRelations>} */([]),
   evidence:{method:'stroke-binding-v1',omitted:'graph-capacity',sourceAuthorized:false}};
  throw error;
 }
 const objects=[...(plan.regions??[]).filter(r=>['card','container'].includes(r.kind)),...plan.objects,...(plan.textEndpoints??[])].map(o=>({id:o.id,box:o.box}));
 const relations=plan.relations.map(r=>({id:r.id,fromId:r.fromId,toId:r.toId,direction:r.direction}));
 const bindings=bindSceneStrokeRelations({graph,objects,relations});
 return {bindings,evidence:{method:'stroke-binding-v1',graph:graph.evidence,bound:bindings.filter(b=>b.status==='bound').length,
  ambiguous:bindings.filter(b=>b.status==='ambiguous'||b.direction==='contradicts'||b.direction==='unknown-proposal').length,sourceAuthorized:false}};
}
/** Extract bounded 1-round residual candidates not covered by admitted objects or OCR boxes.
 * @param {{image:{width:number,height:number,rgba:Uint8Array},sourceHash:string,textBoxes:Box[],plan:import('./source-scene-plan').ScenePlan,round?:number}} input */
function sourceSceneResidualCandidates({image,sourceHash,textBoxes,plan,round=0}){
 const ownedBoxes=[...plan.objects.map(o=>o.box),...(plan.textEndpoints??[]).map(t=>t.box)];
 return extractSceneResidualCandidates({image,sourceHash,ownedBoxes,textBoxes,round});
}
module.exports={sourceSceneGraphicLocations,sourceSceneStrokeBindings,sourceSceneResidualCandidates,GRAPHIC_LOCATION_PROMPT,GRAPHIC_LOCATION_BUDGET};

// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {parseBandBackground}=require('./source-scene-band-geometry');
const {retainedOpenScenePaint}=require('./source-scene-open-paint');
const {retainedSceneLiteralPaint}=require('./source-scene-literal-paint');
const {retainedOpenSceneOwnerMembers}=require('./source-scene-open-owner-members');
const {primitiveSourceRaster}=require('./source-scene-primitive-raster');
const {hasMeasuredScenePortFrame,measuredScenePortPerimeterCells,measuredScenePortBodyMask,measuredSceneOpaqueSurface}=require('./source-scene-port-evidence');
const {patternedSceneFrameGeometry}=require('./source-scene-patterned-frame');
const {measuredGroupVertices}=require('./source-scene-group-containment');
const {sourcePolygonRowMask}=require('./source-polygon-row-mask');
const {measuredSceneVisibleGapPaint}=require('./source-scene-visible-gap-compiler');
const {sourceSceneTextBoxes}=require('./source-scene-text-frame');
const {sourceTextEraseMask,residualSourceTextEvidence}=require('./residual-source-text-evidence');
const {sceneSourceTextPointsOwned,sceneGlyphOcclusionMatches}=require('./source-scene-glyph-occlusion');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-open-owner-members').Page} Page */
/** @type {WeakMap<object,{image:import('./png').PngImage,plan:Plan,page:Page,memberReceipt:unknown,
 * paintReceipt:unknown,paintParts:unknown[],literalReceipt:unknown,literalParts:unknown[],ownerId:string}>} */
const inventories=new WeakMap();
/** Account the FULL source window against independently measured units and
 * the exact final native member tree. Child enclosures and OCR frames delegate
 * analysis to those complete members, never opacity or glyph erasure. Any
 * residual must be preserved literally; color/proximity NEVER infer its owner.
 * This does not approve the rendered quality or grant a physical owner body.
 * @param {unknown} request */
function observeOpenSceneOwnerInventory(request){
 if(!record(request)||Reflect.ownKeys(request).some(k=>typeof k!=='string'||!['image','plan','page','membersReceipt','paintReceipt','paintParts','literalPaint','foreignFrames','relationParts','slideSize','budget','glyph'].includes(k))
  ||!record(request.slideSize)||!list(request.paintParts)||!list(request.foreignFrames)||request.foreignFrames.length>88
  ||!list(request.relationParts)||request.relationParts.length>48)throw new TypeError('Open owner inventory controls are invalid');
 const member=retainedOpenSceneOwnerMembers(request.image,request.membersReceipt,request.plan,request.page);
 if(!member)return {failure:'open-owner-inventory-members'};
 const plan=/** @type {Plan} */(request.plan),page=/** @type {Page} */(request.page);
 const owner=plan.regions.find(r=>r.id===member.ownerId);if(!owner)throw new TypeError('Open owner inventory owner is invalid');
 const paint=retainedOpenScenePaint(/** @type {import('./png').PngImage} */(request.image),request.paintReceipt,request.paintParts);
 if(!paint||paint.ownerId!==owner.id||!paint.box||paint.box.x>owner.box.x||paint.box.y>owner.box.y
  ||paint.box.x+paint.box.w<owner.box.x+owner.box.w||paint.box.y+paint.box.h<owner.box.y+owner.box.h)return {failure:'open-owner-inventory-paint'};
 const parsed=parseBandBackground({image:request.image,hint:paint.box,budget:request.budget,textMasks:[],owners:[]});
 if(!Buffer.isBuffer(parsed.image.rgba))throw new TypeError('Open owner inventory pixels are invalid');
 const image={...parsed.image,rgba:parsed.image.rgba},budget=parsed.budget;
 if(!sceneGlyphOcclusionMatches(request.glyph,image,budget))return {failure:'open-owner-inventory-glyph-context'};
 const size=/** @type {{widthPt:number,heightPt:number}} */(request.slideSize);
 if(![size.widthPt,size.heightPt].every(n=>Number.isFinite(n)&&n>0&&n<=20000))throw new TypeError('Open owner inventory frame is invalid');
 let literalReceipt;let literalParts=/** @type {unknown[]} */([]),literalCells=new Set();
 if(request.literalPaint!==undefined){
  const value=request.literalPaint;
  if(!record(value)||Reflect.ownKeys(value).some(k=>k!=='receipt'&&k!=='parts')||!list(value.parts))throw new TypeError('Open owner inventory literal controls are invalid');
  const literal=retainedSceneLiteralPaint(image,value.receipt,value.parts);if(!literal)return {failure:'open-owner-inventory-literal'};
  literalReceipt=value.receipt;literalParts=value.parts;literalCells=literal.cells;
 }
 for(const part of [...request.paintParts,...literalParts])if(!record(part)||typeof part.id!=='string'||!member.members.includes(part.id)
  ||!page.shapes.some(p=>p===part))return {failure:'open-owner-inventory-paint-members'};
 const {window,box}=paint,area=window.w*window.h;
 const work={checks:0};const scope=new Uint8Array(area),label=new Uint8Array(area),perimeter=new Set();
 const frameIds=new Set(),children=plan.regions.filter(r=>r.parentId===owner.id);
 for(const value of request.foreignFrames){
  if(!record(value)||Reflect.ownKeys(value).some(k=>k!=='id'&&k!=='token'&&k!=='box'&&k!=='pattern')||typeof value.id!=='string'
   ||frameIds.has(value.id)||!paint.foreignFrameIds.includes(value.id)||!record(value.box))throw new TypeError('Open owner inventory dependency is invalid');
  const bounds=/** @type {Box} */(value.box);frameIds.add(value.id);
  if(!hasMeasuredScenePortFrame(image,value.token,bounds))return {failure:'open-owner-inventory-dependency'};
  for(const relative of measuredScenePortPerimeterCells(image,value.token,bounds,window)){
   const x=relative%window.w+window.x,y=Math.floor(relative/window.w)+window.y;perimeter.add(y*image.width+x);
  }
  const child=children.find(r=>r.id===value.id),opaque=measuredSceneOpaqueSurface(image,value.token);
  if(!child&&!opaque)continue;
  const pattern=child&&!opaque?patternedSceneFrameGeometry(value.pattern,image):null;
  if(child&&!opaque&&!pattern)return {failure:'open-owner-inventory-child-source'};
  if(pattern&&['x','y','w','h'].some(k=>pattern.box[/** @type {keyof Box} */(k)]!==bounds[/** @type {keyof Box} */(k)]))return {failure:'open-owner-inventory-child-frame'};
  const vertices=pattern?measuredGroupVertices(pattern):null;if(pattern&&!vertices)return {failure:'open-owner-inventory-child-source'};
  const x=Math.max(window.x,Math.floor(bounds.x-1)),y=Math.max(window.y,Math.floor(bounds.y-1));
  const w=Math.min(window.x+window.w,Math.ceil(bounds.x+bounds.w+1))-x,h=Math.min(window.y+window.h,Math.ceil(bounds.y+bounds.h+1))-y;
  if(w<=0||h<=0)continue;
  const stripHeight=Math.max(1,Math.floor(262144/w));
  for(let yy=y;yy<y+h;yy+=stripHeight){
   const strip={x,y:yy,w,h:Math.min(stripHeight,y+h-yy)};
   const mask=vertices?sourcePolygonRowMask(vertices,strip,bounds,work):measuredScenePortBodyMask(image,value.token,bounds,strip,work);
   if(!mask)return {failure:'open-owner-inventory-geometry-budget'};
   for(let i=0;i<mask.length;i++){
    if(++work.checks>4000000)return {failure:'open-owner-inventory-geometry-budget'};
    if(mask[i])scope[(yy+Math.floor(i/w)-window.y)*window.w+x+i%w-window.x]=1;
   }
  }
 }
 if(paint.foreignFrameIds.some(id=>!frameIds.has(id))||children.some(child=>!frameIds.has(child.id)))return {failure:'open-owner-inventory-child-source'};
 const sourceTexts=sourceSceneTextBoxes(page.textBoxes,image,size);
 for(const text of sourceTexts){
  const b=record(text.source?.ocrLabelBox)?/** @type {Box} */(text.source.ocrLabelBox):text.box;
  const x=Math.max(window.x,Math.ceil(b.x*image.width/size.widthPt-.5)),y=Math.max(window.y,Math.ceil(b.y*image.height/size.heightPt-.5));
  const right=Math.min(window.x+window.w,Math.ceil((b.x+b.w)*image.width/size.widthPt-.5)),bottom=Math.min(window.y+window.h,Math.ceil((b.y+b.h)*image.height/size.heightPt-.5));
  for(let yy=y;yy<bottom;yy++)for(let xx=x;xx<right;xx++){
   if(++work.checks>4000000)return {failure:'open-owner-inventory-geometry-budget'};label[(yy-window.y)*window.w+xx-window.x]=1;
  }
 }
 const glyphContexts=page.textBoxes.filter(t=>record(t.font)&&t.text.trim()).map(text=>{
  const mask=sourceTextEraseMask(text,image,size),ink=residualSourceTextEvidence(text,image,size).ink;
  const xs=ink.polygon.map(p=>p[0]),ys=ink.polygon.map(p=>p[1]);
  return {mask,box:{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}};
 });
 const relations=new Set(),relationIds=new Set();
 for(const part of request.relationParts){
  if(!record(part)||!record(part.source)||typeof part.id!=='string'||typeof part.source.sceneRelationId!=='string')return {failure:'open-owner-inventory-relation-members'};
  const relationId=part.source.sceneRelationId;
  if(relationIds.has(relationId)||!plan.relations.some(r=>r.regionId===owner.id&&r.id===relationId)
   ||!member.members.includes(part.id)||!page.shapes.some(p=>p===part))return {failure:'open-owner-inventory-relation-members'};
  const cells=measuredSceneVisibleGapPaint(image,part);if(!cells)return {failure:'open-owner-inventory-relation-source'};
  relationIds.add(relationId);for(const cell of cells)relations.add(cell);
 }
 if(plan.relations.some(r=>r.regionId===owner.id&&!relationIds.has(r.id)))return {failure:'open-owner-inventory-relation-source'};
 const raster=primitiveSourceRaster(image,window,budget);if(!raster)return {failure:'open-owner-inventory-source-budget'};
 const histogram=Array.from({length:3},()=>new Uint32Array(256));let samples=0;
 const inside=(/** @type {number} */x,/** @type {number} */y)=>x+.5>=box.x&&x+.5<box.x+box.w&&y+.5>=box.y&&y+.5<box.y+box.h;
 for(let y=window.y;y<window.y+window.h;y++)for(let x=window.x;x<window.x+window.w;x++){
  if(++work.checks>4000000)return {failure:'open-owner-inventory-geometry-budget'};
  const color=raster.pixel(x,y);if(!color)return {failure:'open-owner-inventory-source-alpha'};
  const at=(y-window.y)*window.w+x-window.x,cell=y*image.width+x;
  // Background comes ONLY from the actually observed exterior context; a
  // large unknown interior object cannot nominate itself as the backdrop.
  if(inside(x,y)||scope[at]||label[at]||perimeter.has(cell)||paint.cells.has(cell)||relations.has(cell))continue;
  samples++;for(let c=0;c<3;c++){
   const channel=color[c],bin=histogram[c];if(channel===undefined||!bin)throw new TypeError('Open owner inventory color is invalid');
   bin[channel]=(bin[channel]??0)+1;
  }
 }
 if(!samples)return {failure:'open-owner-inventory-background'};
 const background=histogram.map(h=>{let sum=0;return h.findIndex(n=>(sum+=n)>Math.floor(samples/2));});
 const counts={context:0,units:0,perimeter:0,paint:0,relations:0,labels:0,glyphs:0,background:0,literal:0,unaccounted:0};
 const unresolved=new Set();let stable=0;
 for(let y=window.y;y<window.y+window.h;y++)for(let x=window.x;x<window.x+window.w;x++){
  if(++work.checks>4000000)return {failure:'open-owner-inventory-geometry-budget'};
  const at=(y-window.y)*window.w+x-window.x,cell=y*image.width+x,color=raster.pixel(x,y);if(!color)return {failure:'open-owner-inventory-source-alpha'};
  if(!inside(x,y)){
   counts.context++;
   if(!scope[at]&&!label[at]&&!perimeter.has(cell)&&!paint.cells.has(cell)&&!relations.has(cell)
    &&color.every((v,c)=>Math.abs(v-(background[c]??0))<=18))stable++;
   continue;
  }
  if(scope[at]){counts.units++;continue;}if(perimeter.has(cell)){counts.perimeter++;continue;}
  if(paint.cells.has(cell)){counts.paint++;continue;}if(relations.has(cell)){counts.relations++;continue;}
  if(label[at]){counts.labels++;continue;}
  if(color.every((v,c)=>Math.abs(v-(background[c]??0))<18)){counts.background++;continue;}
  let glyph=false;
  for(const value of glyphContexts){
   if(++work.checks>4000000)return {failure:'open-owner-inventory-geometry-budget'};
   if(x>=value.mask.x&&x<value.mask.x+value.mask.w&&y>=value.mask.y&&y<value.mask.y+value.mask.h
    &&sceneSourceTextPointsOwned(request.glyph,image,budget,value.box,[{x,y}])===true){glyph=true;break;}
  }
  if(glyph){counts.glyphs++;continue;}
  unresolved.add(cell);
 }
 if(stable/samples<.82)return {failure:'open-owner-inventory-background'};
 for(const cell of literalCells)if(!unresolved.has(cell))return {failure:'open-owner-inventory-extra-literal',counts};
 for(const cell of unresolved)if(literalCells.has(cell))counts.literal++;else counts.unaccounted++;
 if(counts.unaccounted)return {failure:'open-owner-inventory-unaccounted',counts,sourcePixels:budget.used,
  // Coordinates are observation output, not source or paint authority. A
  // bounded second phase may preserve them literally and repeat the complete
  // check; callers cannot patch a receipt or skip already-declared members.
  unaccountedCells:new Set([...unresolved].filter(cell=>!literalCells.has(cell)))};
 const receipt=Object.freeze({});inventories.set(receipt,{image,plan,page,memberReceipt:request.membersReceipt,
  paintReceipt:request.paintReceipt,paintParts:request.paintParts,literalReceipt,literalParts,ownerId:owner.id});
 return {failure:/** @type {null} */(null),receipt,sourceComplete:true,counts,sourcePixels:budget.used,geometryChecks:work.checks,
  ownerCompleted:false,opaqueBodyAuthorized:false,portsAuthorized:false,erasureAuthorized:false};
}
/** @param {unknown} image @param {unknown} receipt @param {unknown} plan @param {unknown} page */
function retainedOpenSceneOwnerInventory(image,receipt,plan,page){
 const proof=receipt!==null&&typeof receipt==='object'?inventories.get(receipt):undefined;
 if(!proof||!record(image)||image.rgba!==proof.image.rgba||image.width!==proof.image.width||image.height!==proof.image.height
  ||!retainedOpenSceneOwnerMembers(image,proof.memberReceipt,plan,page)
  ||!retainedOpenScenePaint(proof.image,proof.paintReceipt,proof.paintParts)
  ||proof.literalParts.length&&!retainedSceneLiteralPaint(image,proof.literalReceipt,proof.literalParts))return null;
 return {ownerId:proof.ownerId,sourceComplete:true,ownerCompleted:false,opaqueBodyAuthorized:false,portsAuthorized:false,erasureAuthorized:false};
}
module.exports={observeOpenSceneOwnerInventory,retainedOpenSceneOwnerInventory};

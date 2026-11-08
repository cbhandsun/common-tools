'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {sourceLabelIdentity}=require('../packages/slideclone-core/scene-plan/source-label-identity');
const {parseSourceScenePlan,admitSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {parseSceneTextEndpoint,bindSceneTextEndpoints,hasSceneTextEndpoint,sceneTextEndpointObservationMask,survivingSceneTextEndpoint}=require('../packages/slideclone-core/scene-plan/source-scene-text-endpoints');
const {sceneEndpointWithinScope}=require('../packages/slideclone-core/scene-plan/source-scene-topology-review');
const {hasMeasuredScenePortFrame,measuredScenePortFill,measuredScenePortOwnsCell,measuredScenePortBodyMask}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
const {measureSourceSceneVisibleGap,measuredSceneVisibleGapCells}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {writePng}=require('../packages/slideclone-core/png');
const {diagonalGapFixture}=require('./helpers/scene-diagonal-gap.cjs');
const {sceneTextEndpointHasMemberBox}=require('../packages/slideclone-core/scene-plan/source-scene-text-endpoints');
function fixture(){
 const f=diagonalGapFixture(),dimensions={widthPx:220,heightPx:220},slideSize={widthPt:220,heightPt:220};
 const boxes=[f.from.box,f.to.box],refs=boxes.map(b=>sourceLabelIdentity(b,dimensions));
 for(const box of boxes)for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)
  f.put(x,y,x===box.x+10&&y>=box.y+6&&y<box.y+24?[20,20,20]:[255,255,255]);
 const source={sourceHash:'a'.repeat(64),...dimensions,labelRefs:refs,labelBoxes:boxes};
 const raw={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:220,h:220}}],objects:[],
  relations:[{id:'link',regionId:'root',fromId:['label',0],toId:['label',1],direction:'forward',shaftBox:f.shaftBox}]};
 const texts=boxes.map((box,i)=>({id:'native-text-'+i,text:'label '+i,box:{...box},font:{family:'Arial',sizePt:12},
  source:{editable:true,ocrLabelBox:{...box},evidenceBox:{...box},ocrLabelRef:refs[i]}}));
 const plan=parseSourceScenePlan(raw,source),bound=bindSceneTextEndpoints(f.image,plan.textEndpoints,texts,slideSize);
 return {...f,source,raw,texts,plan,bound,slideSize};
}

test('clamped text ports explicitly distinguish diagonal displacement and preserve the terminal',()=>{
 const f=fixture(),node=f.bound.nodes.get(f.plan.textEndpoints[0].id),text=f.texts[0],b=text.box;
 const {sceneTextEndpointNativeAnchor:anchor}=require('../packages/slideclone-core/scene-plan/source-scene-text-endpoints');
 for(const [side,point,kind] of [['right',{x:b.x+b.w+10,y:b.y+b.h+3},'source-visible-diagonal-gap'],
  ['left',{x:b.x-10,y:b.y-3},'source-visible-diagonal-gap'],['bottom',{x:b.x+b.w/2,y:b.y+b.h+3},'source-visible-gap']]){
  const a=anchor(node.portFrame,text.id,{width:220,height:220,point,side});assert.ok(a);assert.equal(a.siteOffsetKind,kind);
  const horizontal=['left','right'].includes(side);
  const x=horizontal?(side==='right'?b.x+b.w:b.x):b.x+a.position*b.w;
  const y=horizontal?b.y+a.position*b.h:(side==='bottom'?b.y+b.h:b.y);
  assert.equal(x+a.dxPt,point.x);assert.equal(y+a.dyPt,point.y);
 }
});

test('a bound OCR obstacle survives coordinate round-trip rounding without admitting displaced or foreign boxes',()=>{
 const f=fixture(),node=f.bound.nodes.get(f.plan.textEndpoints[0].id);assert.ok(node);
 const candidate=Object.fromEntries(Object.entries(node.box).map(([k,v])=>[k,v+Number.EPSILON*2*Math.max(1,Math.abs(v))]));
 assert.equal(sceneTextEndpointHasMemberBox(f.image,node.portFrame,node.box,candidate),true);
 for(const bad of [{...node.box,x:node.box.x+.000001},f.plan.textEndpoints[1].box,{...node.box,w:NaN},null])
  assert.equal(sceneTextEndpointHasMemberBox(f.image,node.portFrame,node.box,bad),false);
 assert.equal(sceneTextEndpointHasMemberBox(f.image,{},node.box,node.box),false);
 let reads=0;const hostile={...node.box};Object.defineProperty(hostile,'x',{get(){reads++;return node.box.x;}});
 assert.equal(sceneTextEndpointHasMemberBox(f.image,node.portFrame,node.box,hostile),false);assert.equal(reads,0);
});
test('source OCR label endpoints retain identity, legal ancestry and zero physical census slots',()=>{
 const f=fixture();assert.equal(f.plan.objects.length,0);assert.equal(f.plan.textEndpoints.length,2);
 for(const endpoint of f.plan.textEndpoints)assert.equal(sceneEndpointWithinScope(f.plan,'region-root',endpoint.id),true);
 assert.equal(f.bound.nodes.size,2);assert.deepEqual(f.bound.rejected,[]);
 const raw=structuredClone(f.raw);raw.regions.push({id:'small',parentId:'root',kind:'section',box:{x:0,y:0,w:80,h:80}});
 const plan=parseSourceScenePlan(raw,f.source);
 assert.equal(sceneEndpointWithinScope(plan,'region-small',plan.relations[0].fromId),true);
 assert.equal(sceneEndpointWithinScope(plan,'region-small',plan.relations[0].toId),false);
});
test('label transport rejects unsafe, missing, ambiguous, invalid and out-of-range references',()=>{
 const f=fixture();
 for(const ref of [['label',-1],['label',512],['label',.5],['label','0'],['label',0,1],['other',0],[],['label',NaN]]){
  const raw=structuredClone(f.raw);raw.relations[0].fromId=ref;
  assert.throws(()=>parseSourceScenePlan(raw,f.source),TypeError);
  const partial=admitSourceScenePlan(raw,f.source);assert.equal(partial.relations.length,0);assert.equal(partial.admission.complete,false);
 }
 for(const source of [{...f.source,labelRefs:[]},{...f.source,labelRefs:[f.source.labelRefs[0],f.source.labelRefs[0]]},
  {...f.source,labelBoxes:[{...f.source.labelBoxes[0],x:21},f.source.labelBoxes[1]]}])assert.throws(()=>parseSourceScenePlan(f.raw,source),TypeError);
 let reads=0;const unsafe=['label',0];Object.defineProperty(unsafe,1,{get(){reads++;return 0;}});
 assert.throws(()=>parseSceneTextEndpoint(unsafe,f.source,f.plan.regions),TypeError);assert.equal(reads,0);
 assert.equal(parseSceneTextEndpoint('regular-object',f.source,f.plan.regions),null);
});
test('native text binding rejects missing, split, duplicate, altered and empty labels',()=>{
 for(const mode of ['missing','split','duplicate','duplicate-id','frame','ref','empty']){
  const f=fixture(),texts=structuredClone(f.texts);
  if(mode==='missing')texts.shift();if(mode==='split')texts[0].source.segmentedOcrLineId='segment';
  if(mode==='duplicate')texts.push(structuredClone(texts[0]));if(mode==='duplicate-id')texts[1].id=texts[0].id;
  if(mode==='frame')texts[0].source.evidenceBox.x++;
  if(mode==='ref')texts[0].source.ocrLabelRef='label-'+'0'.repeat(24);if(mode==='empty')texts[0].text='  ';
  const bound=bindSceneTextEndpoints(f.image,f.plan.textEndpoints,texts,f.slideSize);
  assert.ok(!bound.nodes.has(f.plan.textEndpoints[0].id),mode);assert.ok(bound.rejected.length,mode);
 }
});
test('logical text capability never grants physical paint, perimeter or erasure rights',()=>{
 const f=fixture(),node=f.bound.nodes.get(f.plan.relations[0].fromId),token=node.portFrame;
 assert.equal(hasSceneTextEndpoint(f.image,token,node.box),true);
 for(const foreign of [{},structuredClone(token),null])assert.equal(hasSceneTextEndpoint(f.image,foreign,node.box),false);
 assert.equal(hasSceneTextEndpoint({...f.image,rgba:Buffer.from(f.image.rgba)},token,node.box),false);
 assert.equal(hasSceneTextEndpoint(f.image,token,{...node.box,x:21}),false);
 assert.equal(hasMeasuredScenePortFrame(f.image,token,node.box),false);assert.equal(measuredScenePortFill(f.image,token,node.box),null);
 assert.equal(measuredScenePortOwnsCell(f.image,token,node.box,20*220+20),false);
 assert.equal(measuredScenePortBodyMask(f.image,token,node.box,{x:0,y:0,w:80,h:80},{checks:0}),null);
 assert.equal(sceneTextEndpointObservationMask(f.image,token,node.box,{x:0,y:0,w:80,h:80},{checks:4000000}),null);
 assert.equal(survivingSceneTextEndpoint(token,structuredClone(f.texts)),true);
 const altered=structuredClone(f.texts);altered[0].box.x++;assert.equal(survivingSceneTextEndpoint(token,altered),false);
 f.texts[0].text='changed';assert.equal(hasSceneTextEndpoint(f.image,token,node.box),false);
});
test('whole original source arrows bind real native text while retaining exact source ink and logical attachment',()=>{
 const f=fixture(),relation=f.plan.relations[0],from=f.bound.nodes.get(relation.fromId),to=f.bound.nodes.get(relation.toId);
 const before=Buffer.from(f.image.rgba),result=measureSourceSceneVisibleGap({...f,from,to,textMasks:f.source.labelBoxes,sourceInk:true});
 assert.ok(result.fit,result.reason);assert.equal(result.fit.physical===true,false);
 assert.deepEqual(measuredSceneVisibleGapCells(f.image,result.fit),f.oracle);assert.deepEqual(f.image.rgba,before);
 const broken=fixture();for(let y=90;y<=110;y++)broken.put(100,y,[255,255,255]);
 const wrong=measureSourceSceneVisibleGap({...broken,from:broken.bound.nodes.get(broken.plan.relations[0].fromId),to:broken.bound.nodes.get(broken.plan.relations[0].toId),sourceInk:true});
 assert.equal(wrong.fit,null);
});
test('real compiler emits editable text anchors with no invented node body or raster',t=>{
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-text-endpoint-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const plan={...f.plan,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex')};
 const result=compileSourceScene({sourceFile,root,plan,slideSize:f.slideSize,page:{shapes:[],images:[],textBoxes:f.texts},preflight:true});
 assert.equal(result.evidence.resolvedRelations,1);assert.equal(result.evidence.containers,0);assert.equal(result.evidence.icons,0);
 assert.deepEqual(result.page.images,[]);assert.equal(result.page.textBoxes.length,2);
 const relation=result.page.shapes.find(s=>s.source?.sceneRelationId==='relation-link');assert.ok(relation);
 assert.equal(relation.style.startAnchor.elementId,'native-text-0');assert.equal(relation.style.endAnchor.elementId,'native-text-1');
 assert.equal(relation.source.sourcePhysicalAttachment,false);
});

test('text anchors preserve source-visible shaft coordinates when native layout has a different frame',t=>{
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-text-layout-anchor-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const text of f.texts)text.box={x:text.box.x-4,y:text.box.y-8,w:text.box.w+8,h:text.box.h+16};
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const plan={...f.plan,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex')};
 const result=compileSourceScene({sourceFile,root,plan,slideSize:f.slideSize,page:{shapes:[],images:[],textBoxes:f.texts},preflight:true});
 assert.equal(result.evidence.resolvedRelations,1);
 const line=result.page.shapes.find(s=>s.source?.sceneRelationId==='relation-link');assert.ok(line);
 for(const [end,name] of [[false,'startAnchor'],[true,'endAnchor']]){
  const anchor=line.style[name],text=result.page.textBoxes.find(t=>t.id===anchor.elementId),b=text.box,p=anchor.position;
  const point=anchor.side==='left'||anchor.side==='right'?{x:anchor.side==='right'?b.x+b.w:b.x,y:b.y+b.h*p}
   :{x:b.x+b.w*p,y:anchor.side==='bottom'?b.y+b.h:b.y};
  point.x+=anchor.dxPt??0;point.y+=anchor.dyPt??0;
  assert.ok(Math.abs(point.x-(line.box.x+(end?line.box.w:0)))<1e-6);
  assert.ok(Math.abs(point.y-(line.box.y+(end?line.box.h:0)))<1e-6);
 }
});
test('new endpoint regression is included in unified CI',()=>{
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-scene-text-endpoints.test.js'));
});

test('packed transport preserves explicit OCR endpoint indices without object or relation budget changes',()=>{
 const f=fixture(),raw={format:'packed-v1',regions:[[null,0,[0,0,1000,1000],[0,0,1]]],objects:[],
  relations:[[0,['label',0],['label',1],[250,250,650,650]]],programs:[[]]};
 const plan=admitSourceScenePlan(raw,f.source);
 assert.equal(plan.relations.length,1);assert.equal(plan.objects.length,0);assert.equal(plan.textEndpoints.length,2);
 assert.equal(plan.admission.complete,true);assert.equal(plan.observedInventory[0].containers,0);
 assert.equal(plan.observedInventory[0].relations,1);
});
test('bounded regional consensus can add missing text-node relations and rejects stale endpoint geometry',()=>{
 const f=fixture(),plan={...f.plan,relations:[],observedInventory:[{regionId:'region-root',containers:0,icons:0,relations:1}]};
 const {selectRegionalInventoryTargets:select,applyRegionalInventoryReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');
 const selected=select(plan,1,0);assert.equal(selected.length,1);
 const target={...selected[0],index:7};assert.equal(target.endpoints.length,2);assert.ok(target.endpoints.every(e=>e.entityKind==='text'));
 const rows=[{index:7,units:[],relations:[{from:plan.textEndpoints[0].id,to:plan.textEndpoints[1].id,direction:'forward'}]}];
 const out=apply(plan,[target],[rows,structuredClone(rows)]);assert.equal(out.plan.relations.length,1);
 assert.equal(out.plan.objects.length,0);assert.deepEqual(out.plan.textEndpoints,plan.textEndpoints);
 const stale=structuredClone(plan);stale.textEndpoints[0].box.x++;
 assert.equal(apply(stale,[target],[rows,structuredClone(rows)]).plan.relations.length,0);
});
test('complete-region receipts require actual unique native text endpoints to survive',()=>{
 const f=fixture(),relation=f.plan.relations[0],ids=f.plan.textEndpoints.map(t=>t.id);
 const plan={...f.plan,observedInventory:[{regionId:'region-root',containers:0,icons:0,relations:1}],
  regionPrograms:[{regionId:'region-root',objects:[],relations:[relation.id],labels:[]}]};
 const {completeRegionPrograms:complete}=require('../packages/slideclone-core/scene-plan/source-scene-region-completion');
 const base={page:{shapes:[{id:'native-line'}],images:[],textBoxes:f.texts},plan,slideSize:f.slideSize,preflight:true,
  objects:new Map(ids.map((id,i)=>[id,['native-text-'+i]])),relations:new Map([[relation.id,['native-line']]]),interiorParents:new Set(),recoveries:[],unresolved:[],labelEvidence:{prepared:0,rejected:[]}};
 assert.equal(complete(base).evidence.staged,1);
 for(const textBoxes of [f.texts.slice(1),[...f.texts,structuredClone(f.texts[0])]]){
  const failed=complete({...base,page:{...base.page,textBoxes}});assert.equal(failed.evidence.staged,0);
  assert.ok(failed.evidence.rejected[0].missing.includes(relation.id));
 }
});
test('text binding validates hostile and extreme input before accessing user fields',()=>{
 const f=fixture();let reads=0;const hostile={get text(){reads++;return 'x';}};
 assert.throws(()=>bindSceneTextEndpoints(f.image,f.plan.textEndpoints,[hostile],f.slideSize),TypeError);assert.equal(reads,0);
 for(const texts of [null,[],Array(10001).fill(f.texts[0])]){
  if(Array.isArray(texts)&&!texts.length)assert.equal(bindSceneTextEndpoints(f.image,f.plan.textEndpoints,texts,f.slideSize).nodes.size,0);
  else assert.throws(()=>bindSceneTextEndpoints(f.image,f.plan.textEndpoints,texts,f.slideSize),TypeError);
 }
 assert.throws(()=>bindSceneTextEndpoints(f.image,f.plan.textEndpoints,f.texts,{widthPt:0,heightPt:220}),TypeError);
});

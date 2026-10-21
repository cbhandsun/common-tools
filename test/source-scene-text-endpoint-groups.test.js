'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {sourceLabelIdentity}=require('../packages/slideclone-core/source-label-identity');
const {parseSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {parseSceneTextEndpoint,bindSceneTextEndpoints,hasSceneTextEndpoint,survivingSceneTextEndpoint,sceneTextEndpointNativeIds,sceneTextEndpointHasMemberBox}=require('../packages/slideclone-core/source-scene-text-endpoints');
const {selectTopologyReviewTargets,applyTopologyReview}=require('../packages/slideclone-core/source-scene-topology-review');
const {hasMeasuredScenePortFrame}=require('../packages/slideclone-core/source-scene-port-evidence');
const {compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
const {writePng}=require('../packages/slideclone-core/png');
const {diagonalGapFixture}=require('./helpers/scene-diagonal-gap.cjs');
function fixture(){
 const f=diagonalGapFixture(),dimensions={widthPx:220,heightPx:220},slideSize={widthPt:220,heightPt:220};
 for(let y=20;y<50;y++)for(let x=20;x<50;x++)f.put(x,y,[255,255,255]);
 const boxes=[{x:20,y:20,w:30,h:10},{x:20,y:40,w:30,h:10},{...f.to.box}];
 for(const b of boxes)for(let y=b.y+2;y<b.y+b.h-2;y++)f.put(b.x+8,y,[20,20,20]);
 const refs=boxes.map(b=>sourceLabelIdentity(b,dimensions));
 const source={sourceHash:'a'.repeat(64),...dimensions,labelRefs:refs,labelBoxes:boxes};
 const raw={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:220,h:220}}],objects:[],
  relations:[{id:'link',regionId:'root',fromId:['labels',[0,1]],toId:['label',2],direction:'forward',shaftBox:f.shaftBox}]};
 const plan=parseSourceScenePlan(raw,source),group=plan.textEndpoints.find(e=>e.members),relation=plan.relations[0];
 const texts=boxes.map((box,i)=>({id:'native-text-'+i,text:'line '+i,box:{...box},font:{family:'Arial',sizePt:12},
  source:{editable:true,ocrLabelBox:{...box},evidenceBox:{...box},ocrLabelRef:refs[i]}}));
 const target={...selectTopologyReviewTargets(plan,32)[0],index:5};
 const observation=[{index:5,fromId:relation.fromId,toId:relation.toId,direction:'forward',confidence:.99}];
 return {...f,source,raw,plan,group,texts,slideSize,target,observation};
}
function confirm(f){return applyTopologyReview(f.plan,[f.target],[f.observation,structuredClone(f.observation)]).plan;}

test('physical compiler failure reopens legal icon references for paired OCR endpoint review through the production planner',async t=>{
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-physical-endpoint-review-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const raw={...f.raw,objects:[{id:'a',regionId:'root',kind:'icon',box:{...f.group.box}},
  {id:'b',regionId:'root',kind:'icon',box:{...f.to.box}}],relations:[{...f.raw.relations[0],fromId:'a',toId:'b'}]};
 const parsed=parseSourceScenePlan(raw,f.source);
 assert.equal(selectTopologyReviewTargets(parsed,32).length,0);
 const from=parsed.textEndpoints.find(e=>e.labelRef===f.source.labelRefs[1]),to=parsed.textEndpoints.find(e=>e.labelRef===f.source.labelRefs[2]);
 assert.ok(selectTopologyReviewTargets(parsed,32,{unresolved:[{id:parsed.relations[0].id,reason:'relation-source-evidence',detailCode:'missing-native-node'}]})[0].endpoints.some(e=>e.id===from.id));
 assert.ok(from&&to);let calls=0;
 const {createSourceScenePlanner}=require('../packages/slideclone-core/source-scene-planner');
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene:raw,reviews:[],missingText:[]};
  assert.equal(request.localTargets.relations.length,1);
  assert.ok(request.prompt.includes(from.id),'source text candidate must be visible to the paired reviewer');
  const targets=request.localTargets;
  return {reviews:[],recoveredText:[],relations:targets.relations.map(index=>({index,fromId:from.id,toId:to.id,direction:'forward',confidence:.99})),
   structures:(targets.structures??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   inventories:(targets.inventories??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))};
 }})({root,sourceFile,dimensions:{widthPx:220,heightPx:220},ocr:{lines:f.texts.map((row,i)=>({text:row.text,confidence:.99,box:f.source.labelBoxes[i]}))},
  preflightSourceScene:plan=>({evidence:{unresolved:[{id:plan.relations[0].id,reason:'relation-source-evidence',detailCode:'missing-native-node'}]}}),
  isCancellationRequested:async()=>false});
 assert.equal(calls,3);assert.equal(result.plan.relations[0].fromId,from.id,JSON.stringify(result.evidence.topologyReview));assert.equal(result.plan.relations[0].toId,to.id);
 assert.equal(result.plan.objects.length,2);assert.equal(result.plan.relations.length,1);
});

test('packed production recognition carries a multiline nomination through both independent local observations',async t=>{
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-packed-text-members-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const coords=b=>[Math.floor(b.y/220*1000),Math.floor(b.x/220*1000),Math.ceil((b.y+b.h)/220*1000),Math.ceil((b.x+b.w)/220*1000)];
 const scene={format:'packed-v1',regions:[[null,0,[0,0,1000,1000],[0,0,1]]],objects:[],
  relations:[[0,['labels',[0,1]],['label',2],coords(f.shaftBox),0]],programs:[[[[0,1,2]]]]};
 const ocr={lines:f.texts.map((row,i)=>({text:row.text,confidence:.99,box:f.source.labelBoxes[i]}))};
 const expected=parseSourceScenePlan(scene,f.source),edge=expected.relations[0];let calls=0;
 const {createSourceScenePlanner}=require('../packages/slideclone-core/source-scene-planner');
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1){assert.match(request.prompt,/\["labels",\[originalOcrIndex/);return {scene,reviews:[],missingText:[]};}
  assert.equal(request.localTargets.relations.length,1);assert.match(request.prompt,/textMemberBoxes/);
  return {reviews:[],recoveredText:[],relations:request.localTargets.relations.map(index=>({index,fromId:edge.fromId,toId:edge.toId,direction:'forward',confidence:.99}))};
 }})({root,sourceFile,dimensions:{widthPx:220,heightPx:220},ocr,isCancellationRequested:async()=>false});
 assert.equal(calls,3);assert.equal(result.plan.textEndpoints.find(e=>e.members).reviewed,true);
 assert.equal(result.plan.objects.length,0);assert.equal(result.plan.relations.length,1);
 assert.deepEqual(result.plan.relationBatches[1].reviewed,[edge.id]);
});
test('a multiline endpoint requires two independent membership/reference confirmations in the original relation budget',()=>{
 const f=fixture();assert.ok(f.group);assert.equal(f.group.reviewed,undefined);assert.equal(f.plan.objects.length,0);
 const bound=bindSceneTextEndpoints(f.image,f.plan.textEndpoints,f.texts,f.slideSize);
 assert.ok(!bound.nodes.has(f.group.id));assert.ok(bound.rejected.some(r=>r.reason==='text-endpoint-member-review'));
 const accepted=confirm(f);assert.equal(accepted.textEndpoints.find(e=>e.members).reviewed,true);
 assert.deepEqual(accepted.relationBatches[1].reviewed,['relation-link']);assert.equal(accepted.relations.length,1);
 assert.equal(selectTopologyReviewTargets(accepted,32).length,0);assert.equal(f.group.reviewed,undefined);
 for(const mode of ['disagree','confidence','unknown']){
  const other=structuredClone(f.observation);if(mode==='disagree')other[0].fromId=f.plan.textEndpoints[0].id;
  if(mode==='confidence')other[0].confidence=.89;if(mode==='unknown')other[0].direction='unknown';
  const rejected=applyTopologyReview(f.plan,[f.target],[f.observation,other]);assert.equal(rejected.plan.textEndpoints.find(e=>e.members).reviewed,undefined,mode);
 }
});
test('group transport rejects empty, duplicate, hostile, oversized and foreign member references',()=>{
 const f=fixture();
 for(const indices of [[],[0],[0,0],[0,2,1,0],[0,512],['0',1],Array.from({length:9},(_,i)=>i)])
  assert.throws(()=>parseSceneTextEndpoint(['labels',indices],f.source,f.plan.regions),TypeError);
 let reads=0;const hostile=[0,1];Object.defineProperty(hostile,0,{get(){reads++;return 0;}});
 assert.throws(()=>parseSceneTextEndpoint(['labels',hostile],f.source,f.plan.regions),TypeError);assert.equal(reads,0);
 const source={...f.source,labelBoxes:[...f.source.labelBoxes,{x:24,y:31,w:10,h:5}]};
 assert.throws(()=>parseSceneTextEndpoint(['labels',[0,1]],source,f.plan.regions),/unselected/);
 const regions=[...f.plan.regions,{id:'region-child',parentId:'region-root',kind:'section',box:{x:19,y:19,w:32,h:12}}];
 assert.throws(()=>parseSceneTextEndpoint(['labels',[0,1]],f.source,regions),/scope/);
 const reversed=parseSceneTextEndpoint(['labels',[1,0]],f.source,f.plan.regions);assert.deepEqual(reversed,f.group);
});
test('all native members must survive and a logical union grants no physical paint or foreign text exclusion',()=>{
 const f=fixture(),plan=confirm(f),bound=bindSceneTextEndpoints(f.image,plan.textEndpoints,f.texts,f.slideSize),node=bound.nodes.get(f.group.id);
 assert.ok(node);assert.equal(hasSceneTextEndpoint(f.image,node.portFrame,node.box),true);
 assert.equal(hasMeasuredScenePortFrame(f.image,node.portFrame,node.box),false);
 assert.deepEqual(sceneTextEndpointNativeIds(node.portFrame),['native-text-0','native-text-1']);
 assert.equal(sceneTextEndpointHasMemberBox(f.image,node.portFrame,node.box,f.source.labelBoxes[0]),true);
 assert.equal(sceneTextEndpointHasMemberBox(f.image,node.portFrame,node.box,{x:21,y:31,w:10,h:4}),false);
 assert.equal(survivingSceneTextEndpoint(node.portFrame,f.texts.slice(1)),false);
 assert.equal(hasSceneTextEndpoint({...f.image,rgba:Buffer.from(f.image.rgba)},node.portFrame,node.box),false);
 f.texts[1].box.x++;assert.equal(hasSceneTextEndpoint(f.image,node.portFrame,node.box),false);
 assert.deepEqual(sceneTextEndpointNativeIds(node.portFrame),[]);
});
test('native compiler emits the original arrow, actual text anchors and zero invented shapes for a reviewed multiline node',t=>{
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-text-members-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const plan={...confirm(f),sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex')};
 const result=compileSourceScene({sourceFile,root,plan,slideSize:f.slideSize,page:{shapes:[],images:[],textBoxes:f.texts},preflight:true});
 assert.equal(result.evidence.resolvedRelations,1);assert.equal(result.evidence.containers,0);assert.equal(result.evidence.icons,0);
 assert.deepEqual(result.page.images,[]);assert.equal(result.page.textBoxes.length,3);assert.equal(result.page.shapes.length,1);
 const link=result.page.shapes[0];assert.equal(link.style.startAnchor.elementId,'native-text-0');assert.equal(link.style.endAnchor.elementId,'native-text-2');
 assert.equal(link.source.sourcePhysicalAttachment,false);
});

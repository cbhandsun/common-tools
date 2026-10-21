"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceLabelIdentity}=require('../packages/slideclone-core/source-label-identity');
const {reconcileSceneLabelLayout}=require('../packages/slideclone-core/source-scene-label-layout');
const {prepareRegionProgramLabels}=require('../packages/slideclone-core/source-scene-region-program');
const {admitSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
function fixture(){
 const boxes=[{x:10,y:10,w:10,h:10},{x:70,y:10,w:10,h:10}],dimensions={widthPx:100,heightPx:100};
 const refs=boxes.map(box=>sourceLabelIdentity(box,dimensions));
 const plan={version:1,sourceHash:'a'.repeat(64),...dimensions,regions:[
  {id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}},
  {id:'region-left',parentId:'region-root',kind:'section',box:{x:0,y:0,w:50,h:100}},
  {id:'region-right',parentId:'region-root',kind:'section',box:{x:50,y:0,w:50,h:100}}],objects:[],relations:[],
  regionPrograms:[{regionId:'region-root',objects:[],relations:[],labels:[]},
   {regionId:'region-left',objects:[],relations:[],labels:[{refs:[...refs],family:'Arial',weight:'bold',sizePt:30}]},
   {regionId:'region-right',objects:[],relations:[],labels:[]}]};
 return {plan,refs,boxes,dimensions};
}
test('source layout corrects a misplaced label while preserving every reference and native font',()=>{
 const f=fixture(),before=structuredClone(f.plan),resolved=reconcileSceneLabelLayout(f.plan,f.refs,f.boxes);
 assert.deepEqual(f.plan,before);assert.equal(resolved.regionLabelLayout.reassigned,1);
 assert.deepEqual(resolved.regionPrograms[1].labels[0].refs,[f.refs[0]]);
 assert.deepEqual(resolved.regionPrograms[2].labels,[{refs:[f.refs[1]]}]);
 const page={textBoxes:f.boxes.map((box,i)=>({id:'t'+i,text:'sample',box,font:{family:'Calibri',weight:'regular',sizePt:12},
  source:{evidenceBox:box,ocrLabelBox:box,ocrLabelRef:f.refs[i]}}))};
 const beforeResult=prepareRegionProgramLabels(page,f.plan,{widthPt:100,heightPt:100});
 assert.equal(beforeResult.evidence.rejected.length,1);
 const result=prepareRegionProgramLabels(page,resolved,{widthPt:100,heightPt:100});
 assert.deepEqual(result.evidence.rejected,[]);assert.deepEqual(result.page.textBoxes[1].font,page.textBoxes[1].font);
 assert.equal(result.page.textBoxes[1].source.sceneRegionProgramId,'region-right');
 assert.equal(result.page.textBoxes[0].font.family,'Arial');
});
test('nested labels follow the unique innermost declared region independent of ordering',()=>{
 const f=fixture();f.plan.regionPrograms[1].labels=[];f.plan.regionPrograms[0].labels=[{refs:f.refs}];
 const a=reconcileSceneLabelLayout(f.plan,f.refs,f.boxes),b=reconcileSceneLabelLayout({...f.plan,regions:[...f.plan.regions].reverse()},f.refs,f.boxes);
 assert.deepEqual(a.regionPrograms,b.regionPrograms);assert.equal(a.regionLabelLayout.reassigned,2);
 assert.deepEqual(a.regionPrograms[0].labels,[]);
});
test('a later admitted layout correction recomputes membership from the same source references',()=>{
 const f=fixture(),first=reconcileSceneLabelLayout(f.plan,f.refs,f.boxes);
 const next={...first,regions:first.regions.map(region=>({...region,box:region.id==='region-left'?{x:0,y:0,w:85,h:100}
  :region.id==='region-right'?{x:85,y:0,w:15,h:100}:{...region.box}}))};
 const second=reconcileSceneLabelLayout(next,f.refs,f.boxes);
 assert.equal(second.regionLabelLayout.reassigned,1);assert.deepEqual(second.regionPrograms[2].labels,[]);
 assert.deepEqual(second.regionPrograms[1].labels.at(-1),{refs:[f.refs[1]]});
 assert.deepEqual(second.objects,first.objects);assert.deepEqual(second.relations,first.relations);
});
test('overlapping sibling regions and straddling source labels remain explicit binding failures',()=>{
 const f=fixture();f.plan.regions[2].box={x:0,y:0,w:100,h:100};
 const overlap=reconcileSceneLabelLayout(f.plan,f.refs,f.boxes);
 assert.equal(overlap.regionLabelLayout.ambiguous,1);assert.ok(overlap.regionPrograms[1].labels[0].refs.includes(f.refs[0]));
 const span={x:45,y:10,w:10,h:10},ref=sourceLabelIdentity(span,f.dimensions);
 f.plan.regionPrograms[1].labels=[{refs:[ref]}];f.plan.regionPrograms=f.plan.regionPrograms.slice(1);f.plan.regions[2].box={x:50,y:0,w:50,h:100};
 const unresolved=reconcileSceneLabelLayout(f.plan,[ref],[span]);
 assert.equal(unresolved.regionLabelLayout.uncontained,1);assert.deepEqual(unresolved.regionPrograms[0].labels,[{refs:[ref]}]);
 const rooted=fixture();rooted.plan.regionPrograms[1].labels=[{refs:[ref]}];
 const noRootFallback=reconcileSceneLabelLayout(rooted.plan,[ref],[span]);
 assert.equal(noRootFallback.regionLabelLayout.ambiguous,1);
 assert.deepEqual(noRootFallback.regionPrograms[1].labels,[{refs:[ref]}]);assert.deepEqual(noRootFallback.regionPrograms[0].labels,[]);
});
test('the admitted production plan receives source layout without changing object or relation ledgers',()=>{
 const f=fixture(),wire={version:1,coordinateSpace:'source-pixels',regions:f.plan.regions,objects:[],relations:[],
  programs:f.plan.regionPrograms.map(p=>({...p,labels:p.labels.map(style=>({...style,refs:style.refs.map(ref=>f.refs.indexOf(ref))}))}))};
 const base=admitSourceScenePlan(wire,{sourceHash:f.plan.sourceHash,...f.dimensions,labelRefs:f.refs});
 const corrected=admitSourceScenePlan(wire,{sourceHash:f.plan.sourceHash,...f.dimensions,labelRefs:f.refs,labelBoxes:f.boxes});
 assert.equal(corrected.regionLabelLayout.reassigned,1);assert.deepEqual(corrected.objectBatches,base.objectBatches);
 assert.deepEqual(corrected.relationBatches,base.relationBatches);assert.deepEqual(corrected.admission,base.admission);
 assert.equal(corrected.regionPrograms.flatMap(p=>p.labels.flatMap(s=>s.refs)).length,2);
});
test('empty and maximum source inventories keep fixed limits; unsafe and cross-frame input fails closed',()=>{
 const f=fixture(),empty={...f.plan,regionPrograms:[]};
 assert.deepEqual(reconcileSceneLabelLayout(empty,[],[]).regionLabelLayout,{reassigned:0,ambiguous:0,uncontained:0});
 const boxes=Array.from({length:512},(_,i)=>({x:i%32*3,y:Math.floor(i/32)*3,w:1,h:1}));
 const refs=boxes.map(box=>sourceLabelIdentity(box,f.dimensions));
 assert.equal(reconcileSceneLabelLayout(empty,refs,boxes).regionPrograms.length,0);
 for(const [plan,r,b] of [[f.plan,f.refs,[]],[f.plan,[...f.refs,f.refs[0]],[...f.boxes,f.boxes[0]]],
  [f.plan,f.refs,[{...f.boxes[0],x:11},f.boxes[1]]],[{...f.plan,widthPx:101},f.refs,f.boxes],
  [empty,Array(513).fill(refs[0]),Array(513).fill(boxes[0])],[{...empty,widthPx:0},[],[]]])
  assert.throws(()=>reconcileSceneLabelLayout(plan,r,b),/Scene label layout/);
 let reads=0;const hostile=Object.defineProperty({},'x',{get(){reads++;throw Error('PRIVATE');},enumerable:true});
 assert.throws(()=>reconcileSceneLabelLayout(f.plan,f.refs,[hostile,f.boxes[1]]),/Scene label layout/);assert.equal(reads,0);
 assert.throws(()=>reconcileSceneLabelLayout(new Proxy(f.plan,{}),f.refs,f.boxes),/Scene label layout/);
 const duplicate=structuredClone(f.plan);duplicate.regionPrograms[2].labels=[{refs:[f.refs[0]]}];
 assert.throws(()=>reconcileSceneLabelLayout(duplicate,f.refs,f.boxes),/reference/);
 const cycle=structuredClone(empty);cycle.regions[1].parentId=cycle.regions[2].id;cycle.regions[2].parentId=cycle.regions[1].id;
 assert.throws(()=>reconcileSceneLabelLayout(cycle,[],[]),/cycle/);
 assert.throws(()=>reconcileSceneLabelLayout({...empty,regions:[...empty.regions,empty.regions[0]]},[],[]),/owner/);
 const sparse=f.boxes.slice();delete sparse[0];assert.throws(()=>reconcileSceneLabelLayout(f.plan,f.refs,sparse),/binding/);
 const invalid=structuredClone(f.plan);invalid.regionPrograms[0].labels=[{refs:['label-'+'f'.repeat(24)]}];
 assert.throws(()=>reconcileSceneLabelLayout(invalid,f.refs,f.boxes),/reference/);
});
test('layout regression and runtime module enter the unified CI and package surfaces',()=>{
 const suites=require('../scripts/test-suites'),runtime=require('../scripts/verify-runtime-package');
 assert.equal(suites.includesSuite(__filename,'all'),true);assert.equal(suites.includesSuite(__filename,'unit'),true);
 assert.ok(runtime.REQUIRED_FILES.includes('packages/slideclone-core/source-scene-label-layout.js'));
});

"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {createSceneMeasurementCache:create}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
const {measureSceneParametricSurface}=require('../packages/slideclone-core/scene-plan/source-scene-parametric-surface');
const {hasMeasuredScenePortFrame}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
function fixture(){
 const image={width:340,height:120,rgba:Buffer.alloc(340*120*4)},hint={x:20,y:20,w:280,h:70};
 const put=(x,y,color)=>image.rgba.set([...color,255],(y*340+x)*4);
 for(let y=0;y<120;y++)for(let x=0;x<340;x++)put(x,y,[253,232,242]);
 for(let x=20;x<300;x++)for(let y=20+2*(Math.floor(x/7)%2);y<90+2*(Math.floor(x/7)%2);y++)put(x,y,[246-Math.round((y-20)/10),246,252]);
 const masks=[{x:30,y:27,w:260,h:7},{x:30,y:81,w:260,h:7}];
 for(const mask of masks)for(let y=mask.y;y<mask.y+mask.h;y++)for(let x=30;x<290;x++)if((x-30)%10<5)put(x,y,[30,40,60]);
 return {image,hint,masks,budget:{used:0}};
}
test('a measured drawing partition does not suppress an independently proven complete source body',()=>{
 const f=fixture(),cache=create(f.image,f.masks,f.budget),paint=cache.fill(f.hint);
 assert.ok(paint?.parts?.length>1);
 assert.equal(cache.portFrame(f.hint),null,'the paint union itself grants no port');
 const independent=measureSceneParametricSurface(f.image,f.hint,f.masks,{used:0});assert.ok(independent);
 const result=cache.surface(f.hint);
 assert.deepEqual(result.measured,independent,'consume the exact admitted body and source gradient');
 assert.ok(hasMeasuredScenePortFrame(f.image,cache.portFrame(f.hint),independent.box));
 assert.deepEqual(cache.fill(f.hint),paint,'retain the original private paint measurement');
 assert.ok(f.budget.used<=4000000);
});
test('complete-body recovery is cached, immutable and bound to the source and the exact physical hint',()=>{
 const f=fixture(),cache=create(f.image,f.masks,f.budget),result=cache.surface(f.hint),expected=structuredClone(result),used=f.budget.used;
 assert.ok(result.measured&&!result.measured.parts);result.measured.box.x=0;result.measured.perimeterPixels.length=0;
 assert.deepEqual(cache.surface({...f.hint}),expected);assert.equal(f.budget.used,used);
 const token=cache.portFrame(f.hint);assert.ok(token);
 assert.equal(hasMeasuredScenePortFrame(f.image,structuredClone(token),expected.measured.box),false);
 assert.equal(hasMeasuredScenePortFrame({...f.image,rgba:Buffer.from(f.image.rgba)},token,expected.measured.box),false);
 assert.equal(cache.portFrame({...f.hint,x:21}),null);
});
test('source connectivity is private evidence and cannot be supplied by cloned, proxy or unrelated measurements',()=>{
 const {measureSceneContainer}=require('../packages/slideclone-core/scene-plan/source-scene-container');
 const {sceneFillHasConnectedBody:connected}=require('../packages/slideclone-core/scene-plan/source-scene-fill-window');
 const f=fixture(),paint=measureSceneContainer(f.image,f.hint,f.masks,f.budget);assert.ok(paint?.parts);
 assert.equal(connected(paint,f.image),true);
 for(const candidate of [null,{},structuredClone(paint),new Proxy(paint,{})])assert.equal(connected(candidate,f.image),false);
 assert.equal(connected(paint,{...f.image,rgba:Buffer.from(f.image.rgba)}),false);
 let calls=0;const hostile={get rgba(){calls++;throw Error('private');}};
 assert.equal(connected(paint,hostile),false);assert.equal(connected(paint,new Proxy(f.image,{})),false);assert.equal(calls,0);
});
test('the normal compiler consumes a proven partitioned body as a visible native node, label group and source-attached relation',t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png'),{parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const f=fixture(),image={width:400,height:120,rgba:Buffer.alloc(400*120*4)};
 const put=(x,y,color)=>image.rgba.set([...color,255],(y*400+x)*4);
 for(let y=0;y<120;y++)for(let x=0;x<400;x++)put(x,y,[253,232,242]);
 for(let y=0;y<120;y++)for(let x=0;x<340;x++)image.rgba.set(f.image.rgba.subarray((y*340+x)*4,(y*340+x+1)*4),(y*400+x)*4);
 for(let y=20;y<90;y++)for(let x=320;x<375;x++)put(x,y,[210,230,245]);
 for(let x=300;x<320;x++)for(let y=55;y<=57;y++)put(x,y,[30,40,60]);
 for(let x=314;x<320;x++)for(let y=56-(319-x);y<=56+(319-x);y++)put(x,y,[30,40,60]);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'partitioned-body-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:120}}],
  objects:[{id:'body',regionId:'root',kind:'container',box:f.hint},{id:'target',regionId:'root',kind:'container',box:{x:320,y:20,w:55,h:70}}],
  relations:[{id:'edge',regionId:'root',fromId:'body',toId:'target',direction:'forward'}]},
 {sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:400,heightPx:120});
 const page={shapes:[],images:[],textBoxes:f.masks.map((box,i)=>({id:'label-'+i,text:'Label',box,source:{editable:true,confidence:.99,evidenceBox:box}}))};
 const original=structuredClone(page),result=compileSourceScene({page,plan,sourceFile,root,slideSize:{widthPt:400,heightPt:120}});
 const body=result.page.shapes.find(s=>s.id==='scene-container-object-body');assert.ok(body);
 assert.equal(body.type,'rect');assert.notEqual(body.style.fill,'none');assert.ok(body.style.gradient);
 assert.equal(result.evidence.resolvedRelations,1);assert.equal(result.evidence.physicallyGroupedText,2,
  JSON.stringify({matched:result.evidence.physicallyMatchedText,conflicts:result.evidence.physicalGroupPaintConflicts,
   checks:result.evidence.physicalGroupGeometryChecks,skipped:result.evidence.physicalGroupSkippedGeometry}));
 assert.ok(result.page.textBoxes.every(text=>text.source.nativeComponentGroupId===body.source.nativeComponentGroupId));
 assert.equal(result.evidence.unresolved.some(item=>item.reason==='compound-background-node'||item.detailCode==='missing-native-node'),false);
 assert.ok(result.evidence.sourceScanPixels<=4000000);assert.deepEqual(page,original);
});
test('depleted optional scans preserve drawing parts and never manufacture a node',()=>{
 const f=fixture(),cache=create(f.image,f.masks,f.budget);cache.outline(f.hint);
 const paint=cache.fill(f.hint);assert.ok(paint?.parts);
 f.budget.used=4000000;
 assert.deepEqual(cache.surface(f.hint).measured,paint);assert.equal(cache.portFrame(f.hint),null);assert.equal(f.budget.used,4000000);
});
test('boundary masks keep partitioned paint unresolved, without weakening the source predicate',()=>{
 const f=fixture();f.masks.push({x:19,y:19,w:282,h:8});
 const cache=create(f.image,f.masks,f.budget),paint=cache.fill(f.hint);assert.ok(paint?.parts);
 assert.equal(measureSceneParametricSurface(f.image,f.hint,f.masks,{used:0}),null);
 assert.deepEqual(cache.surface(f.hint).measured,paint);assert.equal(cache.portFrame(f.hint),null);
 const used=f.budget.used;cache.surface(f.hint);assert.equal(f.budget.used,used,'rejected source observation is reusable');
});
test('blank, invalid and hostile recovery inputs preserve the existing boundary and unified CI discovery',()=>{
 const f=fixture();f.image.rgba.fill(255);const cache=create(f.image,[],f.budget);assert.equal(cache.surface(f.hint).measured,null);
 let calls=0;const getter={get x(){calls++;throw Error('private');}};
 for(const hint of [null,{},getter,new Proxy(f.hint,{}),{...f.hint,w:Infinity}])assert.throws(()=>cache.surface(hint),TypeError);
 assert.equal(calls,0);
 const {includesSuite}=require('../scripts/test-suites');assert.equal(includesSuite(__filename,'unit'),true);assert.equal(includesSuite(__filename,'all'),true);
});

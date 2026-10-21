"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {selectSceneInteriorTargets}=require('../packages/slideclone-core/source-scene-interior-targets');
const {compileSceneInteriorParts}=require('../packages/slideclone-core/source-scene-interior-parts');
function fixture(){
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 for(let y=70;y<121;y++)for(let x=75;x<126;x++){
  const radius=Math.hypot(x-100,y-95);if(radius<=23)image.rgba.set(radius>19?[20,20,20,255]:[230,50,80,255],(y*400+x)*4);
 }
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:400,heightPx:300,
  regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:300}}],
  objects:[{id:'first',kind:'container',regionId:'region',box:{x:20,y:20,w:160,h:130}},
   {id:'second',kind:'container',regionId:'region',box:{x:220,y:20,w:160,h:130}}],
  relations:[{id:'link',regionId:'region',fromId:'first',toId:'second',direction:'forward'}]};
 return {image,plan,root:process.cwd(),slideSize:{widthPt:400,heightPt:300},
  textBoxes:[{id:'caption',text:'Caption',box:{x:60,y:30,w:80,h:14}}],shapes:[],images:[],budget:{used:0},capacity:2};
}

test('side-by-side row labels do not suppress an independent pictorial interior',()=>{
 const input=fixture();input.image.rgba.fill(255);
 input.plan.objects=input.plan.objects.slice(0,1);input.plan.objects[0].pictorialContent='present';
 input.plan.objects[0].box={x:20,y:20,w:160,h:180};input.capacity=3;
 input.plan.relations=[{id:'required-link',regionId:'region',fromId:'first',toId:'missing',direction:'forward'}];
 input.textBoxes=[50,100,150].map(y=>({text:'Row label',box:{x:100,y,w:60,h:24}}));
 for(const cy of [62,112,162])for(let y=cy-12;y<=cy+12;y++)for(let x=40;x<=64;x++){
  const edge=x<43||x>61||y<cy-9||y>cy+9;
  input.image.rgba.set(edge?[20,20,20,255]:[40,120,200,255],(y*400+x)*4);
 }
 const before=structuredClone(input.plan),pixels=Buffer.from(input.image.rgba);
 const result=compileSceneInteriorParts(input);
 assert.ok(result.evidence.interiorGroups>0,'row-aligned native illustrations must reach source isolation');
 assert.ok(result.parts.every(p=>p.box.x+p.box.w<100));
 assert.ok(result.evidence.interiorTargets<=3);assert.ok(result.parts.length<=32);
 assert.deepEqual(input.plan,before);assert.deepEqual(input.image.rgba,pixels);
 assert.ok(input.budget.used<=4000000);assert.deepEqual(input.shapes,[]);assert.deepEqual(input.images,[]);
});
test('complete colored interior paint is compiled as bounded parts without changing the plan or existing content',()=>{
 const input=fixture(),plan=structuredClone(input.plan),pixels=Buffer.from(input.image.rgba),text=structuredClone(input.textBoxes);
 const result=compileSceneInteriorParts(input);assert.equal(result.evidence.interiorGroups,1);assert.ok(result.parts.length>0);
 assert.ok(result.parts.every(p=>p.source.sceneInteriorParentId==='first'&&p.source.nativeComponentGroupId==='scene-interior-first'));
 assert.ok(result.parts.every(p=>p.style.freeformSegments.length<=120));assert.ok(result.parts.length<=32);
 assert.deepEqual(input.plan,plan);assert.deepEqual(input.textBoxes,text);assert.deepEqual(input.image.rgba,pixels);
 assert.deepEqual(input.shapes,[]);assert.deepEqual(input.images,[]);assert.equal(input.budget.used,160*130*2);
});

test('previously observed interiors remain available near the shared scan limit without buying new pixels',()=>{
 const {withSceneFillRasterCache,readSceneFillRaster}=require('../packages/slideclone-core/source-scene-fill-raster-cache');
 const expected=compileSceneInteriorParts(fixture());
 const input=fixture();
 withSceneFillRasterCache(input.image,input.budget,()=>{
  for(const object of input.plan.objects)readSceneFillRaster(input.image,object.box,input.budget);
  input.budget.used=4000000;
  const result=compileSceneInteriorParts(input);
  assert.deepEqual(result,expected);
  assert.equal(input.budget.used,4000000);
  input.textBoxes.push({text:'Owned text',box:{x:85,y:80,w:30,h:30}});
  assert.equal(compileSceneInteriorParts(input).parts.length,0);
  assert.equal(input.budget.used,4000000);
 });
 const uncached=fixture();uncached.budget.used=4000000;
 assert.equal(compileSceneInteriorParts(uncached).evidence.interiorSkippedBudget,2);
 assert.equal(uncached.budget.used,4000000);
});
test('text contact, monochrome marks, empty sources and existing pictorial paint are not traced again',()=>{
 for(const edit of [r=>r.textBoxes.push({text:'Native',box:{x:85,y:80,w:30,h:30}}),
  r=>{for(let i=0;i<r.image.rgba.length;i+=4)if(r.image.rgba[i]===230)r.image.rgba.set([30,30,30],i);},
  r=>r.image.rgba.fill(255),r=>r.images.push({box:{x:75,y:70,w:51,h:51}}),
  r=>r.shapes.push({box:{x:75,y:70,w:51,h:51},source:{semanticPictorialNative:true}})]){
  const input=fixture();edit(input);assert.equal(compileSceneInteriorParts(input).parts.length,0);
 }
});
test('existing object parts, scan allowance, target slots and pictorial absence remain hard limits',()=>{
 const full=fixture();full.shapes=Array.from({length:32},(_,i)=>({id:'scene-container-first-part-'+i,box:{x:20,y:20,w:10,h:10}}));
 assert.equal(compileSceneInteriorParts(full).parts.length,0);
 const painted=fixture();painted.shapes=Array.from({length:32},(_,i)=>({id:'paint-'+i,box:{x:20,y:20,w:10,h:10},source:{sceneOutlinePaintOwnerId:'scene-outline-first'}}));
 assert.equal(compileSceneInteriorParts(painted).parts.length,0);
 const exhausted=fixture();exhausted.budget.used=4000000;assert.equal(compileSceneInteriorParts(exhausted).parts.length,0);assert.equal(exhausted.budget.used,4000000);
 const none=fixture();none.capacity=0;assert.equal(compileSceneInteriorParts(none).parts.length,0);assert.equal(none.budget.used,0);
 const absent=fixture();absent.plan.objects[0].pictorialContent='absent';assert.equal(compileSceneInteriorParts(absent).parts.length,0);
 const child=fixture();child.plan.objects.push({id:'icon',kind:'icon',regionId:'region',box:{x:75,y:70,w:51,h:51}});
 assert.ok(compileSceneInteriorParts(child).parts.length>0,'a proposal without actual native representation cannot suppress recovery');
 const represented=fixture();represented.representedParents=['first'];assert.equal(compileSceneInteriorParts(represented).parts.length,0);
 for(const capacity of [-1,33,NaN,1.5])assert.throws(()=>compileSceneInteriorParts({...fixture(),capacity}),RangeError);
});
test('overlapping parent proposals cannot duplicate an already recovered physical picture',()=>{
 const input=fixture();input.plan.objects[1].box={...input.plan.objects[0].box};
 const result=compileSceneInteriorParts(input);assert.equal(result.evidence.interiorGroups,1);
 assert.ok(result.evidence.interiorRejected.some(r=>r.reason==='existing-pictorial'));
});
test('an admitted wide sparse picture cannot abort compilation at the narrower contour-engine boundary',()=>{
 const input=fixture();input.image={width:4000,height:1600,rgba:Buffer.alloc(4000*1600*4,255)};
 input.slideSize={widthPt:4000,heightPt:1600};input.plan.widthPx=4000;input.plan.heightPx=1600;
 input.plan.regions[0].box={x:0,y:0,w:4000,h:1600};input.plan.objects[0].box={x:50,y:50,w:800,h:300};
 input.plan.objects[1].box={x:950,y:50,w:100,h:100};input.textBoxes=[];input.capacity=1;
 const paint=(x,y,c)=>input.image.rgba.set([...c,255],(y*4000+x)*4);
 for(let x=130;x<=770;x++){
  const y=Math.round(x<=450?100+(x-130)*200/320:300-(x-450)*200/320);
  for(let delta=-2;delta<=2;delta++)paint(x,y+delta,[30,30,30]);
 }
 for(const [cx,cy,color] of [[130,100,[240,60,90]],[450,300,[60,220,100]],[770,100,[70,100,220]]])
  for(let y=cy-25;y<=cy+25;y++)for(let x=cx-25;x<=cx+25;x++){
   const radius=Math.hypot(x-cx,y-cy);if(radius<=25)paint(x,y,radius>21?[30,30,30]:color);
  }
 const result=compileSceneInteriorParts(input);assert.equal(result.parts.length,0);
 assert.deepEqual(result.evidence.interiorRejected,[{id:'first',reason:'native-representation'}]);
 assert.equal(input.budget.used,800*300);
});
test('largest unobserved interiors win remaining slots without depending on provider enumeration',()=>{
 const input=fixture();input.plan.objects[1].box.h=170;
 const a=selectSceneInteriorTargets(input.plan,[],1);assert.equal(a[0].parent.id,'second');
 input.plan.objects.reverse();assert.deepEqual(selectSceneInteriorTargets(input.plan,[],1),a);
 input.plan.objects[0].regionId='missing';assert.equal(selectSceneInteriorTargets(input.plan,[],2).length,1);
 assert.deepEqual(selectSceneInteriorTargets({...input.plan,relations:[]},[],2),[]);
 assert.throws(()=>selectSceneInteriorTargets({...input.plan,objects:Array(65).fill(input.plan.objects[0])},[],2),RangeError);
});
test('the real compiler invokes interior recovery only after ordinary work and keeps unresolved topology',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png');
 const {compileSourceScene,preflightSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
 const input=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-interior-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(let y=20;y<150;y++)for(let x=20;x<180;x++)if((x<23||x>=177)&&y%12<4||(y<23||y>=147)&&x%12<4)input.image.rgba.set([20,20,20,255],(y*400+x)*4);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,input.image);
 input.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const request={root,sourceFile,plan:input.plan,slideSize:input.slideSize,page:{shapes:[],images:[],textBoxes:input.textBoxes}};
 const preflight=preflightSourceScene(request);assert.equal(preflight.evidence.interiorTargets,undefined);
 const result=compileSourceScene({...request,compilationSession:preflight.compilationSession});
 assert.equal(result.evidence.interiorGroups,1);assert.ok(result.page.shapes.some(s=>s.source?.sceneInteriorParentId==='first'));
 assert.ok(result.evidence.unresolved.some(r=>r.id==='link'&&r.reason==='relation-source-evidence'));
 assert.equal(result.evidence.resolvedRelations,0);assert.ok(result.evidence.sourceScanPixels<=4000000);
 assert.deepEqual(result.page.textBoxes.map(t=>t.text),input.textBoxes.map(t=>t.text));
 const occupied={...input.plan,objects:[...input.plan.objects,...Array.from({length:32},(_,i)=>({id:'existing-'+i,kind:'icon',regionId:'region',box:{x:1,y:1,w:2,h:2}}))]};
 const full=compileSourceScene({...request,plan:occupied});assert.equal(full.evidence.interiorTargets,0);assert.equal(full.evidence.interiorParts,0);
});

test('the real compiler assembles the complete measured node, label and interior in one native edit group',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png');
 const {compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
 const input=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-complete-node-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(let y=20;y<150;y++)for(let x=20;x<180;x++)if(input.image.rgba[(y*400+x)*4]===255)
  input.image.rgba.set([225,240,250,255],(y*400+x)*4);
 input.textBoxes[0].source={editable:true,evidenceBox:{...input.textBoxes[0].box}};
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,input.image);
 input.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const page={shapes:[],images:[],textBoxes:input.textBoxes},before=structuredClone(page);
 const result=compileSourceScene({root,sourceFile,plan:input.plan,slideSize:input.slideSize,page});
 const interior=result.page.shapes.filter(s=>s.source?.sceneInteriorParentId==='first');
 const parent=result.page.shapes.filter(s=>s.id==='scene-container-first'||s.id==='scene-outline-first');
 assert.ok(interior.length>0,JSON.stringify(result.evidence));assert.ok(parent.length>0);
 assert.equal(result.page.textBoxes[0].source.nativeComponentGroupId,'scene-unit-first');
 assert.ok([...parent,...interior].every(s=>s.source.nativeComponentGroupId==='scene-unit-first'));
 assert.equal(result.evidence.assembledInteriorGroups,1);
 assert.ok(result.evidence.physicalGroupGeometryChecks<=4000000);
 assert.ok(result.evidence.sourceScanPixels<=4000000);assert.deepEqual(page,before);
 assert.ok(result.evidence.unresolved.some(r=>r.id==='link'));
});

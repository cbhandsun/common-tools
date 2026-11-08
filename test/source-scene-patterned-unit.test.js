'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measurePatternedSceneFrame,patternedSceneFrameGeometry}=require('../packages/slideclone-core/scene-plan/source-scene-patterned-frame');
const {nativePatternedSceneOutput,patternedSceneParentMembers,rebindPatternedSceneParentMembers}=require('../packages/slideclone-core/scene-plan/source-scene-patterned-output');
const {measureSceneFillWindow,sceneFillPaintMeasurement}=require('../packages/slideclone-core/scene-plan/source-scene-fill-window');
const {createMeasuredScenePortFrame,verifyMeasuredScenePort}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
const {bindSourceScenePhysicalGroups}=require('../packages/slideclone-core/scene-plan/source-scene-physical-groups');
const {assembleSourceSceneCompleteGroups}=require('../packages/slideclone-core/scene-plan/source-scene-complete-groups');
const {compileSceneIcon}=require('../packages/slideclone-core/scene-plan/source-scene-native-icon');
const {ungroupHybridOverlayObjects}=require('../packages/slideclone-core/team-native-rebuild');

function fixture(pictorial=false){
 const image={width:240,height:210,rgba:Buffer.alloc(240*210*4,255)},hint={x:30,y:25,w:144,h:120},budget={used:0};
 const put=(x,y,w,h,color=[30,60,90,255])=>{for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)image.rgba.set(color,(row*240+col)*4);};
 put(33,28,138,114,[253,255,231,255]);put(100,28,2,114,[255,255,255,255]);
 for(let x=46;x<158;x+=12){put(x,25,8,2);put(x,143,8,2);}
 for(let y=41;y<130;y+=12){put(30,y,2,8);put(172,y,2,8);}
 for(const [x,y,right,bottom]of[[30,25,false,false],[165,25,true,false],[30,136,false,true],[165,136,true,true]]){
  put(x,y+(bottom?7:0),9,2);put(x+(right?7:0),y,2,9);
 }
 if(pictorial)put(65,78,23,24,[230,50,80,255]);
 const measurement=measurePatternedSceneFrame({image,hint,textMasks:[],owners:[],budget});assert.ok(measurement);
 const background=measureSceneFillWindow({image,hint,fill:[253,255,231],color:'#FDFFE7',marginX:16,marginY:16,budget}).fit;
 assert.ok(background?.parts?.length);
 const slideSize={widthPt:240,heightPt:210},output={image,measurement,id:'parent',regionId:'region',inventory:true,slideSize,background};
 const shapes=nativePatternedSceneOutput(output);assert.ok(shapes);
 const node={box:measurement.box,portFrame:createMeasuredScenePortFrame(image,{...patternedSceneFrameGeometry(measurement,image),fill:'none'},measurement),parentPaint:shapes};
 return {image,hint,budget,put,measurement,background,slideSize,output,shapes,node,physicalNodes:[{proposalId:'parent',node}],images:[],textBoxes:[]};
}

test('a contained background can join an intact measured multi-face parent without replacing its receipt',()=>{
 const f=fixture(),background={id:'background',type:'rect',box:{x:55,y:50,w:40,h:14},
  style:{fill:'#FEF5F1',stroke:'none',strokeWidthPt:0},source:{detector:'solid-region-native-background',residualBackgroundFill:true}};
 const label={id:'caption',text:'Caption',box:background.box,source:{editable:true,evidenceBox:background.box}};
 const shapes=[...f.shapes,background],before=structuredClone(shapes);
 const grouped=bindSourceScenePhysicalGroups({...f,shapes,textBoxes:[label]});
 assert.equal(grouped.evidence.physicalGroups,1);assert.equal(grouped.shapes.at(-1).source.nativeComponentGroupId,'scene-unit-parent');
 assert.ok(patternedSceneParentMembers(f.image,f.shapes,'parent',grouped.shapes),'the entire original parent receipt survives');
 const page={shapes:grouped.shapes,images:[],textBoxes:grouped.textBoxes};
 const {retainedSceneGroupMembers}=require('../packages/slideclone-core/scene-plan/source-scene-group-retention');
 assert.equal(retainedSceneGroupMembers(page,grouped.sealGroups(page)).size,shapes.length+1);
 assert.deepEqual(shapes,before);
 const missing=fixture();missing.shapes.pop();
 const rejected=bindSourceScenePhysicalGroups({...missing,shapes:[...missing.shapes,background],textBoxes:[label]});
 assert.equal(rejected.evidence.physicalGroups,0,'a missing original face cannot be replaced by an inferred background');
});

test('fragmented boundary preserves every previously measured background path before its outline',()=>{
 const f=fixture(),count=f.background.parts.length;
 const backgrounds=f.shapes.slice(0,count);
 assert.deepEqual(backgrounds.map(p=>p.box),f.background.parts.map(p=>p.box));
 assert.deepEqual(backgrounds.map(p=>p.style.freeformSegments),f.background.parts.map(p=>p.segments));
 assert.ok(backgrounds.every(p=>p.style.fill===f.background.fill&&p.source.residualBackgroundFill===true));
 assert.ok(f.shapes.slice(count).every(p=>p.source.residualBackgroundFill===false));
 assert.deepEqual(patternedSceneParentMembers(f.image,f.shapes,'parent',f.shapes),f.shapes);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-scene-patterned-unit.test.js','all'),true);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-scene-patterned-unit.test.js','unit'),true);
});

test('only the unchanged private fill handle can preserve background paint',()=>{
 const f=fixture();assert.deepEqual(sceneFillPaintMeasurement(f.background,f.image),f.background);
 for(const bad of[{},structuredClone(f.background),new Proxy(f.background,{})])assert.throws(()=>nativePatternedSceneOutput({...f.output,background:bad}),TypeError);
 assert.equal(sceneFillPaintMeasurement(f.background,{...f.image,rgba:Buffer.from(f.image.rgba)}),null);
 f.background.parts[0].segments[0].points[0].x+=.1;
 assert.equal(sceneFillPaintMeasurement(f.background,f.image),null);
});

test('complete parent receipts reject copied, missing, duplicate, changed and wrong-source members',()=>{
 for(const mode of['receipt-copy','shape-copy','missing','duplicate','paint','source','group','source-raster','wrong-id']){
  const f=fixture(),shapes=f.shapes.slice();let token=f.shapes,image=f.image,id='parent';
  if(mode==='receipt-copy')token=structuredClone(token);
  if(mode==='shape-copy')shapes[0]=structuredClone(shapes[0]);
  if(mode==='missing')shapes.pop();
  if(mode==='duplicate')shapes.push({...shapes[0]});
  if(mode==='paint')shapes[0].style.fill='#000000';
  if(mode==='source')shapes[0].source.sceneRegionId='foreign';
  if(mode==='group')shapes[0].source.nativeComponentGroupId='foreign';
  if(mode==='source-raster')image={...image,rgba:Buffer.from(image.rgba)};
  if(mode==='wrong-id')id='other';
  assert.equal(patternedSceneParentMembers(image,token,id,shapes),null,mode);
 }
});

test('only paint-preserving grouping copies carry complete membership forward',()=>{
 for(const mode of['valid','paint','order','foreign-group','source']){
  const f=fixture(),after=f.shapes.map(p=>({...p,source:{...p.source,nativeComponentGroupId:'scene-unit-parent'}}));
  if(mode==='paint')after[0]={...after[0],box:{...after[0].box,w:1}};
  if(mode==='order')after.reverse();
  if(mode==='foreign-group')after[0].source.nativeComponentGroupId='foreign';
  if(mode==='source')after[0].source.sceneRegionId='foreign';
  assert.equal(rebindPatternedSceneParentMembers(f.image,f.shapes,'parent',f.shapes,after),mode==='valid',mode);
  if(mode==='valid')assert.deepEqual(patternedSceneParentMembers(f.image,f.shapes,'parent',after),after);
 }
});

test('hostile member arrays and source metadata never execute while checking receipts',()=>{
 const f=fixture();let calls=0;const source={};Object.defineProperty(source,'nativeComponentGroupId',{get(){calls++;throw Error('private');}});
 const shapes=f.shapes.slice(),bad={};Object.defineProperty(bad,'id',{get(){calls++;throw Error('private');}});
 for(const array of[new Proxy(shapes,{}),[bad],new Array(shapes.length)])assert.equal(patternedSceneParentMembers(f.image,f.shapes,'parent',array),null);
 assert.equal(rebindPatternedSceneParentMembers(f.image,f.shapes,'parent',shapes,new Proxy(shapes,{})),false);
 shapes[0].source=source;assert.equal(patternedSceneParentMembers(f.image,f.shapes,'parent',shapes),null);
 assert.equal(calls,0);
});

test('native text and pictorial children complete one source-bound group that survives hybrid output',()=>{
 const f=fixture(true);
 const icon=compileSceneIcon({image:f.image,box:{x:65,y:78,w:23,h:24},id:'child',regionId:'region',root:process.cwd(),
  slideSize:f.slideSize,textBoxes:[],budget:f.budget},{preflight:true,nativePictorial:true,parentObjectId:'parent'});
 assert.ok(icon.shapes.length);
 const label={id:'caption',text:'Caption',box:{x:55,y:50,w:40,h:14},source:{editable:true,evidenceBox:{x:55,y:50,w:40,h:14}}};
 const request={...f,shapes:[...f.shapes,...icon.shapes],textBoxes:[label],nativeIcons:[icon],interior:null,geometryChecks:0,
  plan:{objects:[{id:'parent',kind:'container',regionId:'region',box:f.hint},{id:'child',kind:'icon',regionId:'region',parentObjectId:'parent',box:{x:65,y:78,w:23,h:24}}]}};
 const grouped=bindSourceScenePhysicalGroups(request);assert.equal(grouped.evidence.physicalGroups,1);
 const completed=assembleSourceSceneCompleteGroups({...request,shapes:grouped.shapes,textBoxes:grouped.textBoxes,geometryChecks:grouped.evidence.physicalGroupGeometryChecks});
 assert.equal(completed.completedParents.has('parent'),true);
 const page={shapes:completed.shapes,images:[],textBoxes:completed.textBoxes},receipt=completed.sealGroups(page);
 ungroupHybridOverlayObjects(page,receipt);
 assert.ok([...page.shapes,...page.textBoxes].every(p=>p.source.nativeComponentGroupId==='scene-unit-parent'));
 assert.deepEqual(page.shapes.slice(0,f.background.parts.length).map(p=>p.style),f.shapes.slice(0,f.background.parts.length).map(p=>p.style));
});

test('adding a measured icon preserves the privately bound background in the existing physical group',()=>{
 const f=fixture(true),background={id:'background',type:'rect',box:{x:55,y:50,w:40,h:14},
  style:{fill:'#FEF5F1',stroke:'none',strokeWidthPt:0},source:{detector:'solid-region-native-background',residualBackgroundFill:true}};
 const icon=compileSceneIcon({image:f.image,box:{x:65,y:78,w:23,h:24},id:'child',regionId:'region',root:process.cwd(),
  slideSize:f.slideSize,textBoxes:[],budget:f.budget},{preflight:true,nativePictorial:true,parentObjectId:'parent'});
 const label={id:'caption',text:'Caption',box:background.box,source:{editable:true,evidenceBox:background.box}};
 const request={...f,shapes:[...f.shapes,background,...icon.shapes],textBoxes:[label],nativeIcons:[icon],interior:null,geometryChecks:0,
  plan:{objects:[{id:'parent',kind:'container',regionId:'region',box:f.hint},{id:'child',kind:'icon',regionId:'region',parentObjectId:'parent',box:{x:65,y:78,w:23,h:24}}]}};
 const grouped=bindSourceScenePhysicalGroups(request);
 const completed=assembleSourceSceneCompleteGroups({...request,shapes:grouped.shapes,textBoxes:grouped.textBoxes,geometryChecks:grouped.evidence.physicalGroupGeometryChecks});
 assert.equal(completed.completedParents.has('parent'),true);
 const page={shapes:completed.shapes,images:[],textBoxes:completed.textBoxes};ungroupHybridOverlayObjects(page,completed.sealGroups(page));
 assert.ok([...page.shapes,...page.textBoxes].every(p=>p.source.nativeComponentGroupId==='scene-unit-parent'));
 assert.equal(page.shapes.find(p=>p.id==='background').style.fill,'#FEF5F1');
 const copy=grouped.shapes.map(s=>s.id==='background'?structuredClone(s):s);
 const rejected=assembleSourceSceneCompleteGroups({...request,shapes:copy,textBoxes:grouped.textBoxes,geometryChecks:grouped.evidence.physicalGroupGeometryChecks});
 assert.equal(rejected.completedParents.has('parent'),false,'a copied group flag cannot replace the measured background member');
});

test('nearby corner blobs and large unexplained rail gaps cannot authorize an inferred enclosure',()=>{
 for(const mode of['blob','gap']){
  const f=fixture();
  if(mode==='blob'){f.put(30,25,9,9,[255,255,255,255]);f.put(30,25,9,9);}
  if(mode==='gap')f.put(40,25,41,2,[255,255,255,255]);
  assert.equal(!!measurePatternedSceneFrame({image:f.image,hint:f.hint,textMasks:[],owners:[],budget:{used:0}}),false,mode);
 }
});

test('empty inferred boundary gaps never authorize physical connector attachment',()=>{
 const f=fixture(),used=f.budget.used;
 assert.equal(verifyMeasuredScenePort({image:f.image,token:f.node.portFrame,box:f.node.box,point:{x:174,y:63},side:'right',
  color:'#1e3c5a',textMasks:[],budget:f.budget}),false);
 assert.ok(f.budget.used>=used&&f.budget.used<=4000000);
});

test('the full compiler keeps measured background paint when admitting a fragmented source node',t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png');
 const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'patterned-scene-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:240,h:210}}],
  objects:[{id:'parent',kind:'container',regionId:'region',box:f.hint}],relations:[]},
 {sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:240,heightPx:210});
 const result=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:f.slideSize,preflight:true});
 const backgrounds=result.page.shapes.filter(s=>s.id?.startsWith('scene-container-object-parent-part-'));
 const outlines=result.page.shapes.filter(s=>s.id?.startsWith('scene-pattern-object-parent-'));
 assert.ok(backgrounds.length>0&&outlines.length>0);
 assert.deepEqual(backgrounds.map(s=>s.style.fill),f.background.parts.map(()=>f.background.fill));
 assert.deepEqual(backgrounds.map(s=>s.style.freeformSegments),f.background.parts.map(p=>p.segments));
 assert.ok(result.page.shapes.indexOf(backgrounds.at(-1))<result.page.shapes.indexOf(outlines[0]));
 assert.ok(result.evidence.sourceScanPixels<=4000000);
});

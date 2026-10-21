"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {bindSourceScenePhysicalGroups:bind}=require('../packages/slideclone-core/source-scene-physical-groups');
const {sourceGroupTextPolygon,measuredGroupVertices,fullyContainedGroupPolygon}=require('../packages/slideclone-core/source-scene-group-containment');
const {createMeasuredScenePortFrame,measuredSceneContainsGroup,measuredSceneGroupBounds}=require('../packages/slideclone-core/source-scene-port-evidence');
const {ungroupSourceNativeOverlays}=require('../packages/slideclone-core/source-native-finalization');
const {combineMeasuredSceneGroupReceipts,retainedSceneGroupMembers}=require('../packages/slideclone-core/source-scene-group-retention');
const {finalizeSourceScene}=require('../packages/slideclone-core/source-scene-finalize');
function fixture(){
 const image={width:100,height:100,rgba:Buffer.alloc(40000,255)},box={x:10,y:10,w:80,h:80};
 const portFrame=createMeasuredScenePortFrame(image,{box,fill:'#CDEFFF'});
 return {image,slideSize:{widthPt:100,heightPt:100},shapes:[{id:'scene-container-panel',box,source:{editable:true}}],images:[],
  textBoxes:[{id:'text',text:'Native label',box:{x:30,y:30,w:20,h:10},source:{editable:true,evidenceBox:{x:30,y:30,w:20,h:10}}}],
  physicalNodes:[{proposalId:'panel',node:{box,portFrame}}]};
}
function enclosingRing(reverseHole=true){
 const loop=points=>[{type:'moveTo',points:[points[0]]},...points.slice(1).map(p=>({type:'lnTo',points:[p]})),{type:'close',points:[]}];
 const outer=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],inner=[{x:.05,y:.05},{x:.95,y:.05},{x:.95,y:.95},{x:.05,y:.95}];
 return {id:'enclosing-outline',type:'freeform',box:{x:0,y:0,w:100,h:100},style:{fill:'#005599',stroke:'none',strokeWidthPt:0,
  freeformSegments:[...loop(outer),...loop(reverseHole?inner.reverse():inner)]}};
}
test('a measured node and its text group through a surrounding hollow native frame without changing paint',()=>{
 const input=fixture();input.shapes.push(enclosingRing());
 const before=structuredClone(input),result=bind(input);
 assert.equal(result.evidence.physicallyMatchedText,1);
 assert.equal(result.evidence.physicallyGroupedText,1);
 assert.equal(result.evidence.physicalGroupPaintConflicts,0);
 assert.equal(result.shapes[0].source.nativeComponentGroupId,'scene-unit-panel');
 assert.equal(result.textBoxes[0].source.nativeComponentGroupId,'scene-unit-panel');
 assert.deepEqual(result.shapes[1],before.shapes[1]);
 assert.deepEqual(result.textBoxes[0].box,before.textBoxes[0].box);
 assert.deepEqual(input.shapes,before.shapes);assert.deepEqual(input.textBoxes,before.textBoxes);
});
test('same-winding nested fill and actual outline contact still block native grouping',()=>{
 const filled=fixture();filled.shapes.push(enclosingRing(false));
 assert.equal(bind(filled).evidence.physicallyGroupedText,0);
 // The left border reaches x=30.25, across the label's x=30 edge.
 const touched=fixture(),ring=enclosingRing();ring.box={x:29,y:25,w:25,h:30};touched.shapes.push(ring);
 assert.equal(bind(touched).evidence.physicallyGroupedText,0);
});
test('private measured panels group original labels without changing text or geometry or granting pixels',()=>{
 const input=fixture(),before=structuredClone({shapes:input.shapes,textBoxes:input.textBoxes});
 const result=bind(input);assert.equal(result.evidence.physicallyGroupedText,1);assert.equal(result.evidence.physicalGroups,1);
 assert.equal(result.textBoxes[0].source.nativeComponentGroupId,'scene-unit-panel');
 assert.equal(result.shapes[0].source.nativeComponentGroupId,'scene-unit-panel');
 assert.equal(result.textBoxes[0].text,input.textBoxes[0].text);assert.deepEqual(result.textBoxes[0].box,input.textBoxes[0].box);
 assert.deepEqual({shapes:input.shapes,textBoxes:input.textBoxes},before);
 assert.equal(result.textBoxes[0].source.pixelOwnership,undefined);assert.equal(JSON.stringify(result).includes('rgba'),false);
});

test('a source-measured body and label survive final hybrid cleanup without an interior picture',()=>{
 const input=fixture(),result=bind(input),page={shapes:result.shapes,images:input.images,textBoxes:result.textBoxes};
 const before=structuredClone(page),receipt=result.sealGroups(page);
 const combined=combineMeasuredSceneGroupReceipts([receipt,{}]);
 assert.equal(retainedSceneGroupMembers(page,combined).size,2);
 ungroupSourceNativeOverlays(page,combined);
 assert.deepEqual(page,before);
 assert.equal(page.shapes[0].source.nativeComponentGroupId,'scene-unit-panel');
 assert.equal(page.textBoxes[0].source.nativeComponentGroupId,'scene-unit-panel');
 // Duplicate valid stage receipts do not duplicate membership or geometry work.
 assert.equal(retainedSceneGroupMembers(page,combineMeasuredSceneGroupReceipts([receipt,receipt])).size,2);
});

test('production finalization carries ordinary measured groups across the empty interior-assembly stage',()=>{
 const input=fixture(),plan={version:1,sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
  objects:[{id:'panel',regionId:'root',kind:'container',box:input.physicalNodes[0].node.box,pictorialContent:'absent'}],relations:[]};
 const budget={used:0},result=finalizeSourceScene({...input,plan,root:process.cwd(),budget,preflight:false,
  validRegions:new Set(['root']),physicalAliases:[],nativeIcons:[]});
 const page={shapes:result.shapes,images:[],textBoxes:result.textBoxes},before=structuredClone(page);
 assert.equal(result.evidence.assembledInteriorGroups,0);
 const receipt=result.sealGroups(page);ungroupSourceNativeOverlays(page,receipt);
 assert.deepEqual(page,before);assert.equal(retainedSceneGroupMembers(page,receipt).size,2);
 assert.equal(budget.used,0,'receipt transfer does not acquire more raster or glyph capacity');
});

test('the physical receipt follows actual expanded outline paint and its label through final cleanup',()=>{
 const input=fixture(),outline={id:'scene-outline-panel',type:'freeform',box:input.physicalNodes[0].node.box,
  style:enclosingRing().style,source:{editable:true}};
 input.shapes.push(outline);
 input.outlinePaints=new Map([[outline.id,{box:outline.box,baseColor:'#112233',parts:[{box:outline.box,
  color:'#334455',segments:enclosingRing().style.freeformSegments}]}]]);
 const result=bind(input),page={shapes:result.shapes,images:input.images,textBoxes:result.textBoxes};
 const receipt=result.sealGroups(page),before=structuredClone(page);
 assert.equal(retainedSceneGroupMembers(page,receipt).size,4);
 ungroupSourceNativeOverlays(page,receipt);assert.deepEqual(page,before);
 assert.ok(page.shapes.every(s=>s.source.nativeComponentGroupId==='scene-unit-panel'));
});

test('missing, copied, edited or foreign members revoke the whole physical receipt',()=>{
 for(const mode of ['missing','copied-page','copied-token','text','shape','foreign']){
  const input=fixture(),result=bind(input);let page={shapes:result.shapes,images:input.images,textBoxes:result.textBoxes};
  const receipt=result.sealGroups(page);
  if(mode==='missing')page.textBoxes=[];
  if(mode==='copied-page')page=structuredClone(page);
  if(mode==='text')page.textBoxes[0].text='Changed';
  if(mode==='shape')page.shapes[0].box={...page.shapes[0].box,x:11};
  if(mode==='foreign')page.shapes.push({...page.shapes[0],id:'foreign'});
  const token=mode==='copied-token'?structuredClone(receipt):receipt;
  assert.equal(retainedSceneGroupMembers(page,combineMeasuredSceneGroupReceipts([token,{}])).size,0,mode);
  ungroupSourceNativeOverlays(page,token);
  assert.ok([...page.shapes,...page.textBoxes].every(p=>p.source.nativeComponentGroupId===undefined),mode);
 }
});

test('empty, unsafe and over-capacity receipt composition does not read hostile controls',()=>{
 const input=fixture(),result=bind(input),page={shapes:result.shapes,images:input.images,textBoxes:result.textBoxes};
 const receipt=result.sealGroups(page);let touched=false;
 const getter=[];Object.defineProperty(getter,'0',{get(){touched=true;throw Error('private');}});
 for(const tokens of [[],[null,{}],new Array(1),getter,new Proxy([receipt],{get(){touched=true;throw Error('private');}}),
  [receipt,receipt,receipt],[new Proxy(receipt,{get(){touched=true;throw Error('private');}})]])
  assert.equal(retainedSceneGroupMembers(page,combineMeasuredSceneGroupReceipts(tokens)).size,0);
 assert.equal(touched,false);
});
test('empty, missing, invalid or moved source evidence cannot be replaced by a fitted text box',()=>{
 const input=fixture();assert.equal(bind({...input,textBoxes:[],physicalNodes:[]}).evidence.physicalGroups,0);
 for(const source of [undefined,{}, {editable:false,evidenceBox:input.textBoxes[0].box},
  {editable:true,evidenceBox:{x:0,y:0,w:20,h:10}}, {editable:true,evidenceBox:{x:30,y:30,w:Infinity,h:10}},
  {editable:true,evidenceBox:{x:30,y:30,w:20,h:10},ocrPolygonPt:[]},
  {editable:true,evidenceBox:{x:30,y:30,w:20,h:10},ocrPolygonPt:[[31,30],[51,30],[51,40],[31,40]]}]){
  input.textBoxes[0].source=source;assert.equal(bind(input).evidence.physicallyGroupedText,0);
 }
 const original=fixture();original.textBoxes[0].box={x:0,y:0,w:5,h:5};
 assert.equal(bind(original).evidence.physicallyMatchedText,1);
});
test('source quadrilaterals reject accessors, proxies, coercion, sparse and self-crossing polygons',()=>{
 const bounds={x:30,y:30,w:20,h:10},good={editable:true,evidenceBox:bounds,ocrPolygonPt:[[30,30],[50,30],[50,40],[30,40]]};
 assert.deepEqual(sourceGroupTextPolygon(good,2,3),[{x:60,y:90},{x:100,y:90},{x:100,y:120},{x:60,y:120}]);
 let touched=false;const accessor={editable:true,get evidenceBox(){touched=true;return bounds;}};
 const sparse=new Array(4);sparse[0]=[30,30];
 for(const source of [null,accessor,new Proxy(good,{get(){touched=true;throw Error('Private source');}}),
  {...good,ocrPolygonPt:sparse},{...good,ocrPolygonPt:[[30,30],[50,40],[50,30],[30,40]]},
  {...good,ocrPolygonPt:[[30,'30'],[50,30],[50,40],[30,40]]},{...good,ocrPolygonPt:new Array(17).fill([30,30])}]){
  assert.equal(sourceGroupTextPolygon(source,1,1),null);
 }assert.equal(touched,false);assert.equal(sourceGroupTextPolygon(good,Infinity,1),null);
});
test('copied, proxy, wrong-raster and stale-box frames cannot authorize grouping',()=>{
 const input=fixture(),node=input.physicalNodes[0].node,polygon=sourceGroupTextPolygon(input.textBoxes[0].source,1,1);
 assert.equal(measuredSceneContainsGroup(input.image,node.portFrame,node.box,polygon),true);
 for(const token of [null,{},structuredClone(node.portFrame),new Proxy(node.portFrame,{})]){
  assert.equal(measuredSceneContainsGroup(input.image,token,node.box,polygon),false);
  assert.equal(measuredSceneGroupBounds(input.image,token),null);
 }
 assert.equal(measuredSceneContainsGroup({...input.image,rgba:Buffer.from(input.image.rgba)},node.portFrame,node.box,polygon),false);
 assert.equal(measuredSceneContainsGroup(input.image,node.portFrame,{...node.box,x:11},polygon),false);
 const box=measuredSceneGroupBounds(input.image,node.portFrame);box.x=0;
 assert.equal(measuredSceneGroupBounds(input.image,node.portFrame).x,10);
});
test('full polygon edges cannot cross a concave source notch or the .75px uncertainty',()=>{
 const owner=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:60,y:100},{x:60,y:40},{x:40,y:40},{x:40,y:100},{x:0,y:100}];
 assert.equal(fullyContainedGroupPolygon(owner,[{x:20,y:20},{x:80,y:20},{x:80,y:80},{x:20,y:80}]),false);
 assert.equal(fullyContainedGroupPolygon(owner,[{x:10,y:10},{x:30,y:10},{x:30,y:30},{x:10,y:30}]),true);
 assert.equal(fullyContainedGroupPolygon(owner,[{x:.5,y:10},{x:30,y:10},{x:30,y:30},{x:.5,y:30}]),false);
});
test('holes, multiple subpaths and open bodies cannot inherit a rectangular grouping frame',()=>{
 const box={x:0,y:0,w:100,h:100},ring=[{type:'moveTo',points:[{x:0,y:0}]},{type:'lnTo',points:[{x:1,y:0}]},
  {type:'lnTo',points:[{x:1,y:1}]},{type:'lnTo',points:[{x:0,y:1}]},{type:'close',points:[]}];
 assert.equal(measuredGroupVertices({box,segments:ring}).length,4);
 for(const segments of [ring.slice(0,-1),[...ring,...ring],Array.from({length:121},()=>ring[0])])
  assert.equal(measuredGroupVertices({box,segments}),null);
 const input=fixture(),token=createMeasuredScenePortFrame(input.image,{box,segments:[...ring,...ring],fill:'#112233'});
 assert.equal(measuredSceneGroupBounds(input.image,token),null);
});
test('certified cubic bodies retain containment without treating endpoint chords as the source edge',()=>{
 const box={x:0,y:0,w:100,h:100},segments=[{type:'moveTo',points:[{x:0,y:.5}]},
  {type:'cubicBezTo',points:[{x:0,y:0},{x:1,y:0},{x:1,y:.5}]},
  {type:'cubicBezTo',points:[{x:1,y:1},{x:0,y:1},{x:0,y:.5}]},{type:'close',points:[]}];
 const vertices=measuredGroupVertices({box,segments});assert.ok(vertices.length>4);
 assert.equal(fullyContainedGroupPolygon(vertices,[{x:40,y:40},{x:60,y:40},{x:60,y:60},{x:40,y:60}]),true);
 assert.equal(fullyContainedGroupPolygon(vertices,[{x:1,y:1},{x:99,y:1},{x:99,y:99},{x:1,y:99}]),false);
});
test('the unique smallest enclosing body owns the label; coincident or intersecting owners fail closed',()=>{
 const input=fixture(),parentBox={x:1,y:1,w:98,h:98};
 input.physicalNodes.push({proposalId:'parent',node:{box:parentBox,portFrame:createMeasuredScenePortFrame(input.image,{box:parentBox,fill:'#EEEEEE'})}});
 input.shapes.unshift({id:'scene-container-parent',box:parentBox,source:{editable:true}});
 assert.equal(bind(input).textBoxes[0].source.nativeComponentGroupId,'scene-unit-panel');
 for(const box of [{x:10,y:10,w:80,h:80},{x:20,y:20,w:60,h:70}]){
  const f=fixture();f.physicalNodes.push({proposalId:'other',node:{box,portFrame:createMeasuredScenePortFrame(f.image,{box,fill:'#FFFFFF'})}});
  assert.equal(bind(f).evidence.physicallyGroupedText,0);
 }
});
test('grouping refuses an overlapping later shape, image, native text or rotated drawable',()=>{
 for(const mode of ['shape','image','text','rotation','stroke']){
  const input=fixture(),item={id:'external',box:{x:35,y:32,w:10,h:5}};
  if(mode==='shape')input.shapes.push(item);
  if(mode==='image')input.images.push(item);
  if(mode==='text')input.textBoxes.unshift(item);
  if(mode==='rotation')input.shapes.push({...item,box:{x:48,y:22,w:4,h:25},rotation:45});
  if(mode==='stroke')input.shapes.push({...item,box:{x:51,y:32,w:0,h:5},style:{strokeWidthPt:4}});
  const result=bind(input);assert.equal(result.evidence.physicallyMatchedText,1,mode);
  assert.equal(result.evidence.physicallyGroupedText,0,mode);assert.equal(result.evidence.physicalGroupPaintConflicts,1,mode);
 }
});
test('native text outline paint cannot cross an external drawable when its label is grouped',()=>{
 for(const width of [.5,6,12]){
  const input=fixture(),gap=width/4;
  input.textBoxes[0].style={textWarp:'textPlain',textOutlineColor:'#112233',textOutlineWidthPt:width};
  input.shapes.push({id:'external',box:{x:50+gap,y:32,w:5,h:5}});
  const before=structuredClone(input.textBoxes),result=bind(input);
  assert.equal(result.evidence.physicallyMatchedText,1);
  assert.equal(result.evidence.physicallyGroupedText,0);
  assert.equal(result.evidence.physicalGroupPaintConflicts,1);
  assert.deepEqual(result.textBoxes,before);
 }
});
test('external outlined text and rotated outlined paint participate in order checks',()=>{
 const input=fixture();
 input.textBoxes.push({id:'external',box:{x:51,y:32,w:5,h:5},style:{textWarp:'textPlain',
  textOutlineColor:'#000000',textOutlineWidthPt:6}});
 assert.equal(bind(input).evidence.physicallyGroupedText,0);
 const rotated=fixture();
 rotated.textBoxes[0]={...rotated.textBoxes[0],box:{x:40,y:30,w:20,h:10},rotation:90,
  style:{textWarp:'textPlain',textOutlineColor:'#000000',textOutlineWidthPt:6}};
 rotated.shapes.push({id:'external',box:{x:57,y:32,w:2,h:5}});
 assert.equal(bind(rotated).evidence.physicallyGroupedText,0);
});
test('absent outline and separate outlined paint preserve the ordinary grouping contract',()=>{
 for(const style of [undefined,{}, {textWarp:'textPlain',textOutlineColor:'#000000',textOutlineWidthPt:12}]){
  const input=fixture();input.textBoxes[0].style=style;
  input.shapes.push({id:'external',box:{x:60,y:32,w:5,h:5}});
  assert.equal(bind(input).evidence.physicallyGroupedText,1);
 }
});
test('invalid or unsafe outline input cannot authorize a physical group or execute a getter',()=>{
 for(const width of [0,-1,13,Infinity,NaN,'6']){
  const input=fixture();input.textBoxes[0].style={textWarp:'textPlain',textOutlineColor:'#000000',textOutlineWidthPt:width};
  input.shapes.push({id:'external',box:{x:60,y:32,w:5,h:5}});
  assert.throws(()=>bind(input),TypeError);
 }
 let touched=false;
 for(const style of [{get strokeWidthPt(){touched=true;throw Error('private');}},
  new Proxy({},{get(){touched=true;throw Error('private');}})]){
  const input=fixture();input.textBoxes[0].style=style;
  input.shapes.push({id:'external',box:{x:60,y:32,w:5,h:5}});
  assert.throws(()=>bind(input),TypeError);
 }
 assert.equal(touched,false);
});
test('existing native groups, unsafe ids and intermediate paint do not lose their controls',()=>{
 for(const mode of ['text-group','shape-group','id','outline-order']){
  const input=fixture();
  if(mode==='text-group')input.textBoxes[0].source.nativeComponentGroupId='existing';
  if(mode==='shape-group')input.shapes[0].source.nativeComponentGroupId='existing';
  if(mode==='id')input.physicalNodes[0].proposalId='bad\nidentifier';
  if(mode==='outline-order')input.shapes.push({id:'outside',box:{x:5,y:5,w:90,h:90}},
   {id:'scene-outline-panel',box:input.shapes[0].box,source:{editable:true}});
  const before=structuredClone({shapes:input.shapes,textBoxes:input.textBoxes}),result=bind(input);
  assert.equal(result.evidence.physicallyGroupedText,0);assert.deepEqual({shapes:result.shapes,textBoxes:result.textBoxes},before);
 }
});
test('the normal 88 admitted-body boundary stays deterministic and grouping tests enter unified CI',()=>{
 const f=fixture();f.physicalNodes=Array.from({length:88},(_,i)=>({...f.physicalNodes[0],proposalId:'alias-'+i}));
 assert.equal(bind(f).evidence.physicalGroups,0);
 const {discoverTestFiles}=require('../scripts/test-sharded'),{IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 assert.ok(discoverTestFiles(require('node:path').resolve(__dirname,'..'),'all').some(p=>p.file.endsWith('source-scene-physical-groups.test.js')));
 for(const name of ['source-scene-group-containment','source-scene-physical-groups'])
  assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/'+name+'.js'));
});
test('derived geometry exhaustion leaves incomplete ownership flat and never spends a source pixel allowance',()=>{
 const f=fixture();f.physicalNodes=Array.from({length:88},(_,i)=>({...f.physicalNodes[0],proposalId:'alias-'+i}));
 f.textBoxes=Array.from({length:5000},(_,i)=>({...f.textBoxes[0],id:'label-'+i}));
 const result=bind(f);assert.equal(result.evidence.physicalGroups,0);
 assert.ok(result.evidence.physicalGroupSkippedGeometry>0);assert.ok(result.evidence.physicalGroupGeometryChecks<=4000000);
 assert.deepEqual(result.shapes,f.shapes);assert.deepEqual(result.textBoxes,f.textBoxes);
 const owner=measuredGroupVertices({box:{x:0,y:0,w:100,h:100}}),polygon=[{x:20,y:20},{x:40,y:20},{x:40,y:40},{x:20,y:40}],work={used:3999999,exhausted:false};
 assert.equal(fullyContainedGroupPolygon(owner,polygon,work),false);assert.equal(work.used,3999999);assert.equal(work.exhausted,true);
});

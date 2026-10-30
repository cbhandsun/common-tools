'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {eraseObjectMask}=require('../packages/slideclone-core/archetypes/full-slide-native-residual');
const {eraseMasks}=require('../packages/slideclone-core/scene-plan/residual-primitive-erasure');
const {pointInMask}=require('../packages/slideclone-core/scene-plan/raster-native-detection');
const {encodeNativeFreeformPath}=require('../packages/slideclone-core/scene-plan/native-freeform-path');
const {residualConnectorPath}=require('../packages/slideclone-core/scene-plan/residual-connector-path');
const {createResidualConnectorMaskProjector}=require('../packages/slideclone-core/scene-plan/residual-connector-mask');
const image={width:100,height:100},size={x:0,y:0,w:100,h:100};
const point=(x,y)=>({x,y});
function freeform(segments){return {type:'freeform',box:{x:20,y:20,w:60,h:60},source:{connector:true},
 style:{fill:'none',stroke:'#204060',strokeWidthPt:3,closed:false,freeformPath:encodeNativeFreeformPath(segments)}};}
const move=p=>({type:'moveTo',points:[p]}),line=p=>({type:'lnTo',points:[p]});
const entries=masks=>Array.isArray(masks)?masks:[masks];
const contains=(masks,x,y)=>entries(masks).some(m=>pointInMask(x,y,m));

test('reverse freeform routes preserve off-path diagonal source pixels while retaining common erasure',()=>{
 const item=freeform([move(point(1,0)),line(point(0,1))]);
 const masks=eraseObjectMask(item,image,size);
 assert.equal(contains(masks,35,35),false);assert.equal(contains(masks,50,50),true);
 assert.equal(contains(masks,70,30),false,'the repair cannot add previously unowned erasure');
});

test('bent and rounded freeform routes never erase their bounding-box diagonal',()=>{
 for(const segments of [[move(point(0,0)),line(point(1,0)),line(point(1,1))],
  [move(point(0,0)),line(point(.75,0)),{type:'cubicBezTo',points:[point(.9,0),point(1,.1),point(1,.25)]},line(point(1,1))]]){
  const masks=eraseObjectMask(freeform(segments),image,size);
  assert.equal(contains(masks,50,50),false);assert.equal(contains(masks,20,20),true);assert.equal(contains(masks,80,80),true);
 }
});

test('actual preset frame and quarter-turn rotation constrain erasure rather than route metadata',()=>{
 const item={type:'line',box:{x:20,y:20,w:60,h:60},source:{connector:true,nativeRoutePoints:[point(20,20),point(80,80)]},
  style:{connectorType:'elbow-3',connectorAdjustments:[100000],connectorFrame:{x:20,y:20,w:60,h:60,rotationDeg:90,flipH:false,flipV:false}}};
 const masks=eraseObjectMask(item,image,size);
 assert.equal(contains(masks,50,50),false);assert.equal(contains(masks,80,20),false);
 assert.equal(contains(masks,20,20),false);assert.equal(contains(masks,80,80),true);
});

test('the full residual preserves every source byte outside the intersection of old and actual route masks',()=>{
 const item=freeform([move(point(1,0)),line(point(0,1))]),masks=entries(eraseObjectMask(item,image,size));
 const source={...image,rgba:Buffer.alloc(40000)};
 for(let n=0;n<10000;n++)source.rgba.set([n%251,n%239,n%227,255],n*4);
 const before=Buffer.from(source.rgba),residual=eraseMasks(source,masks,{transparent:true});
 const old={kind:'line',x1:20,y1:20,x2:80,y2:80,width:8};
 let erased=0;
 for(let y=0;y<100;y++)for(let x=0;x<100;x++){
  const i=(y*100+x)*4;
  if(residual.rgba[i+3]===0){erased++;assert.equal(pointInMask(x,y,old),true);assert.ok(Math.abs(x+y-100)<=4*Math.SQRT2+1e-9);}
  else assert.deepEqual(residual.rgba.subarray(i,i+4),source.rgba.subarray(i,i+4));
 }
 assert.ok(erased>0);assert.deepEqual(source.rgba,before);
});

test('compact and expanded cubic or quadratic paths agree under flips, rotation and nonuniform scaling',()=>{
 for(const kind of ['cubicBezTo','quadBezTo']){
  const curve={type:kind,points:kind==='cubicBezTo'?[point(.1,.9),point(.9,.1),point(1,1)]:[point(1,0),point(1,1)]};
  const item=freeform([move(point(0,0)),curve]);item.style.flipH=true;item.style.rotationDeg=90;
  const before=structuredClone(item),compact=residualConnectorPath(item,{x:2,y:1});
  const expanded=structuredClone(item);delete expanded.style.freeformPath;expanded.style.freeformSegments=[move(point(0,0)),curve];
  assert.deepEqual(residualConnectorPath(expanded,{x:2,y:1}),compact);assert.deepEqual(item,before);
  assert.ok(compact.length>2&&compact.length<=4096);
  assert.ok(Math.abs(compact[0].x-160)<1e-8&&Math.abs(compact[0].y-80)<1e-8);
  assert.ok(Math.abs(compact.at(-1).x-40)<1e-8&&Math.abs(compact.at(-1).y-20)<1e-8);
 }
});

test('all supported native elbows and signed straight frames retain the old erasure ceiling',()=>{
 for(const preset of ['straight','elbow','elbow-2','elbow-3','elbow-4','elbow-5'])for(const rotationDeg of [0,90,180,270])for(const flipH of [false,true]){
  const item={type:'connector',box:{x:80,y:20,w:-60,h:60},style:{connectorType:preset,
   connectorFrame:{x:20,y:20,w:60,h:60,rotationDeg,flipH,flipV:false}}};
  const before=structuredClone(item),masks=entries(eraseObjectMask(item,image,size));
  const old={kind:'line',x1:80,y1:20,x2:20,y2:80,width:8};
  for(const m of masks)for(let x=m.x;x<m.x+m.w;x++)assert.equal(pointInMask(x,m.y,old),true);
  assert.deepEqual(item,before);
 }
 const plain=eraseObjectMask({type:'line',box:{x:80,y:20,w:-60,h:60}},image,size);
 assert.deepEqual(plain,{kind:'line',x1:80,y1:20,x2:20,y2:80,width:8});
 const vertical=residualConnectorPath({type:'line',box:{x:30,y:40,w:0,h:-20}}, {x:1,y:1});
 assert.deepEqual(vertical,[point(30,40),point(30,20)]);
});

test('invalid, ambiguous, closed, multiple and absent route geometries fail without diagonal fallback',()=>{
 const original=freeform([move(point(0,0)),line(point(1,1))]);
 for(const change of [i=>{delete i.style.freeformPath;},i=>{i.style.freeformPath='private-value';},
  i=>{i.style.freeformSegments=[];},i=>{i.style.closed=true;},i=>{i.style.fill='#ffffff';},
  i=>{i.style.freeformPath='[[0,0,0]]';},i=>{i.style.freeformPath='[[0,0,0],[4]]';},
  i=>{i.style.freeformPath='[[0,0,0],[1,1,1],[0,0,0],[1,1,0]]';},
  i=>{i.style.freeformPath='[[0,0,0],[1,-1,1]]';},i=>{i.style.flipV='yes';},
  i=>{i.style.rotationDeg=Infinity;},i=>{i.type='rect';},i=>{i.box.w=0;}]){
  const item=structuredClone(original);change(item);
  assert.throws(()=>eraseObjectMask(item,image,size),e=>e instanceof TypeError||/geometry is invalid/.test(e.message));
 }
 for(const connectorType of ['curved-3','custom-path','unknown'])assert.throws(()=>eraseObjectMask({type:'line',box:original.box,style:{connectorType}},image,size),/unsupported/);
 for(const changes of [{connectorFrame:{x:0,y:0,w:-1,h:2}},{connectorFrame:{x:0,y:0,w:2,h:2,rotationDeg:45}},
  {connectorType:'elbow-3',connectorAdjustments:[]},{connectorType:'straight',connectorAdjustments:[10]},
  {connectorType:'elbow-3',startAnchor:{elementId:'unresolved'}}]){
  assert.throws(()=>eraseObjectMask({type:'line',box:original.box,style:changes},image,size));
 }
});

test('path boundaries reject accessors, proxies, sparse collections and malformed controls without reading them',()=>{
 let calls=0;
 const hostile={};Object.defineProperty(hostile,'x',{get(){calls++;throw Error('private-value');}});
 const original=freeform([move(point(0,0)),line(point(1,1))]);
 for(const value of [null,{},new Proxy(original,{}),{...original,box:hostile},{...original,style:new Proxy(original.style,{})}]){
  assert.throws(()=>residualConnectorPath(value,{x:1,y:1}),TypeError);
 }
 for(const value of [hostile,new Proxy(point(1,1),{}),point(NaN,0),point(2,1)]){
  const item=structuredClone(original);delete item.style.freeformPath;item.style.freeformSegments=[move(point(0,0)),line(value)];
  assert.throws(()=>residualConnectorPath(item,{x:1,y:1}),TypeError);
 }
 const sparse=structuredClone(original);delete sparse.style.freeformPath;sparse.style.freeformSegments=Array(2);sparse.style.freeformSegments[0]=move(point(0,0));
 assert.throws(()=>residualConnectorPath(sparse,{x:1,y:1}),TypeError);
 assert.equal(calls,0);
});

test('dimension, scale and mask inputs reject hostile values and capture dimensions without mutable aliases',()=>{
 const item=freeform([move(point(0,0)),line(point(1,1))]);let calls=0;
 const getter=(obj,key)=>Object.defineProperty(obj,key,{get(){calls++;return 1;}});
 for(const input of [null,new Proxy({x:1,y:1},{}),getter({y:1},'x')])assert.throws(()=>residualConnectorPath(item,input),TypeError);
 for(const input of [null,new Proxy(image,{}),getter({height:100},'width')])assert.throws(()=>createResidualConnectorMaskProjector(input,size),TypeError);
 for(const input of [null,new Proxy(size,{}),getter({h:100},'w')])assert.throws(()=>createResidualConnectorMaskProjector(image,input),TypeError);
 const im={...image},slide={...size},project=createResidualConnectorMaskProjector(im,slide),mask={kind:'line',x1:20,y1:20,x2:80,y2:80,width:8};
 const original=project(item,mask);im.width=1;slide.w=1;assert.deepEqual(project(item,mask),original);
 for(const input of [null,new Proxy(mask,{}),getter({...mask},'width')])assert.throws(()=>project(item,input),TypeError);
 assert.equal(calls,0);
});

test('sparse or symbolic preset adjustments and unresolved anchored frames cannot masquerade as actual drawing geometry',()=>{
 const sparse=Array(1);sparse[Symbol('hidden')]=50000;
 for(const connectorAdjustments of [sparse,Array(1),[undefined],[null],Object.assign([50000],{extra:2})]){
  assert.throws(()=>residualConnectorPath({type:'line',box:{x:20,y:20,w:60,h:60},style:{connectorType:'elbow-3',connectorAdjustments}}, {x:1,y:1}),TypeError);
 }
 assert.throws(()=>eraseObjectMask({type:'line',box:{x:20,y:20,w:60,h:60},style:{flipH:true,
  startAnchor:{elementId:'a',side:'bottom',position:.5},endAnchor:{elementId:'b',side:'top',position:.5}}},image,size),/anchors require/);
});

test('Office path, transform and rotation quantization are applied in the writer order',()=>{
 const item=freeform([move(point(0,0)),line(point(1,1))]);item.box={x:1/25400,y:3/25400,w:20,h:20};
 const actual=residualConnectorPath(item,{x:1,y:1});
 for(const [i,p]of [point(0,2/12700),point(20,20+2/12700)].entries())assert.ok(Math.hypot(actual[i].x-p.x,actual[i].y-p.y)<1e-12);
 const noRotation=freeform([move(point(0,0)),line(point(1,1))]);noRotation.box={x:0,y:0,w:16000,h:16000};
 noRotation.style.rotationDeg=.001;assert.deepEqual(residualConnectorPath(noRotation,{x:1,y:1}),[point(0,0),point(16000,16000)]);
 const roundRotation=structuredClone(noRotation);
 const equivalent=structuredClone(noRotation);equivalent.style.rotationDeg=.002;
 // Exact ties in binary floating point are rounded by the same .NET rule;
 // a non-tie sub-unit value has the same serialized DrawingML angle.
 roundRotation.style.rotationDeg=360.002+.1/60000;
 const a=residualConnectorPath(roundRotation,{x:1,y:1}),b=residualConnectorPath(equivalent,{x:1,y:1});
 for(let i=0;i<a.length;i++)assert.ok(Math.hypot(a[i].x-b[i].x,a[i].y-b[i].y)<1e-8);
});

test('text, independent native fill and overlapping routes preserve final alpha monotonicity in either mask order',()=>{
 const {auditResidualPixelOwnership:audit}=require('../packages/slideclone-core/scene-plan/residual-pixel-ownership');
 const source={...image,rgba:Buffer.alloc(40000)};
 for(let n=0;n<10000;n++)source.rgba.set([240,240,240,255],n*4);
 for(let y=31;y<49;y++)for(let x=43;x<47;x++)source.rgba.set([20,20,20,255],(y*100+x)*4);
 const text={x:37,y:25,w:18,h:30,textInk:{color:[20,20,20],polygon:[[41,29],[49,29],[49,51],[41,51]]}};
 const panel={x:55,y:30,w:10,h:30,sourceFill:[240,240,240]};
 const old={kind:'line',x1:20,y1:20,x2:80,y2:80,width:8};
 const route=freeform([move(point(0,0)),line(point(1,0)),line(point(1,1))]),clipped=entries(eraseObjectMask(route,image,size));
 for(const reverse of [false,true]){
  const beforeMasks=[old,panel,text],afterMasks=[...clipped,panel,text];if(reverse){beforeMasks.reverse();afterMasks.reverse();}
  const before=eraseMasks(source,beforeMasks,{transparent:true}),after=eraseMasks(source,afterMasks,{transparent:true});
  assert.equal(audit({source,residual:after,masks:afterMasks}).passed,true);
  let restored=0;
  for(let i=0;i<source.rgba.length;i+=4){assert.ok(after.rgba[i+3]>=before.rgba[i+3]);if(after.rgba[i+3]>before.rgba[i+3])restored++;}
  assert.ok(restored>0);
  assert.equal(after.rgba[(40*100+60)*4+3],0,'independent matching fill retains its own erasure');
  assert.deepEqual(Array.from(after.rgba.subarray((40*100+44)*4,(40*100+44)*4+4)),[240,240,240,255],'glyph background is restored without a new transparent hole');
 }
});

test('empty intersections and collapsed curves are bounded without inventing source ownership',()=>{
 const item=freeform([move(point(1,0)),line(point(1,0))]);
 const project=createResidualConnectorMaskProjector(image,size);
 assert.deepEqual(project(item,{kind:'line',x1:20,y1:20,x2:20,y2:30,width:1}),[]);
 for(const badImage of [{width:0,height:1},{width:16385,height:1},{width:10000,height:10000}])assert.throws(()=>createResidualConnectorMaskProjector(badImage,size),TypeError);
 for(const width of [0,-1,NaN,Infinity])assert.throws(()=>project(item,{kind:'line',x1:20,y1:20,x2:80,y2:80,width}),TypeError);
});

test('path, mask and cumulative page work ceilings fail closed',()=>{
 const original=freeform([move(point(0,0)),line(point(1,1))]);
 const excessive=structuredClone(original);delete excessive.style.freeformPath;excessive.style.freeformSegments=Array(121).fill(line(point(1,1)));
 assert.throws(()=>residualConnectorPath(excessive,{x:1,y:1}),/invalid/);
 const project=createResidualConnectorMaskProjector({width:100,height:4000},{w:100,h:4000});
 const item=freeform([move(point(0,0)),line(point(1,1))]);item.box={x:0,y:0,w:100,h:4000};
 const legacy={kind:'line',x1:0,y1:0,x2:100,y2:4000,width:8};
 let accepted=0;
 assert.throws(()=>{for(let i=0;i<101;i++){project(item,legacy);accepted++;}},/page pixel budget/);
 assert.ok(accepted>0&&accepted<101,'one page shares one ledger');
 const separate=createResidualConnectorMaskProjector({width:100,height:4000},{w:100,h:4000});assert.ok(separate(item,legacy).length>0);
 const split=freeform([move(point(0,0)),line(point(0,1)),line(point(1,1)),line(point(1,0))]);split.box={x:43,y:0,w:14,h:16000};
 const maskCount=createResidualConnectorMaskProjector({width:100,height:16000},{w:100,h:16000});
 assert.throws(()=>maskCount(split,{kind:'line',x1:50,y1:0,x2:50,y2:16000,width:8}),/mask count exceeds/);
 const curves=freeform([move(point(0,0)),...Array.from({length:100},()=>({type:'cubicBezTo',points:[point(1,0),point(0,1),point(1,1)]}))]);
 assert.throws(()=>residualConnectorPath(curves,{x:10000,y:10000}),RangeError);
});

test('real frozen auto and reroutable drawing geometries preserve the confirmed white-wedge source points',()=>{
 const fixture=require('./fixtures/residual-connector-geometry.json');
 assert.equal(fixture.cases.length,4);
 for(const row of fixture.cases){
  const before=structuredClone(row.item),masks=eraseObjectMask(row.item,{width:1086,height:1448},{x:0,y:0,w:960,h:1280});
  for(const [x,y]of row.preserved)assert.equal(contains(masks,x,y),false,row.mode+' '+row.id);
  assert.deepEqual(row.item,before);
 }
});

test('the normal full-slide builder publishes the constrained residual and rejects invalid paths before output',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {readPng,writePng}=require('../packages/slideclone-core/png');
 const {createFullSlideResidualBuilder}=require('../packages/slideclone-core/archetypes/full-slide-native-residual');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'connector-residual-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png'),outputFile=path.join(root,'result.png'),source={...image,rgba:Buffer.alloc(40000,255)};
 for(let n=0;n<10000;n++)source.rgba.set([220+n%25,210+n%35,200+n%45,255],n*4);writePng(sourceFile,source);
 const item=freeform([move(point(1,0)),line(point(0,1))]),request={sourceFile,outputFile,objects:[item],slideSize:size};
 const build=createFullSlideResidualBuilder({readPng,writePng,eraseMasks}),before=fs.readFileSync(sourceFile);
 const result=await build(request),actual=readPng(outputFile);
 assert.equal(result.pixelOwnership.passed,true);assert.equal(actual.rgba[(35*100+35)*4+3],255);assert.equal(actual.rgba[(50*100+50)*4+3],0);
 assert.deepEqual(fs.readFileSync(sourceFile),before);
 const invalid=path.join(root,'invalid.png');item.style.freeformPath='[[0,0,0]]';
 await assert.rejects(build({...request,outputFile:invalid}),/path is empty/);assert.equal(fs.existsSync(invalid),false);
});

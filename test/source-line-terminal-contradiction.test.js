'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSolidAtomSourceFilter}=require('../packages/slideclone-core/scene-plan/visual-atom-source-contradiction');
const {createVisualAtomNativeShapes}=require('../packages/slideclone-core/scene-plan/visual-atom-native-reconstruction');
const size={widthPt:100,heightPt:80};
const raster=()=>({width:100,height:80,rgba:Buffer.alloc(100*80*4,255)});
function paint(image,x,y,w,h,rgb=[51,102,153],alpha=255){
 for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)image.rgba.set([...rgb,alpha],(yy*image.width+xx)*4);
}
const line=(box={x:10,y:20,w:30,h:0},style={},source)=>({type:'line',box,
 style:{stroke:'#336699',strokeWidthPt:2,connectorType:'straight',...style},...(source?{source}:{})});

test('a supported middle cannot authorize painting a background-only line terminal',()=>{
 const image=raster();paint(image,14,19,22,2);
 const result=createSolidAtomSourceFilter(image,size).inspectShape(line());
 assert.equal(result.retained,false);
 assert.equal(result.reason,'source-line-terminal-contradicted');
});

test('both terminal strips are checked for horizontal, vertical and reversed lines',()=>{
 for(const reverse of [false,true])for(const vertical of [false,true])for(const missingStart of [false,true]){
  const image=raster(),lo=missingStart?12:10,hi=missingStart?40:38;
  if(vertical)paint(image,19,lo,2,hi-lo);else paint(image,lo,19,hi-lo,2);
  const a=reverse?40:10,delta=reverse?-30:30;
  const shape=line(vertical?{x:20,y:a,w:0,h:delta}:{x:a,y:20,w:delta,h:0});
  assert.equal(createSolidAtomSourceFilter(image,size).inspectShape(shape).retained,false);
 }
});

test('complete source lines and exact endpoint ink retain their original admission',()=>{
 const image=raster();paint(image,10,19,30,2);
 assert.equal(createSolidAtomSourceFilter(image,size).inspectShape(line()).retained,true);
 // A cap with real line ink must not be rejected because its other cells are pale.
 const mixed=raster();paint(mixed,10,19,30,2);
 paint(mixed,10,20,1,1,[255,255,255]);paint(mixed,39,20,1,1,[255,255,255]);
 assert.equal(createSolidAtomSourceFilter(mixed,size).inspectShape(line()).retained,true);
});

test('source coordinates honor independent slide-axis scales',()=>{
 const image=raster();paint(image,14,19,22,2);
 const shape=line({x:20,y:80,w:60,h:0},{strokeWidthPt:4});
 assert.equal(createSolidAtomSourceFilter(image,{widthPt:200,heightPt:320}).inspectShape(shape).retained,false);
});

test('nonuniform or transparent independent flanks supply no terminal contradiction',()=>{
 const uneven=raster();paint(uneven,14,19,22,2);paint(uneven,10,21,30,2,[220,230,240]);
 assert.equal(createSolidAtomSourceFilter(uneven,size).inspectShape(line()).retained,true);
 const alpha=raster();paint(alpha,14,19,22,2);paint(alpha,10,21,30,2,[255,255,255],0);
 assert.equal(createSolidAtomSourceFilter(alpha,size).inspectShape(line()).retained,true);
});

test('nonflat, arrowed, transformed and semantically bound lines stay outside terminal scope',()=>{
 const image=raster();paint(image,14,19,22,2);
 for(const style of [{lineCap:'round'},{lineCap:'square'},{endArrow:'triangle'},
  {startArrow:'triangle'},{rotationDeg:90},{rotation:90},{rotate:90},{flipH:true},
  {connectorType:'elbow-3'},{connectorFrame:{x:10,y:10,w:30,h:20,rotationDeg:90}}]){
  assert.equal(createSolidAtomSourceFilter(image,size).inspectShape(line(undefined,style)).retained,true);
 }
 for(const source of [{fromAtomId:'a'},{toAtomId:'b'},{visualConnectorId:'edge'},{semanticNativeStructure:true}]){
  assert.equal(createSolidAtomSourceFilter(image,size).inspectShape(line(undefined,{},source)).retained,true);
 }
});

test('production rejects the entire contradicted atom before emission and retains its source layer',()=>{
 const image=raster();paint(image,14,18,22,4);
 const proposal={id:'proposal',kind:'grid-line-candidate',box:{x:10,y:18,w:30,h:4},
  color:'#336699',density:.94,nativeCandidate:true,shapeHint:'grid-line-horizontal'};
 const layer={id:'layer',box:{x:0,y:0,w:100,h:80},source:{detector:'diagram-underlay',dropErasedResidualAfterNativeRebuild:true,
  layer:{layerType:'table-zone',recommendedAction:'attempt-native-reconstruction',diagramUnderstanding:{
   archetype:'generic-node-diagram',confidence:.9,nativeReadiness:'native-rebuild',visualAtoms:[proposal]}}}};
 const before=Buffer.from(image.rgba),shapes=createVisualAtomNativeShapes([layer],image,size);
 assert.equal(shapes.length,0);
 assert.equal(layer.source.visualAtomObjectified,false);
 assert.equal(layer.source.objectifiedVisualAtoms,0);
 assert.equal(layer.source.visualAtomFullyObjectified,false);
 assert.equal(layer.source.dropErasedResidualAfterNativeRebuild,false);
 assert.equal(layer.source.solidAtomSourceContradictions[0].reason,'source-line-terminal-contradicted');
 assert.deepEqual(image.rgba,before);
});

test('terminal regression is included in the unified unit suite',()=>{
 assert.ok(require('../scripts/test-suites').includesSuite(__filename,'unit'));
});

const {inspectSourceLineTerminals}=require('../packages/slideclone-core/scene-plan/source-line-terminal-contradiction');
test('terminal reads use the shared source allowance and reject before an over-budget scan',()=>{
 const image=raster();paint(image,14,19,22,2);
 const input={image,shape:line(),sx:1,sy:1,remainingPixels:12};
 assert.deepEqual(inspectSourceLineTerminals({...input,remainingPixels:11}),
  {contradicted:false,scannedPixels:0,budgetExceeded:true});
 assert.deepEqual(inspectSourceLineTerminals(input),
  {contradicted:true,scannedPixels:12,budgetExceeded:false});
 assert.equal(input.remainingPixels,12);
});

test('unknown controls, accessors and proxies never invoke user code',()=>{
 const input={image:raster(),shape:line(),sx:1,sy:1,remainingPixels:100};
 for(const controls of [null,{...input,sx:0},{...input,sy:Infinity},{...input,remainingPixels:-1},
  {...input,remainingPixels:4000001},{...input,remainingPixels:1.5}])assert.throws(()=>inspectSourceLineTerminals(controls),TypeError);
 assert.throws(()=>inspectSourceLineTerminals({get image(){assert.fail('must not evaluate controls');}}),TypeError);
 for(const shape of [new Proxy({}, {get(){assert.fail('must not inspect proxy');}}),
  {...line(),get style(){assert.fail('must not evaluate shape');}},
  {...line(),style:new Proxy({}, {get(){assert.fail('must not inspect style');}})},
  {...line(),source:{get fromAtomId(){assert.fail('must not evaluate metadata');}}}]){
  assert.deepEqual(inspectSourceLineTerminals({...input,shape}),{contradicted:false,scannedPixels:0,budgetExceeded:false});
 }
});

test('empty, subpixel and extreme geometry cannot create unsupported terminal evidence',()=>{
 const image=raster(),input={image,sx:1,sy:1,remainingPixels:100};
 for(const shape of [line({x:10,y:20,w:0,h:0}),line({x:10.1,y:20,w:.1,h:0}),
  line({x:-1,y:20,w:30,h:0}),line({x:10,y:20,w:Number.MAX_VALUE,h:0}),
  line(undefined,{strokeWidthPt:Infinity}),line(undefined,{strokeWidthPt:Number.MAX_VALUE})]){
  const result=inspectSourceLineTerminals({...input,shape});
  assert.equal(result.contradicted,false);assert.equal(result.scannedPixels,0);
 }
});

test('minor source-color differences do not create a terminal contradiction',()=>{
 const image=raster();paint(image,10,19,30,2,[240,240,240]);
 paint(image,10,19,1,2,[255,255,255]);paint(image,39,19,1,2,[255,255,255]);
 const shape=line(undefined,{stroke:'#F0F0F0'});
 assert.equal(createSolidAtomSourceFilter(image,size).inspectShape(shape).retained,true);
 assert.equal(inspectSourceLineTerminals({image,shape,sx:1,sy:1,remainingPixels:100}).contradicted,false);
});

test('the real card-edge proposal cannot paint absent endpoints in the frozen source crop',()=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const root=path.join(__dirname,'fixtures/source-line-terminal');
 const fixture=JSON.parse(fs.readFileSync(path.join(root,'card-edge.json'),'utf8'));
 const file=path.join(root,'card-edge.png'),bytes=fs.readFileSync(file);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),fixture.fixtureSha256);
 const image=require('../packages/slideclone-core/png').readPng(file),before=Buffer.from(image.rgba);
 assert.equal(image.width,fixture.box.w);assert.equal(image.height,fixture.box.h);
 const result=createSolidAtomSourceFilter(image,fixture.slideSize).inspectShape(fixture.shape);
 assert.equal(result.retained,false);assert.equal(result.reason,'source-line-terminal-contradicted');
 assert.deepEqual(image.rgba,before);
});

"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createSolidAtomSourceFilter } = require("../packages/slideclone-core/scene-plan/visual-atom-source-contradiction");
const { createVisualAtomNativeShapes } = require("../packages/slideclone-core/scene-plan/visual-atom-native-reconstruction");
const size = { widthPt: 100, heightPt: 80 };
const primitive=(type,box,style={})=>({type,box,style:{fill:'#336699',stroke:'none',strokeWidthPt:0,...style}});
test('speculative ellipses cannot turn sparse caption ink into filled circles',()=>{
 const image=raster(),shape=primitive('ellipse',{x:10,y:10,w:20,h:20});
 paint(image,{x:18,y:12,w:2,h:16},[51,102,153]);
 const result=createSolidAtomSourceFilter(image,size).inspectShape(shape);
 assert.equal(result.retained,false);assert.ok(result.paintError>result.backgroundError);
 for(let y=10;y<30;y++)for(let x=10;x<30;x++)if(((x+.5-20)/10)**2+((y+.5-20)/10)**2<=1)image.rgba.set([51,102,153,255],(y*100+x)*4);
 assert.equal(createSolidAtomSourceFilter(image,size).inspectShape(shape).retained,true);
});
test('actual native line paint must improve source fit along its complete footprint',()=>{
 const image=raster(),shape=primitive('line',{x:10,y:20,w:30,h:0},{stroke:'#336699',strokeWidthPt:2});
 paint(image,{x:10,y:19,w:2,h:2},[51,102,153]);
 assert.equal(createSolidAtomSourceFilter(image,size).inspectShape(shape).retained,false);
 paint(image,{x:10,y:19,w:30,h:2},[51,102,153]);
 assert.equal(createSolidAtomSourceFilter(image,size).inspectShape(shape).retained,true);
 const reversed={...shape,box:{x:40,y:20,w:-30,h:0}};
 assert.equal(createSolidAtomSourceFilter(image,size).inspectShape(reversed).retained,true);
 const scaled={...shape,box:{x:20,y:80,w:60,h:0},style:{...shape.style,strokeWidthPt:4}};
 assert.equal(createSolidAtomSourceFilter(image,{widthPt:200,heightPt:320}).inspectShape(scaled).retained,true);
});
test('primitive rejection has bounded safe input and grants no ownership or completion',()=>{
 const image=raster(),filter=createSolidAtomSourceFilter(image,size),box={x:10,y:10,w:16,h:16};
 paint(image,box,[51,102,153]);const supported=filter.inspectShape(primitive('rect',box));
 assert.equal(supported.retained,true);assert.equal('owned' in supported,false);
 for(const b of [{...box,x:-1},{...box,w:Infinity},{...box,w:0}])assert.equal(filter.inspectShape(primitive('rect',b)).retained,false);
 assert.equal(filter.inspectShape(primitive('roundRect',box,{radiusRatio:{valueOf(){assert.fail('no coercion');}}})).retained,false);
 assert.equal(filter.inspectShape(primitive('rect',box,{opacity:.5})).reason,'outside-scope');
 assert.equal(filter.inspectShape(primitive('freeform',box)).reason,'outside-scope');
 assert.throws(()=>filter.inspectShape({get type(){assert.fail('no getter');}}),TypeError);
 assert.throws(()=>filter.inspectShape(new Proxy({},{})),TypeError);
 assert.equal(filter.inspectShape(primitive('rect',box,{fill:'url(secret)'})).reason,'outside-scope');
 const large={width:600,height:600,rgba:Buffer.alloc(600*600*4,255)},bounded=createSolidAtomSourceFilter(large,{widthPt:600,heightPt:600});
 assert.equal(bounded.inspectShape(primitive('rect',{x:1,y:1,w:598,h:598})).reason,'source-budget');
 assert.equal(bounded.scannedPixels(),0);
 const clear={...image,rgba:Buffer.alloc(image.rgba.length)};
 assert.equal(createSolidAtomSourceFilter(clear,size).inspectShape(primitive('rect',box)).retained,false);
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));
});
const raster = () => ({ width: 100, height: 80, rgba: Buffer.alloc(100 * 80 * 4, 255) });
const atom = (box = { x: 10, y: 10, w: 16, h: 16 }) => ({ id: "proposal", kind: "native-rect-candidate", box,
  color: "#336699", nativeCandidate: true, density: 0.94 });
function paint(image, box, color) {
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    image.rgba.set([...color, 255], (y * image.width + x) * 4);
  }
}
test("a broad color-family density peak cannot paint a fill absent at its location", () => {
  const image = raster(), proposal = atom();
  paint(image, { x: 60, y: 10, w: 16, h: 16 }, [51, 102, 153]);
  const filter = createSolidAtomSourceFilter(image, size);
  assert.deepEqual(filter.inspect(proposal), { retained: false, reason: "fill-absent", scannedPixels: 256, matchingPixels: 0 });
  paint(image, proposal.box, [51, 102, 153]);
  assert.equal(filter.inspect(proposal).retained, true);
});
test("matching source fill containing glyph holes survives without granting ownership", () => {
  const image = raster(), proposal = atom(); paint(image, proposal.box, [51, 102, 153]);
  paint(image, { x: 13, y: 12, w: 6, h: 10 }, [0, 0, 0]);
  const result = createSolidAtomSourceFilter(image, size).inspect(proposal);
  assert.equal(result.retained, true); assert.equal(result.reason, "not-contradicted");
  assert.equal("owned" in result, false);
});

test("density peaks inside uniform panels are not independent rectangles", () => {
  for (const color of [[51, 102, 153], [180, 210, 235]]) {
    const image = raster(), proposal = { ...atom(), color: `#${color.map(c => c.toString(16).padStart(2, "0")).join("")}`,
      source: { detector: "dense-linked-node-visual-atom", method: "density-peak" } };
    paint(image, { x: 0, y: 0, w: 100, h: 80 }, color);
    assert.equal(createSolidAtomSourceFilter(image, size).inspect(proposal).retained, false);
    const localized = raster(); paint(localized, proposal.box, color);
    assert.equal(createSolidAtomSourceFilter(localized, size).inspect(proposal).retained, true);
  }
});
test("source mapping uses both actual slide dimensions", () => {
  const image = raster(); paint(image, { x: 10, y: 40, w: 16, h: 16 }, [51, 102, 153]);
  const filter = createSolidAtomSourceFilter(image, { widthPt: 200, heightPt: 320 });
  assert.equal(filter.inspect(atom({ x: 20, y: 160, w: 32, h: 64 })).retained, true);
  assert.equal(filter.inspect(atom()).retained, false);
});
test("malformed evidence, transparent pixels and out-of-bounds candidates cannot paint", () => {
  const image = raster(); image.rgba.fill(0);
  const filter = createSolidAtomSourceFilter(image, size);
  for (const proposal of [{ ...atom(), color: "url(secret)" }, atom({ x: -1, y: 0, w: 10, h: 10 }), atom({ x: 1, y: 1, w: Infinity, h: 2 }), atom()]) {
    assert.equal(filter.inspect(proposal).retained, false);
  }
  assert.equal(filter.inspect({ kind: "grid-line-candidate" }).reason, "outside-scope");
  assert.throws(() => createSolidAtomSourceFilter(image, { ...size, heightPt: 0 }), /slide size/);
  assert.throws(() => createSolidAtomSourceFilter({ ...image, rgba: Buffer.alloc(1) }, size), /pixels/);
});
test("accessors and proxies are rejected without evaluation", () => {
  const filter = createSolidAtomSourceFilter(raster(), size);
  assert.throws(() => filter.inspect({ get kind() { assert.fail("must not read accessor"); } }), /candidate/);
  assert.throws(() => filter.inspect(new Proxy({}, { get() { assert.fail("must not inspect proxy"); } })), /candidate/);
});
test("whole regions and shared scan budget are bounded before scanning", () => {
  const image = { width: 600, height: 600, rgba: Buffer.alloc(600 * 600 * 4, 255) };
  const filter = createSolidAtomSourceFilter(image, { widthPt: 600, heightPt: 600 });
  assert.equal(filter.inspect(atom({ x: 0, y: 0, w: 600, h: 600 })).reason, "source-budget");
  assert.equal(filter.scannedPixels(), 0);
  for (let i = 0; i < 16; i++) filter.inspect(atom({ x: 0, y: 0, w: 500, h: 500 }));
  assert.equal(filter.scannedPixels(), 4000000);
  assert.equal(filter.inspect(atom()).reason, "source-budget");
});
test("production emission rejects unsupported rectangles and preserves raster fallback", () => {
  const image = raster(), proposal = atom();
  const layer = { id: "layer", box: { x: 0, y: 0, w: 100, h: 80 }, source: { detector: "diagram-underlay",
    dropErasedResidualAfterNativeRebuild: true, layer: { layerType: "diagram-zone", recommendedAction: "attempt-native-reconstruction",
      diagramUnderstanding: { archetype: "generic-node-diagram", confidence: 0.9, nativeReadiness: "native-rebuild", visualAtoms: [proposal] } } } };
  assert.equal(createVisualAtomNativeShapes([layer], image, size).length, 0);
  assert.equal(layer.source.dropErasedResidualAfterNativeRebuild, false);
  assert.equal(layer.source.visualAtomFullyObjectified, false);
  assert.equal(layer.source.solidAtomSourceContradictions[0].reason, "fill-absent");
});
test('production rejects source-contradicted ellipse paint without dropping its source layer',()=>{
 const image=raster(),proposal={...atom(),kind:'native-ellipse-candidate'};
 paint(image,{x:17,y:12,w:2,h:10},[51,102,153]);
 const layer={id:'source-layer',box:{x:0,y:0,w:100,h:80},source:{detector:'diagram-underlay',
  dropErasedResidualAfterNativeRebuild:true,layer:{layerType:'diagram-zone',recommendedAction:'attempt-native-reconstruction',
   diagramUnderstanding:{archetype:'generic-node-diagram',confidence:.9,nativeReadiness:'native-rebuild',visualAtoms:[proposal]}}}};
 assert.equal(createVisualAtomNativeShapes([layer],image,size).length,0);
 assert.equal(layer.source.visualAtomObjectified,false);assert.equal(layer.source.objectifiedVisualAtoms,0);
 assert.equal(layer.source.visualAtomFullyObjectified,false);assert.equal(layer.source.dropErasedResidualAfterNativeRebuild,false);
 assert.equal(layer.source.solidAtomSourceContradictions[0].reason,'source-paint-contradicted');
});
test('large rejected paint diagnostics remain bounded deck transport values',()=>{
 const image={width:500,height:500,rgba:Buffer.alloc(500*500*4,255)};
 const result=createSolidAtomSourceFilter(image,{widthPt:500,heightPt:500}).inspectShape(primitive('ellipse',{x:20,y:20,w:400,h:400}));
 assert.equal(result.retained,false);assert.ok(result.paintError<=255);assert.equal(result.backgroundError,0);
 assert.ok(result.paintCoverage>0&&result.paintCoverage<=1);
 const {validateDeckIrEnvelope}=require('../packages/slideclone-core/deck-ir-tree');
 assert.doesNotThrow(()=>validateDeckIrEnvelope({version:'1.0',slideSize:{widthPt:500,heightPt:500},pages:[{images:[{source:{solidAtomSourceContradictions:[result]}}]}]}));
});

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {validateDeckIrTree} = require("../packages/slideclone-core/deck-ir-tree");

test('deferred scene review audit pixels retain their original shared 4M bound at exact metadata paths',()=>{
 const paths=[['cropPixels'],['deferredRegionalReview','spentBefore'],['deferredRegionalReview','spentAfter'],
  ['deferredRegionalReview','allocation','sheetPixels'],['deferredRegionalReview','allocation','reservedPixels']];
 const make=(parts,value)=>parts.reduceRight((child,key)=>({[key]:child}),value);
 for(const parts of paths){
  const envelope=value=>({meta:{sourceSceneReview:make(parts,value)}});
  for(const value of [0,100001,114242,3613912,3728154,4000000])assert.doesNotThrow(()=>validateDeckIrTree(envelope(value)));
  for(const value of [-1,.5,4000001,NaN,Infinity,null,undefined,'3728154'])assert.throws(()=>validateDeckIrTree(envelope(value)),/invalid number/u);
  for(const other of [make(parts,100001),{sourceSceneReview:make(parts,100001)},
   {pages:[{meta:{sourceSceneReview:make(parts,100001)}}]},
   {meta:{sourceSceneReview:{other:make(parts,100001)}}},
   {meta:{sourceSceneReview:make([...parts,'x'],100001)}}])assert.throws(()=>validateDeckIrTree(other),/invalid number/u);
 }
 let calls=0;const hostile={meta:{sourceSceneReview:{deferredRegionalReview:{allocation:{get sheetPixels(){calls++;throw Error('private');}}}}}};
 assert.throws(()=>validateDeckIrTree(hostile),/data properties/u);assert.equal(calls,0);
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.equal(includesSuite(__filename,suite),true);
});

test('owner review and native finalization counters serialize within their original 4M work bounds only at exact paths',()=>{
 const paths=[['meta','sourceSceneReview','ownerRevisionReview','spentBefore'],['meta','sourceSceneReview','ownerRevisionReview','spentAfter'],
  ...['sheetPixels','reservedPixels','focusPixels'].map(k=>['meta','sourceSceneReview','ownerRevisionReview','allocation',k]),
  ['meta','sourceSceneReview','deferredRegionalReview','allocation','focusPixels'],['meta','nativeRouteSelection','geometryChecks']];
 for(const root of [['source','sourceScene'],['meta','sourceSceneCompilation'],['pages',0,'source','sourceScene']])
  paths.push([...root,'replacedConnectors','checks'],[...root,'outlineAxisRetirements','geometryChecks']);
 const make=(parts,value)=>parts.reduceRight((child,key)=>typeof key==='number'?[child]:{[key]:child},value);
 for(const parts of paths){
  for(const value of [0,100001,1862005,3668448,4000000])assert.doesNotThrow(()=>validateDeckIrTree(make(parts,value)));
  for(const value of [-1,.5,4000001,NaN,Infinity,null,undefined,'1862005'])assert.throws(()=>validateDeckIrTree(make(parts,value)),/invalid number/u);
  for(const other of [make(['wrong',...parts],100001),make([...parts,'x'],100001)])assert.throws(()=>validateDeckIrTree(other),/invalid number/u);
 }
 assert.throws(()=>validateDeckIrTree({box:{geometryChecks:1862005}}),/invalid number/u);
 let reads=0;const hostile={meta:{nativeRouteSelection:{get geometryChecks(){reads++;throw Error('private');}}}};
 assert.throws(()=>validateDeckIrTree(hostile),/data properties/u);assert.equal(reads,0);
});
test('transparent owner inventory counters use exact audit paths and the unchanged 4M source cap',()=>{
 const roots=[audit=>({source:{sourceScene:{openOwners:audit}}}),audit=>({pages:[{source:{sourceScene:{openOwners:audit}}}]}),
  audit=>({meta:{sourceSceneCompilation:{openOwners:audit}}})];
 const keys=['context','units','perimeter','paint','relations','labels','glyphs','background','literal','unaccounted'];
 for(const root of roots)for(const key of ['sourcePixels',...keys]){
  const make=n=>root(key==='sourcePixels'?{sourcePixels:n}:{counts:[{[key]:n}]});
  for(const n of [0,100001,274498,4000000])assert.doesNotThrow(()=>validateDeckIrTree(make(n)));
  for(const n of [-1,.5,4000001,NaN,Infinity,null,undefined,'274498'])assert.throws(()=>validateDeckIrTree(make(n)),/invalid number/u);
 }
 for(const tree of [
  {box:{units:274498}},{openOwners:{counts:[{units:274498}]}},
  {meta:{sourceSceneCompilation:{openOwners:{counts:[{x:274498}]}}}},
  {pages:{0:{source:{sourceScene:{openOwners:{sourcePixels:274498}}}}}},
  {source:{sourceScene:{openOwners:{counts:{0:{units:274498}}}}}},
  {source:{sourceScene:{openOwners:{counts:Array.from({length:25},(_,i)=>({units:i===24?274498:0}))}}}},
 ])assert.throws(()=>validateDeckIrTree(tree),/invalid number/u);
 let reads=0;
 const hostile={meta:{sourceSceneCompilation:{openOwners:{get sourcePixels(){reads++;throw Error('private');}}}}};
 assert.throws(()=>validateDeckIrTree(hostile),/data properties/u);assert.equal(reads,0);
});
test("rejected residual audit counters retain their pixel bounds without granting geometry authority", () => {
  const keys = ["scannedPixels", "ownedPixels", "ownedForegroundPixels", "remainingOwnedForegroundPixels",
    "remainingOwnedBackgroundPixels", "unownedChangedPixels", "remainingTextCorePixels",
    "incorrectTextBackgroundPixels", "unresolvedTextMasks"];
  const make = (key, value) => ({meta:{residualBranchRejected:{code:"RESIDUAL_PIXEL_OWNERSHIP_REJECTED",
    pixelOwnership:{passed:false,[key]:value}}}});
  for (const key of keys) {
    for (const value of [0,100001,4283415,40000000]) {
      const deck = make(key, value);
      assert.doesNotThrow(() => validateDeckIrTree(deck));
      assert.equal(deck.meta.residualBranchRejected.pixelOwnership.passed, false);
    }
    for (const value of [-1,0.5,40000001,NaN,Infinity,"4283415",null,undefined])
      assert.throws(() => validateDeckIrTree(make(key, value)), /invalid number/u);
    for (const deck of [{[key]:100001},{meta:{pixelOwnership:{[key]:100001}}},
      {meta:{residualBranchRejected:{other:{[key]:100001}}}},
      {pages:[{meta:make(key,100001).meta}]},make("x",100001),
      {"meta.residualBranchRejected.pixelOwnership.scannedPixels":100001}])
      assert.throws(() => validateDeckIrTree(deck), /invalid number/u);
  }
  let calls = 0;
  const hostile = make("scannedPixels", 0);
  Object.defineProperty(hostile.meta.residualBranchRejected.pixelOwnership, "scannedPixels", {
    enumerable:true,get(){calls++;return 40000000;}
  });
  assert.throws(() => validateDeckIrTree(hostile), /data properties/u);
  assert.equal(calls, 0);
  const {includesSuite} = require("../scripts/test-suites");
  assert.equal(includesSuite(__filename,"all"),true);
});
test("admitting residual rejection evidence keeps the native quality gate failed", () => {
  const {auditNativeComponentQuality} = require("../packages/slideclone-core/quality/native-component-quality");
  const {residualOwnershipRejection,readResidualOwnershipRejection} = require("../packages/slideclone-core/scene-plan/residual-branch-result");
  const report = {passed:false,scannedPixels:4283415,ownedPixels:964500,ownedForegroundPixels:721774,
    remainingOwnedForegroundPixels:0,remainingOwnedBackgroundPixels:0,unownedChangedPixels:0,
    remainingTextCorePixels:186,incorrectTextBackgroundPixels:0,unresolvedTextMasks:0};
  const evidence = readResidualOwnershipRejection(residualOwnershipRejection(report));
  const deck = {pages:[{shapes:[],images:[]}],meta:{residualBranchRejected:{
    code:"RESIDUAL_PIXEL_OWNERSHIP_REJECTED",pixelOwnership:evidence}}};
  assert.doesNotThrow(() => validateDeckIrTree(deck));
  const quality = auditNativeComponentQuality(deck);
  assert.equal(quality.passed,false);
  assert.equal(quality.metrics.residualViolations,1);
  assert(quality.findings.some(item => item.code === "source-residual-ownership-rejected"));
});
test('physical group work counters keep their existing 4M budget without acquiring coordinate authority',()=>{
 const factories=[n=>({source:{sourceScene:{physicalGroupGeometryChecks:n}}}),
  n=>({pages:[{source:{sourceScene:{physicalGroupGeometryChecks:n}}}]}),
  n=>({meta:{sourceSceneCompilation:{physicalGroupGeometryChecks:n}}})];
 for(const make of factories){
  for(const n of [0,100001,106866,4000000])assert.doesNotThrow(()=>validateDeckIrTree(make(n)));
  for(const n of [-1,.5,4000001,NaN,Infinity,'106866',null,undefined])assert.throws(()=>validateDeckIrTree(make(n)),/invalid number/u);
 }
 for(const value of [{physicalGroupGeometryChecks:106866},{source:{other:{physicalGroupGeometryChecks:106866}}},
  {pages:{0:{source:{sourceScene:{physicalGroupGeometryChecks:106866}}}}},
  {source:{sourceScene:{x:106866}}},{source:{sourceScene:{physicalGroupGeometryChecksOther:106866}}}])
  assert.throws(()=>validateDeckIrTree(value),/invalid number/u);
 let calls=0;const input={source:{sourceScene:{get physicalGroupGeometryChecks(){calls++;throw new Error('private');}}}};
 assert.throws(()=>validateDeckIrTree(input),/data properties/u);assert.equal(calls,0);
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.equal(includesSuite(__filename,suite),true);
});
test("Deck IR admits bounded icon scan counters only at their provenance paths", () => {
  const make = (key, value) => ({ pages: [{ images: [{ source: { sourceIconEvidence: { [key]: value } } }] }] });
  for (const [key, maximum] of [["scannedPixels", 4000000], ["foregroundPixels", 262144]]) {
    for (const value of [0, 100001, maximum]) assert.doesNotThrow(() => validateDeckIrTree(make(key, value)));
    for (const value of [-1, 0.5, NaN, Infinity, maximum + 1, "100001", null]) {
      assert.throws(() => validateDeckIrTree(make(key, value)), /invalid number/);
    }
    assert.throws(() => validateDeckIrTree({ pages: [{ images: [{ source: { other: { [key]: 100001 } } }] }] }), /invalid number/);
    assert.throws(() => validateDeckIrTree({ sourceIconEvidence: { [key]: 100001 } }), /invalid number/);
  }
  assert.throws(() => validateDeckIrTree(make("x", 100001)), /invalid number/);
  let executed = false;
  const request = make("scannedPixels", 0);
  Object.defineProperty(request.pages[0].images[0].source.sourceIconEvidence, "scannedPixels", {
    enumerable: true, get() { executed = true; throw new Error("private"); }
  });
  assert.throws(() => validateDeckIrTree(request), /data properties/);
  assert.equal(executed, false);
});
test("Deck IR bounds semantic curve sample work without relaxing coordinate or foreign metadata limits", () => {
  const make = value => ({meta:{semanticNative:{shapeAdmission:{sourceCurveFit:{sampledPixels:value}}}}});
  const page = value => ({pages:[{source:{semanticNativeStructure:{shapeAdmission:{sourceCurveFit:{sampledPixels:value}}}}}]});
  for (const factory of [make, page]) {
    for (const value of [0,100000,546679,4000000]) assert.doesNotThrow(() => validateDeckIrTree(factory(value)));
    for (const value of [-1,0.5,4000001,NaN,Infinity,null,undefined,"546679"])
      assert.throws(() => validateDeckIrTree(factory(value)), /invalid number/u);
  }
  for (const value of [{sampledPixels:546679}, {meta:{sourceCurveFit:{sampledPixels:546679}}},
    {pages:[{box:{x:546679}}]}, {pages:{0:page(546679).pages[0]}},
    {meta:{semanticNative:{shapeAdmission:{otherFit:{sampledPixels:546679}}}}}])
    assert.throws(() => validateDeckIrTree(value), /invalid number/u);
  const getter = make(0); let calls = 0;
  Object.defineProperty(getter.meta.semanticNative.shapeAdmission.sourceCurveFit, "sampledPixels", {
    enumerable:true, get(){calls++;return 546679;}
  });
  assert.throws(() => validateDeckIrTree(getter), /data properties/u);
  assert.equal(calls, 0);
});
test("Deck IR bounds residual split coverage counts as pixels at the exact source path", () => {
  for (const key of ["foregroundPixelCount","coveredForegroundPixelCount"]) {
    const make=value=>({pages:[{images:[{source:{residualSplitRejected:{[key]:value}}}]}]});
    for(const value of [0,156564,428232,40000000]) assert.doesNotThrow(()=>validateDeckIrTree(make(value)));
    for(const value of [-1,1.5,40000001,NaN,Infinity,null,undefined,"428232"]) assert.throws(()=>validateDeckIrTree(make(value)),/invalid number/u);
    assert.throws(()=>validateDeckIrTree({residualSplitRejected:{[key]:428232}}),/invalid number/u);
    assert.throws(()=>validateDeckIrTree({pages:{0:make(428232).pages[0]}}),/invalid number/u);
    assert.throws(()=>validateDeckIrTree({pages:[{images:[{source:{other:{[key]:428232}}}]}]}),/invalid number/u);
  }
});
test("Deck IR admits bounded residual pixel counts only at image provenance fields", () => {
  const make = value => ({pages:[{images:[{source:{residualForegroundPixelCountAfterVisualAtomErase:value}}]}]});
  for (const value of [0,111205,40000000]) assert.doesNotThrow(()=>validateDeckIrTree(make(value)));
  for (const value of [-1,0.5,40000001,Infinity,NaN,"111205",null,undefined]) assert.throws(()=>validateDeckIrTree(make(value)),/invalid number/u);
  assert.throws(()=>validateDeckIrTree({residualForegroundPixelCountAfterVisualAtomErase:111205}),/invalid number/u);
  assert.throws(()=>validateDeckIrTree({pages:{0:make(111205).pages[0]}}),/invalid number/u);
  assert.throws(()=>validateDeckIrTree({pages:[{images:{0:make(111205).pages[0].images[0]}}]}),/invalid number/u);
  assert.throws(()=>validateDeckIrTree({pages:[{images:[{source:{otherPixelCount:111205}}]}]}),/invalid number/u);
});

test("Deck IR never executes accessors, overridden iteration or serialization hooks", () => {
  let calls = 0;
  const getter = {}; Object.defineProperty(getter, "text", {enumerable:true,get(){calls++;return "private-sentinel";}});
  const indexed = [null]; Object.defineProperty(indexed, "0", {enumerable:true,get(){calls++;return null;}});
  const iteration = [null]; iteration.entries = () => {calls++;return [][Symbol.iterator]();};
  const serializer = {}; Object.defineProperty(serializer, "toJSON", {value(){calls++;return {};}});
  const arraySerializer = [null]; arraySerializer.toJSON = () => {calls++;return [];};
  const iterator = [null]; iterator[Symbol.iterator] = () => {calls++;return [][Symbol.iterator]();};
  for (const input of [getter,indexed,iteration,serializer,arraySerializer,iterator]) {
    assert.throws(() => validateDeckIrTree(input), /editable deck/u);
    assert.equal(calls, 0);
  }
});

test("Deck IR envelope preserves geometry and page limits without mutating JSON data", () => {
  const {validateDeckIrEnvelope} = require("../packages/slideclone-core/deck-ir-tree");
  const make = () => ({version:"1.0",slideSize:{widthPt:960,heightPt:540},pages:[{}]});
  for (const dimension of [72,4000]) {
    const input = make(); input.slideSize = {widthPt:dimension,heightPt:dimension}; input.pages = Array.from({length:50},()=>({}));
    const before = structuredClone(input), admitted = validateDeckIrEnvelope(input);
    assert.equal(admitted.pages, input.pages); assert.equal(admitted.widthPt, dimension); assert.deepEqual(input,before);
  }
  for (const invalid of [null,[],{}, {version:"2.0"}, {...make(),pages:[]}, {...make(),pages:Array(51).fill({})}]) assert.throws(()=>validateDeckIrEnvelope(invalid), /editable input/u);
  for (const invalid of [0,71,4001,Infinity,NaN,"960",null]) {
    const input = make(); input.slideSize.widthPt = invalid;
    assert.throws(()=>validateDeckIrEnvelope(input), /editable deck slideSize/u);
  }
  const hidden = make(); Object.defineProperty(hidden,"version",{value:"1.0",enumerable:false});
  assert.throws(()=>validateDeckIrEnvelope(hidden), /data properties/u);
});

test("Deck IR only accepts dense arrays and plain JSON data records", () => {
  const record = Object.create(null); record.text = "中文";
  assert.doesNotThrow(() => validateDeckIrTree(record));
  const hidden = {}; Object.defineProperty(hidden, "text", {value:"hidden"});
  const symbolKey = {[Symbol("private")]:"value"};
  for (const input of [new Date(),new Map(),new Set(),Buffer.from([1]),Object.create({text:"inherited"}),hidden,symbolKey,Array(1)]) {
    assert.throws(() => validateDeckIrTree(input), /editable deck/u);
  }
});

test("Deck IR rejects proxies before reflection can run traps", () => {
  let calls = 0;
  const proxy = new Proxy({text:"private-sentinel"}, {
    getPrototypeOf(target){calls++;return Reflect.getPrototypeOf(target);},
    ownKeys(target){calls++;return Reflect.ownKeys(target);},
    getOwnPropertyDescriptor(target,key){calls++;return Reflect.getOwnPropertyDescriptor(target,key);}
  });
  const revoked = Proxy.revocable({},{}); revoked.revoke();
  for (const input of [proxy,{child:proxy},revoked.proxy]) {
    assert.throws(() => validateDeckIrTree(input), /editable deck/u);
    assert.equal(calls,0);
  }
  const {validateDeckIrEnvelope} = require("../packages/slideclone-core/deck-ir-tree");
  assert.throws(() => validateDeckIrEnvelope(proxy), /editable (?:deck|input)/u);
  const pages = new Proxy([{}], {get(target,key){calls++;return Reflect.get(target,key);}});
  assert.throws(() => validateDeckIrEnvelope({version:"1.0",slideSize:{widthPt:960,heightPt:540},pages}), /editable input/u);
  assert.throws(() => validateDeckIrEnvelope({version:"1.0",slideSize:{widthPt:960,heightPt:540},pages:revoked.proxy}), /editable input/u);
  assert.equal(calls,0);
});

test("Worker validates header descriptors before reading version, dimensions or pages", () => {
  const {validateDeckIr} = require("../packages/slideclone-worker-adapter/team-worker");
  const os = require("node:os");
  let calls = 0;
  const make = () => ({version:"1.0",slideSize:{widthPt:960,heightPt:540},pages:[{}]});
  for (const field of ["version","slideSize","pages","widthPt","heightPt"]) {
    const deck = make(), target = ["widthPt","heightPt"].includes(field) ? deck.slideSize : deck;
    const value = target[field];
    Object.defineProperty(target,field,{enumerable:true,get(){calls++;return value;}});
    assert.throws(() => validateDeckIr(deck,os.tmpdir()), /editable (?:deck|input)/u);
    assert.equal(calls,0);
  }
});

test("Deck IR preserves valid XML text, whitespace, emoji and input identity", () => {
  const input = {text: "中文\tA\nB\rC 😀 𐀀\ud7ff\ue000\ufffd", metadata: [null, true, false, 100000, -100000]};
  const before = structuredClone(input);
  assert.doesNotThrow(() => validateDeckIrTree(input));
  assert.deepEqual(input, before);
  for (const empty of [null, [], {}, ""]) assert.doesNotThrow(() => validateDeckIrTree(empty));
});

test("Deck IR rejects XML-invalid controls and unpaired surrogates without echoing text", () => {
  const invalid = [...Array.from({length: 32}, (_, index) => index).filter(code => ![9, 10, 13].includes(code)).map(code => String.fromCharCode(code)), "\ufffe", "\uffff", "\ud800", "\udfff", "\ud800A", "\ud800\ud800", "\udc00\ud800"];
  for (const value of invalid) assert.throws(() => validateDeckIrTree({text: "private-sentinel" + value}), error => error.message === "editable deck contains an invalid string");
  assert.doesNotThrow(() => validateDeckIrTree("x".repeat(32768)));
  assert.throws(() => validateDeckIrTree("x".repeat(32769)), /invalid string/u);
});

test("Deck IR retains bounded depth, node count, numeric and property rules", () => {
  for (const value of [undefined, NaN, Infinity, -Infinity, 100001, -100001, 1n, () => 0, Symbol("secret")]) assert.throws(() => validateDeckIrTree(value), /editable deck/u);
  const nested = depth => { let value = null; for (let index=0; index<depth; index++) value={child:value}; return value; };
  assert.doesNotThrow(() => validateDeckIrTree(nested(16)));
  assert.throws(() => validateDeckIrTree(nested(17)), /safe limits/u);
  assert.doesNotThrow(() => validateDeckIrTree(Array(29999).fill(null)));
  assert.throws(() => validateDeckIrTree(Array(30000).fill(null)), /safe limits/u);
  const cycle = {}; cycle.child = cycle;
  assert.throws(() => validateDeckIrTree(cycle), /safe limits/u);
  for (const value of [{text: "a", Text: "b"}, {["x".repeat(129)]:0}, {["bad\0key"]:0}, {["bad\ud800key"]:0}, {["bad\u0001key"]:0}]) assert.throws(() => validateDeckIrTree(value), /editable deck/u);
});

test("Deck IR page-area exception is limited to the exact numeric-index path", () => {
  const ir = {pages:[{reconstruction:{qualityBudget:{metrics:{slideAreaPt2:518400}}}}]};
  assert.doesNotThrow(() => validateDeckIrTree(ir, 518400));
  assert.throws(() => validateDeckIrTree(ir, 518399), /invalid number/u);
  assert.throws(() => validateDeckIrTree({"pages.0.reconstruction.qualityBudget.metrics.slideAreaPt2":518400}, 518400), /invalid number/u);
  assert.throws(() => validateDeckIrTree({pages:{0:ir.pages[0]}}, 518400), /invalid number/u);
  for (const limit of [NaN, Infinity, -1, 16000001, "518400"]) assert.throws(() => validateDeckIrTree(null, limit), /area bound/u);
});

test("scene scan evidence retains the original 4M work cap without changing coordinate admission",()=>{
 for(const value of [0,4000000])for(const tree of [{source:{sourceScene:{sourceScanPixels:value}}},
  {pages:[{source:{sourceScene:{sourceScanPixels:value}}}]},{meta:{sourceSceneCompilation:{sourceScanPixels:value}}}])assert.doesNotThrow(()=>validateDeckIrTree(tree));
 for(const value of [-1,4000001,Infinity,.5,"4000000"])assert.throws(()=>validateDeckIrTree({source:{sourceScene:{sourceScanPixels:value}}}),/invalid number/u);
 for(const tree of [{box:{x:4000000}},{"source.sourceScene.sourceScanPixels":4000000},
  {source:{sourceScanPixels:4000000}},{pages:{0:{source:{sourceScene:{sourceScanPixels:4000000}}}}}])assert.throws(()=>validateDeckIrTree(tree),/invalid number/u);
});

test("Worker rejects unsafe XML strings in consumed fields before building", () => {
  const {validateDeckIr} = require("../packages/slideclone-worker-adapter/team-worker");
  const os = require("node:os");
  const input = () => ({version:"1.0", slideSize:{widthPt:960,heightPt:540},pages:[{pageIndex:0,textBoxes:[{id:"text",text:"中文 😀",box:{x:10,y:10,w:200,h:30}}]}]});
  assert.equal(validateDeckIr(input(), os.tmpdir()).pages, 1);
  for (const update of [
    page => { page.textBoxes[0].text = "private\u0001"; },
    page => { page.textBoxes[0].font = {family:"private\ud800"}; },
    page => { page.speakerNotes = "private\ufffe"; },
    page => { page.citations = [{title:"private\u000b"}]; },
  ]) {
    const deck = input(); update(deck.pages[0]);
    assert.throws(() => validateDeckIr(deck, os.tmpdir()), error => error.message === "editable deck contains an invalid string");
  }
});

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {validateDeckIrTree} = require("../packages/slideclone-core/deck-ir-tree");
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
  const {validateDeckIr} = require("../packages/slideclone-core/team-worker");
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

test("Worker rejects unsafe XML strings in consumed fields before building", () => {
  const {validateDeckIr} = require("../packages/slideclone-core/team-worker");
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

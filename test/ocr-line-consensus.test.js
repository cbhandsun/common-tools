"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {ocrLineRevision,planOcrLineConsensus}=require("../packages/slideclone-core/ocr/ocr-line-consensus");
function fixture() {
  const line={text:"Network I/O,",confidence:0.82,box:{x:40,y:50,w:100,h:20}};
  const observations=[8,16].map((padding,index)=>({cropBox:{x:40-padding,y:50-padding,w:100+padding*2,h:20+padding*2},
    cropHash:String(index+1).repeat(64),provider:"test-ocr",ocr:{lines:[{text:"Network I/O",confidence:0.96+index*0.02,box:{x:padding+1,y:padding+1,w:98,h:18}}]}}));
  return {ocr:{lines:[line]},dimensions:{widthPx:300,heightPx:180},sourceHash:"a".repeat(64),evidence:[{lineIndex:0,revision:ocrLineRevision(line),sourceHash:"a".repeat(64),observations}]};
}
test("source-bound crop agreement proposes text only, preserving geometry and original input",()=>{
  const input=fixture(),before=structuredClone(input),result=planOcrLineConsensus(input);
  assert.equal(result.ocr.lines[0].text,"Network I/O");assert.equal(result.ocr.lines[0].confidence,0.96);
  assert.deepEqual(result.ocr.lines[0].box,input.ocr.lines[0].box);assert.equal(result.changes.length,1);assert.deepEqual(input,before);
});

test("a confirmed wording correction invalidates word proposals bound to the old sequence",()=>{
 const input=fixture();input.ocr.lines[0].wordPositionHints=[{text:input.ocr.lines[0].text,box:{...input.ocr.lines[0].box}}];
 const result=planOcrLineConsensus(input);
 assert.equal(result.ocr.lines[0].text,"Network I/O");
 assert.equal(result.ocr.lines[0].wordPositionHints,undefined);
 const {admitOcrResult}=require("../packages/slideclone-core/ocr/ocr-result-admission");
 assert.doesNotThrow(()=>admitOcrResult(result.ocr,input.dimensions));
});

test("same-text confidence confirmation retains the original source word proposals",()=>{
 const input=fixture();input.ocr.lines[0].wordPositionHints=[{text:input.ocr.lines[0].text,box:{...input.ocr.lines[0].box}}];
 for(const observation of input.evidence[0].observations)observation.ocr.lines[0].text=input.ocr.lines[0].text;
 const result=planOcrLineConsensus(input);
 assert.deepEqual(result.ocr.lines[0].wordPositionHints,input.ocr.lines[0].wordPositionHints);
 const {admitOcrResult}=require("../packages/slideclone-core/ocr/ocr-result-admission");
 assert.doesNotThrow(()=>admitOcrResult(result.ocr,input.dimensions));
});
test("empty OCR or absent evidence preserves source text",()=>{
  const input=fixture();input.evidence=[];assert.equal(planOcrLineConsensus(input).changes.length,0);
  input.ocr.lines=[];assert.equal(planOcrLineConsensus(input).ocr.lines.length,0);
});
for(const [name,change] of [
  ["stale source",i=>{i.evidence[0].sourceHash="b".repeat(64);}],
  ["stale target",i=>{i.ocr.lines[0].box.x++;}],
  ["same crop hash",i=>{i.evidence[0].observations[1].cropHash=i.evidence[0].observations[0].cropHash;}],
  ["same crop geometry",i=>{i.evidence[0].observations[1].cropBox=i.evidence[0].observations[0].cropBox;}],
  ["provider disagreement",i=>{i.evidence[0].observations[1].provider="other-ocr";}],
  ["content disagreement",i=>{i.evidence[0].observations[1].ocr.lines[0].text="Network 1/O";}],
  ["weak confidence",i=>{i.evidence[0].observations[1].ocr.lines[0].confidence=0.949;}],
  ["unrelated wording",i=>{for(const o of i.evidence[0].observations)o.ocr.lines[0].text="Entirely different";}],
  ["missing observation",i=>{i.evidence[0].observations[0].ocr.lines=[];}],
  ["mixed neighboring OCR",i=>{i.evidence[0].observations[0].ocr.lines.push({...i.evidence[0].observations[0].ocr.lines[0],text:"Other"});}],
  ["partial source region",i=>{i.evidence[0].observations[0].cropBox.x=45;}],
  ["foreign text ownership",i=>{i.ocr.lines.push({text:"Neighbor",confidence:0.99,box:{x:150,y:52,w:40,h:18}});}],
  ["unrelated glyph geometry",i=>{i.evidence[0].observations[0].ocr.lines[0].box.w=30;}],
  ["high-confidence original",i=>{i.ocr.lines[0].confidence=0.95;i.evidence[0].revision=ocrLineRevision(i.ocr.lines[0]);}],
  ["weak same-text confidence",i=>{for(const o of i.evidence[0].observations){o.ocr.lines[0].text=i.ocr.lines[0].text;o.ocr.lines[0].confidence=0.899;}}]
]) test(`does not adopt ${name}`,()=>{const input=fixture();change(input);assert.equal(planOcrLineConsensus(input).changes.length,0);});
test("same-text confirmation preserves anomalous source wording and raw confidence without lowering text correction admission",()=>{
  const input=fixture();input.ocr.lines[0].text="GraphGraph";
  input.ocr.lines[0].confidence=0.89;input.evidence[0].revision=ocrLineRevision(input.ocr.lines[0]);
  for(const observation of input.evidence[0].observations) observation.ocr.lines[0].text="GraphGraph";
  input.evidence[0].observations[1].ocr.lines[0].confidence=0.939;
  const before=structuredClone(input),result=planOcrLineConsensus(input);
  assert.equal(result.ocr.lines[0].text,"GraphGraph");assert.equal(result.ocr.lines[0].confidence,0.939);
  assert.equal(result.ocr.lines[0].confidenceEvidence.originalConfidence,0.89);
  assert.equal(result.changes[0].operation,"confidence");assert.deepEqual(input,before);
  input.evidence[0].observations.forEach(observation=>{observation.ocr.lines[0].text="Graph";});
  assert.equal(planOcrLineConsensus(input).changes.length,0);
});
test("rejects malformed, oversized and duplicate evidence",()=>{
  for(const input of [null,{}, {...fixture(),sourceHash:"invalid"},{...fixture(),evidence:Array(9).fill(fixture().evidence[0])},
    {...fixture(),evidence:[fixture().evidence[0],fixture().evidence[0]]}]) assert.throws(()=>planOcrLineConsensus(input));
  const input=fixture();input.evidence[0].observations[0].cropBox.w=400;assert.throws(()=>planOcrLineConsensus(input),/crop/u);
  const huge=fixture();huge.ocr.lines=Array(10001).fill(huge.ocr.lines[0]);assert.throws(()=>planOcrLineConsensus(huge));
  const absent=fixture();delete absent.evidence[0].observations[0].ocr.lines[0].confidence;
  assert.throws(()=>planOcrLineConsensus(absent),/confidence/u);
});
test("rejects accessors and proxies without invoking user code",()=>{
  let calls=0;const input=fixture();Object.defineProperty(input,"evidence",{get(){calls++;return [];}});
  assert.throws(()=>planOcrLineConsensus(input));assert.equal(calls,0);
  assert.throws(()=>planOcrLineConsensus(new Proxy(fixture(),{get(){calls++;throw new Error("secret");}})));assert.equal(calls,0);
  const nested=fixture();Object.defineProperty(nested.evidence[0].observations[0],"cropBox",{get(){calls++;return {};}});
  assert.throws(()=>planOcrLineConsensus(nested));assert.equal(calls,0);
});

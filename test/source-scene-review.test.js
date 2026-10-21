"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseSceneReviews,applySourceSceneReview,routeSceneReviewCandidates,sourceSceneReviewCapacity}=require("../packages/slideclone-core/source-scene-review");
const hash="a".repeat(64);
test('review capacity preserves mandatory overlap and the exact 32-target boundary',()=>{
 const mandatory=Array.from({length:27},(_,index)=>({index,kind:'uncertain'}));
 const before=JSON.stringify(mandatory),reservation=sourceSceneReviewCapacity(mandatory);
 assert.deepEqual(reservation.indices,Array.from({length:27},(_,i)=>i));assert.equal(reservation.remaining,5);
 assert.match(reservation.prompt,/Only 5 additional distinct/);assert.match(reservation.prompt,/Do not hide suspicious/);
 assert.equal(sourceSceneReviewCapacity([...mandatory,{index:27,kind:'text'}],5).remaining,0);
 assert.equal(sourceSceneReviewCapacity([...mandatory,...Array.from({length:5},(_,i)=>({index:i+27,kind:'graphic'}))]).remaining,0);
 assert.equal(sourceSceneReviewCapacity([]).remaining,32);assert.equal(JSON.stringify(mandatory),before);
});
test('captured 27 mandatory plus 11 graphic candidates fail explicitly without discarding evidence',()=>{
 const reviews=Array.from({length:38},(_,index)=>({index,kind:index<27?'uncertain':'graphic'}));
 const before=JSON.stringify(reviews);
 assert.throws(()=>sourceSceneReviewCapacity(reviews),error=>{
  assert.equal(error.code,'SCENE_REVIEW_CAPACITY_EXCEEDED');assert.equal(error.requiredReviews,38);
  assert.equal(error.missingTargets,0);assert.equal(error.limitTargets,32);return true;
 });
 assert.equal(JSON.stringify(reviews),before);
 assert.throws(()=>sourceSceneReviewCapacity(reviews.slice(0,32),1),/crop review exceeds/);
});
test('capacity rejects malformed, sparse, extreme and hostile input without invoking accessors',()=>{
 for(const reviews of [null,{},new Array(1),[{index:512,kind:'graphic'}],[{index:0,kind:'graphic'},{index:0,kind:'text'}],new Proxy([],{})])
  assert.throws(()=>sourceSceneReviewCapacity(reviews));
 for(const count of [null,'1',-1,NaN,Infinity,513,1.5])assert.throws(()=>sourceSceneReviewCapacity([],count));
 let touched=false;
 const hostile=[];Object.defineProperty(hostile,0,{get(){touched=true;throw new Error('secret');},enumerable:true});
 assert.throws(()=>sourceSceneReviewCapacity(hostile));assert.equal(touched,false);
 assert.throws(()=>sourceSceneReviewCapacity([{get index(){touched=true;return 0;},kind:'graphic'}]));assert.equal(touched,false);
 assert.throws(()=>sourceSceneReviewCapacity(Array.from({length:512},(_,index)=>({index,kind:'uncertain'}))),error=>error.requiredReviews===512);
});
test('scene icon context does not crop a suspected token out of its physical object or decide its class',()=>{
 const {sourceSceneReviewContext}=require('../packages/slideclone-core/source-scene-review');
 const box={x:30,y:35,w:20,h:10};
 const plan={objects:[{id:'outer',kind:'container',box:{x:0,y:0,w:100,h:100}},
  {id:'icon',kind:'icon',box:{x:20,y:20,w:50,h:50}}]};
 const before=JSON.stringify({box,plan});assert.deepEqual(sourceSceneReviewContext(box,plan),plan.objects[1].box);
 assert.equal(sourceSceneReviewContext({x:65,y:35,w:20,h:10},plan),undefined);
 assert.equal(sourceSceneReviewContext(box,undefined),undefined);
 assert.equal(sourceSceneReviewContext(box,{objects:[plan.objects[0]]}),undefined);
 assert.equal(JSON.stringify({box,plan}),before);
 const f=fixture();f.local.reviews[0].kind='mixed';assert.equal(applySourceSceneReview(f).ocr.lines.length,4);
});
test("small uncertain OCR candidates omitted by a global model still receive local review",()=>{
 const f=fixture(),result=routeSceneReviewCandidates([{index:0,kind:"text"}],f.ocr.lines);
 assert.deepEqual(result.shortTokenReviews,[0,1]);
 assert.deepEqual(result.reviews,[{index:0,kind:"uncertain"},{index:1,kind:"uncertain"},{index:2,kind:"uncertain"}]);
});
test("a square single-glyph OCR box needs local source review even at high confidence",()=>{
 const lines=[{text:"A",confidence:.996,box:{x:10,y:10,w:40,h:35}},
  {text:"long",confidence:.996,box:{x:10,y:60,w:80,h:20}}];
 const result=routeSceneReviewCandidates([{index:0,kind:"text"},{index:1,kind:"text"}],lines);
 assert.deepEqual(result.reviews,[{index:0,kind:"uncertain"},{index:1,kind:"text"}]);
 assert.deepEqual(result.geometryTokenReviews,[0]);
});
test('global text classification cannot waive low-confidence review for longer OCR tokens',()=>{
 const lines=[
  {text:'III',confidence:.76,box:{x:10,y:10,w:24,h:12}},
  {text:'longlabel',confidence:.899999,box:{x:10,y:30,w:70,h:12}},
  {text:'boundary',confidence:.9,box:{x:10,y:50,w:70,h:12}},
  {text:'trusted',confidence:.99,box:{x:10,y:70,w:70,h:12}}
 ];
 const reviews=lines.map((_,index)=>({index,kind:'text'})),before=JSON.stringify({lines,reviews});
 const result=routeSceneReviewCandidates(reviews,lines);
 assert.deepEqual(result.reviews,[{index:0,kind:'uncertain'},{index:1,kind:'uncertain'},{index:2,kind:'text'},{index:3,kind:'text'}]);
 assert.deepEqual(result.lowConfidenceReviews,[0,1]);assert.deepEqual(result.shortTokenReviews,[]);
 assert.equal(JSON.stringify({lines,reviews}),before);
 assert.deepEqual(routeSceneReviewCandidates([],[]).lowConfidenceReviews,[]);
});
function fixture(){const result={sourceHash:hash,dimensions:{widthPx:100,heightPx:100},ocr:{lines:[
  {text:"Q",confidence:0.4,box:{x:10,y:10,w:10,h:10}},
  {text:"v1",confidence:0.5,box:{x:30,y:10,w:10,h:10}},
  {text:"8",confidence:0.99,box:{x:50,y:10,w:10,h:10}},
  {text:"节点",confidence:0.9,box:{x:10,y:30,w:20,h:10}}
]},global:{sourceHash:hash,reviews:[0,1,2,3].map(index=>({index,kind:"graphic"}))},
local:{sourceHash:hash,reviews:[{index:0,kind:"graphic"},{index:1,kind:"text"},{index:2,kind:"text"},{index:3,kind:"mixed"}]},targets:[0,1,2,3]};return {...result,context:structuredClone(result.local)};}
test("scene review consumes independently checked graphic decisions while preserving labels and mixed text",()=>{
 const result=applySourceSceneReview(fixture());assert.deepEqual(result.ocr.lines.map(l=>l.text),["v1","8","节点"]);
 assert.deepEqual(result.evidence.rejectedOcr,[{index:0,box:{x:10,y:10,w:10,h:10}}]);
 assert.deepEqual(result.evidence.retainedAfterLocalReview,[1,2,3]);
});
test("scene reviews reject stale sources, omissions, duplicate IDs and unsolicited crops",()=>{
 for(const mutate of [f=>{f.local.sourceHash="b".repeat(64);},f=>{f.local.reviews.pop();},f=>{f.local.reviews[1].index=0;},f=>{f.targets.pop();},f=>{f.global.reviews=[];}]){
  const f=fixture();mutate(f);assert.throws(()=>applySourceSceneReview(f),/Scene review/);
 }
});
test("scene reviews reject invalid, extreme and accessor input without executing accessors",()=>{
 for(const value of [null,{}, {reviews:[{index:-1,kind:"graphic"}]},{reviews:[{index:Infinity,kind:"graphic"}]},{reviews:[{index:0,kind:"delete"}]},new Proxy({reviews:[]},{})])assert.throws(()=>parseSceneReviews(value,4),/Scene review/);
 let touched=false;assert.throws(()=>parseSceneReviews({get reviews(){touched=true;return [];}},4));assert.equal(touched,false);
 assert.throws(()=>parseSceneReviews({reviews:[]},513));
});
test("empty reviews leave admitted OCR unchanged and uncertain local results never remove text",()=>{
 const f=fixture();f.global.reviews=[];f.local.reviews=[];f.context.reviews=[];f.targets=[];assert.equal(applySourceSceneReview(f).ocr.lines.length,4);
 const g=fixture();g.local.reviews[0].kind="uncertain";assert.equal(applySourceSceneReview(g).ocr.lines.length,4);
});
test("mixed global regions require agreement of both local scales before OCR removal",()=>{
 const f=fixture();f.global.reviews[0].kind="mixed";assert.equal(applySourceSceneReview(f).ocr.lines.length,3);
 f.context.reviews[0].kind="text";assert.equal(applySourceSceneReview(f).ocr.lines.length,4);
});

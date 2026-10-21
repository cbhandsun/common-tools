'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSceneGlyphOcclusion:createGlyph,sceneFillGlyphBridge:bridge,sceneGlyphOcclusionEvidence:evidence,
 sceneGlyphOcclusionRejections:rejections}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
const {createSceneMeasurementCache:create}=require('../packages/slideclone-core/source-scene-measurement-cache');
function striped(){
 const image={width:950,height:500,rgba:Buffer.alloc(950*500*4)},fill=[0,130,70],budget={used:0};
 const paint=(x,y,color)=>image.rgba.set([...color,255],(y*950+x)*4);
 for(let y=0;y<500;y++)for(let x=0;x<950;x++)paint(x,y,fill);
 for(const [left,stripes]of [[30,8],[300,25]])for(let stripe=0;stripe<stripes;stripe++)
  for(let y=30;y<390;y++)for(let x=left+stripe*23;x<left+stripe*23+10;x++)paint(x,y,[255,255,255]);
 const hint={x:733,y:21,w:116,h:398};
 for(let y=20;y<=420;y++)for(let x=732;x<=850;x++)if(x===732||x===850||y===20||y===420)paint(x,y,[0,0,0]);
 for(let stripe=0;stripe<5;stripe++)for(let y=22;y<419;y++)for(let x=737+stripe*23;x<749+stripe*23;x++)paint(x,y,[255,255,255]);
 const boxes=[{x:20,y:10,w:240,h:400},{x:290,y:10,w:590,h:420}],texts=boxes.map(box=>({text:'private-caption',box,font:{color:'#FFFFFF'}}));
 const token=createGlyph(image,texts,{widthPt:950,heightPt:500},budget);
 return {image,fill,budget,hint,boxes,token};
}
function exhaust(f){
 bridge(f.token,f.image,f.budget,f.boxes[0],f.fill);
 bridge(f.token,f.image,f.budget,{x:300,y:30,w:401,h:360},f.fill);
 bridge(f.token,f.image,f.budget,{x:714,y:30,w:10,h:360},f.fill);
 assert.equal(evidence(f.token).glyphOwnedPixels,97200);
}
test('fill budget rejection before ledger acquisition remains visible alongside the independent outline failure',()=>{
 const f=striped();exhaust(f);const original=Buffer.from(f.image.rgba),cache=create(f.image,[f.hint],f.budget,f.token);
 assert.equal(cache.fill(f.hint),null);
 assert.ok(rejections(f.token).glyphBudgetRejections>0);
 cache.outline(f.hint);
 const failures=cache.failureDetails(f.hint),quota=failures.find(failure=>failure.code==='glyph-owned-budget');
 assert.ok(quota);assert.equal(quota.path,'fill');assert.ok(quota.attempts>0);
 assert.ok(quota.requestedGlyphs>quota.remainingGlyphs);assert.equal(quota.remainingGlyphs,2800);
 assert.equal(evidence(f.token).glyphOwnedPixels,97200);assert.deepEqual(f.image.rgba,original);
 assert.equal(JSON.stringify(failures).includes('private-caption'),false);
 const scan=f.budget.used,counters=rejections(f.token);assert.equal(cache.fill({...f.hint}),null);
 assert.equal(f.budget.used,scan);assert.deepEqual(rejections(f.token),counters);
 failures[0].code='mutated';assert.notEqual(cache.failureDetails(f.hint)[0].code,'mutated');
});
test('normal, empty and geometric failures stay distinct from unrelated earlier quota rejections',()=>{
 const f=striped();exhaust(f);
 assert.equal(bridge(f.token,f.image,f.budget,{x:737,y:22,w:12,h:397},f.fill).size,0);
 const cache=create(f.image,[],f.budget,f.token),blank={x:0,y:430,w:100,h:50};
 assert.deepEqual(cache.failureDetails(blank),[]);
 assert.equal(cache.fill(blank),null);assert.deepEqual(cache.failureDetails(blank),[{path:'fill',code:'fill-source-evidence'}]);
 const fresh=striped(),allowed=create(fresh.image,[fresh.hint],fresh.budget,fresh.token);
 assert.ok(allowed.fill(fresh.hint),'the same independently closed source fill is measurable before ownership exhaustion');
 assert.deepEqual(allowed.failureDetails(fresh.hint),[]);
 const counters=rejections(fresh.token);counters.glyphBudgetRejections=999;
 assert.notEqual(rejections(fresh.token).glyphBudgetRejections,999);
 assert.deepEqual(rejections({}),rejections(undefined));
});
test('scan exhaustion is reported without weakening source authority or hiding hard scanner failure',()=>{
 const f=striped();f.budget.used=4000000;
 assert.equal(bridge(f.token,f.image,f.budget,f.hint,f.fill).size,0);
 assert.equal(rejections(f.token).scanBudgetRejections,1);assert.equal(evidence(f.token).glyphOwnedPixels,0);
 assert.equal(f.budget.used,4000000);
 const cache=create(f.image,[f.hint],f.budget,f.token);assert.throws(()=>cache.fill(f.hint),RangeError);
 assert.deepEqual(cache.failureDetails(f.hint),[]);
});
test('diagnostic hint boundaries reject hostile controls without invoking getters',()=>{
 const f=striped(),cache=create(f.image,[],f.budget,f.token);let calls=0;
 const getter={get x(){calls++;throw Error('private-content');}};
 for(const hint of [null,{},getter,new Proxy(f.hint,{}),{...f.hint,w:Infinity},{...f.hint,x:-1}])
  assert.throws(()=>cache.failureDetails(hint),error=>error instanceof TypeError&&!error.message.includes('private-content'));
 assert.equal(calls,0);assert.equal(f.budget.used,0);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-scene-measurement-rejections.test.js','unit'),true);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-scene-measurement-rejections.test.js','all'),true);
});

"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {materializeReviewedSceneGraphics:materialize,mapReviewedSceneGraphics:map}=require("../packages/slideclone-core/source-scene-reviewed-graphics");
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"reviewed-graphic-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 for(let y=100;y<120;y++)for(let x=100;x<120;x++)if(x<105||x>=115||y<105||y>=115)image.rgba.set([20,60,100,255],(y*400+x)*4);
 return {root,image,rejectedOcr:[{index:7,box:{x:99,y:99,w:22,h:22}}],textBoxes:[],budget:{used:1000},sourceHash:"a".repeat(64)};
}
test('reviewed OCR fragments recover a complete source component only inside charged icon context',t=>{
 const f=fixture(t),box={x:100,y:108,w:5,h:5},searchBox={x:95,y:95,w:30,h:30};
 const clipped=materialize({...f,rejectedOcr:[{index:7,box}],budget:{used:0}});
 assert.deepEqual(clipped.unresolved,[7]);
 const budget={used:1000},result=materialize({...f,rejectedOcr:[{index:7,box,searchBox}],budget});
 assert.equal(result.graphics.length,1);assert.deepEqual(result.unresolved,[]);assert.equal(budget.used,1900);
 assert.ok(result.graphics[0].box.w>=20&&result.graphics[0].box.h>=20);
 const text=materialize({...f,rejectedOcr:[{index:7,box,searchBox}],textBoxes:[{text:'label',box:{x:100,y:100,w:20,h:20}}]});
 assert.deepEqual(text.unresolved,[7]);
 assert.throws(()=>materialize({...f,rejectedOcr:[{index:7,box,searchBox}],budget:{used:3999999}}),RangeError);
});
test("dual-reviewed OCR graphics materialize in the remaining local budget with source identity",t=>{
 const f=fixture(t),result=materialize(f);assert.equal(result.graphics.length,1);assert.deepEqual(result.unresolved,[]);
 const g=result.graphics[0];assert.equal(g.source.sceneReviewSourceHash,f.sourceHash);assert.equal(g.source.sceneReviewOcrIndex,7);
 assert.ok(fs.existsSync(path.join(f.root,g.assetPath)));assert.ok(f.budget.used>1000&&f.budget.used<=4000000);
 const mapped=map(result.graphics,{widthPx:400,heightPx:300},{widthPt:200,heightPt:150});
 assert.equal(mapped[0].box.x,g.box.x/2);assert.equal(mapped[0].box.w,g.box.w/2);assert.deepEqual(mapped[0].source,g.source);
});
test("blank, text-owned and clipped graphics stay unresolved without creating source images",t=>{
 for(const mode of ["blank","text","clipped"]){const f=fixture(t);
  if(mode==="blank")f.image.rgba.fill(255);
  if(mode==="text")f.textBoxes=[{text:"Label",box:{x:100,y:100,w:20,h:20}}];
  if(mode==="clipped")for(let x=80;x<140;x++)f.image.rgba.set([20,60,100,255],(110*400+x)*4);
  const result=materialize(f);assert.equal(result.graphics.length,0);assert.deepEqual(result.unresolved,[7]);
 }
});
test("empty reviews have no scan cost and invalid binding or exhausted budgets fail",t=>{
 const f=fixture(t);assert.deepEqual(materialize({...f,rejectedOcr:[]}),{graphics:[],unresolved:[]});assert.equal(f.budget.used,1000);
 assert.throws(()=>materialize({...f,sourceHash:"bad"}),TypeError);
 assert.throws(()=>materialize({...f,rejectedOcr:[{index:-1,box:f.rejectedOcr[0].box}]}),TypeError);
 assert.throws(()=>materialize({...f,rejectedOcr:Array(33).fill(f.rejectedOcr[0])}),TypeError);
 assert.throws(()=>materialize({...f,budget:{used:4000000}}),RangeError);
 assert.throws(()=>map([],{widthPx:0,heightPx:300},{widthPt:200,heightPt:150}),TypeError);
});

test("known graphics removed from OCR cannot disappear from the native completion gate",()=>{
 const {auditNativeComponentQuality:audit}=require("../packages/slideclone-core/native-component-quality");
 const page={shapes:[],images:[],textBoxes:[]};
 const missing=audit({pages:[page],meta:{sourceSceneReview:{unresolvedReviewedGraphics:[40,42]}}});
 assert.equal(missing.passed,false);assert.equal(missing.metrics.unresolvedSceneComponents,2);
 assert.equal(missing.checks.find(c=>c.name==="source-scene-completion").passed,false);
 for(const meta of [undefined,{}, {sourceSceneReview:{unresolvedReviewedGraphics:[]}}])assert.equal(audit({pages:[page],meta}).passed,true);
 const combined=audit({pages:[{...page,source:{sourceScene:{version:1,unresolved:[{id:"node",reason:"container-perimeter"}]}}}],meta:{sourceSceneReview:{unresolvedReviewedGraphics:[40]}}});
 assert.equal(combined.metrics.unresolvedSceneComponents,2);
});

test("review completeness validates bounded source indices without invoking hostile controls",()=>{
 const {unresolvedReviewedGraphicCount:count}=require("../packages/slideclone-core/source-scene-reviewed-graphics");
 assert.equal(count(undefined),0);assert.equal(count({}),0);assert.equal(count({unresolvedReviewedGraphics:[0,511]}),2);
 let executed=0;const hostile={};Object.defineProperty(hostile,"unresolvedReviewedGraphics",{get(){executed++;throw Error("private-provider-body");}});
 const array=[];Object.defineProperty(array,"0",{get(){executed++;throw Error("private-provider-body");}});array.length=1;
 for(const value of [null,[],hostile,new Proxy({},{}),{unresolvedReviewedGraphics:array},
  ...[null,new Array(1),new Proxy([],{}),[-1],[512],[Infinity],["1"],[1,1],Array(33).fill(0)].map(indices=>({unresolvedReviewedGraphics:indices}))])assert.equal(count(value),null);
 assert.equal(executed,0);
 const {auditNativeComponentQuality:audit}=require("../packages/slideclone-core/native-component-quality");
 for(const meta of [hostile,new Proxy({},{}),{sourceSceneReview:hostile},{sourceSceneReview:{unresolvedReviewedGraphics:[512]}}]){
  const result=audit({pages:[{shapes:[],images:[]}],meta});assert.equal(result.passed,false);
 }
 assert.equal(executed,0);
});

test("page completion survives replacement of deck metadata without counting the same review twice",()=>{
 const {withReviewedGraphicEvidence:attach}=require("../packages/slideclone-core/source-scene-reviewed-graphics");
 const {auditNativeComponentQuality:audit}=require("../packages/slideclone-core/native-component-quality");
 const page={shapes:[],images:[],source:{existing:true}},before=JSON.stringify(page);
 const evidence={sourceHash:"a".repeat(64),unresolvedReviewedGraphics:[40,42]};
 const bound=attach(page,evidence);assert.equal(JSON.stringify(page),before);assert.equal(bound.source.existing,true);
 evidence.unresolvedReviewedGraphics.push(94);assert.deepEqual(bound.source.sourceSceneReviewedGraphics.unresolvedReviewedGraphics,[40,42]);
 for(const meta of [{sourceSceneReview:{sourceHash:"a".repeat(64),unresolvedReviewedGraphics:[40,42]}},{reconstructionMode:"native-hybrid"}]){
  const result=audit({pages:[bound],meta});assert.equal(result.passed,false);assert.equal(result.metrics.unresolvedSceneComponents,2);
 }
 assert.equal(attach(page,{}),page);assert.throws(()=>attach(page,{unresolvedReviewedGraphics:[1]}),/source binding/);
 assert.throws(()=>attach(page,{sourceHash:"a".repeat(64),unresolvedReviewedGraphics:[512]}),/evidence/);
 for(const graphics of [null,{version:1,sourceHash:"bad",unresolvedReviewedGraphics:[]},{version:2,sourceHash:"a".repeat(64),unresolvedReviewedGraphics:[]}])assert.equal(audit({pages:[{...page,source:{sourceSceneReviewedGraphics:graphics}}]}).passed,false);
});

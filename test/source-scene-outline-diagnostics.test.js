"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {measureOutlinedSceneContainer,measureOutlinedSceneContainerDetailed:measure}=require('../packages/slideclone-core/source-scene-outline');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/source-scene-measurement-cache');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {writePng}=require('../packages/slideclone-core/png');
const {parseSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
function fixture(dashed=false){
 const image={width:160,height:120,rgba:Buffer.alloc(160*120*4,255)},hint={x:30,y:25,w:90,h:70};
 const put=(x,y)=>image.rgba.set([25,65,95,255],(y*image.width+x)*4);
 for(let x=30;x<=120;x++)if(!dashed||(x-30)%14<8)for(let d=0;d<3;d++){put(x,25+d);put(x,93+d);}
 for(let y=25;y<=95;y++)if(!dashed||(y-25)%14<8)for(let d=0;d<3;d++){put(30+d,y);put(118+d,y);}
 return {image,hint};
}
test('detailed outline measurement preserves successful geometry, cells and exact scan charges',()=>{
 const f=fixture(),first={used:0},second={used:0};
 const ordinary=measureOutlinedSceneContainer(f.image,f.hint,[],first),result=measure(f.image,f.hint,[],second);
 assert.ok(ordinary);assert.deepEqual(result.outline,ordinary);assert.equal(result.detailCode,null);assert.equal(second.used,first.used);
});
test('blank, disconnected dash and text-owned source failures retain precise safe observation stages',()=>{
 const empty=fixture();empty.image.rgba.fill(255);
 assert.deepEqual(measure(empty.image,empty.hint,[],{used:0}),{outline:null,detailCode:'outline-no-ink',rejections:{'outline-no-ink':1}});
 const dash=fixture(true),result=measure(dash.image,dash.hint,[],{used:0});
 assert.equal(result.outline,null);assert.ok(result.rejections['outline-geometry']>0);
 const owned=fixture(),text=measure(owned.image,owned.hint,[{x:30,y:30,w:3,h:10}],{used:0});
 assert.equal(text.outline,null);assert.ok(text.rejections['outline-text-ownership']>0);
 assert.ok(Object.values(text.rejections).every(Number.isSafeInteger));
});
test('exterior and unit-size failures remain distinguishable without new scans or relaxed gates',()=>{
 const f=fixture();for(let y=17;y<26;y++)for(let x=22;x<31;x++)f.image.rgba.set((x+y)%2?[200,0,0,255]:[255,255,255,255],(y*160+x)*4);
 const result=measure(f.image,f.hint,[],{used:0});assert.equal(result.outline,null);assert.equal(result.detailCode,'outline-exterior-unstable');
 const image={width:3000,height:3000,rgba:Buffer.alloc(3000*3000*4,255)},budget={used:0};
 assert.equal(measure(image,{x:50,y:50,w:2900,h:2900},[],budget).detailCode,'outline-window-budget');assert.equal(budget.used,0);
});
test('cached failures retain their stage, count once, and do not consume further source budget',()=>{
 const f=fixture(true),budget={used:0},cache=createSceneMeasurementCache(f.image,[],budget);
 assert.equal(cache.outline(f.hint),null);const charged=budget.used,counts=structuredClone(cache.evidence.outlineRejections);
 assert.equal(cache.outline(f.hint),null);assert.equal(budget.used,charged);assert.deepEqual(cache.evidence.outlineRejections,counts);
 assert.equal(cache.evidence.outlineReuses,1);assert.match(cache.failure(f.hint),/^outline-/);
 assert.equal(cache.failure({x:10,y:10,w:12,h:12}),'container-source-evidence');assert.equal(budget.used,charged);
});
test('per-query diagnostics preserve mixed stages without importing another hint or mutable returned controls',()=>{
 const f=fixture(true);f.image.rgba.set([25,65,95,255],(50*f.image.width+22)*4);
 const budget={used:0},cache=createSceneMeasurementCache(f.image,[],budget);
 const observed=measure(f.image,f.hint,[],{used:0});
 assert.equal(cache.outline(f.hint),null);
 const details=cache.failureDetails(f.hint),expected=Object.entries(observed.rejections)
  .map(([code,attempts])=>({path:'outline',code,attempts}));
 assert.deepEqual(details,expected);assert.ok(details.length>1);
 const charged=budget.used;details[0].attempts=999;details.push({path:'outline',code:'forged',attempts:1});
 assert.deepEqual(cache.failureDetails(f.hint),expected);assert.equal(budget.used,charged);
 const emptyHint={x:5,y:5,w:12,h:12};assert.deepEqual(cache.failureDetails(emptyHint),[]);
 assert.equal(cache.outline(emptyHint),null);
 assert.deepEqual(cache.failureDetails(emptyHint),[{path:'outline',code:'outline-no-ink',attempts:1}]);
 assert.deepEqual(cache.failureDetails(f.hint),expected);
 const filled=fixture(),success=createSceneMeasurementCache(filled.image,[],{used:0});
 assert.ok(success.outline(filled.hint));assert.deepEqual(success.failureDetails(filled.hint),[]);
});
test('invalid, empty, extreme and hostile controls fail without echoing private values or invoking accessors',()=>{
 const f=fixture();let calls=0;const hostile={get x(){calls++;throw Error('private-token');}};
 for(const hint of [null,{},hostile,{...f.hint,x:-1},{...f.hint,w:Infinity},new Proxy(f.hint,{})])
  assert.throws(()=>measure(f.image,hint,[],{used:0}),e=>e instanceof TypeError&&!e.message.includes('private-token'));
 assert.equal(calls,0);assert.throws(()=>measure(f.image,f.hint,[],{used:3999999}),/budget/);
 assert.throws(()=>measure(f.image,f.hint,new Array(1),{used:0}),TypeError);
 assert.throws(()=>measure(f.image,f.hint,[],{used:NaN}),TypeError);
});
test('real scene compilation carries the observed rejection stage without converting disconnected dashes',t=>{
 const f=fixture(true),root=fs.mkdtempSync(path.join(os.tmpdir(),'outline-diagnostics-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'diagram',box:{x:0,y:0,w:160,h:120}}],
  objects:[{id:'node',regionId:'root',kind:'container',box:f.hint}],relations:[]},
 {sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:160,heightPx:120});
 const result=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:160,heightPt:120}});
 const rejected=result.evidence.unresolved.find(r=>r.id==='object-node');assert.ok(rejected);
 assert.equal(rejected.reason,'container-perimeter');assert.match(rejected.detailCode,/^outline-/);
 assert.ok(result.evidence.outlineRejections['outline-geometry']>0);assert.equal(result.evidence.containers,0);
 assert.ok(rejected.alternativeFailures.some(row=>row.path==='outline'&&row.code==='outline-geometry'&&row.attempts>0));
 assert.ok(result.evidence.sourceScanPixels<=4000000);assert.deepEqual(result.page.shapes,[]);
});

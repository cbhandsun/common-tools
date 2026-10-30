'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
const {hasMeasuredScenePortFrame,measuredScenePortFill,measuredSceneGroupBounds,measuredSceneContourPort,verifyMeasuredScenePort,createMeasuredScenePortFrame}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
const {measureSceneRelationDetailed}=require('../packages/slideclone-core/scene-plan/source-scene-relation');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {writePng}=require('../packages/slideclone-core/png');
const {sourceHollowNodes:fixture}=require('./helpers/scene-hollow-nodes.cjs');
function measured(f,masks=[]){const budget={used:0},cache=createSceneMeasurementCache(f.image,masks,budget);
 const surfaces=f.hints.map(h=>cache.surface(h));
 const nodes=surfaces.map((s,i)=>({id:i?'b':'a',box:s.outline?.box,portFrame:cache.portFrame(f.hints[i])}));
 return {cache,budget,surfaces,nodes};}
test('closed heterogeneous nodes retain physical ports without acquiring a fill color',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),m=measured(f);
 for(const [i,s]of m.surfaces.entries()){
  assert.equal(s.outline?.fill,'none');assert.ok(s.outline.portSegments);assert.equal(s.outline.bodySegments,undefined);
  const n=m.nodes[i];assert.ok(hasMeasuredScenePortFrame(f.image,n.portFrame,n.box));assert.equal(measuredScenePortFill(f.image,n.portFrame,n.box),null);
  assert.equal(measuredSceneGroupBounds(f.image,n.portFrame),null,'a hollow port cannot expand label or paint grouping authority');
 }
 const n=m.nodes[0],point=measuredSceneContourPort(f.image,n.portFrame,n.box,50,'right');assert.ok(point);
 assert.equal(verifyMeasuredScenePort({image:f.image,token:n.portFrame,box:n.box,point,side:'right',color:'#1E3C5A',textMasks:[],budget:m.budget}),true);
 const result=measureSceneRelationDetailed({image:f.image,from:m.nodes[0],to:m.nodes[1],direction:'forward',shaftBox:f.shaftBox,textMasks:[],budget:m.budget});
 assert.ok(result.fit,JSON.stringify(result));assert.equal(result.fit.support,1);assert.equal(result.fit.startPosition,.25);
 assert.deepEqual(f.image.rgba,before);assert.ok(m.budget.used<=4000000);
});
test('hollow ports still require source identity, actual ring contact, ownership, direction and continuity',()=>{
 for(const change of [r=>{r.from.portFrame={};},r=>{r.from.portFrame=structuredClone(r.from.portFrame);},
  r=>{r.from.portFrame=new Proxy({},{});},r=>{r.image={...r.image,rgba:Buffer.from(r.image.rgba)};},
  r=>{r.direction='backward';},r=>{r.direction='both';},r=>{r.direction='unknown';},
  r=>{r.textMasks=[{x:90,y:49,w:4,h:4}];},r=>{r.from.box={...r.from.box,x:r.from.box.x+3};},
  r=>{for(let y=38;y<=62;y++)r.image.rgba.fill(255,(y*r.image.width+110)*4,(y*r.image.width+111)*4);}
 ]){const f=fixture(),m=measured(f),r={image:f.image,from:{...m.nodes[0]},to:{...m.nodes[1]},direction:'forward',shaftBox:f.shaftBox,textMasks:[],budget:m.budget};
  change(r);assert.equal(measureSceneRelationDetailed(r).fit,null);}
 const f=fixture(),m=measured(f),n=m.nodes[0];
 for(const token of [undefined,null,{},structuredClone(n.portFrame),new Proxy({}, {})])assert.equal(hasMeasuredScenePortFrame(f.image,token,n.box),false);
 let calls=0;const hostile={get x(){calls++;throw new Error('private');}};
 for(const box of [null,[],{},hostile,new Proxy(n.box,{get(){calls++;throw new Error('private');}}),{...n.box,w:Infinity}])
  assert.equal(hasMeasuredScenePortFrame(f.image,n.portFrame,box),false);
 assert.equal(hasMeasuredScenePortFrame(new Proxy(f.image,{get(){calls++;throw new Error('private');}}),n.portFrame,n.box),false);
 assert.throws(()=>createMeasuredScenePortFrame(f.image,{box:n.box,fill:{toString(){calls++;throw new Error('private');}}}),TypeError);
 assert.equal(calls,0);
 const noRing=createSceneMeasurementCache(f.image,[{x:19,y:30,w:5,h:8}],{used:0});
 noRing.surface(f.hints[0]);assert.equal(noRing.portFrame(f.hints[0]),null);
 const points=[{type:'moveTo',points:[{x:0,y:0}]},{type:'lnTo',points:[{x:1,y:0}]},{type:'lnTo',points:[{x:1,y:1}]},{type:'close',points:[]}];
 for(const measurement of [{box:n.box,fill:'none'},{box:n.box,fill:'none',segments:points},{box:n.box,fill:'bad',segments:points}])
  assert.throws(()=>createMeasuredScenePortFrame(f.image,measurement),TypeError);
 assert.throws(()=>createSceneMeasurementCache(f.image,[],{used:4000000}).surface(f.hints[0]),RangeError);
});
test('compiler writes real hollow shape endpoints and no inferred solid background',t=>{
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-hollow-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const plan={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:f.image.width,heightPx:f.image.height,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:220,h:180}}],
  objects:f.hints.map((box,i)=>({id:i?'right':'left',regionId:'root',kind:'container',box})),
  relations:[{id:'edge',regionId:'root',fromId:'left',toId:'right',direction:'forward',shaftBox:f.shaftBox}]};
 const result=compileSourceScene({root,sourceFile,slideSize:{widthPt:220,heightPt:180},plan,page:{id:'page',textBoxes:[],shapes:[],images:[]}});
 assert.equal(result.evidence.resolvedRelations,1);
 const line=result.page.shapes.find(s=>s.id==='scene-edge');assert.ok(line);
 for(const key of ['startAnchor','endAnchor'])assert.ok(result.page.shapes.some(s=>s.id===line.style[key].elementId&&s.type==='freeform'&&s.source.detector==='source-scene-outline'));
 assert.equal(result.page.shapes.filter(s=>s.source.detector==='source-scene-container').length,0);
 assert.equal(result.evidence.sourceScanPixels<=4000000,true);
 const {includesSuite}=require('../scripts/test-suites');assert.equal(includesSuite(__filename,'unit'),true);assert.equal(includesSuite(__filename,'all'),true);
});

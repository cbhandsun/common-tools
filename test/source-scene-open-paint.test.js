'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {observeOpenScenePaint:observe,retainedOpenScenePaint:retained}=require('../packages/slideclone-core/source-scene-open-paint');
const {measuredSceneOpaqueSurface,hasMeasuredScenePortFrame,createMeasuredScenePortFrame}=require('../packages/slideclone-core/source-scene-port-evidence');
function fixture(){
 const image={width:200,height:160,rgba:Buffer.alloc(200*160*4)},background=[245,249,255];
 for(let n=0;n<200*160;n++)image.rgba.set([...background,255],n*4);
 const box={x:30,y:30,w:130,h:100},paths=[],ink=new Set();
 const put=(x,y,color)=>{image.rgba.set([...color,255],(y*200+x)*4);ink.add(y*200+x);};
 const line=(x0,y0,x1,y1,color)=>{
  paths.push({filled:false,segments:[{type:'moveTo',points:[{x:(x0+.5-box.x)/box.w,y:(y0+.5-box.y)/box.h}]},
   {type:'lnTo',points:[{x:(x1+.5-box.x)/box.w,y:(y1+.5-box.y)/box.h}]}]});
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)put(x,y,color);
 };
 line(30,30,68,30,[225,229,235]);line(110,30,159,30,[225,229,235]);
 line(159,31,159,129,[235,239,245]);line(100,40,100,129,[225,229,235]);
 return {image,ink,put,recipe:{id:'region-owner',kind:'openPaths',box,paths,fill:'#FFFFFF',stroke:'#000000',strokeWidthPx:1},
  slideSize:{widthPt:200,heightPt:160},budget:{used:0},textMasks:[],foreignFrames:[],relationParts:[]};
}
function request(f){const {image,recipe,slideSize,budget,textMasks,foreignFrames,relationParts}=f;return {image,recipe,slideSize,budget,textMasks,foreignFrames,relationParts};}

test('open source paint traces the complete literal source paths, including faint paint, without a body or completion permission',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),result=observe(request(f));assert.equal(result.failure,null,JSON.stringify(result));
 assert.equal(result.parts.length,4);assert.equal(result.ownerCompleted,false);assert.equal(result.portsAuthorized,false);
 assert.equal(result.opaqueBodyAuthorized,false);assert.ok(result.evidence.sourcePixels>0&&result.evidence.sourcePixels<=4000000);
 assert.ok(result.evidence.geometryChecks<=4000000);
 const proof=retained(f.image,result.receipt,result.parts);assert.ok(proof);assert.deepEqual(proof.cells,f.ink);
 assert.equal(hasMeasuredScenePortFrame(f.image,result.receipt,f.recipe.box),false);
 assert.equal(measuredSceneOpaqueSurface(f.image,result.receipt),null);
 assert.ok(result.parts.every(p=>p.style.stroke==='none'&&p.source.residualBackgroundFill!==true));
 assert.equal(result.parts.some(p=>p.box.w>100&&p.box.h>50),false);
 assert.deepEqual(f.image.rgba,before);assert.equal(proof.cells.has(30*200+90),false);
});

test('a missing path, color step, text, alpha and depleted budgets never publish partial source paint',()=>{
 for(const mode of ['missing','step','text','alpha','budget']){
  const f=fixture();
  if(mode==='missing')for(let y=31;y<=129;y++)f.image.rgba.set([245,249,255,255],(y*200+159)*4);
  if(mode==='step')for(let y=31;y<=129;y++)for(let x=159;x<180;x++)f.image.rgba.set([235,239,245,255],(y*200+x)*4);
  if(mode==='text')f.textMasks=[{x:40,y:28,w:15,h:10}];
  if(mode==='alpha')f.image.rgba[(50*200+50)*4+3]=0;
  if(mode==='budget')f.budget.used=4000000;
  const result=observe(request(f));assert.ok(result.failure,mode);assert.equal(result.parts,undefined,mode);assert.equal(result.receipt,undefined,mode);
  assert.ok(f.budget.used<=4000000,mode);
 }
});

test('a constant source offset keeps the same oriented normal through the actual open endpoint',()=>{
 for(const reverse of [false,true]){
  const f=fixture();
  // Move the proposed right edge, not the independent source-ink oracle.
  for(const segment of f.recipe.paths[2].segments)for(const point of segment.points)point.x-=2/f.recipe.box.w;
  if(reverse){const segments=f.recipe.paths[2].segments;[segments[0].points,segments[1].points]=[segments[1].points,segments[0].points];}
  const result=observe(request(f));assert.equal(result.failure,null,JSON.stringify(result));
  assert.deepEqual(retained(f.image,result.receipt,result.parts).cells,f.ink);
  assert.equal(result.evidence.paths[2].maxCenterlineErrorPx,0);
 }
});

test('a genuinely displaced half path still fails the original pose limit atomically',()=>{
 const f=fixture();
 for(let y=80;y<=129;y++){
  f.image.rgba.set([245,249,255,255],(y*200+159)*4);
  f.image.rgba.set([235,239,245,255],(y*200+156)*4);
 }
 const result=observe(request(f));assert.equal(result.failure,'open-path-pose');
 assert.equal(result.path,2);assert.ok(result.maxCenterlineErrorPx>1.5);
 assert.equal(result.parts,undefined);assert.equal(result.receipt,undefined);
});

test('a minority of darker neighboring strokes cannot attract the independently observed path palette',()=>{
 for(const color of [[100,105,110],[220,224,230]]){
 const f=fixture();
 // This unassigned source ink has no private foreign/relationship credential.
 // It must neither be nominated as this paint nor be explained away.
 for(let y=60;y<70;y++)f.image.rgba.set([...color,255],(y*200+156)*4);
 const result=observe(request(f));assert.equal(result.failure,null,JSON.stringify(result));
 const proof=retained(f.image,result.receipt,result.parts);assert.deepEqual(proof.cells,f.ink);
 for(let y=60;y<70;y++)assert.equal(proof.cells.has(y*200+156),false);
 assert.equal(result.ownerCompleted,false);assert.equal(result.portsAuthorized,false);
 }
});

test('an isolated off-path source sample stays unassigned and cannot bridge a literal paint gap',()=>{
 const f=fixture(),row=70;
 f.image.rgba.set([245,249,255,255],(row*200+159)*4);f.ink.delete(row*200+159);
 f.image.rgba.set([235,239,245,255],(row*200+156)*4);
 const result=observe(request(f));assert.equal(result.failure,null,JSON.stringify(result));
 const proof=retained(f.image,result.receipt,result.parts);
 assert.deepEqual(proof.cells,f.ink);assert.equal(proof.cells.has(row*200+156),false);
 assert.equal(proof.cells.has(row*200+159),false);assert.equal(result.evidence.paths[2].rejectedPoseSamples,1);
 assert.ok(result.evidence.paths[2].support>=.9);assert.ok(result.evidence.paths[2].maxCenterlineErrorPx<=1.5);
 assert.equal(result.ownerCompleted,false);
});

test('private source paint survives neither copied capabilities, changed members, wrong rasters nor hostile input',()=>{
 const f=fixture(),result=observe(request(f));assert.equal(result.failure,null);
 for(const token of [null,{},structuredClone(result.receipt),new Proxy(result.receipt,{get(){throw Error('private');}})])
  assert.equal(retained(f.image,token,result.parts),null);
 assert.equal(retained({...f.image,rgba:Buffer.from(f.image.rgba)},result.receipt,result.parts),null);
 assert.equal(retained(f.image,result.receipt,structuredClone(result.parts)),null);
 assert.equal(retained(f.image,result.receipt,result.parts.slice(1)),null);
 const first=retained(f.image,result.receipt,result.parts);first.cells.clear();assert.ok(retained(f.image,result.receipt,result.parts).cells.size>0);
 result.parts[0].style.fill='#FFFFFF';assert.equal(retained(f.image,result.receipt,result.parts),null);
 let reads=0;const getter={get image(){reads++;throw Error('private');}};
 for(const value of [null,{},getter,new Proxy(request(f),{get(){reads++;throw Error('private');}}),{...request(f),relationParts:new Proxy([],{})},
  {...request(f),foreignFrames:new Array(1)},{...request(f),recipe:{...f.recipe,paths:[]}}])assert.throws(()=>observe(value),TypeError);
 assert.equal(reads,0);
 const foreign={box:{x:80,y:80,w:10,h:10},fill:'#FFFFFF'};
 const token=createMeasuredScenePortFrame(f.image,foreign);
 assert.equal(observe({...request(f),foreignFrames:[{id:'neighbor',token:structuredClone(token),box:foreign.box}]}).failure,'open-foreign-source');
 assert.equal(observe({...request(f),relationParts:[{source:{sceneRelationId:'fake'}}]}).failure,'open-relation-source');
});

test('semantic dependency identities bind private frames even when fresh queries create distinct tokens',()=>{
 const f=fixture(),foreign={box:{x:80,y:80,w:10,h:10},fill:'#FFFFFF'};
 const token=createMeasuredScenePortFrame(f.image,foreign),second=createMeasuredScenePortFrame(f.image,foreign);
 assert.notEqual(token,second);
 const entry={id:'neighbor',token,box:foreign.box};
 const result=observe({...request(f),foreignFrames:[entry]});assert.equal(result.failure,null);
 const proof=retained(f.image,result.receipt,result.parts);assert.deepEqual(proof.foreignFrameIds,['neighbor']);
 entry.id='changed';proof.foreignFrameIds.length=0;
 assert.deepEqual(retained(f.image,result.receipt,result.parts).foreignFrameIds,['neighbor']);
 for(const frames of [[{token,box:foreign.box}],[{...entry,id:'bad id'}],[{...entry,id:'neighbor'},{...entry,id:'neighbor',token:second}]])
  assert.throws(()=>observe({...request(f),foreignFrames:frames}),TypeError);
});

test('flat and checkerboard backgrounds cannot supply missing transparent paint, and the regression is in unified CI',()=>{
 for(const noise of [false,true]){
  const f=fixture();
  for(let y=0;y<160;y++)for(let x=0;x<200;x++){
   const offset=noise?((x+y)%2?3:-3):0;f.image.rgba.set([245+offset,249+offset,252+offset,255],(y*200+x)*4);
  }
  assert.ok(observe(request(f)).failure);
 }
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.ok(includesSuite(__filename,suite));
});

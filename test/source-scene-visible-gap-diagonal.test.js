'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSourceSceneVisibleGap:measure,measuredSceneVisibleGapCells}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
const {compileSourceSceneVisibleGap:compile}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap-compiler');
const {diagonalGapFixture:fixture}=require('./helpers/scene-diagonal-gap.cjs');

function dashedFixture(options={}){
 const f=fixture(options);for(const n of f.oracle)f.put(n%220,Math.floor(n/220),[255,255,255]);f.oracle.clear();
 for(const [lo,hi]of [[60,78],[86,104],[112,130]])for(let a=lo;a<=hi;a++)for(let c=-1;c<=1;c++){
  const p=f.transform(a,c);f.put(p.x,p.y);f.oracle.add(p.y*220+p.x);
 }
 return {...f,direction:'undirected'};
}

test('complete diagonal dashes retain every observed segment and native gap in every orientation',()=>{
 for(const up of [false,true])for(const reverse of [false,true])for(const vertical of [false,true]){
  const f=dashedFixture({up,reverse,vertical}),before=Buffer.from(f.image.rgba),result=measure(f);
  assert.ok(result.fit,JSON.stringify({up,reverse,vertical,reason:result.reason}));assert.ok(result.fit.strokeDashPattern);
  assert.deepEqual(measuredSceneVisibleGapCells(f.image,result.fit),f.oracle);assert.deepEqual(f.image.rgba,before);
  const pattern=JSON.parse(result.fit.strokeDashPattern);assert.equal(pattern.length,3);assert.ok(pattern.every(p=>p.every(n=>Number.isFinite(n)&&n>0)));
  const relation={id:'relation-dash',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:'undirected',shaftBox:f.shaftBox};
  const shape=compile({fit:result.fit,relation,fromId:f.from.id,toId:f.to.id,width:220,height:220,slideSize:{widthPt:220,heightPt:220}});
  assert.equal(shape.style.strokeDashPattern,result.fit.strokeDashPattern);assert.equal(shape.source.sourcePhysicalAttachment,false);
  assert.throws(()=>compile({fit:result.fit,relation:{...relation,shaftBox:{...f.shaftBox,x:f.shaftBox.x+1}},fromId:f.from.id,toId:f.to.id,width:220,height:220,slideSize:{widthPt:220,heightPt:220}}),/proof/u);
 }
});

test('diagonal dash proof rejects empty input, branches, false heads, blocked endpoints, foreign frames and exhausted work',()=>{
 for(const mode of ['empty','branch','direction','text','foreign','budget','alpha']){
  const f=dashedFixture();
  if(mode==='empty')for(const n of f.oracle)f.put(n%220,Math.floor(n/220),[255,255,255]);
  if(mode==='branch')for(let y=90;y<=110;y++)f.put(95,y);
  if(mode==='direction')f.direction='forward';
  if(mode==='text')f.textMasks=[{x:53,y:53,w:4,h:4}];
  if(mode==='foreign')f.to={...f.to,portFrame:{}};
  if(mode==='budget')f.budget.used=4000000;
  if(mode==='alpha')f.image.rgba[(95*220+95)*4+3]=0;
  assert.equal(measure(f).fit,null,mode);
 }
});

test('crossing dashed axes account for the complete junction without swallowing a third branch or an unproven spur',()=>{
 const crossing=()=>{
  const f=dashedFixture();
  for(const [lo,hi]of [[60,78],[86,104],[112,130]])for(let x=lo;x<=hi;x++)for(let c=-1;c<=1;c++)f.put(x,190-x+c);
  return f;
 };
 const f=crossing(),before=Buffer.from(f.image.rgba),result=measure(f);
 assert.ok(result.fit,result.reason);assert.ok(result.fit.strokeDashPattern);
 const cells=measuredSceneVisibleGapCells(f.image,result.fit);assert.ok(cells);
 for(const n of f.oracle)assert.ok(cells.has(n),'every original dash cell must be represented');
 assert.deepEqual(f.image.rgba,before);assert.ok(!cells.has(65*220+125),'the other axis remains unowned outside the junction');
 for(const mode of ['branch','spur','budget']){
  const bad=crossing();
  if(mode==='branch')for(let y=80;y<=100;y++)bad.put(95,y);
  if(mode==='spur')for(let x=112;x<=130;x++)for(let c=-1;c<=1;c++)bad.put(x,190-x+c,[255,255,255]);
  if(mode==='budget')bad.budget.used=4000000;
  assert.equal(measure(bad).fit,null,mode);
 }
});

test('joint source-ink observation retains antialiased cells with original component and corridor gates',()=>{
 const f=fixture(),extra=[];
 for(const n of f.oracle)for(const offset of [-1,1]){
  const neighbor=n+offset;if(f.oracle.has(neighbor)||extra.includes(neighbor))continue;
  extra.push(neighbor);f.put(neighbor%220,Math.floor(neighbor/220),[230,230,230]);
 }
 const before=Buffer.from(f.image.rgba),result=measure({...f,sourceInk:true});assert.ok(result.fit,result.reason);
 const cells=measuredSceneVisibleGapCells(f.image,result.fit);assert.ok(cells);
 for(const n of f.oracle)assert.ok(cells.has(n));
 for(const n of extra)assert.ok(cells.has(n),'a source-observed antialias cell must remain accounted for');
 assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);
 for(const value of [null,0,'yes',{},[]])assert.throws(()=>measure({...f,sourceInk:value}),TypeError);
 const broken=fixture();for(let y=90;y<=110;y++)broken.put(100,y,[255,255,255]);
 assert.equal(measure({...broken,sourceInk:true}).fit,null);
 const blocked=fixture();blocked.textMasks=[{x:53,y:53,w:4,h:4}];assert.equal(measure({...blocked,sourceInk:true}).fit,null);
});

test('diagonal logical gaps retain exact original pixels, real nodes and visible endpoints in all orientations',()=>{
 for(const up of [false,true])for(const reverse of [false,true])for(const vertical of [false,true]){
  const f=fixture({up,reverse,vertical}),before=Buffer.from(f.image.rgba),result=measure(f);assert.ok(result.fit,JSON.stringify({up,reverse,vertical,reason:result.reason}));
  assert.deepEqual(measuredSceneVisibleGapCells(f.image,result.fit),f.oracle);assert.deepEqual(f.image.rgba,before);
  assert.ok(result.fit.widthPx>=1&&result.fit.widthPx<=5);assert.equal(result.fit.support,1);
  const relation={id:'relation-gap',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:f.direction};
  const output=compile({fit:result.fit,relation,fromId:f.from.id,toId:f.to.id,width:220,height:220,slideSize:{widthPt:220,heightPt:220}});
  assert.equal(output.style.startAnchor.elementId,f.from.id);assert.equal(output.style.endAnchor.elementId,f.to.id);
  assert.equal(output.source.sourcePhysicalAttachment,false);assert.equal(output.source.sourceAttachmentKind,'visible-gap-logical');
  assert.equal(measuredSceneVisibleGapCells(f.image,structuredClone(result.fit)),null);
 }
});

test('source-ink discovery proves whole arrows beyond a proposal without clipping or weakening endpoint gates',()=>{
 for(const up of [false,true])for(const reverse of [false,true])for(const vertical of [false,true]){
  const f=fixture({up,reverse,vertical}),before=Buffer.from(f.image.rgba);
  f.shaftBox={x:85,y:85,w:20,h:20};
  const result=measure({...f,sourceInk:true});assert.ok(result.fit,JSON.stringify({up,reverse,vertical,reason:result.reason}));
  assert.deepEqual(measuredSceneVisibleGapCells(f.image,result.fit),f.oracle);
  assert.deepEqual(f.image.rgba,before);
 }
 for(const mode of ['blank','break','branch','corridor','text','node','wrong-head','foreign','alpha','budget','unrelated-proposal']){
  const f=fixture();f.shaftBox={x:85,y:85,w:20,h:20};
  if(mode==='blank')for(const cell of f.oracle)f.put(cell%220,Math.floor(cell/220),[255,255,255]);
  if(mode==='break')for(let y=90;y<=110;y++)f.put(100,y,[255,255,255]);
  if(mode==='branch')for(let y=100;y<115;y++)f.put(100,y);
  if(mode==='corridor')f.put(55,55);
  if(mode==='text')f.textMasks=[{x:120,y:120,w:4,h:4}];
  if(mode==='node')f.otherNodes=[{x:120,y:120,w:4,h:4}];
  if(mode==='wrong-head')f.direction='backward';
  if(mode==='foreign')f.to={...f.to,portFrame:{}};
  if(mode==='alpha')f.image.rgba[(100*220+100)*4+3]=0;
  if(mode==='budget')f.budget.used=4000000;
  if(mode==='unrelated-proposal')f.shaftBox={x:80,y:130,w:10,h:10};
  assert.equal(measure({...f,sourceInk:true}).fit,null,mode);assert.ok(f.budget.used<=4000000,mode);
 }
});
test('diagonal gaps reject broken components, extra branches, obstructed corridors, wrong heads and missing private bodies',()=>{
 for(const mode of ['blank','break','branch','corridor','text','node','wrong-head','foreign','alpha','budget','proposal']){
  const f=fixture();
  if(mode==='blank')for(const cell of f.oracle)f.put(cell%220,Math.floor(cell/220),[255,255,255]);
  if(mode==='break')for(let y=90;y<=110;y++)f.put(100,y,[255,255,255]);
  if(mode==='branch')for(let y=100;y<115;y++)f.put(100,y);
  if(mode==='corridor')f.put(55,55);
  if(mode==='text')f.textMasks=[{x:53,y:53,w:4,h:4}];
  if(mode==='node')f.otherNodes=[{x:53,y:53,w:4,h:4}];
  if(mode==='wrong-head')f.direction='backward';
  if(mode==='foreign')f.to={...f.to,portFrame:{}};
  if(mode==='alpha')f.image.rgba[(100*220+100)*4+3]=0;
  if(mode==='budget')f.budget.used=4000000;
  if(mode==='proposal')delete f.shaftBox;
  assert.equal(measure(f).fit,null,mode);assert.ok(f.budget.used<=4000000,mode);
 }
});
test('diagonal tests belong to the unified CI suite',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-scene-visible-gap-diagonal.test.js'));
});
test('the real scene compiler resolves a diagonal gap into one connector between the actual source nodes',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png'),{compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-diagonal-gap-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const plan={version:1,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:220,heightPx:220,
  regions:[{id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:220,h:220}}],
  objects:[f.from,f.to].map(n=>({id:'object-'+n.id,regionId:'region-root',kind:'container',box:n.box})),
  relations:[{id:'relation-gap',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:'forward',shaftBox:f.shaftBox}]};
 const compiled=compileSourceScene({root,sourceFile,plan,page:{shapes:[],textBoxes:[],images:[]},slideSize:{widthPt:220,heightPt:220}});
 assert.equal(compiled.evidence.resolvedRelations,1,JSON.stringify(compiled.evidence));assert.equal(compiled.evidence.sourceVisibleGaps,1);
 const connector=compiled.page.shapes.find(s=>s.id==='scene-relation-gap');assert.ok(connector);
 assert.equal(connector.style.startAnchor.elementId,'scene-container-object-a');assert.equal(connector.style.endAnchor.elementId,'scene-container-object-b');
 assert.equal(connector.source.sourcePhysicalAttachment,false);assert.deepEqual(compiled.page.images,[]);
});

"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSceneFillWindow}=require('../packages/slideclone-core/source-scene-fill-window');
const {appendSceneTableHeaderBackgrounds:append}=require('../packages/slideclone-core/source-scene-table-headers');
const {nativeFilledPathDisjoint}=require('../packages/slideclone-core/native-filled-path-overlap');
function rectangle(){return [{type:'moveTo',points:[{x:0,y:0}]},{type:'lnTo',points:[{x:1,y:0}]},
 {type:'lnTo',points:[{x:1,y:1}]},{type:'lnTo',points:[{x:0,y:1}]},{type:'close',points:[]}];}
function fixture(){const image={width:140,height:100,rgba:Buffer.alloc(140*100*4,255)};
 return {image,headers:[{id:'header',regionId:'table',box:{x:20,y:20,w:100,h:60}}],
  slideSize:{widthPt:140,heightPt:100},shapes:[],budget:{used:0},glyphReserve:()=>0,inventory:true};}
test('real disconnected source header paint keeps its observed gap instead of filling its bounding box',()=>{
 const f=fixture();for(let y=20;y<80;y++)for(let x=20;x<120;x++)if(x<65||x>=75)f.image.rgba.set([120,160,220,255],(y*140+x)*4);
 const original=Buffer.from(f.image.rgba);
 const fit=measureSceneFillWindow({image:f.image,hint:f.headers[0].box,fill:[120,160,220],color:'#78A0DC',
  budget:f.budget,marginX:8,marginY:8}).fit;
 assert.ok(fit?.parts);const spent=f.budget.used;
 const result=append({...f,measure:()=>fit});
 assert.equal(result.accepted,1);assert.equal(f.shapes.length,fit.parts.length);
 assert.ok(f.shapes.every(s=>s.type==='freeform'));
 assert.ok(f.shapes.every(s=>nativeFilledPathDisjoint(s,{x:66,y:22,w:8,h:56},{used:0,exhausted:false})));
 assert.deepEqual(result.inventoryUnits[0].members,f.shapes.map(s=>({type:'shape',id:s.id})));
 assert.equal(f.budget.used,spent);assert.deepEqual(f.image.rgba,original);
 assert.equal(f.shapes.some(s=>s.style?.startAnchor||s.style?.endAnchor),false);
});
test('all measured header parts retain one source identity and one complete inventory member list',()=>{
 const f=fixture(),fit={box:{x:20,y:20,w:100,h:60},fill:'#78A0DC',support:.9,parts:[
  {box:{x:20,y:20,w:45,h:60},segments:rectangle()},{box:{x:75,y:20,w:45,h:60},segments:rectangle()}]};
 const result=append({...f,measure:()=>fit});
 assert.equal(result.accepted,1);assert.equal(f.shapes.length,2);
 assert.equal(new Set(f.shapes.map(s=>s.source.nativeComponentGroupId)).size,1);
 assert.equal(result.inventoryUnits.length,1);assert.equal(result.inventoryUnits[0].members.length,2);
 assert.ok(f.shapes.every(s=>s.style.freeformSegments.length===5));
});
test('single body headers retain their original output and empty measurements emit no paint',()=>{
 const f=fixture(),fit={box:{x:20,y:20,w:100,h:60},fill:'#78A0DC',support:1};
 const result=append({...f,measure:()=>fit});assert.equal(result.accepted,1);
 assert.deepEqual(f.shapes[0],{id:'scene-header',type:'rect',box:fit.box,
  style:{fill:fit.fill,stroke:'none',strokeWidthPt:0,opacity:1},source:{editable:true,nativeRebuild:true,
   semanticNativeStructure:true,nativeComponentRole:'section-panel',detector:'source-scene-container',
   sceneRegionId:'table',residualBackgroundFill:true,preserveResidualInterior:true,sourcePerimeterSupport:1}});
 assert.equal(append({...fixture(),measure:()=>null}).accepted,0);
});
function measured(){return {box:{x:20,y:20,w:100,h:60},fill:'#78A0DC',support:.9,
 parts:[{box:{x:20,y:20,w:100,h:60},segments:rectangle()}]};}
test('paint part parser retains original 32 part and 120 command ceilings and isolates controls',()=>{
 const {parseScenePaintParts:parse}=require('../packages/slideclone-core/source-scene-paint-parts');
 const f=fixture(),v=measured(),before=structuredClone(v);
 const result=parse(v,f.image);result[0].box.x=0;result[0].segments[0].points[0].x=.1;
 assert.deepEqual(v,before);
 const maximum=measured();maximum.parts=Array.from({length:32},()=>structuredClone(maximum.parts[0]));assert.equal(parse(maximum,f.image).length,32);
 maximum.parts.push(structuredClone(maximum.parts[0]));assert.throws(()=>parse(maximum,f.image),TypeError);
 const commands=measured();commands.parts[0].segments=[rectangle()[0],...Array.from({length:118},()=>rectangle()[1]),rectangle()[4]];
 assert.equal(parse(commands,f.image)[0].segments.length,120);
 commands.parts[0].segments.splice(1,0,rectangle()[1]);assert.throws(()=>parse(commands,f.image),TypeError);
});
test('invalid or unsafe parts cannot create a bounding rectangle or leave partially appended shapes',()=>{
 const {parseScenePaintParts:parse}=require('../packages/slideclone-core/source-scene-paint-parts');
 let touches=0;
 const getter={get box(){touches++;throw Error('secret-payload');}};
 const poisonedParts=[{box:{x:20,y:20,w:45,h:60},segments:rectangle()},getter];
 const values=[{...measured(),parts:[]},{...measured(),parts:null},{...measured(),parts:new Array(1)},
  {...measured(),parts:new Proxy(measured().parts,{get(){touches++;throw Error('secret-payload');}})},
  {...measured(),segments:rectangle()},{...measured(),support:.57},{...measured(),fill:'secret-payload'},
  {...measured(),parts:poisonedParts},new Proxy(measured(),{get(){touches++;throw Error('secret-payload');}})];
 for(const mutate of [v=>{v.parts[0].box.x=19;},v=>{v.parts[0].box.w=101;},v=>{v.parts[0].box.w=Infinity;},
  v=>{v.parts[0].segments.pop();},v=>{v.parts[0].segments[1].points[0].x=2;}]){const v=measured();mutate(v);values.push(v);}
 for(const value of values){
  assert.throws(()=>parse(value,fixture().image),error=>error instanceof TypeError&&!error.message.includes('secret-payload'));
 }
 assert.equal(touches,0);
 const f=fixture();assert.throws(()=>append({...f,measure:()=>({...measured(),parts:poisonedParts})}),TypeError);
 assert.deepEqual(f.shapes,[]);assert.equal(touches,0);
 const exhausted=fixture();exhausted.budget.used=4000000;
 assert.deepEqual(append({...exhausted,measure:()=>{throw Error('unreachable');}}),{accepted:0,skippedBudget:1,inventoryUnits:[]});
 assert.throws(()=>append({...fixture(),measure:()=>{throw Error('measurement-failure');}}),/measurement-failure/);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-scene-header-paint.test.js','unit'),true);
});
test('a coincident union rectangle cannot suppress fragmented contours as already represented',()=>{
 const f=fixture();f.shapes.push({id:'old-union',type:'rect',box:{x:20,y:20,w:100,h:60},style:{fill:'#78A0DC'}});
 const v=measured();v.parts=[{box:{x:20,y:20,w:45,h:60},segments:rectangle()},{box:{x:75,y:20,w:45,h:60},segments:rectangle()}];
 assert.equal(append({...f,measure:()=>v}).accepted,1);assert.equal(f.shapes.length,3);
 assert.equal(append({...f,measure:()=>v}).accepted,0);assert.equal(f.shapes.length,3);
});

test('a surviving source-measured body prevents header recovery from minting a duplicate inventory unit',()=>{
 const f=fixture();for(let y=20;y<80;y++)for(let x=20;x<120;x++)f.image.rgba.set([120,160,220,255],(y*140+x)*4);
 const {createSceneMeasurementCache:create}=require('../packages/slideclone-core/source-scene-measurement-cache');
 const cache=create(f.image,[],f.budget),declared={x:21,y:21,w:98,h:58},fit=cache.fill(declared);assert.ok(fit);
 const before={id:'declared-body',type:'freeform',box:fit.box,style:{fill:'#79A1DC',freeformSegments:rectangle()}};
 f.shapes.push(before);const seen=[];
 const result=append({...f,measure:hint=>cache.fill(hint),isMeasuredBodyRepresented:header=>{
  seen.push(header.id);return cache.sameSurface(header.box,declared)&&f.shapes.includes(before);
 }});
 assert.equal(result.accepted,0);assert.deepEqual(result.inventoryUnits,[]);assert.deepEqual(f.shapes,[before]);assert.deepEqual(seen,['header']);
 const removed=fixture();removed.image=f.image;assert.equal(append({...removed,measure:()=>fit,isMeasuredBodyRepresented:()=>false}).accepted,1);
 const absent=fixture();assert.equal(append({...absent,measure:()=>null,isMeasuredBodyRepresented:()=>{throw Error('unreachable');}}).accepted,0);
});

test('invalid source identity policies and policy failures cannot append partial header paint',()=>{
 const fit={box:{x:20,y:20,w:100,h:60},fill:'#78A0DC',support:1};
 for(const policy of [null,true,{},'private-token']){
  const f=fixture();assert.throws(()=>append({...f,measure:()=>fit,isMeasuredBodyRepresented:policy}),TypeError);assert.deepEqual(f.shapes,[]);
 }
 const f=fixture();assert.throws(()=>append({...f,measure:()=>fit,isMeasuredBodyRepresented:()=>{throw Error('policy-failure');}}),/policy-failure/);
 assert.deepEqual(f.shapes,[]);
});

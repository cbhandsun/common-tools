"use strict";
// Compile probes use only spare crop work. They neither defer the existing
// required structure reviews nor remove any final compilation rejection.
const test=require('node:test'),assert=require('node:assert/strict');
const {allocateSourceSceneReview:allocate}=require('../packages/slideclone-core/scene-plan/source-scene-review-allocation');

test('both unknown glyph views retain their complete bounded context and charge the unchanged pixel allowance',()=>{
 const {sourceSceneReviewCrop:crop}=require('../packages/slideclone-core/scene-plan/source-scene-review-allocation');
 const target={index:0,box:{x:40,y:40,w:12,h:8},role:'missing',optional:false,textKnown:false},before=structuredClone(target);
 assert.deepEqual(crop(target,0,100,100),{x:35,y:35,w:22,h:18});
 assert.deepEqual(crop(target,.7,100,100),{x:31,y:31,w:30,h:26});
 assert.deepEqual(crop({...target,textKnown:true},0,100,100),target.box);
 const cost=allocate({width:100,height:100,targets:[target]});
 assert.equal(cost.reservedPixels,2*(22*18+30*26)+8*12*8);assert.ok(cost.sheetPixels+cost.reservedPixels<=4000000);
 const edge={...target,box:{x:0,y:0,w:12,h:8}};
 assert.deepEqual(crop(edge,0,20,15),{x:0,y:0,w:17,h:13});
 assert.deepEqual(crop(edge,.7,20,15),{x:0,y:0,w:20,h:15});assert.deepEqual(target,before);
});

test('unadmitted relation repair can defer without displacing required structural review',()=>{
 const targets=[{index:0,box:{x:30,y:30,w:40,h:40},role:'structure',optional:false,textKnown:false},
  {index:1,box:{x:0,y:0,w:2304,h:1728},role:'relation',optional:true,textKnown:false}];
 const input={width:2304,height:1728,targets},before=structuredClone(input),result=allocate(input);
 assert.deepEqual(result.indices,[0]);
 assert.deepEqual(result.deferred,[{index:1,role:'relation',reason:'optional-complete-stage-budget'}]);
 assert.deepEqual(input,before);
 assert.throws(()=>allocate({...input,targets:[targets[0],{...targets[1],optional:false}]}),RangeError);
 const small=allocate({...input,targets:[targets[0],{...targets[1],box:{x:100,y:100,w:40,h:40}}]});
 assert.deepEqual(small.indices,[0,1]);assert.deepEqual(small.deferred,[]);
});

test('final crop allocation preserves uncovered text-only members before optional regional inventories',()=>{
 const review={index:0,box:{x:10,y:10,w:20,h:20},role:'review',optional:false,textKnown:false};
 const inventory={index:9,box:{x:500,y:300,w:1100,h:1100},role:'region-inventory',optional:true,textKnown:false};
 const label={index:1,box:{x:2600,y:500,w:200,h:200},role:'missing',optional:true,textKnown:false};
 const input={width:4000,height:1600,targets:[review,inventory,label]},before=JSON.stringify(input);
 const oldOrder=allocate(input);assert.ok(oldOrder.indices.includes(9));assert.ok(!oldOrder.indices.includes(1));
 const retained=allocate({...input,targets:[review,inventory,{...label,labelCandidate:true}]});
 assert.ok(retained.indices.includes(1));assert.ok(!retained.indices.includes(9));
 assert.deepEqual(retained.deferred,[{index:9,role:'region-inventory',reason:'optional-complete-stage-budget'}]);
 assert.ok(retained.reservedPixels>0&&retained.sheetPixels+retained.reservedPixels+(retained.focusPixels??0)<=4000000);
 assert.equal(JSON.stringify(input),before);
 const required=allocate({...input,targets:[review,{...inventory,box:{x:500,y:500,w:550,h:550},role:'structure',optional:false},{...label,labelCandidate:true}]});
 assert.ok(required.indices.includes(9),'member priority cannot displace a required correction');
});

test('label scheduling hints reject invalid roles, empty flags, accessors and proxies without source authority',()=>{
 const target={index:1,box:{x:10,y:10,w:30,h:30},role:'missing',optional:true,textKnown:false,labelCandidate:true};
 const input={width:100,height:100,targets:[target]};assert.deepEqual(allocate(input).indices,[1]);
 for(const labelCandidate of [false,null,0,'true',{}])assert.throws(()=>allocate({...input,targets:[{...target,labelCandidate}]}),TypeError);
 for(const role of ['review','inventory','region-inventory','structure','probe','relation'])
  assert.throws(()=>allocate({...input,targets:[{...target,role}]}),TypeError);
 assert.throws(()=>allocate({...input,targets:[{...target,textKnown:true,optional:false}]}),TypeError);
 let calls=0;const getter={...target};Object.defineProperty(getter,'labelCandidate',{get(){calls++;throw Error('private-token');}});
 for(const raw of [getter,new Proxy(target,{get(){calls++;throw Error('private-token');}})])
  assert.throws(()=>allocate({...input,targets:[raw]}),error=>error instanceof TypeError&&!error.message.includes('private-token'));
 assert.equal(calls,0);assert.deepEqual(allocate({width:100,height:100,targets:[]}).indices,[]);
 const enormous={...target,box:{x:0,y:0,w:2000,h:2000}};
 const result=allocate({width:3000,height:3000,targets:[enormous]});assert.deepEqual(result.indices,[]);
 assert.equal(result.deferred.length,1);assert.equal(result.reservedPixels,0);
});
test('complete review context is charged while the original OCR target retains its identity',()=>{
 const target={index:0,box:{x:40,y:40,w:12,h:8},contextBox:{x:20,y:20,w:60,h:60},role:'review',optional:false,textKnown:false};
 const input={width:150,height:150,targets:[target]},before=JSON.stringify(input),result=allocate(input);
 const plain=allocate({...input,targets:[{...target,contextBox:undefined}]});
 assert.ok(result.sheetPixels>plain.sheetPixels);assert.equal(result.reservedPixels,78*78);
 assert.deepEqual(result.indices,[0]);assert.equal(JSON.stringify(input),before);
 const {sourceSceneReviewCrop}=require('../packages/slideclone-core/scene-plan/source-scene-review-allocation');
 assert.deepEqual(sourceSceneReviewCrop(target,0,150,150),target.contextBox);
 assert.deepEqual(sourceSceneReviewCrop(target,.7,150,150),{x:11,y:11,w:78,h:78});
 for(const contextBox of [null,{x:45,y:40,w:10,h:10},{x:0,y:0,w:151,h:150},new Proxy(target.contextBox,{})])
  assert.throws(()=>allocate({...input,targets:[{...target,contextBox}]}),/target/);
 let touched=false;const hostile={};Object.defineProperty(hostile,'x',{get(){touched=true;throw Error('private');}});
 assert.throws(()=>allocate({...input,targets:[{...target,contextBox:hostile}]}),/target/);assert.equal(touched,false);
 assert.throws(()=>allocate({...input,targets:[{...target,role:'missing'}]}),/target/);
 assert.throws(()=>allocate({width:2000,height:2000,targets:[{...target,contextBox:{x:0,y:0,w:2000,h:2000}}]}),/budget/);
});
function fixture(){
 const sizes=[[340,130],[146,148],[127,111],[124,115],[131,131],[117,131],[126,122],[117,122],[235,108],[251,117],[235,184],[251,169],[288,169]];
 return {width:2304,height:1728,targets:sizes.map(([w,h],index)=>({index,box:{x:100,y:200,w,h},
  role:index<3?'review':index<8?'missing':'inventory',optional:index>=3,textKnown:false}))};
}

test('focused OCR views charge both complete observations and preserve every atlas target',()=>{
 const target={index:0,box:{x:40,y:40,w:12,h:8},contextBox:{x:20,y:20,w:60,h:60},role:'review',optional:false,textKnown:false};
 const result=allocate({width:150,height:150,targets:[target]});
 assert.deepEqual(result.focusIndices,[0]);assert.equal(result.focusPixels,60*60+78*78);
 assert.ok(result.sheetPixels+result.reservedPixels+result.focusPixels<=4000000);
 const wide=allocate({width:150,height:150,targets:Array.from({length:32},(_,index)=>({...target,index}))});
 assert.equal(wide.indices.length,32);assert.equal(wide.focusIndices,undefined,'32 reviews cannot add a 33rd transport image');
 const large=allocate({width:1000,height:1000,targets:Array.from({length:8},(_,index)=>({...target,index,
  contextBox:{x:0,y:0,w:450,h:450}}))});
 assert.equal(large.indices.length,8);assert.equal(large.focusIndices,undefined,'focused copies cannot borrow downstream reserves');
});

test('an oversized context observation cannot enlarge the source isolation window limit',()=>{
 const {sourceSceneReviewedGraphicCrop}=require('../packages/slideclone-core/scene-plan/source-scene-review-allocation');
 const target={index:0,box:{x:400,y:400,w:20,h:20},contextBox:{x:250,y:250,w:500,h:500},role:'review',optional:false,textKnown:false};
 const result=allocate({width:1000,height:1000,targets:[target]});
 assert.deepEqual(sourceSceneReviewedGraphicCrop(target,1000,1000),target.contextBox);
 assert.equal(result.reservedPixels,250000);assert.ok(result.sheetPixels+result.reservedPixels<=4000000);
});

test('pixel allocation preserves semantic inventory priority instead of sorting probes ahead by target ID',()=>{
 const input={width:4000,height:1600,targets:[
  {index:0,box:{x:10,y:10,w:20,h:20},role:'review',optional:false,textKnown:false},
  {index:9,box:{x:500,y:500,w:550,h:550},role:'inventory',optional:true,textKnown:false},
  {index:1,box:{x:2600,y:500,w:550,h:550},role:'probe',optional:true,textKnown:false}]};
 const before=JSON.stringify(input),result=allocate(input);
 assert.deepEqual(result.indices,[0,9]);assert.deepEqual(result.deferred,[{index:1,role:'probe',reason:'optional-complete-stage-budget'}]);
 assert.ok(result.sheetPixels+result.reservedPixels<=4000000);assert.equal(JSON.stringify(input),before);
 const sameRole={...input,targets:[input.targets[0],input.targets[1],{...input.targets[2],role:'inventory'}]};
 assert.deepEqual(allocate(sameRole).indices,[0,9]);
});
test('additional compiler probes can defer under 4M while original required structure and OCR slots remain mandatory',()=>{
 const input={width:2304,height:1728,targets:[
  {index:0,box:{x:10,y:10,w:20,h:20},role:'review',optional:false,textKnown:false},
  {index:1,box:{x:40,y:40,w:30,h:30},role:'structure',optional:false,textKnown:false},
  {index:2,box:{x:100,y:100,w:1200,h:1000},role:'probe',optional:true,textKnown:false}]};
 const result=allocate(input);assert.deepEqual(result.indices,[0,1]);assert.deepEqual(result.deferred,[{index:2,role:'probe',reason:'optional-complete-stage-budget'}]);
 assert.ok(result.sheetPixels+result.reservedPixels<=4000000);
 assert.throws(()=>allocate({...input,targets:[...input.targets.slice(0,2),{...input.targets[2],role:'structure',optional:true}]}),TypeError);
 assert.throws(()=>allocate({...input,targets:[...input.targets.slice(0,2),{...input.targets[2],role:'structure',optional:false}]}),RangeError);
});
test('missing glyph discovery reserves complete source scans before an optional compiler probe',()=>{
 const input={width:4000,height:1600,targets:[
  {index:0,box:{x:10,y:10,w:20,h:20},role:'review',optional:false,textKnown:false},
  {index:1,box:{x:2600,y:500,w:550,h:550},role:'probe',optional:true,textKnown:false},
  {index:9,box:{x:500,y:500,w:200,h:200},role:'missing',optional:true,textKnown:false}]};
 const before=JSON.stringify(input),result=allocate(input);
 assert.deepEqual(result.indices,[0,9]);assert.deepEqual(result.deferred,[{index:1,role:'probe',reason:'optional-complete-stage-budget'}]);
 assert.ok(result.reservedPixels>0);assert.ok(result.sheetPixels+result.reservedPixels+(result.focusPixels??0)<=4000000);
 assert.equal(JSON.stringify(input),before);
 const required={...input,targets:[input.targets[0],{...input.targets[1],role:'structure',optional:false},input.targets[2]]};
 assert.ok(allocate(required).indices.includes(1),'a mandatory structure retains priority');
});
test('complete local-stage budgeting preserves mandatory targets and reserves downstream source scans',()=>{
 const input=fixture(),before=JSON.stringify(input),result=allocate(input);
 assert.deepEqual(result.indices,input.targets.map(t=>t.index));assert.equal(result.deferred.length,0);
 assert.ok(result.reservedPixels>0&&result.sheetPixels+result.reservedPixels<=4000000);
 assert.equal(JSON.stringify(input),before);assert.deepEqual(allocate(input),result);
 assert.ok(result.deferred.every(d=>input.targets[d.index].optional&&d.reason==='optional-complete-stage-budget'));
});
test('empty and normal stages need no speculative deferral; explicit text and structure retain identity',()=>{
 assert.deepEqual(allocate({width:10,height:10,targets:[]}),{indices:[],sheetPixels:0,reservedPixels:0,deferred:[]});
 const input={width:400,height:300,targets:[
  {index:511,box:{x:10.5,y:20.25,w:22,h:10},role:'missing',optional:false,textKnown:true},
  {index:1,box:{x:100,y:100,w:20,h:30},role:'structure',optional:false,textKnown:false}]};
 const result=allocate(input);assert.deepEqual(result.indices,[511,1]);assert.equal(result.deferred.length,0);assert.equal(result.reservedPixels,23*11);
});
test('required-stage exhaustion fails before model calls and cannot discard explicit missing glyphs',()=>{
 const input={width:1000,height:1000,targets:Array.from({length:10},(_,index)=>({index,
  box:{x:400,y:400,w:180,h:160},role:'missing',optional:false,textKnown:false}))};
 assert.throws(()=>allocate(input),/required review stages/);
 const graphic={width:2304,height:1728,targets:[{index:0,box:{x:0,y:0,w:2304,h:1728},role:'review',optional:false,textKnown:false}]};
 assert.throws(()=>allocate(graphic),RangeError);
 const explicit=fixture();explicit.targets[3].textKnown=true;
 assert.throws(()=>allocate(explicit),/target is invalid/);
});
test('invalid, extreme, hostile and inherited control fields fail without invoking accessors',()=>{
 let calls=0;const getter={};Object.defineProperty(getter,'width',{enumerable:true,get(){calls++;throw Error('private-token');}});
 for(const value of [null,new Proxy(fixture(),{}),getter,{...fixture(),width:Infinity},{...fixture(),height:0},
  {...fixture(),targets:new Array(1)},{...fixture(),targets:new Proxy(fixture().targets,{})},
  {...fixture(),targets:[Object.create(fixture().targets[0])]},{...fixture(),targets:[new Proxy(fixture().targets[0],{})]},
  {...fixture(),targets:[{...fixture().targets[0],index:512}]},{...fixture(),targets:[{...fixture().targets[0],box:{x:-1,y:0,w:1,h:1}}]},
  {...fixture(),targets:[{...fixture().targets[0],optional:true}]},{...fixture(),targets:[fixture().targets[0],fixture().targets[0]]}])
  assert.throws(()=>allocate(value),e=>!e.message.includes('private-token'));
 assert.equal(calls,0);
});

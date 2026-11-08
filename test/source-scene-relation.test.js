"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {measureSceneRelation}=require("../packages/slideclone-core/scene-plan/source-scene-relation");
function fixture(direction="forward"){
 const image={width:200,height:140,rgba:Buffer.alloc(200*140*4,255)};
 const put=(x,y)=>image.rgba.set([30,60,90,255],(y*200+x)*4);
 for(let x=81;x<=118;x++)for(let y=59;y<=61;y++)put(x,y);
 if(direction==="forward"||direction==="both")for(let x=114;x<=118;x++)for(let y=60-(118-x);y<=60+(118-x);y++)put(x,y);
 if(direction==="backward"||direction==="both")for(let x=81;x<=85;x++)for(let y=60-(x-81);y<=60+(x-81);y++)put(x,y);
 return {image,from:{id:"left",box:{x:20,y:40,w:60,h:40}},to:{id:"right",box:{x:120,y:40,w:60,h:40}},direction,textMasks:[],budget:{used:0}};
}
test('longer triangular source heads require their complete taper and stable body, with the original direction and ownership gates',()=>{
 for(const direction of ['forward','backward'])for(const length of [12,14,16]){
  const f=fixture('unknown');f.direction=direction;
  const right=direction==='forward';
  for(let step=0;step<length;step++){
   const x=right?118-step:81+step,radius=Math.round(8*step/(length-1));
   for(let y=59;y<=61;y++)f.image.rgba.set([255,255,255,255],(y*200+x)*4);
   for(let y=60-radius;y<=60+radius;y++)f.image.rgba.set([30,60,90,255],(y*200+x)*4);
  }
  const before=Buffer.from(f.image.rgba),fit=measureSceneRelation(f);
  assert.ok(fit, direction+' '+length);assert.equal(fit.widthPx,3);assert.ok(fit.support>=.9);
  assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);
  assert.equal(measureSceneRelation({...f,direction:'both',budget:{used:0}}),null);
  assert.equal(measureSceneRelation({...f,direction:'undirected',budget:{used:0}}),null);
  assert.equal(measureSceneRelation({...f,textMasks:[{x:100,y:55,w:10,h:10}],budget:{used:0}}),null);
 }
});

test('an explicit undirected shaft needs observed continuous paint and rejects headed source',()=>{
 const f=fixture('undirected'),before=Buffer.from(f.image.rgba);
 const fit=measureSceneRelation(f);assert.ok(fit);assert.equal(fit.widthPx,3);assert.deepEqual(f.image.rgba,before);
 assert.ok(measureSceneRelation({...f,from:f.to,to:f.from}));
 assert.equal(measureSceneRelation({...fixture('forward'),direction:'undirected'}),null);
 assert.equal(measureSceneRelation({...fixture('both'),direction:'undirected'}),null);
 assert.equal(measureSceneRelation({...f,direction:'unknown'}),null);
 assert.equal(measureSceneRelation({...f,textMasks:[{x:92,y:59,w:10,h:5}]}),null);
 f.image.rgba.fill(255);assert.equal(measureSceneRelation(f),null);
});
test("source relation requires a measured shaft, correct arrow direction and real container sites",()=>{
 for(const direction of ["forward","backward","both"]){const f=fixture(direction),r=measureSceneRelation(f);assert.ok(r,direction);
  assert.deepEqual(r.start,{x:80,y:60});assert.deepEqual(r.end,{x:120,y:60});assert.equal(r.color,"#1E3C5A");assert.equal(r.widthPx,3);assert.ok(r.support>=.9);assert.ok(f.budget.used>0);}
 const f=fixture("forward");assert.equal(measureSceneRelation({...f,direction:"both"}),null);
 assert.equal(measureSceneRelation({...f,direction:"backward"}),null);
});
test("vertical relations and reverse object order retain source arrow direction",()=>{
 const f=fixture(),original=f.image,rgba=Buffer.alloc(original.rgba.length);
 for(let y=0;y<140;y++)for(let x=0;x<200;x++)original.rgba.copy(rgba,(x*140+y)*4,(y*200+x)*4,(y*200+x+1)*4);
 const transpose=node=>({id:node.id,box:{x:node.box.y,y:node.box.x,w:node.box.h,h:node.box.w}});
 const input={...f,image:{width:140,height:200,rgba},from:transpose(f.from),to:transpose(f.to)};
 const result=measureSceneRelation(input);assert.ok(result);assert.equal(result.startSide,"bottom");assert.equal(result.endSide,"top");
 assert.ok(measureSceneRelation({...input,from:input.to,to:input.from,direction:"backward"}));
});
test("blank source, plain shafts, occlusion, detached arrows and unaligned nodes remain unresolved",()=>{
 const blank=fixture();blank.image.rgba.fill(255);assert.equal(measureSceneRelation(blank),null);
 assert.equal(measureSceneRelation(fixture("unknown")),null);
 const line=fixture("unknown");line.direction="forward";assert.equal(measureSceneRelation(line),null);
 const occluded=fixture();for(let x=95;x<104;x++)for(let y=55;y<65;y++)occluded.image.rgba.fill(255,(y*200+x)*4,(y*200+x+1)*4);
 assert.equal(measureSceneRelation(occluded),null);
 const broken=fixture();for(let y=55;y<65;y++)broken.image.rgba.fill(255,(y*200+100)*4,(y*200+101)*4);
 assert.equal(measureSceneRelation(broken),null);
 const f=fixture();assert.equal(measureSceneRelation({...f,textMasks:[{x:92,y:59,w:10,h:5}]}),null);
 assert.equal(measureSceneRelation({...f,to:{...f.to,box:{...f.to.box,y:50}}}),null);
});
test("relation boundaries reject unsafe input without invoking accessors and keep the shared scan budget",()=>{
 const f=fixture();assert.throws(()=>measureSceneRelation({...f,budget:{used:4000000}}),/budget/);
 assert.throws(()=>measureSceneRelation({...f,to:{...f.to,id:f.from.id}}),/input/);
 assert.throws(()=>measureSceneRelation({...f,textMasks:new Array(1)}),/input/);
 assert.throws(()=>measureSceneRelation({...f,to:{...f.to,box:{x:199,y:1,w:50,h:30}}}),/source/);
 let calls=0;const hostile={};Object.defineProperty(hostile,"image",{get(){calls++;throw Error("private");}});
 assert.throws(()=>measureSceneRelation(hostile),/input/);assert.throws(()=>measureSceneRelation(new Proxy(f,{})),/input/);assert.equal(calls,0);
});

test("a source shaft within the original 2px allowance binds its observed row instead of an assumed midpoint",()=>{
 const image={width:100,height:100,rgba:Buffer.alloc(100*100*4,255)},put=(x,y)=>image.rgba.set([30,60,90,255],(y*100+x)*4);
 for(let x=31;x<=44;x++)for(let y=47;y<=49;y++)put(x,y);
 for(let x=39;x<=44;x++)for(let y=48-(44-x);y<=48+(44-x);y++)put(x,y);
 const input={image,from:{id:"a",box:{x:10,y:20,w:20,h:60}},to:{id:"b",box:{x:45,y:20,w:20,h:60}},direction:"forward",textMasks:[],budget:{used:0}};
 const result=measureSceneRelation(input);assert.ok(result);
 assert.deepEqual(result.start,{x:30,y:48});assert.deepEqual(result.end,{x:45,y:48});
 assert.equal(result.startPosition,28/60);assert.equal(result.endPosition,28/60);assert.equal(result.widthPx,3);
 assert.ok(result.support>=.9);assert.ok(input.budget.used<=4000000);
 const unsafe={...input,textMasks:[{x:32,y:40,w:6,h:10}],budget:{used:0}};assert.equal(measureSceneRelation(unsafe),null);
 const wrong={...input,direction:"both",budget:{used:0}};assert.equal(measureSceneRelation(wrong),null);
});

test("transparent source ink and exterior pixels cannot prove a visible shaft",()=>{
 const f=fixture();for(let y=55;y<=65;y++)for(let x=81;x<=118;x++)f.image.rgba[(y*200+x)*4+3]=0;
 assert.equal(measureSceneRelation(f),null);
 const bg=fixture();bg.image.rgba.fill(0);assert.equal(measureSceneRelation(bg),null);
});

test("a real offset shaft requires two source-boundary tokens and independently observed attachments",()=>{
 const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
 const f=fixture();f.image.rgba.fill(255);
 for(const node of [f.from,f.to])for(let y=40;y<80;y++)for(let x=node.box.x;x<node.box.x+60;x++)f.image.rgba.set([210,230,245,255],(y*200+x)*4);
 for(let x=80;x<=119;x++)for(let y=56;y<=58;y++)f.image.rgba.set([30,60,90,255],(y*200+x)*4);
 for(let x=114;x<=119;x++)for(let y=57-(119-x);y<=57+(119-x);y++)f.image.rgba.set([30,60,90,255],(y*200+x)*4);
 const cache=createSceneMeasurementCache(f.image,[],f.budget);
 assert.equal(cache.portFrame(f.from.box),null);
 assert.ok(cache.fill(f.from.box));assert.ok(cache.fill(f.to.box));
 f.from.portFrame=cache.portFrame(f.from.box);f.to.portFrame=cache.portFrame(f.to.box);
 assert.ok(f.from.portFrame);assert.ok(f.to.portFrame);
 assert.equal(measureSceneRelation({...f,from:{id:f.from.id,box:f.from.box},to:{id:f.to.id,box:f.to.box}}),null);
 const result=measureSceneRelation(f);assert.ok(result);
 assert.equal(result.start.y,57);assert.equal(result.end.y,57);assert.equal(result.startPosition,17/40);assert.equal(result.endPosition,17/40);
 assert.equal(result.widthPx,3);assert.ok(result.support>=.9);
 assert.equal(measureSceneRelation({...f,from:{...f.from,portFrame:structuredClone(f.from.portFrame)}}),null);
 assert.equal(measureSceneRelation({...f,to:{...f.to,portFrame:new Proxy(f.to.portFrame,{})}}),null);
 const cloned={...f,image:{...f.image,rgba:Buffer.from(f.image.rgba)}};assert.equal(measureSceneRelation(cloned),null);
 f.image.rgba.fill(255,(57*200+119)*4,(57*200+120)*4);
 for(let y=56;y<=58;y++)f.image.rgba.fill(255,(y*200+119)*4,(y*200+120)*4);
 assert.equal(measureSceneRelation({...f,budget:{used:0}}),null);
});

function unequalPorts(){
 const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
 const f=fixture();f.image.rgba.fill(255);f.from.box={x:20,y:20,w:60,h:80};f.to.box={x:120,y:40,w:60,h:20};
 for(const node of [f.from,f.to])for(let y=node.box.y;y<node.box.y+node.box.h;y++)for(let x=node.box.x;x<node.box.x+node.box.w;x++)
  f.image.rgba.set([210,230,245,255],(y*200+x)*4);
 for(let x=80;x<=119;x++)for(let y=49;y<=51;y++)f.image.rgba.set([30,60,90,255],(y*200+x)*4);
 for(let x=114;x<=119;x++)for(let y=50-(119-x);y<=50+(119-x);y++)f.image.rgba.set([30,60,90,255],(y*200+x)*4);
 const cache=createSceneMeasurementCache(f.image,[],f.budget);assert.ok(cache.fill(f.from.box));assert.ok(cache.fill(f.to.box));
 f.from.portFrame=cache.portFrame(f.from.box);f.to.portFrame=cache.portFrame(f.to.box);return f;
}

test('different node centers do not veto a straight shaft proven at both measured source ports',()=>{
 const f=unequalPorts(),before=f.budget.used,fit=measureSceneRelation(f);assert.ok(fit);
 assert.deepEqual(fit.start,{x:80,y:50});assert.deepEqual(fit.end,{x:120,y:50});
 assert.equal(fit.startPosition,30/80);assert.equal(fit.endPosition,10/20);assert.equal(fit.widthPx,3);
 assert.ok(fit.support>=.9);assert.ok(f.budget.used>before);assert.ok(f.budget.used<=4000000);
 assert.ok(measureSceneRelation({...f,from:f.to,to:f.from,direction:'backward'}));
});

test('a shared port hypothesis grants no authority to guessed, occluded, detached or ambiguous geometry',()=>{
 const f=unequalPorts();
 for(const token of [undefined,{},structuredClone(f.from.portFrame),new Proxy(f.from.portFrame,{})]){
  const budget={used:0};assert.equal(measureSceneRelation({...f,from:{...f.from,portFrame:token},budget}),null);assert.equal(budget.used,0);
 }
 assert.equal(measureSceneRelation({...f,image:{...f.image,rgba:Buffer.from(f.image.rgba)},budget:{used:0}}),null);
 assert.equal(measureSceneRelation({...f,textMasks:[{x:90,y:49,w:6,h:4}]}),null);
 assert.equal(measureSceneRelation({...f,direction:'both'}),null);
 assert.equal(measureSceneRelation({...f,budget:{used:4000000}}),null);
 for(let y=49;y<=51;y++)f.image.rgba.fill(255,(y*200+100)*4,(y*200+101)*4);
 assert.equal(measureSceneRelation({...f,budget:{used:0}}),null);
});

test('measured noncentral ports work vertically and retain independent attachment and scan limits',()=>{
 const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
 const {measureSceneRelationDetailed}=require('../packages/slideclone-core/scene-plan/source-scene-relation');
 const f=unequalPorts(),image={width:f.image.height,height:f.image.width,rgba:Buffer.alloc(f.image.rgba.length)};
 for(let y=0;y<f.image.height;y++)for(let x=0;x<f.image.width;x++)
  image.rgba.set(f.image.rgba.subarray((y*f.image.width+x)*4,(y*f.image.width+x+1)*4),(x*image.width+y)*4);
 const swap=b=>({x:b.y,y:b.x,w:b.h,h:b.w}),from={id:'a',box:swap(f.from.box)},to={id:'b',box:swap(f.to.box)},budget={used:0};
 const cache=createSceneMeasurementCache(image,[],budget);assert.ok(cache.fill(from.box));assert.ok(cache.fill(to.box));
 from.portFrame=cache.portFrame(from.box);to.portFrame=cache.portFrame(to.box);
 const input={...f,image,from,to,budget},before=Buffer.from(image.rgba),fit=measureSceneRelation(input);
 assert.ok(fit);assert.deepEqual(fit.start,{x:50,y:80});assert.deepEqual(fit.end,{x:50,y:120});
 assert.equal(fit.startSide,'bottom');assert.equal(fit.endSide,'top');assert.equal(fit.startPosition,30/80);
 assert.ok(measureSceneRelation({...input,from:to,to:from,direction:'backward'}));assert.deepEqual(image.rgba,before);
 const capped={used:4000000};assert.deepEqual(measureSceneRelationDetailed({...input,budget:capped}),{fit:null,reason:'source-scan-budget'});
 assert.equal(capped.used,4000000);
 // A valid token cannot excuse a detached tip, even when the full-gap support
 // would pass. Neither the axis hypothesis nor the shaft grants a port.
 for(let x=49;x<=51;x++)image.rgba.fill(255,(119*image.width+x)*4,(119*image.width+x+1)*4);
 assert.equal(measureSceneRelation({...input,budget:{used:0}}),null);
});

test('the shared interval is only a bounded hypothesis, never evidence for blank or disjoint nodes',()=>{
 const {createMeasuredScenePortFrame}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
 const {measuredScenePortAxis}=require('../packages/slideclone-core/scene-plan/source-scene-port-axis');
 const f=unequalPorts();f.image.rgba.fill(255);assert.equal(measureSceneRelation({...f,budget:{used:0}}),null);
 for(const bounds of [{x:120,y:101,w:60,h:20},{x:40,y:35,w:60,h:20},{x:120,y:100,w:60,h:20}]){
  const to={id:'b',box:bounds,portFrame:createMeasuredScenePortFrame(f.image,{box:bounds,fill:'#D2E6F5'})};
  const budget={used:0};assert.equal(measuredScenePortAxis({...f,to}),null);
  assert.equal(measureSceneRelation({...f,to,budget}),null);assert.equal(budget.used,0);
 }
});

test("axis recovery cannot spend beyond the existing pixel allowance or emit incompatible proofs",()=>{
 const f=fixture();f.image.rgba.fill(255);f.budget.used=3999900;
 assert.throws(()=>measureSceneRelation(f),RangeError);assert.equal(f.budget.used,3999900);
 const {recoverSourceRelationAxis}=require('../packages/slideclone-core/scene-plan/source-scene-relation-recovery');
 const fit={start:{x:0,y:0},end:{x:10,y:0},startSide:"right",endSide:"left",widthPx:3,support:1,color:"#123456"};
 assert.equal(recoverSourceRelationAxis(offset=>({fit:{...fit,start:{x:0,y:offset},end:{x:10,y:offset}},reason:null})),null);
});

test("a measured body-colored fringe is not shaft ink, and its exclusion cannot borrow provider authority",()=>{
 const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
 const {measuredScenePortFill}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
 const f=fixture(),body=[210,230,245,255];
 for(const node of [f.from,f.to])for(let y=40;y<80;y++)for(let x=node.box.x;x<node.box.x+60;x++)f.image.rgba.set(body,(y*200+x)*4);
 // A 17-channel fringe is outside the fill component's 16-channel predicate
 // but inside the independently measured paint's existing 18-channel tolerance.
 for(let y=48;y<72;y++)f.image.rgba.set([193,230,245,255],(y*200+119)*4);
 const cache=createSceneMeasurementCache(f.image,[],f.budget);
 assert.ok(cache.fill(f.from.box));assert.ok(cache.fill(f.to.box));
 f.from.portFrame=cache.portFrame(f.from.box);f.to.portFrame=cache.portFrame(f.to.box);
 const before=Buffer.from(f.image.rgba),used=f.budget.used;
 const result=measureSceneRelation(f);assert.ok(result);assert.equal(result.widthPx,3);
 assert.ok(result.support>=.9);assert.deepEqual(result.start,{x:80,y:60});assert.deepEqual(result.end,{x:120,y:60});
 assert.equal(f.budget.used-used,39*25);assert.deepEqual(f.image.rgba,before);
 const copied=measuredScenePortFill(f.image,f.to.portFrame,f.to.box);assert.deepEqual(copied,[210,230,245]);
 copied[0]=0;assert.deepEqual(measuredScenePortFill(f.image,f.to.portFrame,f.to.box),[210,230,245]);
 for(const token of [null,{},structuredClone(f.to.portFrame),new Proxy(f.to.portFrame,{}),{get fill(){throw Error('private-key');}}])
  assert.equal(measuredScenePortFill(f.image,token,f.to.box),null);
 assert.equal(measuredScenePortFill({...f.image,rgba:Buffer.from(f.image.rgba)},f.to.portFrame,f.to.box),null);
 assert.equal(measuredScenePortFill(f.image,f.to.portFrame,{...f.to.box,x:121}),null);
 assert.equal(measureSceneRelation({...f,from:{id:f.from.id,box:f.from.box},to:{id:f.to.id,box:f.to.box},budget:{used:0}}),null);
 const wrong={...f,direction:'both',budget:{used:0}};assert.equal(measureSceneRelation(wrong),null);
 assert.equal(measureSceneRelation({...f,textMasks:[{x:92,y:59,w:10,h:5}],budget:{used:0}}),null);
 assert.throws(()=>measureSceneRelation({...f,budget:{used:4000000}}),RangeError);
});


test("relation failures expose fixed stage codes without changing geometry or budget",()=>{
 const {measureSceneRelationDetailed}=require('../packages/slideclone-core/scene-plan/source-scene-relation');
 const normal=fixture(),expected=measureSceneRelation(normal),input=fixture();
 assert.deepEqual(measureSceneRelationDetailed(input),{fit:expected,reason:null});assert.equal(input.budget.used,normal.budget.used);
 const blank=fixture();blank.image.rgba.fill(255);assert.deepEqual(measureSceneRelationDetailed(blank),{fit:null,reason:'shaft-support'});
 const shifted=fixture();shifted.to.box.y+=10;assert.equal(measureSceneRelationDetailed(shifted).reason,'node-axis-alignment');assert.equal(shifted.budget.used,0);
 const masked=fixture();masked.textMasks=[{x:92,y:59,w:10,h:5}];assert.equal(measureSceneRelationDetailed(masked).reason,'source-window-ownership');assert.equal(masked.budget.used,0);
 const unknown=fixture();unknown.direction='unknown';assert.equal(measureSceneRelationDetailed(unknown).reason,'direction-unknown');
 const wrong=fixture();wrong.direction='both';assert.equal(measureSceneRelationDetailed(wrong).reason,'arrow-direction');
 let calls=0;const hostile={get image(){calls++;throw Error('private-token');}};
 assert.throws(()=>measureSceneRelationDetailed(hostile),e=>e instanceof TypeError&&!e.message.includes('private-token'));assert.equal(calls,0);
 const capped=fixture();capped.budget.used=4000000;assert.throws(()=>measureSceneRelationDetailed(capped),RangeError);assert.equal(capped.budget.used,4000000);
});

test("a short source arrow keeps its full-gap support and tapered head when the head occupies the middle",()=>{
 const f=fixture();f.image.rgba.fill(255);f.to.box.x=95;
 const widths=[3,4,3,4,4,4,4,9,13,11,10,8,7,5];
 for(const [index,width]of widths.entries())for(let y=60-Math.floor(width/2);y<60-Math.floor(width/2)+width;y++)
  f.image.rgba.set([30,60,90,255],(y*200+81+index)*4);
 const before=Buffer.from(f.image.rgba),result=measureSceneRelation(f);
 assert.ok(result);assert.equal(result.widthPx,4);assert.equal(result.support,1);
 assert.deepEqual(result.start,{x:80,y:60});assert.deepEqual(result.end,{x:95,y:60});
 assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4_000_000);
 const reverse=measureSceneRelation({...f,from:f.to,to:f.from,direction:'backward',budget:{used:0}});
 assert.ok(reverse);assert.equal(reverse.widthPx,4);
 for(const direction of ['both','backward'])assert.equal(measureSceneRelation({...f,direction,budget:{used:0}}),null);
 const blank=Buffer.from(f.image.rgba);blank.fill(255,(60*200+84)*4,(60*200+85)*4);
 for(let y=48;y<=72;y++)blank.fill(255,(y*200+84)*4,(y*200+85)*4);
 assert.equal(measureSceneRelation({...f,image:{...f.image,rgba:blank},budget:{used:0}}),null);
 assert.equal(measureSceneRelation({...f,textMasks:[{x:82,y:58,w:2,h:5}],budget:{used:0}}),null);
 assert.throws(()=>measureSceneRelation({...f,budget:{used:4_000_000}}),RangeError);
});

"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {measureSceneFillWindow,probeSceneFillTolerance}=require("../packages/slideclone-core/scene-plan/source-scene-fill-window");
const {measureSceneContainer}=require("../packages/slideclone-core/scene-plan/source-scene-container");
function request(){
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)},hint={x:80,y:75,w:160,h:60};
 for(let y=75;y<135;y++)for(let x=80;x<240;x++)image.rgba.set([210,230,245,255],(y*400+x)*4);
 return {image,hint,fill:[210,230,245],color:"#D2E6F5",budget:{used:0},marginX:12,marginY:12};
}

test("a measured paint component uses bounded cubic corners instead of losing its closed body",()=>{
 const {traceNativeMaskContours}=require("../packages/slideclone-core/scene-plan/native-mask-contours");
 const image={width:200,height:80,rgba:Buffer.alloc(200*80*4,255)},points=[];
 for(let x=20;x<180;x++)for(let y=22+(Math.floor((x-20)/2)%2)*2;y<42;y++){
  image.rgba.set([120,160,220,255],(y*200+x)*4);points.push({x,y});
 }
 const hint={x:20,y:22,w:160,h:20},budget={used:0},before=Buffer.from(image.rgba);
 assert.equal(traceNativeMaskContours(points,hint,{outerOnly:true}),null);
 const result=measureSceneFillWindow({image,hint,fill:[120,160,220],color:"#78A0DC",budget,marginX:8,marginY:8});
 assert.ok(result.fit);assert.ok(result.fit.segments.some(s=>s.type==="cubicBezTo"));
 assert.ok(result.fit.segments.length<=120);assert.ok(result.fit.support>=.58);
 assert.equal(budget.used,176*36);assert.deepEqual(image.rgba,before);
});
test("complete source components retain exact fit and original scan cost",()=>{
 const input=request(),before=Buffer.from(input.image.rgba),result=measureSceneFillWindow(input);
 assert.deepEqual(result.fit,{box:input.hint,fill:"#D2E6F5",support:1});assert.equal(result.canExpand,false);
 assert.equal(input.budget.used,184*84);assert.deepEqual(input.image.rgba,before);
});

test("a visible surface closes at its proposed source-image edge, not at an unknown scan edge",()=>{
 const image={width:240,height:160,rgba:Buffer.alloc(240*160*4,255)};
 const paint=(box)=>{for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)image.rgba.set([30,60,90,255],(y*240+x)*4);};
 for(const hint of [{x:0,y:128,w:240,h:32},{x:0,y:0,w:240,h:32},{x:0,y:40,w:32,h:80},{x:208,y:40,w:32,h:80}]){
  image.rgba.fill(255);paint(hint);const before=Buffer.from(image.rgba),budget={used:0};
  const result=measureSceneFillWindow({image,hint,fill:[30,60,90],color:'#1E3C5A',budget,marginX:8,marginY:8});
  assert.deepEqual(result.fit,{box:hint,fill:'#1E3C5A',support:1});assert.equal(result.canExpand,false);
  assert.deepEqual(image.rgba,before);assert.ok(budget.used<=240*96);
 }
 image.rgba.fill(255);paint({x:0,y:0,w:240,h:160});
 const input={image,hint:{x:0,y:128,w:240,h:32},fill:[30,60,90],color:'#1E3C5A',budget:{used:0},marginX:8,marginY:8};
 assert.equal(measureSceneFillWindow(input).fit,null,'the unknown upper scan edge remains censored');
 image.rgba.fill(255);paint({x:0,y:128,w:240,h:32});
 assert.equal(measureSceneFillWindow({...input,hint:{x:10,y:128,w:220,h:32},marginX:16}).fit,null,'a nearby image edge is not a proposed viewport closure');
 for(let y=128;y<160;y++)image.rgba[(y*240+239)*4+3]=0;
 assert.equal(measureSceneFillWindow({...input,budget:{used:0}}).fit?.box.w,239,'transparent cells cannot acquire paint ownership');
 assert.throws(()=>measureSceneFillWindow({...input,budget:{used:4000000}}),/budget/);
});
test("complete low-density backgrounds do not trigger a duplicate scan under the identical predicate",()=>{
 const input=request(),hole={x:90,y:80,w:140,h:40};
 for(let y=hole.y;y<hole.y+hole.h;y++)for(let x=hole.x;x<hole.x+hole.w;x++)input.image.rgba.set([255,255,255,255],(y*400+x)*4);
 const result=measureSceneContainer(input.image,input.hint,[hole],input.budget);
 assert.equal(result,null);assert.equal(input.budget.used,184*84+4+2304);
});
test("changed exterior classification still retries and can recover an independently closed surface",()=>{
 const input=request();
 for(let y=75;y<135;y++)for(let x=160;x<240;x++)input.image.rgba.set([215,230,245,255],(y*400+x)*4);
 for(const [x,y] of [[68,63],[251,63],[68,146],[251,146]])input.image.rgba.set([216,230,245,255],(y*400+x)*4);
 const before=measureSceneFillWindow(input);assert.equal(before.fit,null);assert.equal(before.canExpand,false);assert.equal(before.tolerance,2);
 const larger={...input,marginX:28,marginY:18};assert.equal(probeSceneFillTolerance(larger),15);
 assert.deepEqual(measureSceneFillWindow(larger).fit,{box:input.hint,fill:"#D2E6F5",support:1});
 assert.equal(input.budget.used,184*84+4+216*96);
});
test("only source-owned clipped prefixes within the original upper geometry bounds require expansion",()=>{
 const input=request();
 for(let y=60;y<150;y++)for(let x=80;x<240;x++)input.image.rgba.set([210,230,245,255],(y*400+x)*4);
 const result=measureSceneFillWindow(input);assert.equal(result.fit,null);assert.equal(result.canExpand,true);
 input.image.rgba.fill(255);const blank=measureSceneFillWindow({...input,fill:[255,255,255],color:"#FFFFFF"});
 assert.equal(blank.fit,null);assert.equal(blank.canExpand,true);
 // A wide blank prefix still fits the unchanged geometry upper bounds.
 // A square window exceeds those bounds and proves retry is unnecessary.
 const square=measureSceneFillWindow({...input,hint:{x:80,y:75,w:60,h:60},fill:[255,255,255],color:"#FFFFFF"});
 assert.equal(square.fit,null);assert.equal(square.canExpand,false);
});
test("a nearby closed component without a source pixel in the hint cannot acquire ownership",()=>{
 const input=request();input.image.rgba.fill(255);
 input.hint={x:80,y:75,w:10,h:10};input.marginX=64;input.marginY=64;
 for(let y=75;y<85;y++)for(let x=105;x<115;x++)input.image.rgba.set([210,230,245,255],(y*400+x)*4);
 assert.equal(measureSceneFillWindow(input).fit,null);
});
test("window and four-pixel probes cannot exceed either original pixel cap",()=>{
 const input=request();input.budget.used=4000000-3;
 assert.throws(()=>probeSceneFillTolerance(input),/budget/u);assert.equal(input.budget.used,4000000-3);
 assert.throws(()=>measureSceneFillWindow(input),/budget/u);assert.equal(input.budget.used,4000000-3);
 const large={...request(),image:{width:600,height:600,rgba:Buffer.alloc(600*600*4)},hint:{x:10,y:10,w:550,h:550}};
 assert.deepEqual(measureSceneFillWindow(large),{fit:null,tolerance:null,canExpand:false});assert.equal(probeSceneFillTolerance(large),null);assert.equal(large.budget.used,0);
});
test("invalid, extreme, sparse, shared and hostile controls fail without invoking getters or charging pixels",()=>{
 let calls=0;const getter={};Object.defineProperty(getter,"image",{get(){calls++;throw Error("private-token");}});
 const array=[];Object.defineProperty(array,"0",{get(){calls++;throw Error("private-token");}});array.length=3;
 const bad=[null,{},new Proxy(request(),{}),getter,{...request(),fill:array},{...request(),fill:new Array(3)},
  {...request(),fill:new Proxy([210,230,245],{})},{...request(),fill:[NaN,230,245]},
  {...request(),color:"#ffffff"},{...request(),marginX:65},{...request(),hint:{x:-1,y:0,w:1,h:1}},
  {...request(),budget:{used:Infinity}},{...request(),image:{width:400,height:300,rgba:new Uint8Array(new SharedArrayBuffer(400*300*4))}}];
 for(const value of bad)for(const operation of [measureSceneFillWindow,probeSceneFillTolerance])assert.throws(()=>operation(value),e=>e instanceof TypeError&&!e.message.includes("private-token"));
 assert.equal(calls,0);
});

test("uniform local seeds cannot falsely compete with their own source body after a one-cell boundary change",()=>{
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)},hint={x:80,y:60,w:180,h:140},budget={used:0};
 for(let y=60;y<200;y++)for(let x=80;x<260;x++)image.rgba.set([x<170?210:214,230,245,255],(y*400+x)*4);
 for(let y=60;y<200;y++)image.rgba.set([227,230,245,255],(y*400+79)*4);
 for(let y=95;y<165;y++)for(let x=152;x<188;x++)image.rgba.set([30,60,90,255],(y*400+x)*4);
 const result=measureSceneContainer(image,hint,[],budget);
 assert.deepEqual(result,{box:hint,fill:'#D2E6F5',support:.9});assert.ok(budget.used<=4000000);
});

test("source component identity requires mutual observed ownership and cannot be fabricated from matching bounds",()=>{
 const {sameSceneFillComponent}=require('../packages/slideclone-core/scene-plan/source-scene-fill-window');
 const input=request();for(let y=75;y<135;y++)input.image.rgba.set([227,230,245,255],(y*400+79)*4);
 const a=measureSceneFillWindow(input).fit,b=measureSceneFillWindow({...input,fill:[214,230,245],color:'#D6E6F5'}).fit;
 assert.ok(a);assert.ok(b);assert.notDeepEqual(a.box,b.box);assert.equal(sameSceneFillComponent(a,b),true);
 const copied=measureSceneFillWindow({...input,image:{...input.image,rgba:Buffer.from(input.image.rgba)}}).fit;
 assert.equal(sameSceneFillComponent(a,copied),false);assert.equal(sameSceneFillComponent(a,structuredClone(a)),false);
 let calls=0;const hostile={};Object.defineProperty(hostile,'box',{get(){calls++;throw Error('private-token');}});
 const proxy=new Proxy(a,{get(){calls++;throw Error('private-token');}});
 for(const unknown of [null,undefined,1,'x',{},hostile,proxy])assert.equal(sameSceneFillComponent(a,unknown),false);
 assert.equal(calls,0);assert.equal(JSON.stringify(a).includes('pixels'),false);
});

test("two real independent panels stay ambiguous even if their colors are locally uniform",()=>{
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)},hint={x:70,y:75,w:140,h:100};
 for(const [top,color] of [[60,[210,230,245]],[130,[245,230,210]]])for(let y=top;y<top+60;y++)for(let x=80;x<200;x++)image.rgba.set([...color,255],(y*400+x)*4);
 assert.equal(measureSceneContainer(image,hint,[],{used:0}),null);
});

test("a failed global color proposal does not suppress an independently uniform and closed local surface",()=>{
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)},hint={x:78,y:55,w:104,h:68},masks=[{x:95,y:75,w:72,h:40}];
 for(let y=80;y<140;y++)for(let x=80;x<180;x++)image.rgba.set([210,230,245,255],(y*400+x)*4);
 assert.deepEqual(measureSceneContainer(image,hint,masks,{used:0}),{box:{x:80,y:80,w:100,h:60},fill:'#D2E6F5',support:1});
});


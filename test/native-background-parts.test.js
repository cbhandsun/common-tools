"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto");
const {splitNativeBackground:split}=require("../packages/slideclone-core/scene-plan/native-background-parts");
const {traceNativeMaskContours:trace}=require("../packages/slideclone-core/scene-plan/native-mask-contours");
const {measureSceneFillWindow}=require("../packages/slideclone-core/scene-plan/source-scene-fill-window");
const {writePng}=require("../packages/slideclone-core/png");
const {parseSourceScenePlan}=require("../packages/slideclone-core/scene-plan/source-scene-plan");
const {compileSourceScene}=require("../packages/slideclone-core/scene-plan/source-scene-compiler");
function fixture(width=360){
 const box={x:20,y:25,w:width,h:30},points=[];
 for(let x=0;x<width;x++)for(let y=(Math.floor(x/2)%2)*6;y<30;y++)points.push({x:box.x+x,y:box.y+y});
 return {box,points};
}

test("non-banner source surfaces retain measured paint when one path exceeds the unchanged segment ceiling",()=>{
 const box={x:20,y:25,w:180,h:110},image={width:220,height:160,rgba:Buffer.alloc(220*160*4,255)};
 for(let x=0;x<box.w;x++)for(let y=(Math.floor(x/2)%2)*6;y<box.h;y++)
  image.rgba.set([120,160,220,255],((box.y+y)*image.width+box.x+x)*4);
 const before=Buffer.from(image.rgba),budget={used:0};
 const result=measureSceneFillWindow({image,hint:box,fill:[120,160,220],color:'#78A0DC',budget,marginX:8,marginY:8});
 assert.ok(result.fit?.parts?.length>1,'complete measured surface needs bounded native parts');
 assert.ok(result.fit.parts.length<=32);assert.ok(result.fit.support>=.58);
 assert.ok(result.fit.parts.every(part=>part.segments.length<=120));
 assert.equal(budget.used,196*126);assert.deepEqual(image.rgba,before);
});
test("partition fallback preserves an already representable non-banner body as one attachable path",()=>{
 const box={x:20,y:22,w:160,h:60},image={width:200,height:100,rgba:Buffer.alloc(200*100*4,255)};
 for(let x=0;x<box.w;x++)for(let y=(Math.floor(x/2)%2)*2;y<box.h;y++)
  image.rgba.set([120,160,220,255],((box.y+y)*image.width+box.x+x)*4);
 const budget={used:0};
 const result=measureSceneFillWindow({image,hint:box,fill:[120,160,220],color:'#78A0DC',budget,marginX:8,marginY:8});
 assert.ok(result.fit?.segments?.some(segment=>segment.type==='cubicBezTo'));
 assert.equal(result.fit.parts,undefined);assert.deepEqual(result.fit.box,box);
 assert.ok(result.fit.segments.length<=120);assert.equal(budget.used,176*76);
});
test("complex measured background retains the original path ceiling using shared-budget native partitions",()=>{
 const f=fixture(),before=JSON.stringify(f),state={checks:0,exhausted:false};
 assert.equal(trace(f.points,f.box,{outerOnly:true,curveFallback:true,workState:state}),null);
 const initialChecks=state.checks,parts=split(f,state);
 assert.ok(parts.length>1&&parts.length<=32);assert.ok(state.checks>initialChecks&&state.checks<=4000000);
 assert.equal(state.exhausted,false);assert.equal(JSON.stringify(f),before);
 for(const part of parts){
  assert.ok(part.segments.length<=120);assert.equal(part.segments[0].type,"moveTo");assert.equal(part.segments.at(-1).type,"close");
  assert.ok(part.box.x>=f.box.x&&part.box.y>=f.box.y&&part.box.x+part.box.w<=f.box.x+f.box.w&&part.box.y+part.box.h<=f.box.y+f.box.h);
  for(const segment of part.segments)for(const point of segment.points)assert.ok(point.x>=0&&point.x<=1&&point.y>=0&&point.y<=1);
 }
});
test("partitions preserve an open concavity and underpaint only enclosed foreground holes",()=>{
 const box={x:0,y:0,w:20,h:20},points=[];
 for(let y=0;y<20;y++)for(let x=0;x<20;x++)if(!(x<8&&y>=6&&y<14)&&!(x>=12&&x<15&&y>=8&&y<11))points.push({x,y});
 const parts=split({box,points},{checks:0,exhausted:false});assert.equal(parts.length,1);
 // The concave exterior remains in the outer path, while the isolated hole is background underpaint.
 assert.equal(parts[0].segments.filter(segment=>segment.type==="moveTo").length,1);
 assert.ok(parts[0].segments.some(segment=>segment.points.some(point=>point.x===.4)));
});
test("empty and exhausted inputs never return partial geometry or reset the allowance",()=>{
 assert.equal(split({box:{x:0,y:0,w:1,h:1},points:[]},{checks:0,exhausted:false}),null);
 const f=fixture();for(const state of [{checks:4000001,exhausted:true},{checks:4000000,exhausted:false}]){
  const before={...state};assert.equal(split(f,state),null);assert.deepEqual(state,before);assert.equal(trace(f.points,f.box,{workState:state}),null);
 }
 const state={checks:3999999,exhausted:false};assert.equal(split(f,state),null);assert.deepEqual(state,{checks:4000001,exhausted:true});
});
test("hostile, sparse and extreme controls fail without getter execution, work mutation or source content in errors",()=>{
 let calls=0;const hostile={get points(){calls++;throw Error("private-source");}},point={get x(){calls++;throw Error("private-source");}},array=[];
 Object.defineProperty(array,"0",{get(){calls++;throw Error("private-source");}});array.length=1;
 const f=fixture();
 for(const input of [null,{},new Proxy(f,{}),hostile,{...f,points:new Proxy(f.points,{})},{...f,points:new Array(1)},
  {...f,points:array},{...f,points:[point]},{...f,points:[{x:-1,y:2}]},{...f,box:{x:0,y:0,w:1024,h:1024}},
  {...f,box:{x:16000,y:0,w:1000,h:1}},{...f,points:[{x:Infinity,y:1}]}]){
  const state={checks:0,exhausted:false};assert.throws(()=>split(input,state),error=>error instanceof TypeError&&!error.message.includes("private-source"));
  assert.deepEqual(state,{checks:0,exhausted:false});
 }
 const badState={get checks(){calls++;throw Error("private-source");}};
 for(const state of [badState,new Proxy({checks:0,exhausted:false},{}),{checks:NaN,exhausted:false}]){
  assert.throws(()=>split(f,state),TypeError);assert.throws(()=>trace(f.points,f.box,{workState:state}),TypeError);
 }
 assert.equal(calls,0);
});
test("source admission and compiler emit editable background parts without granting them node attachment",t=>{
 const f=fixture(),image={width:400,height:100,rgba:Buffer.alloc(400*100*4,255)};
 for(const point of f.points)image.rgba.set([120,160,220,255],(point.y*400+point.x)*4);
 const before=Buffer.from(image.rgba),budget={used:0};
 const result=measureSceneFillWindow({image,hint:f.box,fill:[120,160,220],color:"#78A0DC",budget,marginX:8,marginY:8});
 assert.ok(result.fit.parts.length>1);assert.ok(result.fit.support>=.58);assert.equal(budget.used,376*46);assert.deepEqual(image.rgba,before);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"background-parts-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,"source.png");writePng(sourceFile,image);
 const context={sourceHash:crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex"),widthPx:400,heightPx:100};
 const proposal={coordinateSpace:"source-pixels",regions:[{id:"root",kind:"section",parentId:null,box:{x:0,y:0,w:400,h:100}}],
  objects:[{id:"paint",kind:"container",regionId:"root",box:f.box}],relations:[]};
 const input={root,sourceFile,slideSize:{widthPt:400,heightPt:100},page:{shapes:[],images:[],textBoxes:[]},plan:parseSourceScenePlan(proposal,context)};
 const compiled=compileSourceScene(input),parts=compiled.page.shapes.filter(shape=>shape.source.nativeComponentGroupId);
 assert.ok(parts.length>1);assert.equal(compiled.evidence.containers,1);
 assert.ok(parts.every(shape=>shape.type==="freeform"&&shape.source.editable===true&&shape.style.freeformSegments.length<=120));
 proposal.objects.push({id:"node",kind:"container",regionId:"root",box:{x:388,y:25,w:12,h:30}});
 proposal.relations.push({id:"edge",regionId:"root",fromId:"paint",toId:"node",direction:"forward"});
 const connected=compileSourceScene({...input,plan:parseSourceScenePlan(proposal,context)});
 assert.ok(connected.evidence.unresolved.some(item=>item.reason==="compound-background-node"));
 assert.equal(connected.evidence.resolvedRelations,0);
 const retained=connected.page.shapes.filter(shape=>shape.source.nativeComponentGroupId==='scene-container-object-paint');
 assert.deepEqual(retained,parts);
 assert.ok(connected.evidence.unresolved.some(item=>item.id==='relation-edge'&&item.detailCode==='missing-native-node'));
 assert.equal(connected.evidence.containerAliases,0);
 assert.deepEqual(image.rgba,before);
 // A disconnected paint surface cannot consume an existing node carrying
 // attachment identity, even when their bounding rectangles coincide.
 const old={id:'attached-surface',type:'rect',box:f.box,style:{fill:'#78A0DC'},source:{editable:true}};
 const preserved=compileSourceScene({...input,page:{...input.page,shapes:[old]},plan:parseSourceScenePlan(proposal,context)});
 assert.ok(preserved.page.shapes.some(shape=>shape.id===old.id));
 assert.equal(preserved.evidence.resolvedRelations,0);
 assert.equal(preserved.evidence.sourceScanPixels,connected.evidence.sourceScanPixels);
});

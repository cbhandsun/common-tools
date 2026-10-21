"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSourceSceneVisibleGap:measure}=require('../packages/slideclone-core/source-scene-visible-gap');
const {compileSourceSceneVisibleGap:compile}=require('../packages/slideclone-core/source-scene-visible-gap-compiler');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/source-scene-measurement-cache');
const {measureSceneRelationDetailed}=require('../packages/slideclone-core/source-scene-relation');
function fixture(vertical=false){
 const image={width:240,height:180,rgba:Buffer.alloc(240*180*4,255)},budget={used:0};
 const put=(x,y,rgb=[30,60,90])=>image.rgba.set([...rgb,255],(y*240+x)*4);
 const from={id:'a',box:vertical?{x:70,y:20,w:40,h:30}:{x:20,y:40,w:50,h:40}},to={id:'b',box:vertical?{x:70,y:120,w:40,h:30}:{x:170,y:40,w:50,h:40}};
 for(const n of [from,to])for(let y=n.box.y;y<n.box.y+n.box.h;y++)for(let x=n.box.x;x<n.box.x+n.box.w;x++)put(x,y,[210,230,245]);
 const lo=vertical?54:74,hi=vertical?115:165,axis=vertical?90:60;
 for(let a=lo;a<=hi;a++)for(let c=axis-1;c<=axis+1;c++)put(vertical?c:a,vertical?a:c);
 for(let a=hi-6;a<=hi;a++)for(let c=axis-(hi-a);c<=axis+(hi-a);c++)put(vertical?c:a,vertical?a:c);
 const cache=createSceneMeasurementCache(image,[],budget);cache.fill(from.box);cache.fill(to.box);from.portFrame=cache.portFrame(from.box);to.portFrame=cache.portFrame(to.box);
 return {image,from,to,direction:'forward',textMasks:[],otherNodes:[],budget,put,lo,hi,axis,vertical};
}
const relation={id:'relation-gap',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:'forward'};

test('complete separated source dashes remain ONE editable relation with exact observed spacing and private paint',()=>{
 for(const vertical of [false,true]){
  const f=fixture(vertical);
  for(let a=f.lo;a<=f.hi;a++)for(let c=f.axis-6;c<=f.axis+6;c++)f.put(vertical?c:a,vertical?a:c,[255,255,255]);
  const cells=new Set();
  for(const [lo,hi] of [[f.lo,f.lo+11],[f.lo+20,f.lo+32],[f.lo+41,f.lo+52]])
   for(let a=lo;a<=hi;a++)for(let c=f.axis-1;c<=f.axis+1;c++){
    const x=vertical?c:a,y=vertical?a:c;f.put(x,y);cells.add(y*240+x);
   }
  const before=Buffer.from(f.image.rgba),result=measure({...f,direction:'undirected'});assert.ok(result.fit,result.reason);
  assert.equal(result.fit.support,1);assert.deepEqual(JSON.parse(result.fit.strokeDashPattern),[[4,8/3],[13/3,8/3],[4,1/3]]);
  const r={...relation,direction:'undirected'},output=compile({fit:result.fit,relation:r,fromId:'a',toId:'b',width:240,height:180,slideSize:{widthPt:240,heightPt:180}});
  assert.equal(output.type,'line');assert.equal(output.style.lineCap,'flat');assert.equal(output.style.startAnchor.elementId,'a');
  assert.equal(output.style.endAnchor.elementId,'b');assert.ok(!output.style.startArrow&&!output.style.endArrow);
  const {measuredSceneVisibleGapPaint:paint}=require('../packages/slideclone-core/source-scene-visible-gap-compiler');
  assert.deepEqual(paint(f.image,output),cells);assert.deepEqual(f.image.rgba,before);
  assert.equal(measure({...f,direction:'forward'}).fit,null);
  output.style.strokeDashPattern='[[1,1],[1,1]]';assert.equal(paint(f.image,output),null);
  for(let d=2;d<=7;d++)f.put(vertical?f.axis+d:f.lo+4,vertical?f.lo+4:f.axis+d);
  assert.equal(measure({...f,direction:'undirected'}).fit,null,'a connected branch cannot be discarded');
 }
});

test('complete broad achromatic dashes preserve partial caps and bounded source scope without changing the thin-arrow gate',()=>{
 for(const vertical of [false,true]){
  const f=fixture(vertical);
  for(let a=f.lo;a<=f.hi;a++)for(let c=f.axis-6;c<=f.axis+6;c++)f.put(vertical?c:a,vertical?a:c,[255,255,255]);
  for(const [lo,hi] of [[f.lo,f.lo+11],[f.lo+20,f.lo+34],[f.lo+43,f.lo+52]])
   for(let a=lo;a<=hi;a++)for(let c=f.axis-4;c<=f.axis+4;c++)f.put(vertical?c:a,vertical?a:c,[20,20,20]);
  // One outermost source slab contains only the cap's corner. Its complete
  // footprint still lies inside the original native stroke radius.
  for(let c=f.axis-4;c<=f.axis+3;c++)f.put(vertical?c:f.lo+34,vertical?f.lo+34:c,[255,255,255]);
  const input={...f,direction:'undirected',shaftBox:vertical?{x:f.axis-6,y:f.lo-1,w:12,h:55}:{x:f.lo-1,y:f.axis-6,w:55,h:12}};
  const result=measure(input);assert.ok(result.fit,result.reason);assert.equal(result.fit.widthPx,9);
  const scopedRelation={...relation,direction:'undirected',shaftBox:input.shaftBox};
  const controls={fit:result.fit,relation:scopedRelation,fromId:'a',toId:'b',width:240,height:180,slideSize:{widthPt:240,heightPt:180}};
  assert.doesNotThrow(()=>compile(controls));
  assert.throws(()=>compile({...controls,relation:{...scopedRelation,shaftBox:{...input.shaftBox,x:input.shaftBox.x+1}}}),/proof/);
  assert.throws(()=>compile({...controls,relation:{...scopedRelation,shaftBox:undefined}}),/proof/);
  assert.equal(result.fit.color,'#141414');assert.deepEqual(JSON.parse(result.fit.strokeDashPattern),[[12/9,8/9],[15/9,8/9],[10/9,1/9]]);
  const reversed=measure({...input,from:f.to,to:f.from});assert.ok(reversed.fit,reversed.reason);
  assert.deepEqual(JSON.parse(reversed.fit.strokeDashPattern),[[10/9,8/9],[15/9,8/9],[12/9,1/9]]);
  assert.equal(measure({...input,shaftBox:vertical?{x:f.axis+2,y:f.lo-1,w:1,h:55}:{x:f.lo-1,y:f.axis+2,w:55,h:1}}).fit,null);
  assert.equal(measure({...input,direction:'forward'}).fit,null);
 }
});

test('complete owner inventories receive only actual unchanged private gap ink, never its proposed box or empty corridors',()=>{
 const {measuredSceneVisibleGapPaint}=require('../packages/slideclone-core/source-scene-visible-gap-compiler');
 const {measuredSceneVisibleGapCells}=require('../packages/slideclone-core/source-scene-visible-gap');
 for(const vertical of [false,true]){
  const f=fixture(vertical),result=measure(f);assert.ok(result.fit,result.reason);
  const before=f.budget.used,request={fit:result.fit,relation,fromId:'a',toId:'b',width:240,height:180,slideSize:{widthPt:240,heightPt:180}};
  const output=compile(request),cells=measuredSceneVisibleGapPaint(f.image,output);assert.ok(cells);
  const oracle=new Set();
  for(let a=f.lo;a<=f.hi;a++)for(let c=f.axis-6;c<=f.axis+6;c++){
   const x=vertical?c:a,y=vertical?a:c,i=(y*240+x)*4;
   if(f.image.rgba[i]===30&&f.image.rgba[i+1]===60&&f.image.rgba[i+2]===90)oracle.add(y*240+x);
  }
  assert.deepEqual(cells,oracle);assert.equal(f.budget.used,before);
  const midpoint=(vertical?f.lo-2:f.axis)*240+(vertical?f.axis:f.lo-2);assert.equal(cells.has(midpoint),false);
  cells.clear();assert.deepEqual(measuredSceneVisibleGapPaint(f.image,output),oracle);
  for(const other of [null,{},structuredClone(output),new Proxy(output,{get(){throw Error('private');}})])
   assert.equal(measuredSceneVisibleGapPaint(f.image,other),null);
  assert.equal(measuredSceneVisibleGapPaint({...f.image,rgba:Buffer.from(f.image.rgba)},output),null);
  assert.equal(measuredSceneVisibleGapPaint({...f.image,width:241},output),null);
  assert.equal(measuredSceneVisibleGapCells(f.image,structuredClone(result.fit)),null);
  let reads=0;const getter={get width(){reads++;throw Error('private');},height:180,rgba:f.image.rgba};
  assert.equal(measuredSceneVisibleGapPaint(getter,output),null);
  assert.equal(measuredSceneVisibleGapPaint(new Proxy(f.image,{get(){reads++;throw Error('private');}}),output),null);
  assert.equal(reads,0);
  output.box.x+=1;assert.equal(measuredSceneVisibleGapPaint(f.image,output),null);output.box.x-=1;
  output.source.sceneRelationId='forged';assert.equal(measuredSceneVisibleGapPaint(f.image,output),null);
  assert.equal(f.budget.used,before);
 }
});

test('the real census finalizer preserves the private ink receipt through its exact inventory binding',()=>{
 const {finalizeSourceScene}=require('../packages/slideclone-core/source-scene-finalize');
 const {measuredSceneVisibleGapPaint,bindMeasuredSceneVisibleGapInventory}=require('../packages/slideclone-core/source-scene-visible-gap-compiler');
 const f=fixture(),result=measure(f);assert.ok(result.fit,result.reason);
 const output=compile({fit:result.fit,relation,fromId:'a',toId:'b',width:240,height:180,slideSize:{widthPt:240,heightPt:180}});
 const expected=measuredSceneVisibleGapPaint(f.image,output),before=f.budget.used;
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:240,heightPx:180,
  regions:[{id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:240,h:180}}],
  objects:[],relations:[relation],observedInventory:[{regionId:'region-root',containers:0,icons:0,relations:1}]};
 const finalized=finalizeSourceScene({image:f.image,slideSize:{widthPt:240,heightPt:180},shapes:[output],images:[],textBoxes:[],
  plan,root:process.cwd(),budget:f.budget,preflight:false,validRegions:new Set(['region-root']),physicalNodes:[],physicalAliases:[]});
 const actual=finalized.shapes.find(s=>s.id===output.id);assert.equal(actual,output);
 assert.equal(actual.source.sceneInventoryId,relation.id);
 assert.deepEqual(measuredSceneVisibleGapPaint(f.image,actual),expected);assert.equal(f.budget.used,before);
 assert.equal(bindMeasuredSceneVisibleGapInventory(f.image,structuredClone(actual),relation.id),false);
 assert.equal(bindMeasuredSceneVisibleGapInventory(f.image,actual,'other'),false);
 const image={...f.image,rgba:Buffer.from(f.image.rgba)};
 assert.equal(bindMeasuredSceneVisibleGapInventory(image,actual,relation.id),false);
 actual.style.stroke='#ABCDEF';assert.equal(bindMeasuredSceneVisibleGapInventory(f.image,actual,relation.id),false);
 assert.equal(measuredSceneVisibleGapPaint(f.image,actual),null);
});

test('explicit undirected visible gaps preserve observed offsets and grant no arrowheads',()=>{
 for(const vertical of [false,true]){
  const f=fixture(vertical);
  for(let a=f.hi-6;a<=f.hi;a++)for(let c=f.axis-6;c<=f.axis+6;c++)
   f.put(vertical?c:a,vertical?a:c,Math.abs(c-f.axis)<=1?[30,60,90]:[255,255,255]);
  const before=Buffer.from(f.image.rgba),result=measure({...f,direction:'undirected'});
  assert.ok(result.fit,result.reason);
  const r={...relation,direction:'undirected'},request={fit:result.fit,relation:r,fromId:'a',toId:'b',width:240,height:180,slideSize:{widthPt:240,heightPt:180}};
  const output=compile(request);assert.ok(!output.style.startArrow&&!output.style.endArrow);
  assert.equal(output.source.sourcePhysicalAttachment,false);assert.equal(output.style.startAnchor.elementId,'a');
  assert.equal(output.style.endAnchor.elementId,'b');assert.deepEqual(f.image.rgba,before);
  assert.throws(()=>compile({...request,relation}),/proof/);
  assert.equal(measure({...fixture(vertical),direction:'undirected'}).fit,null);
  assert.equal(measure({...f,direction:'forward'}).fit,null);
 }
 let calls=0;const direction={toString(){calls++;throw Error('private');}};
 assert.throws(()=>measure({...fixture(),direction}),TypeError);assert.equal(calls,0);
});
test('visible source gaps are explicit logical sites, preserving physical and native identities',()=>{
 for(const vertical of [false,true]){
  const f=fixture(vertical),source=Buffer.from(f.image.rgba),old=measureSceneRelationDetailed(f);
  assert.equal(old.fit,null);const result=measure(f);assert.ok(result.fit,result.reason);
  assert.equal(result.fit.support,1);assert.equal(result.fit.widthPx,3);assert.ok(f.budget.used<=4000000);
  const s=compile({fit:result.fit,relation,fromId:'a',toId:'b',width:240,height:180,slideSize:{widthPt:240,heightPt:180}});
  assert.equal(s.style.startAnchor.elementId,'a');assert.equal(s.style.endAnchor.elementId,'b');assert.equal(s.style.endArrow,'triangle');
  assert.equal(s.style.startAnchor.siteOffsetKind,'source-visible-gap');assert.equal(s.source.sourcePhysicalAttachment,false);
  assert.equal(s.source.sourceAttachmentKind,'visible-gap-logical');assert.equal(s.source.sceneRelationId,relation.id);
  assert.equal(s.source.nativeComponentGroupId,undefined);assert.deepEqual(f.image.rgba,source);
  assert.equal(vertical?s.style.startAnchor.dyPt:s.style.startAnchor.dxPt,4);
  assert.equal(vertical?s.style.endAnchor.dyPt:s.style.endAnchor.dxPt,-5);
 }
});
test('visible paths cannot bridge missing shaft, text, obstacles, wrong heads, alpha or budgets',()=>{
 for(const mode of ['blank','break','head','branch','text','node','alpha','budget']){
  const f=fixture();
  if(mode==='blank')for(let a=f.lo;a<=f.hi;a++)for(let y=53;y<=67;y++)f.put(a,y,[255,255,255]);
  if(mode==='break')for(let y=53;y<=67;y++)f.put(110,y,[255,255,255]);
  if(mode==='head')f.direction='backward';
  if(mode==='branch')for(let y=60;y<=70;y++)for(let x=110;x<=112;x++)f.put(x,y);
  if(mode==='text')f.textMasks=[{x:110,y:56,w:10,h:10}];
  if(mode==='node')f.otherNodes=[{x:110,y:56,w:10,h:10}];
  if(mode==='alpha')f.image.rgba[(60*240+110)*4+3]=0;
  if(mode==='budget')f.budget.used=4000000;
  const before=f.budget.used;assert.equal(measure(f).fit,null,mode);assert.ok(f.budget.used>=before&&f.budget.used<=4000000);
 }
});
test('unobserved boundary, forged capabilities, cross-source and hostile controls fail',()=>{
 const f=fixture();let reads=0;const hostile={};Object.defineProperty(hostile,'x',{get(){reads++;throw Error('private');}});
 for(const input of [null,new Proxy(f,{}),{...f,textMasks:new Proxy([],{})},{...f,textMasks:new Array(1)},
  {...f,shaftBox:hostile},{...f,budget:{used:Infinity}},{...f,from:{...f.from,box:{x:0,y:0,w:99999,h:1}}}])assert.throws(()=>measure(input),TypeError);
 assert.equal(reads,0);
 for(const portFrame of [undefined,{},structuredClone(f.from.portFrame),new Proxy(f.from.portFrame,{})])assert.equal(measure({...f,from:{...f.from,portFrame}}).fit,null);
 assert.equal(measure({...f,image:{...f.image,rgba:Buffer.from(f.image.rgba)}}).fit,null);
 const result=measure(f);assert.ok(result.fit);const request={fit:result.fit,relation,fromId:'a',toId:'b',width:240,height:180,slideSize:{widthPt:240,heightPt:180}};
 for(const value of [{...request,fit:structuredClone(result.fit)},{...request,fromId:'c'}, {...request,width:241}, {...request,relation:{...relation,direction:'backward'}}])assert.throws(()=>compile(value),/proof/);
});
test('scope and existing relation identity remain mandatory at the production stage',()=>{
 const {compileExistingSceneVisibleGaps:stage}=require('../packages/slideclone-core/source-scene-visible-gap-stage');
 const f=fixture(),plan={version:1,sourceHash:'a'.repeat(64),widthPx:240,heightPx:180,
  regions:[{id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:240,h:180}}],
  objects:[{id:'object-a',regionId:'region-root',kind:'container',box:f.from.box},{id:'object-b',regionId:'region-root',kind:'container',box:f.to.box}],relations:[relation]};
 const request={plan,image:f.image,nodes:new Map([['object-a',f.from],['object-b',f.to]]),shapes:[{id:'a'},{id:'b'}],textMasks:[],budget:f.budget,
  slideSize:{widthPt:240,heightPt:180},unresolved:[{id:relation.id,reason:'relation-source-evidence',detailCode:'shaft-support'},{id:'other',reason:'icon-isolation'}]};
 const before=structuredClone(plan),result=stage(request);assert.equal(result.parts.length,1);assert.deepEqual([...result.resolved],[relation.id]);
 assert.deepEqual(result.unresolved,[{id:'other',reason:'icon-isolation'}]);assert.equal(result.repaired[0].previous,'shaft-support');assert.deepEqual(plan,before);
 assert.equal(stage({...request,unresolved:[]}).parts.length,0);
 assert.equal(stage({...request,shapes:[{id:'a'}]}).parts.length,0);
 const invalid=structuredClone(plan);invalid.objects[1].regionId='region-other';assert.equal(stage({...request,plan:invalid}).parts.length,0);
});
test('complete source evidence consumes coarse two-vertex programs and binds the original proposal to its private proof',()=>{
 const {compileExistingSceneVisibleGaps:stage}=require('../packages/slideclone-core/source-scene-visible-gap-stage');
 const f=fixture(),visiblePath={kind:'polyline',dash:'solid',vertices:[{x:80,y:61},{x:160,y:59}]},shaftBox={x:74,y:53,w:92,h:15};
 const r={...relation,visiblePath,shaftBox},plan={version:1,sourceHash:'a'.repeat(64),widthPx:240,heightPx:180,
  regions:[{id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:240,h:180}}],
  objects:[{id:'object-a',regionId:'region-root',kind:'container',box:f.from.box},{id:'object-b',regionId:'region-root',kind:'container',box:f.to.box}],relations:[r]};
 const request={plan,image:f.image,nodes:new Map([['object-a',f.from],['object-b',f.to]]),shapes:[{id:'a'},{id:'b'}],textMasks:[],budget:f.budget,
  slideSize:{widthPt:240,heightPt:180},unresolved:[{id:r.id,reason:'relation-source-evidence',detailCode:'visible-path-program'}]};
 const before=structuredClone(plan),out=stage(request);assert.equal(out.parts.length,1);assert.deepEqual(out.unresolved,[]);
 assert.equal(out.parts[0].source.sourcePathProgramRefined,true);assert.equal(out.parts[0].source.sourcePathMaxCenterlineErrorPx,0);
 assert.deepEqual(plan,before);assert.equal(out.parts[0].box.x,74);assert.equal(out.parts[0].box.w,91);
 const measured=measure({...f,visiblePath,shaftBox});assert.ok(measured.fit);
 const controls={fit:measured.fit,relation:r,fromId:'a',toId:'b',width:240,height:180,slideSize:request.slideSize};
 assert.throws(()=>compile({...controls,relation}),/proof/);
 const changed=structuredClone(r);changed.visiblePath.vertices[0].x++;
 assert.throws(()=>compile({...controls,relation:changed}),/proof/);
 const shifted=structuredClone(r);shifted.shaftBox.x++;
 assert.throws(()=>compile({...controls,relation:shifted}),/proof/);
 assert.throws(()=>compile({...controls,relation:{...r,shaftBox:undefined}}),/proof/);
 let reads=0;const poisoned={get x(){reads++;throw Error('private-token');},y:53,w:92,h:15};
 assert.throws(()=>compile({...controls,relation:{...r,shaftBox:poisoned}}),/proof/);assert.equal(reads,0);
 const custom={...shaftBox,toJSON(){reads++;throw Error('private-token');}};
 assert.doesNotThrow(()=>compile({...controls,relation:{...r,shaftBox:custom}}));assert.equal(reads,0);
 const multi=structuredClone(plan);multi.relations[0].visiblePath.vertices.splice(1,0,{x:110,y:65});assert.equal(stage({...request,plan:multi}).parts.length,0);
 const source=fixture();for(let y=53;y<=67;y++)source.put(110,y,[255,255,255]);assert.equal(measure({...source,visiblePath,shaftBox}).fit,null);
});
test('complete terminal paint accepts a broad source base and rejects hidden branches and missing body',()=>{
 const {sourceVisibleArrowTerminals:terminals}=require('../packages/slideclone-core/source-visible-arrow-terminals');
 const widths=[...Array(15).fill(4),16,18,18,18,16,16,14,12,11,10,8,7,5,4,2],counts=[...Array(15).fill(4),7,12,13,16,16,16,14,12,11,10,8,7,5,4,2];
 assert.deepEqual(terminals({widths,counts,leftArrow:false,rightArrow:true}),{widthPx:4,firstBody:0,lastBody:14});
 assert.equal(terminals({widths,counts,leftArrow:true,rightArrow:false}),null);
 assert.equal(terminals({widths:widths.map((w,i)=>i===8?17:w),counts:counts.map((w,i)=>i===8?17:w),leftArrow:false,rightArrow:true}),null);
 assert.equal(terminals({widths:[],counts:[],leftArrow:false,rightArrow:true}),null);
 assert.equal(terminals({widths:[2,4,8,14,8,4,2],counts:[2,4,8,14,8,4,2],leftArrow:true,rightArrow:true}),null);
 const f=fixture();for(let x=90;x<=145;x++)f.put(x,69);
 assert.equal(measure(f).fit,null,'another long source stroke cannot be ignored');
});

test('a complete short head can taper inside the original terminal window without hiding a side branch',()=>{
 const {sourceVisibleArrowTerminals:terminals}=require('../packages/slideclone-core/source-visible-arrow-terminals');
 const head=[2,4,6,8,10,12,12,10,6],body=Array(12).fill(3);
 const widths=[...head,...body,...head.toReversed()],counts=widths.map(w=>w>=6?4:w);
 assert.deepEqual(terminals({widths,counts,leftArrow:true,rightArrow:true}),{widthPx:3,firstBody:9,lastBody:20});
 const branch=[...widths];branch[8]=14;
 assert.equal(terminals({widths:branch,counts:branch,leftArrow:true,rightArrow:true}),null);
 assert.equal(terminals({widths,counts,leftArrow:false,rightArrow:true}),null);
 const interrupted=[...counts];interrupted[14]=1;
 assert.equal(terminals({widths,counts:interrupted,leftArrow:true,rightArrow:true}),null);
});

test('oversized aligned proposals cannot nominate an endpoint interior as gap background or clip a source branch',()=>{
 for(const vertical of [false,true]){
  const f=fixture(vertical),shaftBox=vertical?{x:75,y:49,w:30,h:110}:{x:69,y:45,w:145,h:30};
  const result=measure({...f,shaftBox,sourceInk:true});assert.ok(result.fit,result.reason);
  assert.equal(result.fit.start[vertical?'y':'x'],f.lo);
  assert.equal(result.fit.end[vertical?'y':'x'],f.hi);
  // The sample location may change; complete source observation may not.
  if(vertical)for(let x=90;x<110;x++)f.put(x,80);
  else for(let y=60;y<78;y++)f.put(110,y);
  assert.equal(measure({...f,shaftBox,sourceInk:true}).fit,null);
 }
});

test('a two-point proposal preserves the complete filled-gap consumer, source receipts and private control binding',()=>{
 const f=fixture();
 for(let y=53;y<=67;y++)for(let x=f.lo;x<=f.hi;x++)f.put(x,y,[255,255,255]);
 for(let x=f.lo;x<=f.hi;x++)for(let y=57;y<=63;y++)f.put(x,y);
 for(let x=f.hi-25;x<=f.hi;x++){const radius=Math.floor((f.hi-x)*.7);for(let y=60-radius;y<=60+radius;y++)f.put(x,y);}
 const shaftBox={x:f.lo-2,y:40,w:f.hi-f.lo+4,h:40},visiblePath={kind:'polyline',dash:'solid',vertices:[{x:f.lo+2,y:60},{x:f.hi-2,y:60}]};
 const result=measure({...f,shaftBox,visiblePath,sourceInk:true});assert.ok(result.fit,result.reason);
 assert.ok(result.fit.sourcePath,'the broad source head must use its complete independent filled certificate');
 const relation={id:'relation-filled-program',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:'forward',shaftBox,visiblePath};
 const controls={fit:result.fit,relation,fromId:f.from.id,toId:f.to.id,width:240,height:180,slideSize:{widthPt:240,heightPt:180}};
 const output=compile(controls);assert.equal(output.style.startAnchor.elementId,'a');assert.equal(output.style.endArrowWidth,'large');
 const moved=structuredClone(relation);moved.visiblePath.vertices[0].y++;
 assert.throws(()=>compile({...controls,relation:moved}),/proof/);
 const blocked={...f,shaftBox,visiblePath,sourceInk:true,otherNodes:[{x:100,y:57,w:4,h:7}]};assert.equal(measure(blocked).fit,null);
 assert.equal(measure({...f,shaftBox,visiblePath:{...visiblePath,vertices:[...visiblePath.vertices].reverse()},sourceInk:true}).fit,null);
});

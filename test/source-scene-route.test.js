"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route');
const {compileSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route-compiler');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
function fixture(){
 const image={width:240,height:180,rgba:Buffer.alloc(240*180*4,255)},budget={used:0};
 const put=(x,y,rgb=[30,60,90])=>image.rgba.set([...rgb,255],(y*240+x)*4);
 const from={id:'a',box:{x:20,y:20,w:50,h:40}},to={id:'b',box:{x:170,y:20,w:50,h:40}};
 for(const n of [from,to])for(let y=n.box.y;y<n.box.y+n.box.h;y++)for(let x=n.box.x;x<n.box.x+n.box.w;x++)put(x,y,[210,230,245]);
 for(let y=60;y<=130;y++)for(let x=44;x<=46;x++)put(x,y);
 for(let x=45;x<=195;x++)for(let y=129;y<=131;y++)put(x,y);
 for(let y=60;y<=130;y++)for(let x=194;x<=196;x++)put(x,y);
 for(let y=60;y<=65;y++)for(let x=195-(y-60);x<=195+(y-60);x++)put(x,y);
 const cache=createSceneMeasurementCache(image,[],budget);assert.ok(cache.fill(from.box));assert.ok(cache.fill(to.box));
 from.portFrame=cache.portFrame(from.box);to.portFrame=cache.portFrame(to.box);
 return {image,from,to,direction:'forward',budget,textMasks:[],shaftBox:{x:38,y:59,w:165,h:76},put};
}
test('a truncated shaft hint cannot discard the already measured endpoint contacts',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba);
 const result=measureSourceSceneRoute({...f,shaftBox:{x:38,y:80,w:165,h:55}});
 assert.ok(result.fit,result.reason);assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);
 assert.equal(result.fit.startSide,'bottom');assert.equal(result.fit.endSide,'bottom');
 assert.ok(result.fit.points.some(p=>p.y>=129));
});

test('one continuous source route compiles its complete path and two external native attachments',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),result=measureSourceSceneRoute(f);
 assert.ok(result.fit,result.reason);assert.equal(result.fit.startSide,'bottom');assert.equal(result.fit.endSide,'bottom');
 assert.ok(result.fit.points.some(p=>p.y>=129));assert.equal(result.fit.widthPx,3);assert.ok(result.fit.support>=.9);
 assert.ok(f.budget.used<=4000000);assert.deepEqual(f.image.rgba,before);
 const relation={id:'relation-loop',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:'forward'};
 const request={fit:result.fit,relation,fromId:'a',toId:'b',widthPx:240,heightPx:180,slideSize:{widthPt:240,heightPt:180}};
 const parts=compileSourceSceneRoute(request);
 const lines=parts.filter(p=>p.type==='line'),controls=parts.filter(p=>p.source.routeControl);
 assert.ok(lines.length>=3);assert.equal(controls.length,lines.length-1);assert.ok(parts.length<=32);
 assert.equal(lines[0].style.startAnchor.elementId,'a');assert.equal(lines.at(-1).style.endAnchor.elementId,'b');
 assert.equal(lines.at(-1).style.endArrow,'triangle');assert.ok(lines.slice(0,-1).every(l=>!l.style.endArrow));
 assert.ok(parts.every(p=>p.source.sceneRelationId===relation.id&&p.source.sourceRouteParts===parts.length));
 // Office removes cross-boundary attachments when only the route is grouped.
 // Keep explicit parts on the page; the owning diagram can select them by ID.
 assert.ok(parts.every(p=>p.source.nativeComponentGroupId===undefined));
 for(const l of lines)for(const key of ['startAnchor','endAnchor'])assert.ok(['a','b',...controls.map(c=>c.id)].includes(l.style[key].elementId));
 assert.throws(()=>compileSourceSceneRoute({...request,fit:structuredClone(result.fit)}),/proof/);
});

test('a source route with varying paint retains real ports, native gradient segments and all direction/coverage gates',()=>{
 const f=fixture();
 for(let y=60;y<=135;y++)for(let x=38;x<=203;x++){
  const at=(y*240+x)*4;if(f.image.rgba[at]===30&&f.image.rgba[at+1]===60&&f.image.rgba[at+2]===90)
   f.put(x,y,[Math.round(x/240*160),60,180]);
 }
 const result=measureSourceSceneRoute(f);assert.ok(result.fit,result.reason);assert.ok(result.fit.paint);
 assert.ok(result.fit.paint.stops.length<=6);assert.ok(result.fit.paint.support>=.9);
 const request={fit:result.fit,relation:{id:'gradient-route',regionId:'root',fromId:'a',toId:'b',direction:'forward'},fromId:'a',toId:'b',widthPx:240,heightPx:180,slideSize:{widthPt:240,heightPt:180}};
 const lines=compileSourceSceneRoute(request).filter(p=>p.type==='line');assert.ok(lines.every(l=>l.style.strokeGradient));
 assert.equal(lines[0].style.startAnchor.elementId,'a');assert.equal(lines.at(-1).style.endAnchor.elementId,'b');
 assert.throws(()=>compileSourceSceneRoute({...request,fit:structuredClone(result.fit)}),/proof/);
 assert.throws(()=>{result.fit.paint.stops[0].color='#FFFFFF';},TypeError);
 assert.equal(measureSourceSceneRoute({...f,direction:'backward'}).fit,null);
 for(let y=130;y<=150;y++)for(let x=119;x<=121;x++)f.put(x,y,[80,60,180]);
 assert.equal(measureSourceSceneRoute({...f,shaftBox:{x:38,y:59,w:165,h:98}}).fit,null);
});
test('source routes preserve direction, continuity, text ownership and the original caps',()=>{
 const f=fixture();assert.equal(measureSourceSceneRoute({...f,direction:'backward'}).fit,null);
 assert.equal(measureSourceSceneRoute({...f,direction:'both'}).fit,null);
 assert.equal(measureSourceSceneRoute({...f,textMasks:[{x:100,y:125,w:20,h:12}]}).fit,null);
 assert.equal(measureSourceSceneRoute({...f,otherNodes:[{x:100,y:125,w:20,h:12}]}).fit,null);
 const capped={used:4000000};assert.equal(measureSourceSceneRoute({...f,budget:capped}).fit,null);assert.equal(capped.used,4000000);
 for(let x=100;x<=103;x++)for(let y=128;y<=132;y++)f.put(x,y,[255,255,255]);
 assert.equal(measureSourceSceneRoute(f).fit,null);
});

test('source contact uses actual terminal ink even when a valid global paint fit excludes its antialiased cells',()=>{
 const f=fixture();
 for(let y=60;y<=61;y++)for(let x=44;x<=46;x++)f.put(x,y,[180,185,190]);
 const result=measureSourceSceneRoute(f);assert.ok(result.fit,result.reason);
 assert.equal(result.fit.color,'#1E3C5A');assert.ok(result.fit.support>=.9);
 // Source contrast still cannot bridge an empty attachment or grant a body
 // capability to an unbound, changed or foreign endpoint.
 for(let y=60;y<=62;y++)for(let x=44;x<=46;x++)f.put(x,y,[255,255,255]);
 assert.equal(measureSourceSceneRoute(f).fit,null);
});

test('an antialiased source shaft compiles its measured coverage width and retains real external attachments',()=>{
 const f=fixture();
 for(let y=0;y<180;y++)for(let x=0;x<240;x++)
  if(![f.from,f.to].some(n=>x>=n.box.x&&x<n.box.x+n.box.w&&y>=n.box.y&&y<n.box.y+n.box.h))f.put(x,y,[255,255,255]);
 const weights=[.25,.55,1,1,1,.55,.25];
 for(let x=70;x<=162;x++)for(let d=-3;d<=3;d++)f.put(x,40+d,[30,60,90].map(v=>Math.round(255+(weights[d+3])*(v-255))));
 for(let x=162;x<=169;x++)for(let d=-(169-x);d<=169-x;d++)f.put(x,40+d);
 const input={...f,shaftBox:{x:69,y:24,w:102,h:32}},result=measureSourceSceneRoute(input);
 assert.ok(result.fit,result.reason);assert.ok(result.fit.widthPx>4.5&&result.fit.widthPx<4.7);
 const parts=compileSourceSceneRoute({fit:result.fit,relation:{id:'antialiased',regionId:'root',fromId:'a',toId:'b',direction:'forward'},
  fromId:'a',toId:'b',widthPx:240,heightPx:180,slideSize:{widthPt:240,heightPt:180}});
 const lines=parts.filter(p=>p.type==='line');assert.equal(lines[0].style.startAnchor.elementId,'a');assert.equal(lines.at(-1).style.endAnchor.elementId,'b');
 // A truly opaque six-pixel shaft cannot use antialias measurement to cross
 // the unchanged five-pixel cap.
 for(let x=70;x<=162;x++)for(let d=-3;d<=3;d++)f.put(x,40+d,d===-3?[255,255,255]:[30,60,90]);
 assert.equal(measureSourceSceneRoute(input).fit,null);
});
test('a complete native route cannot silently drop a connected branch or another loop',()=>{
 const f=fixture();for(let y=130;y<=150;y++)for(let x=119;x<=121;x++)f.put(x,y);
 // The hint includes the whole observed branch. No cropped disappearance is a pass.
 const result=measureSourceSceneRoute({...f,shaftBox:{x:38,y:59,w:165,h:98}});
 assert.equal(result.fit,null);assert.equal(result.reason,'route-unrepresented-branch');
 const {simplifySourceRoute,sourceRoutePath}=require('../packages/slideclone-core/routing/source-route-centerline');
 assert.equal(simplifySourceRoute([{x:0,y:0},{x:1,y:1},{x:2,y:0}],{checks:4000000}),null);
 assert.equal(sourceRoutePath(new Uint8Array(10),5,2,0,9,{checks:4000000}),null);
});
test('blank, detached, plain and transparent paths cannot turn provider geometry into source evidence',()=>{
 for(const mode of ['blank','plain','detached','transparent']){
  const f=fixture();
  if(mode==='blank')f.image.rgba.fill(255);
  if(mode==='plain')for(let y=60;y<=65;y++)for(let x=189;x<=201;x++)f.put(x,y,x>=194&&x<=196?[30,60,90]:[255,255,255]);
  if(mode==='detached')for(let y=60;y<=64;y++)for(let x=189;x<=201;x++)f.put(x,y,[255,255,255]);
  if(mode==='transparent')for(let y=100;y<110;y++)for(let x=44;x<=46;x++)f.image.rgba[(y*240+x)*4+3]=0;
  assert.equal(measureSourceSceneRoute(f).fit,null,mode);
 }
});
test('unknown controls, cross-source tokens, proxies and accessors fail before granting path authority',()=>{
 const f=fixture();let reads=0;const hostile={};Object.defineProperty(hostile,'x',{get(){reads++;throw Error('private');}});
 for(const input of [null,new Proxy(f,{}),{...f,textMasks:new Array(1)},{...f,textMasks:new Proxy([],{})},
  {...f,shaftBox:hostile},{...f,budget:{used:NaN}},{...f,from:{...f.from,box:{x:0,y:0,w:99999,h:10}}}])assert.throws(()=>measureSourceSceneRoute(input),TypeError);
 assert.equal(reads,0);
 for(const token of [undefined,{},structuredClone(f.from.portFrame),new Proxy(f.from.portFrame,{})])assert.equal(measureSourceSceneRoute({...f,from:{...f.from,portFrame:token}}).fit,null);
 assert.equal(measureSourceSceneRoute({...f,image:{...f.image,rgba:Buffer.from(f.image.rgba)}}).fit,null);
});

test('explicit undirected source routes retain attachments without inventing arrowheads',()=>{
 const f=fixture();
 for(let y=60;y<=65;y++)for(let x=189;x<=201;x++)f.put(x,y,x>=194&&x<=196?[30,60,90]:[255,255,255]);
 const before=Buffer.from(f.image.rgba),result=measureSourceSceneRoute({...f,direction:'undirected'});
 assert.ok(result.fit,result.reason);assert.deepEqual(f.image.rgba,before);
 const relation={id:'plain-route',regionId:'root',fromId:'a',toId:'b',direction:'undirected'};
 const request={fit:result.fit,relation,fromId:'a',toId:'b',widthPx:240,heightPx:180,slideSize:{widthPt:240,heightPt:180}};
 const parts=compileSourceSceneRoute(request),lines=parts.filter(p=>p.type==='line');
 assert.ok(lines.length>=3);assert.equal(lines[0].style.startAnchor.elementId,'a');
 assert.equal(lines.at(-1).style.endAnchor.elementId,'b');
 assert.ok(lines.every(p=>!p.style.startArrow&&!p.style.endArrow));
 assert.throws(()=>compileSourceSceneRoute({...request,relation:{...relation,direction:'forward'}}),/proof/);
 assert.equal(measureSourceSceneRoute({...fixture(),direction:'undirected'}).fit,null);
 assert.equal(measureSourceSceneRoute({...f,direction:'forward'}).fit,null);
 for(const direction of ['unknown','',null,4,{},new Proxy({},{})])assert.throws(()=>measureSourceSceneRoute({...f,direction}),TypeError);
 assert.equal(measureSourceSceneRoute({...f,direction:'undirected',textMasks:[{x:100,y:125,w:20,h:12}]}).fit,null);
 const capped={used:4000000};assert.equal(measureSourceSceneRoute({...f,direction:'undirected',budget:capped}).fit,null);
 assert.equal(capped.used,4000000);
});

test('unrelated perimeter paint does not veto a complete source route but connected clipped paint does',()=>{
 const f=fixture();
 // The shaft window includes an independent mark crossing its left perimeter.
 for(let x=36;x<=41;x++)for(let y=94;y<=96;y++)f.put(x,y);
 const before=Buffer.from(f.image.rgba),result=measureSourceSceneRoute(f);
 assert.ok(result.fit,result.reason);assert.deepEqual(f.image.rgba,before);
 assert.ok(result.fit.points.every(p=>p.x>=44));
 // Connect that mark to the actual shaft: its complete source component now
 // reaches the crop edge, so the same representation must remain rejected.
 for(let x=41;x<=45;x++)for(let y=94;y<=96;y++)f.put(x,y);
 const clipped=measureSourceSceneRoute(f);assert.equal(clipped.fit,null);assert.equal(clipped.reason,'route-window-boundary');
 const polluted=fixture();
 for(let x=36;x<=41;x++)for(let y=94;y<=96;y++)polluted.put(x,y);
 for(const [lo,hi] of [[39,41],[48,51]])for(let x=lo;x<=hi;x++)for(let y=70;y<=125;y++)polluted.put(x,y);
 assert.equal(measureSourceSceneRoute(polluted).fit,null);
});

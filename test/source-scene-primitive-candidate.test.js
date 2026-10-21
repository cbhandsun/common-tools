"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {parsePrimitiveCandidate,constructPrimitiveCandidate}=require('../packages/slideclone-core/source-scene-primitive-candidate');
const frame={widthPx:800,heightPx:600,widthPt:400,heightPt:300};
const recipe=kind=>({id:'unit',kind,box:{x:100,y:100,w:100,h:80},fill:'#AABBCC',stroke:'#112233',strokeWidthPx:2});
for(const kind of ['ellipse','roundRect','quad','cylinder','handFrame'])test(`actual ${kind} constructor emits bounded native drawing`,()=>{
 const r=recipe(kind),result=constructPrimitiveCandidate(r,frame);
 assert(result.shapes.length>0&&result.shapes.length<=32);
 assert.equal(result.kind,kind);assert.equal(result.sourceAuthorized,false);assert.equal(result.labelsCompleted,false);assert.equal(result.portsAuthorized,false);
 for(const s of result.shapes){assert.equal(s.box.x,50);assert.equal(s.box.y,50);assert.equal(s.style.strokeWidthPt,1);assert.equal(s.source.nativeRebuildCandidate,true);
  assert.equal(s.source.editable,undefined);assert.equal(s.source.semanticNativeStructure,undefined);assert.equal(s.source.nativeComponentGroupId,undefined);
  if(s.style.freeformSegments){assert(s.style.freeformSegments.length<=120);for(const c of s.style.freeformSegments)for(const p of c.points){assert(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);}}
 }
 assert.deepEqual(r,recipe(kind));
});
test('layered cylinder emits front seams and separate real cap, with stable member ids',()=>{
 const r={...recipe('cylinder'),capRatio:.2,seams:[.4,.7],capFill:'#DDCCBB'},x=constructPrimitiveCandidate(r,frame);
 assert.deepEqual(x.shapes.map(s=>s.id),['unit-body','unit-seam-0','unit-seam-1','unit-cap']);
 assert.equal(x.shapes[0].type,'freeform');assert.equal(x.shapes[1].style.fill,'none');assert.equal(x.shapes[3].type,'ellipse');assert.equal(x.shapes[3].style.fill,'#DDCCBB');
 assert.equal(x.shapes[3].box.h,8);assert.equal(x.shapes[1].style.freeformSegments.at(-1).type,'cubicBezTo');
});
test('tilted quadrilateral uses all actual proposed corners and owns no shadow or labels',()=>{
 const corners=[{x:0,y:.15},{x:.85,y:0},{x:1,y:.85},{x:.15,y:1}],r={...recipe('quad'),corners};
 const x=constructPrimitiveCandidate(r,frame);assert.deepEqual(x.shapes[0].style.freeformSegments[0].points,[corners[0]]);
 assert.equal(x.shapes.length,1);assert.equal(x.shapes[0].style.freeformSegments.at(-1).type,'close');
 corners[0].x=.2;assert.equal(x.shapes[0].style.freeformSegments[0].points[0].x,0);
});
test('hollow frame has an explicit outline and cannot silently authorize fill',()=>{
 const x=constructPrimitiveCandidate({...recipe('handFrame'),dash:'dash'},frame);assert.equal(x.shapes[0].style.fill,'none');assert.equal(x.shapes[0].style.dash,'dash');
});
for(const value of [null,undefined,[],{},'',new Date()])test(`empty or unsupported recipe ${String(value)} is rejected`,()=>assert.throws(()=>parsePrimitiveCandidate(value),TypeError));
for(const patch of [{kind:'unknown'},{id:'../native'},{fill:'red'},{stroke:'#00000000'},{strokeWidthPx:-1},{strokeWidthPx:17},{strokeWidthPx:NaN},
 {dash:'dot'},{capRatio:0},{capRatio:.51},{radiusRatio:Infinity},{seams:[.5,.4]},{seams:[.12]},{seams:Array.from({length:16},(_,i)=>.25+i*.01)},
 {box:{x:-1,y:10,w:20,h:20}},{box:{x:0,y:0,w:0,h:20}},{box:{x:0,y:0,w:20,h:Infinity}},{box:{x:16384,y:0,w:1,h:1}},
 {corners:[{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]},{corners:[{x:0,y:0},{x:1,y:0},{x:1,y:0},{x:0,y:1}]},{sourceAuthorized:true}])
 test('invalid recipe boundary '+JSON.stringify(patch),()=>assert.throws(()=>parsePrimitiveCandidate({...recipe('quad'),...patch}),TypeError));
test('getter, proxy and coercion objects cannot run while parsing external data',()=>{
 let runs=0;const r=recipe('quad'),getter={...r};Object.defineProperty(getter,'kind',{get(){runs++;return 'quad';},enumerable:true});
 assert.throws(()=>parsePrimitiveCandidate(getter));assert.equal(runs,0);
 assert.throws(()=>parsePrimitiveCandidate(new Proxy(r,{get(){runs++;throw Error('trap');}})));assert.equal(runs,0);
 const coercion={toString(){runs++;return 'quad';}};assert.throws(()=>parsePrimitiveCandidate({...r,kind:coercion}));assert.equal(runs,0);
 const sparse=new Array(4);assert.throws(()=>parsePrimitiveCandidate({...r,corners:sparse}));
});
test('sparse and accessor seams fail before constructing geometry',()=>{
 const sparse=new Array(2),seams=[.4,.7];Object.defineProperty(seams,'1',{get(){throw Error('trap');}});
 assert.throws(()=>parsePrimitiveCandidate({...recipe('cylinder'),seams:sparse}),TypeError);assert.throws(()=>parsePrimitiveCandidate({...recipe('cylinder'),seams}),TypeError);
});
for(const f of [null,{}, {...frame,widthPx:Infinity},{...frame,widthPx:1},{...frame,widthPx:16384,heightPx:16384},{...frame,widthPt:0},
 {...frame,widthPt:20001},{...frame,heightPt:NaN},{...frame,extra:true}])test('invalid candidate frame '+JSON.stringify(f),()=>assert.throws(()=>constructPrimitiveCandidate(recipe('ellipse'),f),TypeError));
test('maximum cylinder recipe still respects existing 32-part and 120-command bounds',()=>{
 const result=constructPrimitiveCandidate({...recipe('cylinder'),capRatio:.05,seams:Array.from({length:15},(_,i)=>.1+i*.05)},frame);
 assert.equal(result.shapes.length,17);assert(result.shapes.every(s=>!s.style.freeformSegments||s.style.freeformSegments.length<=120));
});

"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fitSourceOutlinePalette:fit}=require('../packages/slideclone-core/scene-plan/source-outline-palette');
const {measureSourceOutlinePaint:measure}=require('../packages/slideclone-core/scene-plan/source-outline-paint');
const {applySourceOutlinePaint:apply}=require('../packages/slideclone-core/scene-plan/source-outline-paint-shapes');
const {readPng}=require('../packages/slideclone-core/png');
function gradient(){return {samples:Array.from({length:64},(_,i)=>[30+i*3,90+i*2,150+i]),centers:[[30,90,150],[219,216,213]]};}
function work(){return {checks:0,exhausted:false};}
function fixture(){
 const source=readPng(path.join(__dirname,'fixtures/source-thin-outline/source.png'));
 const points=require('./fixtures/source-thin-outline/contour.json').points.map(p=>({x:p.x+16,y:p.y+18}));
 return {points,width:source.width,colors:new Map(points.map(p=>[p.y*source.width+p.x,
  Array.from(source.rgba.subarray((p.y*source.width+p.x)*4,(p.y*source.width+p.x)*4+3))]))};
}
function covers(segments,box,x,y){
 let winding=0,loop=[];
 for(const s of segments){
  if(s.type!=='close'){assert.ok(['moveTo','lnTo'].includes(s.type));loop.push({x:box.x+s.points[0].x*box.w,y:box.y+s.points[0].y*box.h});continue;}
  for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length],cross=(b.x-a.x)*(y-a.y)-(x-a.x)*(b.y-a.y);
   if(a.y<=y&&b.y>y&&cross>0)winding++;if(a.y>y&&b.y<=y&&cross<0)winding--;}
  loop=[];
 }
 return winding!==0;
}

test('real antialias fringe uses disjoint native color parts without a fabricated pale base',()=>{
 const input=fixture(),before=structuredClone(input),w=work(),paint=measure(input,w,true);assert.ok(paint);
 assert.equal(paint.disjoint,true);assert.ok(paint.parts.length<=30);assert.ok(paint.parts.every(p=>p.segments.length<=120));
 const cells=new Set(input.points.map(p=>`${p.x},${p.y}`));let totalError=0;
 for(let y=18;y<65;y++)for(let x=16;x<65;x++){
  const parts=paint.parts.filter(p=>covers(p.segments,p.box,x+.5,y+.5));
  assert.equal(parts.length,cells.has(`${x},${y}`)?1:0,`source cell ${x},${y}`);
  if(parts.length){const color=parts[0].color,expected=input.colors.get(y*input.width+x);
   for(let channel=0;channel<3;channel++)totalError+=Math.abs(Number.parseInt(color.slice(1+channel*2,3+channel*2),16)-expected[channel]);}
 }
 assert.ok(totalError/(input.points.length*3)<7);assert.ok(w.checks>0&&w.checks<=4000000);assert.deepEqual(input,before);
 const shape={id:'ring',type:'freeform',box:{x:10,y:20,w:49,h:47},style:{fill:'#888888',freeformPath:'original-anchor'},source:{}};
 const result=apply([shape],new Map([['ring',paint]]));
 assert.equal(result.shapes[0].style.fill,'none');assert.equal(result.shapes[0].style.freeformPath,'original-anchor');
 assert.equal(result.shapes.length,paint.parts.length+1);assert.deepEqual(shape.style,{fill:'#888888',freeformPath:'original-anchor'});
});

test('palette is bounded, deterministic, translates source sample order to labels and preserves inputs',()=>{
 const input=gradient(),before=structuredClone(input),a=fit(input,work()),b=fit(input,work());assert.ok(a);assert.deepEqual(a,b);
 assert.equal(a.colors.length,8);assert.equal(a.labels.length,64);assert.deepEqual(input,before);
 for(const label of a.labels)assert.ok(label<a.colors.length);
});

test('disjoint paint erases only its measured source cells while the complete anchor erases nothing',()=>{
 const input=fixture(),paint=measure(input,work(),true);assert.ok(paint?.disjoint);
 const {traceNativeMaskContours}=require('../packages/slideclone-core/scene-plan/native-mask-contours');
 const {freeformResidualMasks}=require('../packages/slideclone-core/scene-plan/residual-freeform-mask');
 const shape={id:'ring',type:'freeform',box:paint.box,style:{stroke:'none',fill:paint.baseColor,
  freeformSegments:traceNativeMaskContours(input.points,paint.box,{tolerancePx:.5})},source:{}};
 const result=apply([shape],new Map([['ring',paint]])),image={width:81,height:83},size={w:81,h:83};
 assert.deepEqual(freeformResidualMasks(result.shapes[0],image,size),[]);
 const owned=new Set();for(const part of result.shapes.slice(1))for(const m of freeformResidualMasks(part,image,size))
  for(let x=m.x;x<m.x+m.w;x++){const key=`${x},${m.y}`;assert.equal(owned.has(key),false);owned.add(key);}
 assert.deepEqual(owned,new Set(input.points.map(p=>`${p.x},${p.y}`)));
});

test('closed source outlines enable the palette while relationship-body consumers keep legacy paint',()=>{
 const input=fixture(),legacy=measure(input,work());assert.ok(legacy);assert.equal(legacy.disjoint,undefined);assert.equal(legacy.parts.length,1);
 const image=readPng(path.join(__dirname,'fixtures/source-thin-outline/source.png'));
 const {measureOutlinedSceneContainerDetailed}=require('../packages/slideclone-core/scene-plan/source-scene-outline');
 const result=measureOutlinedSceneContainerDetailed(image,{x:16.01,y:16.912,w:48.87,h:49.232},
  [{x:31.214,y:29.569,w:15.204,h:24.616}],{used:0});
 assert.equal(result.outline?.paint?.disjoint,true);
 for(const mode of [null,{},'disjoint',1])assert.throws(()=>measure(input,work(),mode),TypeError);
});

test('uniform and existing two-color paint do not multiply native parts',()=>{
 for(const input of [{samples:[[10,20,30],[10,20,30]],centers:[[10,20,30],[10,20,30]]},
  {samples:[[10,20,30],[200,210,220]],centers:[[10,20,30],[200,210,220]]}])assert.equal(fit(input,work()),null);
});

test('empty, sparse, invalid, extreme and hostile sample controls fail safely',()=>{
 for(const samples of [[],new Array(1),[[1,2]],[[1,2,NaN]],[[1,2,256]],[[1,2,-1]],[[1,2,'3']],Array(262145).fill([0,0,0])])
  assert.throws(()=>fit({...gradient(),samples},work()),TypeError);
 let reads=0;const secret={get samples(){reads++;throw Error('private-token');},centers:[]};
 const hostile=[secret,new Proxy(gradient(),{}),{...gradient(),samples:[new Proxy([1,2,3],{})]}];
 for(const input of hostile)assert.throws(()=>fit(input,work()),e=>e instanceof TypeError&&!e.message.includes('private-token'));
 assert.equal(reads,0);
});

test('work failures are atomic, bounded and cannot run accessors or silently accept partial palettes',()=>{
 const exhausted={checks:4000000,exhausted:false};assert.equal(fit(gradient(),exhausted),null);assert.equal(exhausted.checks,4000000);
 const partial={checks:3999900,exhausted:false};assert.equal(fit(gradient(),partial),null);assert.deepEqual(partial,{checks:4000001,exhausted:true});
 let reads=0;const getter={get checks(){reads++;throw Error('private-token');},exhausted:false};
 for(const w of [null,{},getter,new Proxy(work(),{}),{checks:4000001,exhausted:false},{checks:0,exhausted:0},Object.freeze(work())])
  assert.throws(()=>fit(gradient(),w),e=>e instanceof TypeError&&!e.message.includes('private-token'));
 assert.equal(reads,0);
});

test('sparse arrays cannot trade holes for symbols or custom iterators at the palette boundary',()=>{
 let calls=0;
 const samples=gradient().samples;
 const sparseColor=[30,,150];sparseColor[Symbol('hole')]=90;
 const colorIterator=[30,,150];colorIterator[Symbol.iterator]=function*(){calls++;yield 30;yield 90;yield 150;};
 const outer=[samples[0],,samples[2]];outer[Symbol.iterator]=function*(){calls++;yield* samples;};
 const outerSymbol=[samples[0],,samples[2]];outerSymbol[Symbol('hole')]=samples[1];
 const centers=[[30,90,150],];centers.length=2;centers[Symbol('hole')]=[219,216,213];
 for(const input of [
  {...gradient(),samples:[sparseColor]},
  {...gradient(),samples:[colorIterator]},
  {...gradient(),samples:outer},
  {...gradient(),samples:outerSymbol},
  {...gradient(),centers}
 ]){
  const ledger=work();
  assert.throws(()=>fit(input,ledger),TypeError);
  assert.deepEqual(ledger,work());
 }
 assert.equal(calls,0);
});

test('color fringe regression is included in the unified unit suite',()=>{
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-outline-palette.test.js','unit'),true);
});

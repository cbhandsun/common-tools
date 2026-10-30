'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compoundHeadAxisFixture:fixture}=require('./helpers/source-compound-head-axis.cjs');
const {sourceCompoundRouteGeometry:measure}=require('../packages/slideclone-core/routing/source-compound-route-geometry');
const {partitionSourceCompoundRoute:partition}=require('../packages/slideclone-core/routing/source-compound-route-partition');
const {sourceRouteFootprintPolyline:footprint}=require('../packages/slideclone-core/routing/source-route-footprint-polyline');
const {sourceCompoundRouteAxis:axis}=require('../packages/slideclone-core/routing/source-compound-route-axis');

// These small partitions exercise the internal composition boundary only.
// Production obtains head certificates from partitionSourceCompoundRoute.
function lineFixture(){
 const width=50,height=25,path=Array.from({length:31},(_,i)=>({x:i+5,y:10})),trimmed=path.slice(0,21);
 const queue=trimmed.map(p=>p.y*width+p.x),remaining=new Uint8Array(width*height);for(const n of queue)remaining[n]=1;
 const selected=new Set(path.slice(20).map(p=>p.y*width+p.x));
 return {input:{width,height,path,work:{checks:0}},partition:{trimmed,queue,remaining,shaft:1,startHead:null,endHead:{selected}}};
}

test('separately proved head skeleton cannot exhaust the thin shaft vertex capacity',()=>{
 const f=fixture(),before=Buffer.from(f.rgba),mask=f.mask.slice(),path=structuredClone(f.path),p=partition({...f,work:{checks:0}});assert.ok(p);
 assert.equal(footprint({points:f.path,cells:p.queue,width:f.width,height:f.height,shaft:p.shaft,work:{checks:0}}),null);
 const result=measure(f);assert.ok(result);assert.equal(!!result.filledBody,false);assert.ok(result.nativePoints);
 assert.ok(result.nativePoints.length<=16);assert.equal(result.shaft,p.shaft);assert.equal(result.fixedHeadCuts,true);
 assert.deepEqual(result.nativePoints[0],f.path[0]);assert.deepEqual(result.nativePoints.at(-1),f.path.at(-1));
 assert.ok(result.nativePoints.some(q=>q.x===p.trimmed.at(-1).x&&q.y===p.trimmed.at(-1).y),'the certified cut must remain a vertex');
 assert.deepEqual(f.rgba,before);assert.deepEqual(f.mask,mask);assert.deepEqual(f.path,path);assert.ok(f.work.checks<=4000000);
 assert.ok(path.every((q,i)=>!i||Math.max(Math.abs(q.x-path[i-1].x),Math.abs(q.y-path[i-1].y))===1));
});

test('fixed cuts survive collinear simplification and retain forward, backward and double heads',()=>{
 const f=lineFixture(),before=structuredClone(f);
 assert.deepEqual(axis(f.input,f.partition),[{x:5,y:10},{x:25,y:10},{x:35,y:10}]);
 const back=lineFixture();back.input.path.reverse();back.partition.trimmed.reverse();
 back.partition.startHead=back.partition.endHead;back.partition.endHead=null;
 assert.deepEqual(axis(back.input,back.partition),[{x:35,y:10},{x:25,y:10},{x:5,y:10}]);
 const both=lineFixture();both.partition.trimmed=both.input.path.slice(5,21);both.partition.remaining.fill(0);
 both.partition.queue=both.partition.trimmed.map(p=>p.y*both.input.width+p.x);for(const n of both.partition.queue)both.partition.remaining[n]=1;
 both.partition.startHead={selected:new Set(both.input.path.slice(0,6).map(p=>p.y*both.input.width+p.x))};
 assert.deepEqual(axis(both.input,both.partition),[{x:5,y:10},{x:10,y:10},{x:25,y:10},{x:35,y:10}]);
 assert.deepEqual(f.input.path,before.input.path);assert.deepEqual(f.partition,before.partition);
});

test('only an exact contiguous shaft and head-owned original prefixes and suffixes can compose',()=>{
 for(const mode of ['no-head','missing-owned-cell','wrong-head','shaft-hole','stale-trimmed','reordered','duplicate','empty','untrimmed']){
  const f=lineFixture(),p=f.partition,input=f.input;
  if(mode==='no-head')p.endHead=null;
  if(mode==='missing-owned-cell')p.endHead.selected.delete(10*input.width+29);
  if(mode==='wrong-head'){p.startHead=p.endHead;p.endHead={selected:new Set()};}
  if(mode==='shaft-hole'){p.remaining[10*input.width+15]=0;p.trimmed=p.trimmed.filter(q=>q.x!==15);}
  if(mode==='stale-trimmed')p.remaining[10*input.width+15]=0;
  if(mode==='reordered')[p.trimmed[3],p.trimmed[4]]=[p.trimmed[4],p.trimmed[3]];
  if(mode==='duplicate')input.path.splice(25,0,{...input.path[24]});
  if(mode==='empty')p.trimmed=[];
  if(mode==='untrimmed'){for(const q of input.path)p.remaining[q.y*input.width+q.x]=1;p.trimmed=[...input.path];}
  assert.equal(axis(input,p),null,mode);
 }
});

test('continuous head chords reject a short empty interval that integer samples miss',()=>{
 const f=lineFixture(),p=f.partition,input=f.input;
 input.path=[...Array.from({length:6},(_,i)=>({x:5+i,y:10})),...Array.from({length:10},(_,i)=>({x:11+i,y:10+Math.ceil((i+1)*.3)}))];
 p.trimmed=input.path.slice(0,6);p.queue=p.trimmed.map(q=>q.y*input.width+q.x);p.remaining.fill(0);for(const n of p.queue)p.remaining[n]=1;
 p.endHead.selected=new Set();for(let y=9;y<=14;y++)for(let x=10;x<=20;x++)p.endHead.selected.add(y*input.width+x);
 assert.ok(axis(input,p));
 p.endHead.selected.delete(11*input.width+15);
 // At t=.45..5 the chord occupies (15,11), although these eleven
 // integer-x observations all round to other original cells.
 for(let i=0;i<=10;i++)assert.ok(p.endHead.selected.has(Math.floor(10+i*.3+.5)*input.width+10+i));
 assert.equal(axis({...input,work:{checks:0}},p),null);
});

test('diagonal head chords support exact unit-cell corner contacts without filling neighboring blanks',()=>{
 const f=lineFixture(),p=f.partition,input=f.input;
 input.path=[...Array.from({length:6},(_,i)=>({x:5+i,y:10})),...Array.from({length:6},(_,i)=>({x:11+i,y:11+i}))];
 p.trimmed=input.path.slice(0,6);p.queue=p.trimmed.map(q=>q.y*input.width+q.x);p.remaining.fill(0);for(const n of p.queue)p.remaining[n]=1;
 p.endHead.selected=new Set(input.path.slice(5).map(q=>q.y*input.width+q.x));
 assert.deepEqual(axis(input,p),[{x:5,y:10},{x:10,y:10},{x:16,y:16}]);
});

test('final fractional port chords use only the corresponding head and locally measured body cells',()=>{
 for(const mode of ['one-pixel','fractional','owned-fringe','empty-gap','noncollinear','outside','invalid','wrong-body']){
  const f=lineFixture(),p=f.partition,input=f.input,body=new Uint8Array(input.width*input.height);
  const point=mode==='fractional'?{x:36.25,y:10}:mode==='owned-fringe'||mode==='empty-gap'?{x:37,y:10}:
   mode==='noncollinear'?{x:35,y:12}:mode==='outside'?{x:37.25,y:10}:mode==='invalid'?{x:NaN,y:10}:{x:36,y:10};
  if(mode==='owned-fringe')p.endHead.selected.add(10*input.width+36);
  if(mode!=='wrong-body')body[Math.round(point.y)*input.width+Math.round(point.x)]=1;
  input.headContacts={start:{point:input.path[0],body:new Uint8Array(body.length)},end:{point,body}};
  const before=body.slice(),result=axis(input,p);
  assert.equal(!!result,['one-pixel','fractional','owned-fringe'].includes(mode),mode);assert.deepEqual(body,before);
 }
 const f=fixture(),start=f.path[0],end=f.path.at(-1),body=new Uint8Array(f.width*f.height);
 const result=measure({...f,headContacts:{start:{point:start,body},end:{point:{x:end.x,y:end.y+2},body}}});
 assert.ok(result);assert.ok(result.filledBody,'an unsupported new chord retains the original filled fallback');assert.equal(result.fixedHeadCuts,undefined);
});

test('axis fallback cannot discard shaft cells, raise width or spend a fresh work allowance',()=>{
 const f=lineFixture();f.partition.queue.push(8*f.input.width+15);assert.equal(axis(f.input,f.partition),null);
 for(const checks of [4000000,3999998]){const g=lineFixture();g.input.work.checks=checks;assert.equal(axis(g.input,g.partition),null);assert.ok(g.input.work.checks<=4000001);}
 const full=fixture(),p=partition({...full,work:{checks:0}});assert.ok(p);
 const bounded={...full,work:{checks:3000000}},result=axis(bounded,p);assert.ok(result);assert.ok(bounded.work.checks>3000000&&bounded.work.checks<=4000000);
 assert.equal(p.shaft,3);assert.equal(p.queue.length,p.remaining.reduce((sum,n)=>sum+n,0));
});

test('separately appended head tips count toward the unchanged physical-part capacity',()=>{
 const f=lineFixture(),p=f.partition,input=f.input;
 p.trimmed=Array.from({length:16},(_,i)=>({x:5+i,y:i%2?12:8}));
 input.path=[...p.trimmed,...Array.from({length:10},(_,i)=>({x:21+i,y:12}))];
 p.remaining.fill(0);p.queue=p.trimmed.map(q=>q.y*input.width+q.x);for(const n of p.queue)p.remaining[n]=1;
 p.endHead.selected=new Set(input.path.slice(15).map(q=>q.y*input.width+q.x));
 assert.equal(footprint({points:p.trimmed,cells:p.queue,width:input.width,height:input.height,shaft:1,work:{checks:0}}).length,16);
 const complete=axis(input,p);assert.ok(complete);assert.equal(complete.length,17);assert.equal(complete.length*2-3,31);
 const next={x:21,y:8};input.path.splice(16,0,next);p.trimmed.push(next);p.queue.push(next.y*input.width+next.x);p.remaining[p.queue.at(-1)]=1;
 assert.equal(axis({...input,work:{checks:0}},p),null,'eighteen vertices would require thirty-three physical parts');
});

test('the compiler preserves the certified cut and final head chord for every corner mode',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
 const file=path.resolve(__dirname,'../packages/slideclone-core/scene-plan/source-scene-route-compiler.js'),nativeRequire=createRequire(file),isolated={exports:{}};
 // Isolate the compiler at its private measurement boundary. Geometry and
 // immutable proof admission have their own regressions; every downstream
 // geometry/gradient/anchor helper here is the actual production helper.
 const fit={points:[{x:5,y:10},{x:20,y:10},{x:30,y:13}],color:'#1450D2',widthPx:1,support:1,
  startSide:'right',startPosition:.5,endSide:'left',endPosition:.5,filledTerminals:true};
 vm.compileFunction(fs.readFileSync(file,'utf8'),['require','module','exports'],{filename:file})(
  name=>name==='./source-scene-route'?{isMeasuredSourceRoute:value=>value===fit}:nativeRequire(name),isolated,isolated.exports);
 const compile=isolated.exports.compileSourceSceneRoute,request={fit,relation:{id:'head',regionId:'root',fromId:'a',toId:'b',direction:'forward'},
  fromId:'a',toId:'b',widthPx:50,heightPx:25,slideSize:{widthPt:50,heightPt:25}};
 assert.equal(compile(request).length,1,'the old orthogonal regularizer drops this cut');
 fit.fixedHeadCuts=true;
 for(const mode of ['auto','rounded-freeform','reroutable-elbow']){
  const parts=compile({...request,connectorCornerMode:mode}),lines=parts.filter(p=>p.type==='line');
  assert.equal(parts.length,3);assert.equal(lines.length,2);assert.ok(parts.every(p=>p.source.sourceFixedHeadCuts));
  assert.deepEqual(lines.map(p=>p.box),[{x:5,y:10,w:15,h:0},{x:20,y:10,w:10,h:3}]);
  assert.equal(lines[0].style.startAnchor.elementId,'a');assert.equal(lines.at(-1).style.endAnchor.elementId,'b');
  assert.equal(lines.at(-1).style.endArrow,'triangle');assert.ok(!lines[0].style.endArrow);
  assert.equal(parts.filter(p=>p.source.routeControl).length,1);
 }
 assert.throws(()=>compile({...request,fit:{...fit}}),/proof/);
});

test('axis module and regression are included in the existing runtime and unified CI entrypoints',()=>{
 const file='packages/slideclone-core/routing/source-compound-route-axis.js';
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 for(const suite of ['unit','all'])assert.equal(require('../scripts/test-suites').includesSuite(__filename,suite),true);
});

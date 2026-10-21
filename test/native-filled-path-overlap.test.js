"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {nativeFilledPathDisjoint:disjoint}=require('../packages/slideclone-core/native-filled-path-overlap');
const {encodeNativeFreeformPath}=require('../packages/slideclone-core/native-freeform-path');
const loop=points=>[{type:'moveTo',points:[points[0]]},...points.slice(1).map(p=>({type:'lnTo',points:[p]})),{type:'close',points:[]}];
const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const work=()=>({used:0,exhausted:false});
function shape(segments=[...loop(rect(0,0,1,1)),...loop(rect(.1,.1,.8,.8).reverse())]){
 return {type:'freeform',box:{x:0,y:0,w:100,h:100},style:{fill:'#123ABC',stroke:'none',strokeWidthPt:0,freeformSegments:segments}};
}
const middle={x:30,y:30,w:20,h:20};
test('compound fill uses Office nonzero winding for opposite holes, filled nested loops and islands',()=>{
 assert.equal(disjoint(shape(),middle,work()),true);
 assert.equal(disjoint(shape([...loop(rect(0,0,1,1)),...loop(rect(.1,.1,.8,.8))]),middle,work()),false);
 assert.equal(disjoint(shape(loop(rect(0,0,1,1))),middle,work()),false);
 const islands=shape([...loop(rect(0,0,.2,.2)),...loop(rect(.8,.8,.2,.2))]);
 assert.equal(disjoint(islands,middle,work()),true);
 assert.equal(disjoint(islands,{x:5,y:5,w:5,h:5},work()),false);
 const nested=shape([...shape().style.freeformSegments,...loop(rect(.25,.25,.4,.4))]);
 assert.equal(disjoint(nested,middle,work()),false);
});
test('real border contact, subpixel uncertainty and enclosed paint cannot grant separation',()=>{
 for(const query of [{x:0,y:30,w:20,h:20},{x:10,y:30,w:20,h:20},{x:10+1e-9,y:30,w:20,h:20},
  {x:0,y:0,w:100,h:100},{x:5,y:5,w:90,h:90}])assert.equal(disjoint(shape(),query,work()),false);
 assert.equal(disjoint(shape(),{x:110,y:30,w:20,h:20},work()),true);
});
test('Bezier hull separation preserves winding; endpoint chords alone never prove an empty curved region',()=>{
 const curve=[{type:'moveTo',points:[{x:0,y:0}]},
  {type:'cubicBezTo',points:[{x:1,y:0},{x:1,y:1},{x:0,y:1}]},{type:'lnTo',points:[{x:0,y:.5}]},{type:'close',points:[]}];
 assert.equal(disjoint(shape(curve),middle,work()),false);
 const curvedRing=shape();curvedRing.style.freeformSegments[1]={type:'cubicBezTo',points:[{x:.2,y:0},{x:.8,y:0},{x:1,y:0}]};
 assert.equal(disjoint(curvedRing,middle,work()),true);
 curvedRing.style.freeformSegments[1]={type:'quadBezTo',points:[{x:.5,y:0},{x:1,y:0}]};
 assert.equal(disjoint(curvedRing,middle,work()),true);
 assert.equal(disjoint(shape([...curve,...loop(rect(.1,.1,.8,.8).reverse())]),middle,work()),false);
});
test('compact and expanded paths preserve inputs and charge the same shared allowance',()=>{
 const expanded=shape(),compact=structuredClone(expanded),a=work(),b=work();
 compact.style.freeformPath=encodeNativeFreeformPath(compact.style.freeformSegments);delete compact.style.freeformSegments;
 const before=structuredClone({expanded,compact});
 assert.equal(disjoint(expanded,middle,a),true);assert.equal(disjoint(compact,middle,b),true);
 assert.deepEqual(a,b);assert.deepEqual({expanded,compact},before);
});
test('unsupported effects, rotation, strokes, open paths and invalid or extreme boxes fail closed',()=>{
 for(const change of [{rotation:1},{type:'rect'},{shadow:{}},{box:{x:0,y:0,w:1e308,h:100}},
  {box:{x:0,y:0,w:0,h:100}}])assert.equal(disjoint({...shape(),...change},middle,work()),false);
 for(const change of [{stroke:'#000000'},{strokeWidthPt:1},{fill:'none'},{opacity:NaN},{opacity:2},{shadow:{}},
  {freeformSegments:undefined}])assert.equal(disjoint({...shape(),style:{...shape().style,...change}},middle,work()),false);
 const segments=shape().style.freeformSegments;
 for(const path of [segments.slice(0,-1),segments.slice(0,4),[segments[0],segments.at(-1)],
  [...segments.slice(0,4),...segments.slice(5)], [...segments,{type:'lnTo',points:[{x:.2,y:.2}]}]])
  assert.equal(disjoint(shape(path),middle,work()),false);
 for(const query of [null,{},[],{...middle,x:Infinity},{...middle,h:-1},{...middle,x:'30'}])assert.equal(disjoint(shape(),query,work()),false);
 for(const item of [null,{},[],undefined])assert.equal(disjoint(item,middle,work()),false);
});
test('invalid path collections, ambiguous geometry and oversized commands raise safe fixed errors',()=>{
 const sparse=new Array(3);sparse[0]={type:'moveTo',points:[{x:0,y:0}]};
 for(const path of [[],sparse,new Array(121).fill(shape().style.freeformSegments[0]),[{type:'moveTo',points:[{x:'0',y:0}]}],
  [{type:'moveTo',points:[{x:0,y:0}]},{type:'execute',points:[]}]])assert.throws(()=>disjoint(shape(path),middle,work()),TypeError);
 const both=shape();both.style.freeformPath=encodeNativeFreeformPath(both.style.freeformSegments);
 assert.throws(()=>disjoint(both,middle,work()),/geometry is ambiguous/);
 const bad=shape();delete bad.style.freeformSegments;bad.style.freeformPath='private-invalid-content';
 assert.throws(()=>disjoint(bad,middle,work()),error=>error instanceof TypeError&&!error.message.includes('private-invalid-content'));
});
test('getters, proxies, inherited paint and coercion hooks never execute',()=>{
 let touched=0;const fail=()=>{touched++;throw Error('private data');};
 const accessor={get type(){return fail();}},proxy=new Proxy(shape(),{get:fail,getPrototypeOf:fail,ownKeys:fail});
 for(const item of [accessor,proxy,{...shape(),style:{get fill(){return fail();}}},{...shape(),style:new Proxy({}, {get:fail})},
  {...shape(),box:{get x(){return fail();}}},Object.create(shape())])assert.equal(disjoint(item,middle,work()),false);
 assert.equal(disjoint(shape(),new Proxy(middle,{get:fail}),work()),false);
 const badPoint={get x(){return fail();},y:0};
 assert.throws(()=>disjoint(shape([{type:'moveTo',points:[badPoint]}]),middle,work()),TypeError);
 assert.throws(()=>disjoint(shape(new Proxy([], {get:fail})),middle,work()),TypeError);
 assert.throws(()=>disjoint(shape(),middle,{used:0,get exhausted(){return fail();}}),TypeError);
 assert.throws(()=>disjoint(shape(),middle,new Proxy(work(),{get:fail})),TypeError);
 assert.equal(touched,0);
});
test('exhaustion fails closed, never exceeds 4M and cannot be reset by a caller',()=>{
 const probe=work();assert.equal(disjoint(shape(),middle,probe),true);
 const exact={used:4000000-probe.used,exhausted:false};assert.equal(disjoint(shape(),middle,exact),true);assert.equal(exact.used,4000000);
 assert.equal(disjoint(shape(),middle,exact),false);assert.equal(exact.used,4000000);assert.equal(exact.exhausted,true);
 const short={used:4000001-probe.used,exhausted:false};assert.equal(disjoint(shape(),middle,short),false);assert.ok(short.used<=4000000);assert.equal(short.exhausted,true);
 const exhausted={used:0,exhausted:true};assert.equal(disjoint(shape(),middle,exhausted),false);assert.equal(exhausted.used,0);
 for(const budget of [null,{},Object.freeze(work()),{used:-1,exhausted:false},{used:4000001,exhausted:false},
  {used:Infinity,exhausted:false},{used:0,exhausted:0}])assert.throws(()=>disjoint(shape(),middle,budget),TypeError);
});
test('native paint regression is discovered by unified CI and ships in the runtime',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded'),{IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 for(const suite of ['all','unit'])assert.ok(discoverTestFiles(require('node:path').resolve(__dirname,'..'),suite).some(p=>p.file.endsWith('native-filled-path-overlap.test.js')));
 assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/native-filled-path-overlap.js'));
});

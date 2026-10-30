'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteLinearSections:sections}=require('../packages/slideclone-core/routing/source-route-linear-sections');
const path=[[0,0],[0,1],[1,2],[1,3],[2,4],[2,5],[3,6],[3,7],[4,7],[4,8],[5,9],[5,10],[5,11],[6,12],[6,13],[7,14]].map(([x,y])=>({x:x+25,y:y+20}));
const input=()=>({path,points:[path[0],path.at(-1)],work:{checks:0}});

test('a fixed-distance flank uses the measured straight run instead of a staircase tangent into neighboring ink',()=>{
 const f=input(),before=structuredClone(f),frames=sections(f);assert.ok(frames);assert.equal(frames.length,1);
 assert.deepEqual(frames[0],{low:0,high:15,direction:{x:7,y:14}});
 const p=path[10],a=path[8],b=path[12],radius=3/2+4;
 const sample=({x,y})=>({x:Math.round(p.x+y/Math.hypot(x,y)*radius),y:Math.round(p.y-x/Math.hypot(x,y)*radius)});
 const old=sample({x:b.x-a.x,y:b.y-a.y}),fixed=sample(frames[0].direction);
 const isBackground=({x,y})=>!(x>=33&&x<=50&&y>=28&&y<=30);
 assert.equal(isBackground(old),false);assert.equal(isBackground(fixed),true);
 assert.deepEqual(f.path,before.path);assert.deepEqual(f.points,before.points);
 const reverse=sections({path:[...path].reverse(),points:[...f.points].reverse(),work:{checks:0}});assert.ok(reverse);
 assert.deepEqual(reverse[0].direction,{x:-7,y:-14});
});

test('linear sections preserve failure, bevel, work and hostile-input boundaries',()=>{
 const f=input(),bent=[...path];bent[6]={x:40,y:26};assert.equal(sections({...f,path:bent}),null);
 assert.equal(sections({...f,path:[...path,path[0]]}),null);
 assert.equal(sections({...f,points:[f.points[1],f.points[0]]}),null);
 assert.equal(sections({...f,work:{checks:4000000}}),null);
 assert.deepEqual(sections({path:path.slice(0,4),points:[path[0],path[3]],work:{checks:0}}),[]);
 assert.deepEqual(sections({...f,points:[{x:20,y:19},{x:24,y:18}]}),[]);
 let calls=0;
 for(const v of [null,{}, {...f,path:[]},{...f,points:[path[0]]},{...f,work:{checks:-1}},
  {...f,path:new Proxy(path,{get(){calls++;throw Error('private');}})},
  {...f,points:[path[0],Object.defineProperty({y:30},'x',{get(){calls++;throw Error('private');}})]}])assert.throws(()=>sections(v),TypeError);
 assert.equal(calls,0);
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(r=>r.file.replaceAll('\\','/')==='test/source-route-linear-sections.test.js'));
 const {IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/routing/source-route-linear-sections.js'));
});

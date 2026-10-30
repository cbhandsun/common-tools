'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceFragmentedCorner:certify}=require('../packages/slideclone-core/scene-plan/source-scene-fragmented-corner');
function fixture(farX=true,farY=false,thickness=2,middle=[.45,1.12]){
 const x=60,y=60,radius=12,sx=farX?-1:1,sy=farY?-1:1;
 const tx=x+(farX?-thickness/2:thickness/2),ty=y+(farY?-thickness/2:thickness/2);
 const components=[[0,.36],middle,[1.21,Math.PI/2]].map(([low,high])=>{
  const points=[];
  for(let py=40;py<80;py++)for(let px=40;px<80;px++){
   const u=(px+.5-tx)*sx,v=(py+.5-ty)*sy,angle=Math.atan2(radius-v,radius-u);
   if(u>=0&&v>=0&&Math.abs(Math.hypot(radius-u,radius-v)-radius)<=thickness*.4&&angle>=low&&angle<=high)points.push({x:px,y:py});
  }
  const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
  return {box:{x:left,y:top,w:Math.max(...points.map(p=>p.x))+1-left,h:Math.max(...points.map(p=>p.y))+1-top},points};
 });
 return {components,x,y,farX,farY,limit:24,horizontalThickness:thickness,verticalThickness:thickness,work:{checks:0,exhausted:false}};
}
test('three observed rounded-turn fragments certify all four orientations without creating gap pixels',()=>{
 for(const farX of [false,true])for(const farY of [false,true]){
  const input=fixture(farX,farY),before=structuredClone(input.components),result=certify(input);assert.ok(result);
  assert.equal(result.length,3);assert.ok(result.every(c=>input.components.includes(c)));
  assert.deepEqual(input.components,before);assert.ok(input.work.checks<4000000);
 }
});
test('missing tangencies, a missing diagonal, blank and unrelated fragments cannot certify a turn',()=>{
 const f=fixture();assert.equal(certify({...f,components:[]}),null);
 for(let i=0;i<3;i++)assert.equal(certify({...fixture(),components:f.components.filter((_,index)=>index!==i)}),null);
 const wrong=structuredClone(f.components);for(const p of wrong[1].points)p.x-=10;wrong[1].box.x-=10;
 assert.equal(certify({...fixture(),components:wrong}),null);
});
test('an exhausted corner calculation stops immediately and grants no partial inventory',()=>{
 const f=fixture(),work={checks:3999999,exhausted:false};assert.equal(certify({...f,work}),null);assert.equal(work.exhausted,true);
 const spent=work.checks;assert.equal(certify({...f,work}),null);assert.equal(work.checks,spent);
 assert.equal(require('../scripts/test-suites').includesSuite(__filename,'unit'),true);
});

test('a compact observed diagonal dash retains its direction when both axis spans are smaller than the stroke test',()=>{
 for(const farX of [false,true])for(const farY of [false,true]){
  const input=fixture(farX,farY,3,[.6,.95]),middle=input.components[1],before=structuredClone(input.components);
  assert.ok(middle.box.w<=4.5&&middle.box.h<=4.5,'the old bounding-box-only diagonal test rejects this dash');
  const result=certify(input);assert.ok(result,'the two measured tangencies and independently oblique source dash identify a turn');
  assert.equal(result.length,3);assert.ok(result.every(c=>input.components.includes(c)));assert.deepEqual(input.components,before);
 }
});

function touchingCorner(farX=true,farY=true){
 const vertical=[];for(let y=20;y<32;y++)for(const x of[37,38])vertical.push({x,y});
 vertical.push({x:37,y:32},{x:37,y:33},{x:36,y:33});
 const diagonal=[[34,34],[35,34],[34,35],[34,36],[33,36],[33,37]].map(([x,y])=>({x,y}));
 const horizontal=[];for(let x=20;x<32;x++)for(const y of[38,39])horizontal.push({x,y});horizontal.push({x:32,y:38});
 const components=[vertical,diagonal,horizontal].map(rows=>{
  const points=rows.map(p=>({x:farX?p.x:79-p.x,y:farY?p.y:79-p.y}));
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
  return {points,box:{x,y,w:Math.max(...points.map(p=>p.x))+1-x,h:Math.max(...points.map(p=>p.y))+1-y}};
 });
 return {components,x:40,y:40,farX,farY,limit:24,horizontalThickness:2,verticalThickness:2,work:{checks:0,exhausted:false}};
}

test('diagonally touching complete source fragments jointly prove a compact turn without invented paint',()=>{
 for(const farX of[false,true])for(const farY of[false,true]){
  const f=touchingCorner(farX,farY),before=structuredClone(f.components);
  assert.equal(f.components[1].points.length,6,'the isolated middle component cannot supply eight source pixels');
  const result=certify(f);assert.ok(result);assert.equal(result.length,3);
  assert.ok(result.every(c=>f.components.includes(c)));assert.deepEqual(f.components,before);
 }
});

test('contact support requires both real neighbours and cannot borrow distant or detached source pixels',()=>{
 for(const index of[0,2]){
  const f=touchingCorner(),points=f.components[index].points;
  if(index===0)f.components[index].points=points.filter(p=>!(p.x===36&&p.y===33));
  else f.components[index].points=points.filter(p=>!(p.x===32&&p.y===38));
  assert.equal(certify(f),null);
 }
 const blank=touchingCorner();blank.components[1].points=[];assert.equal(certify(blank),null);
 const exhausted=touchingCorner();exhausted.work.checks=3999999;assert.equal(certify(exhausted),null);assert.equal(exhausted.work.exhausted,true);
});

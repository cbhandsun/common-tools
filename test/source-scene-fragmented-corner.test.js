'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceFragmentedCorner:certify}=require('../packages/slideclone-core/source-scene-fragmented-corner');
function fixture(farX=true,farY=false){
 const x=60,y=60,radius=12,thickness=2,sx=farX?-1:1,sy=farY?-1:1;
 const tx=x+(farX?-thickness/2:thickness/2),ty=y+(farY?-thickness/2:thickness/2);
 const components=[[0,.36],[.45,1.12],[1.21,Math.PI/2]].map(([low,high])=>{
  const points=[];
  for(let py=40;py<80;py++)for(let px=40;px<80;px++){
   const u=(px+.5-tx)*sx,v=(py+.5-ty)*sy,angle=Math.atan2(radius-v,radius-u);
   if(u>=0&&v>=0&&Math.abs(Math.hypot(radius-u,radius-v)-radius)<=.8&&angle>=low&&angle<=high)points.push({x:px,y:py});
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

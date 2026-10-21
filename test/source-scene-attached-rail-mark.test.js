'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {attachedSceneRailMarks:propose}=require('../packages/slideclone-core/source-scene-attached-rail-mark');
function component(points){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {points,box:{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)+1-Math.min(...xs),h:Math.max(...ys)+1-Math.min(...ys)}};}
function cells(x,y,w,h){return Array.from({length:w*h},(_,i)=>({x:x+i%w,y:y+Math.floor(i/w)}));}
function fixture(){
 const marks=[component(cells(10,20,8,2)),component(cells(40,20,8,2))];
 const branch=component([...cells(22,20,10,2),...cells(25,14,2,6)]);
 return {components:[...marks,branch],marks,hint:{x:0,y:20,w:80,h:40},side:0,textMasks:[],work:{checks:0,exhausted:false}};
}
test('an outward attached component proposes only its observed rail cells and preserves its complete input',()=>{
 const f=fixture(),before=structuredClone(f.components),parts=propose(f);assert.equal(parts.length,1);
 assert.deepEqual(parts[0].box,{x:22,y:20,w:10,h:2});assert.equal(parts[0].points.length,20);
 assert.ok(parts[0].points.every(p=>p.y===20||p.y===21));assert.deepEqual(f.components,before);
 assert.notEqual(parts[0].points[0],f.components[2].points[0]);assert.ok(f.work.checks>0);
});
test('all four rail directions retain only the corresponding observed outward junction',()=>{
 for(const side of [1,2,3]){
  const f=fixture();
  for(const c of f.components){
   const transformed=c.points.map(p=>side===1?{x:p.x,y:41-p.y}:side===2?{x:p.y,y:p.x}:{x:41-p.y,y:p.x});
   Object.assign(c,component(transformed));
  }
  if(side>=2)f.hint={x:20,y:0,w:40,h:80};f.side=side;
  const parts=propose(f);assert.equal(parts.length,1);assert.equal(parts[0].points.length,20);
 }
});
test('inward, two-sided, unknown text-owned and disconnected decoration cannot become a rail mark',()=>{
 for(const kind of ['inward','both','text','corner','empty']){
  const f=fixture();
  if(kind==='inward')f.components[2]=component([...cells(22,20,10,2),...cells(25,22,2,6)]);
  if(kind==='both')f.components[2]=component([...f.components[2].points,...cells(25,22,2,6)]);
  if(kind==='text')f.textMasks=[{x:25,y:14,w:2,h:2}];
  if(kind==='corner')f.components[2]=component([...cells(0,20,6,2),...cells(0,14,2,6)]);
  if(kind==='empty')f.components=f.marks.slice();
  assert.deepEqual(propose(f),[],kind);
 }
});
test('geometry exhaustion rejects the complete proposal population rather than granting a partial result',()=>{
 const f=fixture(),initial=propose(f);assert.equal(initial.length,1);
 const charged=f.work.checks,g=fixture();g.components.push(component([...cells(33,20,4,2),...cells(33,14,2,6)]));
 g.work.checks=4000000-charged;assert.deepEqual(propose(g),[]);assert.equal(g.work.exhausted,true);
 const exhausted=fixture();exhausted.work.exhausted=true;assert.deepEqual(propose(exhausted),[]);
});
test('normal empty branches, illegal controls, hostile source points and extreme populations fail safely',()=>{
 let calls=0;const getter={get components(){calls++;throw Error('private-token');}};
 const f=fixture(),hostilePoint={get x(){calls++;throw Error('private-token');},y:20};
 for(const value of [null,{},getter,new Proxy(f,{}),{...f,side:4},{...f,side:NaN},{...f,work:{checks:-1,exhausted:false}},
  {...f,components:new Array(1)},{...f,components:Array(262145).fill(f.components[0])},
  {...f,marks:structuredClone(f.marks)},{...f,components:[...f.marks,{box:{x:20,y:20,w:2,h:2},points:[hostilePoint]}]},
  {...f,components:[...f.marks,{box:{x:20,y:20,w:2,h:2},points:[{x:100,y:20}]}]}])
  assert.throws(()=>propose(value),e=>(e instanceof TypeError||e instanceof RangeError)&&!e.message.includes('private-token'));
 assert.equal(calls,0);
});

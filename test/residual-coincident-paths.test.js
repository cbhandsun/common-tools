'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {residualEraseObjects}=require('../packages/slideclone-core/team-native-rebuild');
const {eraseObjectMask}=require('../packages/slideclone-core/archetypes/full-slide-native-residual');
const {eraseMasks}=require('../packages/slideclone-core/scene-plan/residual-primitive-erasure');
const {auditResidualPixelOwnership}=require('../packages/slideclone-core/scene-plan/residual-pixel-ownership');

function loop(points){return [{type:'moveTo',points:[points[0]]},...points.slice(1).map(point=>({type:'lnTo',points:[point]})),{type:'close',points:[]}];}
function fixture(offset=0){
 const box={x:5+offset,y:5,w:20,h:20};
 const perimeter=loop([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);
 const hole=loop([{x:.1,y:.1},{x:.1,y:.9},{x:.9,y:.9},{x:.9,y:.1}]);
 const body={id:'body',type:'freeform',box,style:{fill:'#EEF8FD',stroke:'none',freeformSegments:perimeter},
  source:{editable:true,residualBackgroundFill:true,preserveResidualInterior:true}};
 const border={id:'border',type:'freeform',box:{...box},style:{fill:'#204060',stroke:'none',freeformSegments:[...perimeter,...hole]},source:{editable:true}};
 const detail={id:'detail',type:'freeform',box:{...box},style:{fill:'#6080A0',stroke:'none',freeformSegments:loop([
  {x:0,y:0},{x:1,y:0},{x:1,y:.05},{x:0,y:.05}])},source:{editable:true}};
 const source={width:60,height:30,rgba:Buffer.alloc(60*30*4,255)};
 for(let y=5;y<25;y++)for(let x=box.x;x<box.x+20;x++){
  const inner=x>=box.x+2&&x<box.x+18&&y>=7&&y<23;
  source.rgba.set(y===5?[96,128,160,255]:inner?[238,248,253,255]:[32,64,96,255],(y*60+x)*4);
 }
 // An unrepresented foreground dot must survive inside the hollow border.
 source.rgba.set([200,30,80,255],(15*60+box.x+10)*4);
 return {source,body,border,detail};
}

test('coincident native paths retain independent background, hollow border and detail erasures',()=>{
 for(const offset of [0,28])for(const order of ['body-first','border-first']){
  const f=fixture(offset),shapes=order==='body-first'?[f.body,f.border,f.detail]:[f.border,f.detail,f.body];
  const before=structuredClone(shapes),pixels=Buffer.from(f.source.rgba);
  const objects=residualEraseObjects({shapes,textBoxes:[]});
  assert.deepEqual(objects.map(p=>p.id),shapes.map(p=>p.id));
  const masks=objects.flatMap(p=>eraseObjectMask(p,f.source,{w:60,h:30}));
  const result=eraseMasks(f.source,masks,{transparent:true});
  for(let y=0;y<30;y++)for(let x=0;x<60;x++){
   const i=(y*60+x)*4,dot=x===f.body.box.x+10&&y===15;
   if(x>=f.body.box.x&&x<f.body.box.x+20&&y>=5&&y<25&&!dot)assert.equal(result.rgba[i+3],0,`${order} ${x},${y}`);
   else assert.deepEqual(result.rgba.subarray(i,i+4),f.source.rgba.subarray(i,i+4));
  }
  assert.equal(auditResidualPixelOwnership({source:f.source,residual:result,masks}).passed,true);
  assert.deepEqual(shapes,before);assert.deepEqual(f.source.rgba,pixels);
 }
});

test('only repeated references coalesce native freeforms, including identical geometry and different source fills',()=>{
 const {body,border}=fixture(),copy=structuredClone(border);
 const otherFill={...body,id:'other-fill',style:{...body.style,fill:'#FFFFFF'}};
 const objects=residualEraseObjects({shapes:[body,body,border,border,copy,otherFill]});
 assert.deepEqual(objects,[body,border,copy,otherFill]);
});

test('geometry equality never hides a malformed second path from the downstream geometry validator',()=>{
 const {source,body,border}=fixture();border.style.freeformSegments=[];
 const objects=residualEraseObjects({shapes:[body,border]});
 assert.throws(()=>objects.flatMap(p=>eraseObjectMask(p,source,{w:60,h:30})),/loop is open/);
});

test('noneditable and protected shapes remain excluded; text and crop deduplication stay compatible',()=>{
 const {body,border}=fixture();
 const objects=residualEraseObjects({shapes:[body,{...border,source:{editable:false}},
  {...border,id:'protected',source:{editable:true,preserveResidualInterior:true}}],
  textBoxes:[{id:'a',box:body.box},{id:'b',box:body.box}],images:[{id:'crop-a',box:body.box},{id:'crop-b',box:body.box}]},
  {includeLocalFidelityImages:true});
 assert.deepEqual(objects.map(p=>p.id),['a','body','crop-a']);
 assert.deepEqual(residualEraseObjects({shapes:[],textBoxes:[]}),[]);
 assert.throws(()=>residualEraseObjects({shapes:[{...body,box:{...body.box,w:NaN}}]}),/invalid/);
});

test('coincident-path regression is included in the unified unit CI',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(p=>p.file.endsWith('residual-coincident-paths.test.js')));
});

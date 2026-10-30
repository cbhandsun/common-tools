'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {nativeOpaqueRectangleMasks:mask}=require('../packages/slideclone-core/scene-plan/native-opaque-rectangle-mask');
const {eraseObjectMask}=require('../packages/slideclone-core/archetypes/full-slide-native-residual');
const {eraseMasks}=require('../packages/slideclone-core/scene-plan/residual-primitive-erasure');
const image={width:100,height:60},size={w:100,h:60};
const rectangle={type:'rect',box:{x:20,y:20,w:60,h:20},style:{fill:'#203060',stroke:'none'}};
test('opaque background replacement never erases source padding outside its own actual footprint',()=>{
 const source={...image,rgba:Buffer.alloc(100*60*4)};
 for(let n=0;n<6000;n++)source.rgba.set([30,50,90,255],n*4);
 for(const type of ['rect','roundRect']){
  const masks=eraseObjectMask({...rectangle,type},source,{x:0,y:0,...size});
  const residual=eraseMasks(source,masks,{transparent:true});
  for(let y=0;y<60;y++)for(let x=0;x<100;x++)if(x<20||x>=80||y<20||y>=40)
   assert.deepEqual(residual.rgba.subarray((y*100+x)*4,(y*100+x)*4+4),source.rgba.subarray((y*100+x)*4,(y*100+x)*4+4));
  assert.equal(residual.rgba[(30*100+50)*4+3],0);
 }
});
test('round replacements keep unproven corner pixels and fractional edges conservatively',()=>{
 const masks=mask({...rectangle,type:'roundRect'},image,size);assert.ok(masks);
 assert.ok(masks.every(m=>m.x>=20&&m.y>=20&&m.x+m.w<=80&&m.y+m.h<=40));
 assert.ok(masks.every(m=>!(20>=m.x&&20<m.x+m.w&&20>=m.y&&20<m.y+m.h)));
 assert.deepEqual(mask({...rectangle,box:{x:20.2,y:20.2,w:59.6,h:19.6}},image,size),[{x:21,y:21,w:58,h:18}]);
});
test('unknown and nonopaque paint cannot acquire the opaque-footprint path or run accessors',()=>{
 for(const item of [null,{}, {...rectangle,type:'ellipse'},...[
  {fill:'none'},{fill:'red'},{opacity:.5},{fillOpacity:.5},{fillTransparency:50},{gradient:{}},{stroke:'#ffffff',strokeWidthPt:1}
 ].map(style=>({...rectangle,style:{...rectangle.style,...style}}))])assert.equal(mask(item,image,size),null);
 let calls=0;const hostile={get type(){calls++;throw Error('PRIVATE');}};
 assert.equal(mask(hostile,image,size),null);assert.equal(mask(new Proxy(rectangle,{}),image,size),null);assert.equal(calls,0);
 const coercion={toString(){calls++;throw Error('PRIVATE');}};
 assert.equal(mask({...rectangle,type:coercion},image,size),null);assert.equal(calls,0);
 assert.deepEqual(mask({...rectangle,type:'roundRect',box:{x:20,y:20,w:10,h:10}},image,size),[]);
 for(const bad of [{width:0,height:60},{width:16385,height:60},new Proxy(image,{})])
  assert.throws(()=>mask(rectangle,bad,size),TypeError);
 for(const bad of [{w:0,h:60},{w:Infinity,h:60},new Proxy(size,{})])
  assert.throws(()=>mask(rectangle,image,bad),TypeError);
 assert.throws(()=>mask({...rectangle,box:{x:-1,y:20,w:60,h:20}},image,size),TypeError);
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));assert.ok(includesSuite(__filename,'all'));
});

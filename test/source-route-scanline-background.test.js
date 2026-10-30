'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteScanlineBackground:measure}=require('../packages/slideclone-core/routing/source-route-scanline-background');
function fixture(transpose=false){
 const width=transpose?120:80,height=transpose?80:120,image={width,height,rgba:Buffer.alloc(width*height*4,255)};
 const put=(across,along,rgb,alpha=255)=>{const x=transpose?along:across,y=transpose?across:along;image.rgba.set([...rgb,alpha],(y*width+x)*4);};
 for(let y=20;y<45;y++)for(let x=0;x<80;x++)put(x,y,[255,205+y-20,185+y-20]);
 for(let y=10;y<110;y++)for(let x=39;x<=41;x++)put(x,y,[20,60,120]);
 return {image,background:[255,255,255],work:{checks:0},put,index:transpose?40*width+25:25*width+40};
}
test('independent complete rows and columns retain narrow ink and source buffers',()=>{
 for(const transpose of [false,true]){
  const f=fixture(transpose),before=Buffer.from(f.image.rgba),at=measure(f);
  assert.deepEqual(at(f.index),[255,210,190]);
  assert.deepEqual(f.image.rgba,before);assert.ok(f.work.checks>0&&f.work.checks<=4000000);
  const spent=f.work.checks;assert.deepEqual(at(f.index),[255,210,190]);
  assert.ok(f.work.checks>spent);assert.ok(f.work.checks-spent<100,'cached evidence still charges lookup work');
 }
});
test('full scans reject unsupported fields, missing flank pairs and transparency without inventing background',()=>{
 for(const change of [
  f=>{for(let x=10;x<30;x++)f.put(x,25,[20,60,120]);},
  f=>f.put(0,25,[20,60,120]),
  f=>f.put(1,25,[255,210,190],0),
  f=>f.put(79,25,[20,60,120]),
  f=>f.put(78,25,[255,210,190],0)
 ]){const f=fixture();change(f);assert.deepEqual(measure(f)(f.index),f.background);}
 const small={image:{width:7,height:7,rgba:Buffer.alloc(7*7*4,255)},background:[255,255,255],work:{checks:0}};
 assert.deepEqual(measure(small)(24),small.background);
});
test('conflicting complete row and column certificates fall back without averaging',()=>{
 const f=fixture();
 // The whole row is peach. Most of this column is global white; each can
 // independently pass 90% support, while their predictions disagree.
 for(let y=20;y<45;y++)if(y!==25)for(let x=0;x<80;x++)f.put(x,y,[255,255,255]);
 for(let y=0;y<120;y++)if(y!==25)f.put(40,y,[255,255,255]);
 assert.deepEqual(measure(f)(f.index),f.background);
});
test('linear scanline color is measured across both flanks, including arbitrary buffer offsets',()=>{
 const f=fixture();
 for(let x=0;x<80;x++)f.put(x,25,[240,190+x/2,170+x/2]);
 for(let x=39;x<=41;x++)f.put(x,25,[20,60,120]);
 const storage=Buffer.alloc(f.image.rgba.length+19,0);f.image.rgba.copy(storage,7);f.image.rgba=storage.subarray(7,7+f.image.rgba.length);
 const at=measure(f),color=at(f.index);assert.ok(color.every((v,c)=>Math.abs(v-[240,210,190][c])<=1));
});
test('scanline support remains exactly 90 percent and flank tolerance remains 18 channels',()=>{
 for(const [changed,delta,accepted]of [[10,18,true],[11,18,false],[10,19,false]]){
  const width=100,height=100,image={width,height,rgba:Buffer.alloc(width*height*4,255)},background=[255,255,255];
  // The broad source header keeps the column from independently certifying
  // white through the narrow band. Neither observer knows any route mask.
  for(let y=0;y<30;y++)for(let x=0;x<width;x++)image.rgba.set([240,200,180,255],(y*width+x)*4);
  for(let x=0;x<width;x++)image.rgba.set([240,200,180,255],(50*width+x)*4);
  // Paired flank samples differ by delta; their average is the field.
  image.rgba.set([240,200+delta,180,255],(50*width+1)*4);
  for(let x=40;x<40+changed;x++)image.rgba.set([20,60,120,255],(50*width+x)*4);
  const value=measure({image,background,work:{checks:0}})(50*width+45);
  assert.equal(value[1]<230,accepted,JSON.stringify({changed,delta,value}));
 }
});
test('exhausted, invalid and executable inputs fail safely and retain the shared work limit',()=>{
 const f=fixture(),at=measure(f);f.work.checks=3999999;assert.deepEqual(at(f.index),f.background);
 assert.ok(f.work.checks>4000000);const spent=f.work.checks;assert.deepEqual(at(f.index),f.background);assert.equal(f.work.checks,spent);
 for(const n of [-1,NaN,Infinity,1.5,9600]){const q=fixture();assert.deepEqual(measure(q)(n),q.background);}
 for(const input of [null,{}, {...fixture(),background:[0,NaN,0]}, {...fixture(),work:{checks:-1}},
  {...fixture(),work:Object.freeze({checks:0})}, {...fixture(),image:{width:513,height:513,rgba:Buffer.alloc(513*513*4)}},
  {...fixture(),image:{width:80,height:120,rgba:Buffer.alloc(1)}}])assert.throws(()=>measure(input));
 let calls=0;const trap=()=>{calls++;throw Error('private');};
 for(const input of [new Proxy({}, {get:trap}),Object.defineProperty({},'image',{get:trap}),
  {...fixture(),background:new Proxy([255,255,255],{get:trap})},
  {...fixture(),image:{width:80,height:120,rgba:new Proxy(new Uint8Array(80*120*4),{get:trap})}}])assert.throws(()=>measure(input),TypeError);
 assert.equal(calls,0);
 const {discoverTestFiles}=require('../scripts/test-sharded'),{IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(r=>r.file.replaceAll('\\','/')==='test/source-route-scanline-background.test.js'));
 assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/routing/source-route-scanline-background.js'));
});

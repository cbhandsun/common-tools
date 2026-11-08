'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteCoverageWidth:measure}=require('../packages/slideclone-core/routing/source-route-coverage-width');
function fixture(weights){
 const width=220,height=90,rgba=new Uint8Array(width*height*4).fill(255);
 const path=Array.from({length:160},(_,i)=>({x:30+i,y:45}));
 for(const p of path)for(const [i,alpha]of weights.entries()){
  const y=p.y+i-Math.floor(weights.length/2),at=(y*width+p.x)*4;
  rgba.set([20,60,110].map(v=>Math.round(255+alpha*(v-255))),at);
 }
 return {path,rgba,width,height,background:[255,255,255],work:{checks:0},cache:new Map()};
}
test('coverage width measures original antialiased source ink without widening the five-pixel native stroke gate',()=>{
 const f=fixture([.15,.65,1,1,1,.65,.15]),before=f.rgba.slice(),result=measure(f);
 assert.ok(result>4.5&&result<4.7);assert.deepEqual(f.rgba,before);assert.ok(f.work.checks<4000000);
 const prior=f.work.checks;assert.equal(measure(f),result);assert.ok(f.work.checks-prior<prior/10);
 // Fully opaque wide paint, background-only samples, nonopaque cells and
 // clipped source sections retain explicit failure instead of a thin fit.
 assert.equal(measure(fixture([1,1,1,1,1,1])),null);
 assert.equal(measure(fixture([0,0,0])),null);
 const transparent=fixture([1,1,1]);transparent.rgba[(45*transparent.width+100)*4+3]=0;assert.equal(measure(transparent),null);
 const clipped=fixture([1,1,1]);clipped.path=clipped.path.map(p=>({...p,y:0}));assert.equal(measure(clipped),null);
 const exhausted=fixture([1,1,1]);exhausted.work.checks=4000000;assert.equal(measure(exhausted),null);assert.ok(exhausted.work.checks>4000000);
 const runtime=require('../scripts/verify-runtime-package'),{includesSuite}=require('../scripts/test-suites');
 assert.ok(runtime.IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/routing/source-route-coverage-width.js'));
 for(const suite of ['unit','all'])assert.equal(includesSuite(__filename,suite),true);
});

test('an explicitly bounded source window can certify both real flanks without fabricating twelve pixels of padding',()=>{
 const full=fixture([.15,.65,1,1,1,.65,.15]),expected=measure(full);
 // Original source rows 38..51 include the complete ink and at least two
 // real background cells on both sides, but less than twelve blank pixels.
 const top=38,height=14,rgba=full.rgba.slice(top*full.width*4,(top+height)*full.width*4);
 const bounded={...full,rgba,height,path:full.path.map(p=>({...p,y:p.y-top})),work:{checks:0},cache:new Map()};
 assert.equal(measure(bounded),expected);
 const clipped={...bounded,height:10,rgba:rgba.slice(0,full.width*10*4),work:{checks:0},cache:new Map()};
 assert.equal(measure(clipped),null,'missing the actual second flank still fails');
});

test('complete shaft calibration rejects local opaque excess outside the median window, including cached sections',()=>{
 const f=fixture([1,1,1]);
 for(let x=35;x<=50;x++)for(let y=42;y<=48;y++)f.rgba.set([20,60,110,255],(y*f.width+x)*4);
 assert.equal(measure(f),3,'the central estimator alone does not observe the wider terminal shaft');
 assert.equal(measure({...f,complete:true}),null);
 const antialiased=fixture([.15,.65,1,1,1,.65,.15]);
 assert.ok(Math.abs(measure({...antialiased,complete:true})-4.6)<.02);
 const cached=fixture([1,1,1]);cached.cache.set('32:45:34:45',6);
 assert.equal(measure({...cached,complete:true}),null);
 const capped=fixture([1,1,1]);capped.work.checks=4000000;
 assert.equal(measure({...capped,complete:true}),null);
});

test('width uses the same independently measured smooth background as source ink extraction',()=>{
 const {sourceRouteLocalBackground}=require('../packages/slideclone-core/routing/source-route-local-background');
 const f=fixture([0]),body=new Uint8Array(f.width*f.height);
 const backgroundAtRow=y=>y<10?[255,255,255]:[255,Math.min(255,200+(y-10)*.7),Math.min(255,170+(y-10)*1.1)].map(Math.round);
 for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){
  if(y<10)body[y*f.width+x]=1;
  f.rgba.set([...backgroundAtRow(y),255],(y*f.width+x)*4);
 }
 f.path=f.path.map(p=>({...p,y:25}));
 for(const p of f.path)for(const [i,alpha]of [.15,.65,1,1,1,.65,.15].entries()){
  const y=p.y+i-3,backdrop=backgroundAtRow(y);
  f.rgba.set([20,60,110].map((v,c)=>Math.round(backdrop[c]+alpha*(v-backdrop[c]))),(y*f.width+p.x)*4);
 }
 const before=f.rgba.slice(),backgroundAt=sourceRouteLocalBackground({image:{width:f.width,height:f.height,rgba:Buffer.from(f.rgba)},body,background:f.background,work:f.work});
 assert.notDeepEqual(backgroundAt(25*f.width+100),f.background);
 assert.equal(measure({...f,cache:new Map()}),null,'the unrelated global color cannot certify this shadow');
 const result=measure({...f,backgroundAt,cache:new Map()});assert.ok(result>4.4&&result<4.8,result);
 assert.deepEqual(f.rgba,before);
 const wide=fixture([1,1,1,1,1,1]);assert.equal(measure({...wide,backgroundAt:()=>wide.background}),null);
 const opaque=fixture([1,1,1]);opaque.rgba[(46*opaque.width+100)*4+3]=0;
 assert.equal(measure({...opaque,backgroundAt:()=>opaque.background}),null);
});

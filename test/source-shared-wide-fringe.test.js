'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {observeRouteAntialiasBackground:observe}=require('../packages/slideclone-core/routing/source-route-antialias-background');
const {observeWideFields}=require('../packages/slideclone-core/routing/source-route-wide-fringe');
function fixture(){
 const width=100,height=100,image={width,height,rgba:Buffer.alloc(width*height*4)},component=new Uint8Array(width*height),blocked=new Uint8Array(width*height);
 for(let n=0;n<width*height;n++)image.rgba.set([235,248,241,255],n*4);
 for(let y=16;y<84;y++){
  for(let x=48;x<=50;x++){const n=y*width+x;component[n]=1;image.rgba.set([30,60,90,255],n*4);}
  for(const [distance,contrast]of [[1,30],[2,24],[3,18],[4,12],[5,8],[6,4]])for(const x of [48-distance,50+distance])
   image.rgba.set([235-contrast,248-contrast,241-contrast,255],(y*width+x)*4);
 }
 return {image,component,blocked,window:{x:0,y:0,w:width,h:height},work:{checks:0}};
}
test('a repeatedly witnessed six-pixel source fringe restores outside the old three-pixel band',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),rows=observe(f);assert.ok(rows);
 for(const x of [42,43,44,45,46,47,51,52,53,54,55,56]){
  const row=rows.find(item=>item.cell===50*100+x);assert.ok(row,'missing fringe x='+x);assert.deepEqual(row.color,[235,248,241]);
 }
 assert.deepEqual(f.image.rgba,before);assert.ok(f.work.checks<=4000000);
});
test('wide source fringe keeps the original contrast, exterior, repetition and occlusion checks',()=>{
 for(const mode of ['contrast','text','transparent','outer-ink','pale-boundary','isolated','increasing']){
  const f=fixture(),target=50*100+44;
  if(mode==='contrast')f.image.rgba.set([193,206,199,255],(50*100+47)*4);
  if(mode==='text')f.blocked[50*100+43]=1;
  if(mode==='transparent')f.image.rgba[(50*100+42)*4+3]=0;
  if(mode==='outer-ink')f.image.rgba.set([10,20,30,255],(50*100+40)*4);
  if(mode==='pale-boundary')f.image.rgba.set([229,242,235,255],(50*100+41)*4);
  if(mode==='isolated')for(let y=46;y<=54;y++)if(y!==50)f.image.rgba.set([235,248,241,255],(y*100+44)*4);
  if(mode==='increasing')f.image.rgba.set([200,213,206,255],target*4);
  const rows=observe(f);assert.ok(rows,mode);assert.equal(rows.some(row=>row.cell===target),false,mode);
 }
});
function controls(f){
 const candidates=new Set();
 for(let n=0;n<f.component.length;n++)if(f.component[n]){
  const x=n%100,y=Math.floor(n/100);
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]])for(let distance=1;distance<=3;distance++){
   const px=x+dx*distance,py=y+dy*distance;if(px<0||py<0||px>=100||py>=100)break;
   const cell=py*100+px;if(f.component[cell]||f.blocked[cell])break;candidates.add(cell);
  }
 }
 return {...f,covered:new Map(),candidates};
}
test('an impossible nine-section wide field stops at its first refusal inside the original shared budget',()=>{
 const f=fixture();f.image.rgba.set([10,20,30,255],(46*100+40)*4);
 const before=Buffer.from(f.image.rgba),expected=observeWideFields(controls(f));assert.equal(expected.length,612);
 assert.equal(expected.some(row=>row.cell===46*100+44),false);
 f.work.checks=4000000-27000;
 assert.deepEqual(observeWideFields(controls(f)),expected);assert.ok(f.work.checks<=4000000);
 assert.deepEqual(f.image.rgba,before);
});
test('wide fields handle gradients, transposition and nonzero source window offsets',()=>{
 for(const mode of ['gradient','transpose','offset']){
  const f=fixture();let target=50*100+44,expected=[235,248,241];
  if(mode==='gradient'){
   for(let y=0;y<100;y++)for(let x=0;x<100;x++)if(!f.component[y*100+x]){
    const offset=(y*100+x)*4;
    for(let c=0;c<3;c++)f.image.rgba[offset+c]-=Math.floor(x/10);
   }
   expected=[231,244,237];
  }
  if(mode==='transpose'){
   const original=Buffer.from(f.image.rgba),component=f.component.slice();
   for(let y=0;y<100;y++)for(let x=0;x<100;x++){
    original.copy(f.image.rgba,(x*100+y)*4,(y*100+x)*4,(y*100+x)*4+4);
    f.component[x*100+y]=component[y*100+x];
   }
   target=44*100+50;
  }
  if(mode==='offset'){
   const rgba=Buffer.alloc(120*120*4,255);
   for(let y=0;y<100;y++)f.image.rgba.copy(rgba,((y+10)*120+10)*4,y*100*4,(y+1)*100*4);
   f.image={width:120,height:120,rgba};f.window={x:10,y:10,w:100,h:100};target=60*120+54;
  }
  const output=observeWideFields(controls(f)),row=output.find(item=>item.cell===target);assert.ok(row,mode);
  assert.ok(row.color.every((value,c)=>Math.abs(value-expected[c])<=1),mode);
 }
});
test('wide fields preserve existing observations, reject conflicting coverage, and fail closed on budgets',()=>{
 const f=controls(fixture()),target=50*100+44;
 f.covered.set(target,[235,248,241]);assert.equal(observeWideFields(f).some(row=>row.cell===target),false);
 f.work.checks=0;f.covered.set(50*100+43,[0,0,0]);assert.equal(observeWideFields(f).some(row=>row.cell===target),false);
 for(const checks of [-1,Infinity,NaN,4000001,4000000]){
  f.work={checks};assert.equal(observeWideFields(f),null);
 }
 f.work={checks:0};f.candidates.clear();assert.deepEqual(observeWideFields(f),[]);
 const empty=controls(fixture());empty.component.fill(0);assert.deepEqual(observeWideFields(empty),[]);
 const invalid=controls(fixture());invalid.candidates=new Set([-1,10000,Infinity,NaN]);assert.deepEqual(observeWideFields(invalid),[]);
});
test('wide fringe regression is discovered by unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-shared-wide-fringe.test.js'));
});

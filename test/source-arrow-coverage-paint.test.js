'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceArrowCoveragePaint:measure}=require('../packages/slideclone-core/routing/source-arrow-coverage-paint');
function fixture(){
 const body=Array.from({length:8},()=>[[20,50,80],[30,60,90]]);
 const terminal=Array.from({length:6},()=>[[3,33,63],[120,140,160]]);
 return {columns:[...terminal,...body,...terminal],background:[250,250,250],firstBody:6,lastBody:13,work:{checks:0}};
}

test('explicit achromatic stroke mode proves source contrast and coverage without changing colored-arrow defaults',()=>{
 const columns=[...Array.from({length:3},()=>[[150,150,150]]),...Array.from({length:8},()=>[[30,30,30]]),...Array.from({length:3},()=>[[180,180,180]])];
 const request={columns,background:[250,250,250],firstBody:3,lastBody:10,work:{checks:0}};
 assert.equal(measure(request),null);
 assert.deepEqual(measure({...request,work:{checks:0},colorMode:'contrast'}),[30,30,30]);
 assert.equal(measure({...request,columns:columns.map(c=>c.map(()=>[240,240,240])),work:{checks:0},colorMode:'contrast'}),null);
 const foreign=structuredClone(columns);foreign[0]=[[240,20,140]];foreign[1]=[[240,20,140]];
 assert.equal(measure({...request,columns:foreign,work:{checks:0},colorMode:'contrast'}),null);
 assert.throws(()=>measure({...request,colorMode:'unchecked'}),TypeError);
});
test('observed body candidates recover coverage rejected by the median without changing either tolerance',()=>{
 const f=fixture(),before=structuredClone(f.columns),result=measure(f);
 assert.deepEqual(result,[20,50,80]);assert.deepEqual(f.columns,before);
 assert.ok(f.work.checks>0&&f.work.checks<=4000000);
 result[0]=255;assert.deepEqual(f.columns,before,'returned paint cannot mutate source evidence');
 const ordinary=fixture();ordinary.columns=ordinary.columns.map(c=>c.map(()=>[30,60,90]));
 assert.deepEqual(measure(ordinary),[30,60,90],'already accepted median remains unchanged');
});
test('empty, competing and neutral paint retain original rejection gates',()=>{
 assert.equal(measure({columns:[],background:[250,250,250],firstBody:0,lastBody:0,work:{checks:0}}),null);
 const empty=fixture();empty.columns[6]=[];empty.columns[7]=[];empty.firstBody=6;empty.lastBody=7;assert.equal(measure(empty),null);
 const wrong=fixture();for(let i=0;i<6;i++)wrong.columns[i]=[[180,20,40]];assert.equal(measure(wrong),null);
 const ambiguous=fixture();ambiguous.columns=ambiguous.columns.map(c=>c.map(()=>[30,30,30]));assert.equal(measure(ambiguous),null);
 const missing=fixture();for(let i=0;i<6;i++)missing.columns[i]=[];assert.equal(measure(missing),null);
});
test('all trials share the work ledger and exhaustion cannot return partial support',()=>{
 const f=fixture();f.work.checks=3999999;assert.equal(measure(f),null);assert.equal(f.work.checks,3999999);
 const partial=fixture(),trialCost=(16+partial.columns.reduce((sum,c)=>sum+c.length,0))*32;
 partial.work.checks=4000000-trialCost;assert.equal(measure(partial),null);assert.equal(partial.work.checks,4000000);
 for(const checks of [NaN,Infinity,-1,4000001])assert.throws(()=>measure({...fixture(),work:{checks}}),TypeError);
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));assert.ok(includesSuite(__filename,'all'));
});
test('actual JPEG arrow preserves complete geometry and both independent directional terminals',()=>{
 const path=require('node:path'),{readPng}=require('../packages/slideclone-core/png');
 const {sourceVisibleGapProfile:profile}=require('../packages/slideclone-core/routing/source-visible-gap-profile');
 const source=readPng(path.join(__dirname,'fixtures/source-short-arrow-jpeg.png'));
 for(const vertical of [false,true]){
  const width=vertical?source.height:source.width,height=vertical?source.width:source.height,rgba=Buffer.alloc(width*height*4);
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
   const a=(y*source.width+x)*4,b=(vertical?x*width+y:y*width+x)*4;source.rgba.copy(rgba,b,a,a+4);
  }
  const background=[249,240,242],seed=vertical?19*width+11:11*width+19,cells=[seed],seen=new Set(cells);
  for(let at=0;at<cells.length;at++){
   const n=cells[at],x=n%width,y=Math.floor(n/width);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const xx=x+dx,yy=y+dy,j=yy*width+xx;
    if(xx<0||yy<0||xx>=width||yy>=height||seen.has(j))continue;
    if(background.some((v,k)=>Math.abs(v-rgba[j*4+k])>=42)){seen.add(j);cells.push(j);}
   }
  }
  const request={cells,width,horizontal:!vertical,rgba,direction:'both',increasing:true,background,work:{checks:0}};
  const result=profile(request);assert.ok(result);assert.equal(result.support,1);assert.equal(result.widthPx,4);
  assert.equal(result.hi-result.lo,29);assert.equal(profile({...request,direction:'forward',work:{checks:0}}),null);
  const broken={...request,cells:cells.filter(n=>(vertical?Math.floor(n/width):n%width)!==19),work:{checks:0}};
  assert.equal(profile(broken),null);
 }
});
test('local backdrop proposals cannot expand the original color agreement',()=>{
 const f=fixture();assert.equal(measure({...f,backdrops:f.columns.map(()=>[250,200,250])}),null);
 assert.equal(measure({...f,backdrops:[]}),null);
 assert.equal(measure({...f,backdrops:f.columns.map(()=>[250,NaN,250])}),null);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {thinSourceRoute}=require('../packages/slideclone-core/source-route-centerline');
// Independent dense reference: original parallel two-phase deletion rule.
function dense(input,width,height,work,terminals){
 const mask=input.slice(),removed=[];
 for(let round=0;round<12;round++){
  let changed=false;
  for(let phase=0;phase<2;phase++){
   removed.length=0;
   for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    if(++work.checks>4000000)return null;const i=y*width+x;if(!mask[i]||terminals?.[i])continue;
    const p=[mask[i-width],mask[i-width+1],mask[i+1],mask[i+width+1],mask[i+width],mask[i+width-1],mask[i-1],mask[i-width-1]].map(n=>n??0);
    const count=p.reduce((s,n)=>s+n,0),transitions=p.filter((n,j)=>!n&&p[(j+1)%8]).length;
    if(count<2||count>6||transitions!==1)continue;
    const top=p[0],right=p[2],bottom=p[4],left=p[6];
    if(phase===0?(top*right*bottom||right*bottom*left):(top*right*left||top*bottom*left))continue;
    removed.push(i);
   }
   for(const i of removed)mask[i]=0;changed ||=removed.length>0;
  }
  if(!changed)return mask;
 }
 return null;
}

test('sparse foreground traversal matches the dense reference cell for cell without changing topology or terminal retention',()=>{
 let seed=173;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let example=0;example<100;example++){
  const width=3+example%37,height=3+example%29,mask=Uint8Array.from({length:width*height},()=>random()<example/100?1:0);
  const terminals=Uint8Array.from(mask,p=>p&&random()<.1?1:0),before=mask.slice();
  assert.deepEqual(thinSourceRoute(mask,width,height,{checks:0},terminals),dense(mask,width,height,{checks:0},terminals));
  assert.deepEqual(mask,before);
 }
 for(const [width,height]of [[1,1],[2,9],[9,2]]){
  const mask=new Uint8Array(width*height);assert.deepEqual(thinSourceRoute(mask,width,height,{checks:0}),dense(mask,width,height,{checks:0}));
 }
});

test('a sparse route avoids repeated blank-window work while preserving the original work cap',()=>{
 const width=400,height=300,mask=new Uint8Array(width*height);
 for(let y=40;y<260;y++)for(let x=100;x<105;x++)mask[y*width+x]=1;
 const oldWork={checks:0},newWork={checks:0};assert.deepEqual(thinSourceRoute(mask,width,height,newWork),dense(mask,width,height,oldWork));
 assert.ok(newWork.checks<oldWork.checks/2);
 for(const checks of [3999999,4000000]){
  const work={checks};assert.equal(thinSourceRoute(mask,width,height,work),null);assert.equal(work.checks,4000001);
 }
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.equal(includesSuite(__filename,suite),true);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sharedJunctionArmsInked}=require('../packages/slideclone-core/source-shared-junction-arms');
const {sourceSharedRouteCoverage}=require('../packages/slideclone-core/source-shared-route-coverage');
const W=40,H=30,BG=[250,244,238];
const raster=()=>{const rgba=new Uint8Array(W*H*4);for(let n=0;n<W*H;n++)rgba.set([...BG,255],n*4);return {rgba};};
const at=(x,y)=>y*W+x;
/** Horizontal arm 5..34 on row 10, vertical arm 20 rows 10..25; joint at (20,10). */
function tee(){
 const left=[],right=[],down=[];
 for(let x=20;x>=5;x--)left.push(at(x,10));
 for(let x=20;x<=34;x++)right.push(at(x,10));
 for(let y=10;y<=25;y++)down.push(at(20,y));
 return {joint:at(20,10),edges:[{from:at(20,10),to:at(5,10),cells:left},{from:at(20,10),to:at(34,10),cells:right},{from:at(20,10),to:at(20,25),cells:down}]};
}
const paint=(r,cells,color)=>{for(const n of cells)r.rgba.set([...color,255],n*4);};
test('a T joint whose arms carry DIFFERENT paint and a blended core is admitted',()=>{
 const t=tee(),r=raster();
 paint(r,t.edges[0].cells,[190,93,44]);paint(r,t.edges[1].cells,[195,101,45]);paint(r,t.edges[2].cells,[209,84,54]);
 r.rgba.set([236,200,180,255],t.joint*4); // anti-aliased joint core
 assert.equal(sharedJunctionArmsInked({edges:t.edges,joint:t.joint,raster:r,backgroundAt:()=>BG,work:{checks:0}}),true);
 // green-to-blue colour coded branches, as in merge diagrams
 const g=raster();paint(g,t.edges[0].cells,[40,170,90]);paint(g,t.edges[1].cells,[30,130,210]);paint(g,t.edges[2].cells,[30,130,210]);
 assert.equal(sharedJunctionArmsInked({edges:t.edges,joint:t.joint,raster:g,backgroundAt:()=>BG,work:{checks:0}}),true);
});
test('an arm without its own ink beyond the joint core is rejected',()=>{
 const t=tee(),r=raster();
 paint(r,t.edges[0].cells,[190,93,44]);paint(r,t.edges[1].cells,[190,93,44]);
 paint(r,t.edges[2].cells.slice(0,3),[190,93,44]); // stub: only the core is inked
 assert.equal(sharedJunctionArmsInked({edges:t.edges,joint:t.joint,raster:r,backgroundAt:()=>BG,work:{checks:0}}),false);
 const short={...t,edges:t.edges.map((e,i)=>i===2?{...e,cells:e.cells.slice(0,5)}:e)};
 assert.equal(sharedJunctionArmsInked({edges:short.edges,joint:t.joint,raster:r,backgroundAt:()=>BG,work:{checks:0}}),false);
});
/** @param {[number,number][]} extra */
function coverageInput(extra=[],joints=true){
 const t=tee(),mask=new Uint8Array(W*H);
 for(const e of t.edges)for(const n of e.cells){const x=n%W,y=Math.floor(n/W);
  for(let d=-1;d<=1;d++){const m=e===t.edges[2]?at(x+d,y):at(x,y+d);mask[m]=1;}}
 for(const [x,y]of extra)mask[at(x,y)]=1;
 return {mask,width:W,height:H,edges:t.edges.map(e=>({...e,widthPx:3})),joints:joints?[t.joint]:[],work:{checks:0}};
}
test('coverage admits joint fillet wedges and a small anti-alias halo',()=>{
 assert.equal(sourceSharedRouteCoverage(coverageInput()),true);
 // fillet wedge in the joint corners, beyond stroke radius but within the joint wedge
 const wedge=[[23,13],[17,13],[23,14],[17,14]];
 assert.equal(sourceSharedRouteCoverage(coverageInput(wedge)),true);
 assert.equal(sourceSharedRouteCoverage(coverageInput(wedge,false)),false,'wedge needs a measured joint');
 assert.equal(sourceSharedRouteCoverage(coverageInput([[10,13]])),true,'single halo cell within width/2+2');
});
test('coverage still rejects unrepresented branches, stubs and excessive halo',()=>{
 const branch=[];for(let y=11;y<=20;y++)branch.push([30,y]);
 assert.equal(sourceSharedRouteCoverage(coverageInput(branch)),false,'unrepresented branch');
 assert.equal(sourceSharedRouteCoverage(coverageInput([[10,15]])),false,'blob 5px off the stroke');
 const halo=[];for(let x=5;x<=34;x++)if(Math.abs(x-20)>6)halo.push([x,13]);
 assert.equal(sourceSharedRouteCoverage(coverageInput(halo)),false,'halo beyond the 2% allowance');
 assert.equal(sourceSharedRouteCoverage({...coverageInput(),mask:new Uint8Array(W*H)}),false,'empty ink');
});
test('regressions are discovered by the unified unit CI entrypoint',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(row=>row.file.replaceAll('\\','/')==='test/source-shared-joint-coverage.test.js'));
});

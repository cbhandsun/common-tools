'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRingInteriorWitness:prove,measureSourceRingInteriorWitness:measure}=require('../packages/slideclone-core/source-ring-interior-witness');
const {measureOutlinedSceneContainer}=require('../packages/slideclone-core/source-scene-outline');
function fixture(){
 const raster={width:32,height:32,rgba:Buffer.alloc(32*32*4,255)},points=[];
 for(let y=3;y<29;y++)for(let x=3;x<29;x++){
  const wall=x<9||x>=23||y<9||y>=23;
  raster.rgba.set(wall?[25,25,25,255]:[230,150,190,255],(y*32+x)*4);
  if(wall)points.push({x,y});
 }
 return {raster,window:{x:0,y:0},box:{x:3,y:3,w:26,h:26},points,colors:[[230,150,190]],textMasks:[]};
}
test('a thick ring needs observed closed colored cells rather than a large inner diameter',()=>{
 const f=fixture(),before=Buffer.from(f.raster.rgba);assert.equal(prove(f),true);assert.deepEqual(f.raster.rgba,before);
 const face=measure(f).face;assert.ok(face);assert.equal(face.color,'#e696be');assert.equal(face.points.length,196);
 assert.ok(face.points.every(p=>p.x>=9&&p.x<23&&p.y>=9&&p.y<23));
 const image={width:80,height:80,rgba:Buffer.alloc(80*80*4,255)};
 for(let y=20;y<52;y++)for(let x=20;x<52;x++){
  const radius=Math.hypot(x-35.5,y-35.5);if(radius<=13)image.rgba.set(radius>=9?[25,25,25,255]:[220+Math.floor((x-30)*2),145,190,255],(y*80+x)*4);
 }
 const budget={used:0},outline=measureOutlinedSceneContainer(image,{x:23,y:23,w:26,h:26},[],budget);
 assert.ok(outline);assert.ok(outline.segments.some(s=>s.type==='close'));assert.ok(budget.used<=262144);
 assert.equal(require('../packages/slideclone-core/source-closed-ring').hasClosedRingTopology(outline.segments),false);
 assert.equal(outline.interiorWitness,true);
 assert.ok(outline.interiorPaint);assert.ok(outline.interiorPaint.box.w<outline.box.w);
});
test('open, solid, empty, differently colored and transparent interiors cannot establish a source face',()=>{
 const open=fixture();open.points=open.points.filter(p=>!(p.x===15&&p.y<9));assert.equal(prove(open),false);
 const solid=fixture();solid.points=[];for(let y=3;y<29;y++)for(let x=3;x<29;x++)solid.points.push({x,y});assert.equal(prove(solid),false);
 assert.equal(prove({...fixture(),points:[]}),false);assert.equal(prove({...fixture(),colors:[[0,0,0]]}),false);
 const transparent=fixture();transparent.raster.rgba.fill(0);assert.equal(prove(transparent),false);
});
test('competing physical holes and OCR-owned enclosed cells stay rejected',()=>{
 const f=fixture();for(let y=9;y<23;y++)f.points.push({x:16,y});assert.equal(prove(f),false);
 assert.equal(prove({...fixture(),textMasks:[{x:12,y:12,w:2,h:2}]}),false);
});
test('small pinholes are preserved and do not replace the independently supported face',()=>{
 const f=fixture();f.points=f.points.filter(p=>!(p.x===5&&p.y===5));assert.equal(prove(f),true);
});
test('a closed multicolor face proves topology but cannot mint a uniform fill',()=>{
 const f=fixture();f.colors.push([30,50,220]);
 for(let y=9;y<23;y++)for(let x=16;x<23;x++)f.raster.rgba.set([30,50,220,255],(y*32+x)*4);
 assert.equal(prove(f),true);assert.equal(measure(f).face,null);
});
test('the compiler emits the proven face together with its outline, without source or label edits',t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ring-face-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:80,height:80,rgba:Buffer.alloc(80*80*4,255)};
 for(let y=20;y<52;y++)for(let x=20;x<52;x++){
  const radius=Math.hypot(x-35.5,y-35.5);if(radius<=13)image.rgba.set(radius>=9?[25,25,25,255]:[220+Math.floor((x-30)*2),145,190,255],(y*80+x)*4);
 }
 const sourceFile=path.join(root,'source.png');require('../packages/slideclone-core/png').writePng(sourceFile,image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const plan={version:1,sourceHash,widthPx:80,heightPx:80,regions:[{id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:80,h:80}}],
  objects:[{id:'object-node',regionId:'region-root',kind:'container',box:{x:23,y:23,w:26,h:26}}],relations:[]};
 const page={shapes:[],images:[],textBoxes:[]};
 const result=require('../packages/slideclone-core/source-scene-compiler').compileSourceScene({root,sourceFile,plan,page,slideSize:{widthPt:80,heightPt:80}});
 // A pre-existing independently measured fill is equally valid. The behavior
 // contract is a colored native face plus outline, not a particular detector.
 const face=result.page.shapes.find(s=>typeof s.style?.fill==='string'&&/^#[a-f\d]{6}$/iu.test(s.style.fill)
  &&Number.parseInt(s.style.fill.slice(1,3),16)>100&&Number.parseInt(s.style.fill.slice(5,7),16)>100);
 assert.ok(face);assert.equal(face.type,'freeform');assert.ok(face.style.freeformSegments.length);
 assert.ok(result.page.shapes.some(s=>s.source?.detector==='source-scene-outline'));
 assert.equal(result.evidence.containers,1);assert.equal(result.evidence.unresolved.length,0);
 assert.deepEqual(page,{shapes:[],images:[],textBoxes:[]});
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),sourceHash);
});
test('source-coordinate translation retains the same proof',()=>{
 const f=fixture();assert.equal(prove({...f,window:{x:100,y:200},box:{x:103,y:203,w:26,h:26},points:f.points.map(p=>({x:p.x+100,y:p.y+200}))}),true);
});
test('large OCR populations stay bounded while distant text does not own the face',()=>{
 assert.equal(prove({...fixture(),textMasks:Array.from({length:10000},()=>({x:0,y:0,w:32,h:32}))}),false);
 assert.equal(prove({...fixture(),textMasks:Array.from({length:10000},()=>({x:100,y:100,w:2,h:2}))}),true);
});
test('invalid, excessive and hostile inputs fail without reading getters or proxy traps',()=>{
 const f=fixture();let calls=0;const getter={};Object.defineProperty(getter,'raster',{get(){calls++;throw Error('private');}});
 const proxy=new Proxy(f,{get(){calls++;throw Error('private');}});
 for(const value of [null,{},getter,proxy,{...f,points:new Array(1)},{...f,colors:new Proxy(f.colors,{})},
  {...f,points:[f.points[0],f.points[0]]},{...f,points:[{x:NaN,y:0}]},
  {...f,box:{...f.box,w:Infinity}},{...f,box:{...f.box,w:40}},{...f,window:{x:16384,y:0}},
  {...f,raster:{...f.raster,rgba:Buffer.alloc(1)}},{...f,colors:[]},{...f,colors:[[256,0,0]]},
  {...f,textMasks:[{x:0,y:0,w:-1,h:1}]},{...f,points:Array(262145).fill({x:3,y:3})}])assert.throws(()=>prove(value),TypeError);
 assert.equal(calls,0);
});

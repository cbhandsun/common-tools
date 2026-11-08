'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {sourceSharedTreeFixture}=require('./helpers/source-shared-tree.cjs');
const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {createFullSlideResidualBuilder}=require('../packages/slideclone-core/archetypes/full-slide-native-residual');
const {eraseMasks}=require('../packages/slideclone-core/scene-plan/residual-primitive-erasure');
const {auditResidualPixelOwnership}=require('../packages/slideclone-core/scene-plan/residual-pixel-ownership');
const {observeRouteAntialiasBackground:observe}=require('../packages/slideclone-core/routing/source-route-antialias-background');
const {writePng}=require('../packages/slideclone-core/png');
const {sourceSharedResidualErasurePlan:plan}=require('../packages/slideclone-core/scene-plan/source-shared-residual-union');
const {sharedSourceAntialiasBackground}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {residualTextPlans}=require('../packages/slideclone-core/typography/residual-text-erasure');
function fixture(){
 const f=sourceSharedTreeFixture();
 for(let y=62;y<100;y++)f.put(148,y,[237,239,242]);
 const {fit,reason}=measureSharedSourceRoute(f);assert.ok(fit,reason);
 const built=compileSharedSourceRoute({fit,image:f.image,relations:f.nodes.slice(1).map((n,i)=>({id:'aa-'+i,regionId:'root',fromId:f.nodes[0].endpointId,toId:n.endpointId,direction:'forward'})),
  id:'aa-native',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230},wholeRelations:true});
 const bodies=f.nodes.map(n=>({id:n.id,type:'rect',box:{...n.box}}));
 return {...f,fit,built,bodies,shapes:[...bodies,...built.parts]};
}
test('complete native relations restore independently witnessed source antialias to background without changing geometry',async t=>{
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'route-aa-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const before=Buffer.from(f.image.rgba),shapes=structuredClone(f.shapes);let output,masks;writePng(path.join(root,'source.png'),f.image);
 const run=createFullSlideResidualBuilder({readPng:()=>f.image,writePng:(file,r)=>{output=r;writePng(file,r);},eraseMasks:(image,rows,options)=>{masks=rows;return eraseMasks(image,rows,options);}});
 const report=await run({sourceFile:path.join(root,'source.png'),outputFile:path.join(root,'out.png'),objects:f.built.parts,sourceShapes:f.shapes,slideSize:{x:0,y:0,w:300,h:230}});
 assert.deepEqual([...output.rgba.subarray((80*300+148)*4,(80*300+148)*4+4)],[255,255,255,255]);
 assert.equal(report.pixelOwnership.passed,true);assert.deepEqual(f.image.rgba,before);assert.deepEqual(f.shapes,shapes);
 // Actual wrong background and a copied receipt both fail independently.
 const tampered={...output,rgba:Buffer.from(output.rgba)};tampered.rgba[(80*300+148)*4]=2;
 assert.equal(auditResidualPixelOwnership({source:f.image,residual:tampered,masks}).passed,false);
 assert.throws(()=>auditResidualPixelOwnership({source:f.image,residual:output,masks:structuredClone(masks)}),/route.*proof|shared.*proof/i);
});
function sectionFixture(){
 const image={width:45,height:45,rgba:Buffer.alloc(45*45*4,255)},component=new Uint8Array(45*45),blocked=new Uint8Array(45*45);
 for(let y=8;y<37;y++)for(let x=20;x<=22;x++){const n=y*45+x;component[n]=1;image.rgba.set([30,60,90,255],n*4);}
 for(let y=10;y<35;y++)image.rgba.set([237,239,242,255],(y*45+19)*4);
 return {image,component,blocked,window:{x:0,y:0,w:45,h:45},work:{checks:0}};
}
test('antialias observations support a smooth gradient and refuse nearby different ink, masks and transparent boundaries',()=>{
 for(const mode of ['plain','gradient','different-ink','text','body','transparent','border','other-line']){
  const f=sectionFixture(),n=20*45+19;
  if(mode==='gradient')for(let y=0;y<45;y++)for(let x=0;x<45;x++){
   const i=y*45+x;if(f.component[i])continue;const bg=[250-Math.floor(x/10),252-Math.floor(x/10),254-Math.floor(x/10)];
   f.image.rgba.set([...bg.map((v,c)=>x===19&&y>=10&&y<35?Math.round(v*.92+[30,60,90][c]*.08):v),255],i*4);
  }
  if(mode==='different-ink')f.image.rgba.set([240,220,240,255],n*4);
  if(mode==='text'||mode==='body')f.blocked[n]=1;
  if(mode==='transparent')f.image.rgba[(20*45+16)*4+3]=0;
  if(mode==='border')f.image.rgba.set([240,230,200,255],(20*45+16)*4);
  if(mode==='other-line')f.image.rgba.set([30,60,90,255],(20*45+16)*4);
  const rows=observe(f);assert.ok(rows);
  assert.equal(rows.some(row=>row.cell===n),['plain','gradient'].includes(mode),mode);
  assert.ok(f.work.checks<=4000000);
 }
});
test('antialias evidence fails closed at bounded source edges, on empty masks and exhausted budgets',()=>{
 const f=sectionFixture();f.component.fill(0);assert.deepEqual(observe(f),[]);
 const edge=sectionFixture();edge.window={x:0,y:0,w:1,h:1};edge.component=new Uint8Array([1]);edge.blocked=new Uint8Array(1);assert.deepEqual(observe(edge),[]);
 const exhausted=sectionFixture();exhausted.work.checks=4000000;assert.equal(observe(exhausted),null);assert.ok(exhausted.work.checks>4000000);
});
test('repeated source resampling halos can exceed the alpha mixture interval but isolated pale paint cannot',()=>{
 const f=sectionFixture();
 for(let n=0;n<45*45;n++)if(!f.component[n])f.image.rgba.set([235,248,241,255],n*4);
 for(let y=10;y<35;y++){
  f.image.rgba.set([213,255,255,255],(y*45+19)*4);
  f.image.rgba.set([223,247,247,255],(y*45+18)*4);
  f.image.rgba.set([232,248,245,255],(y*45+17)*4);
 }
 const rows=observe(f);assert.ok(rows.some(row=>row.cell===20*45+19));
 assert.ok(rows.some(row=>row.cell===20*45+18));
 f.image.rgba.set([220,220,240,255],(20*45+19)*4);f.work.checks=0;
 assert.equal(observe(f).some(row=>row.cell===20*45+19),false);
});
test('no incomplete, cloned or changed source/output/erasure roster can mint a fringe restoration receipt',()=>{
 for(const mode of ['missing','duplicate','clone','geometry','endpoint','source','roster']){
  const f=fixture(),before=Buffer.from(f.image.rgba);
  let shapes=f.shapes,objects=f.built.parts;
  if(mode==='missing')shapes=shapes.slice(1);
  if(mode==='duplicate')shapes=[...shapes,shapes.at(-1)];
  if(mode==='clone')shapes=structuredClone(shapes);
  if(mode==='geometry')f.built.parts[0].box.x+=1;
  if(mode==='endpoint')f.bodies[0].box.x+=1;
  if(mode==='source')f.image.rgba[0]^=1;
  if(mode==='roster')objects=objects.slice(1);
  assert.equal(plan(f.image,shapes,objects,{w:300,h:230}).masks.some(m=>m.sourceRouteInk),false,mode);
  if(mode!=='source')assert.deepEqual(f.image.rgba,before);
 }
});
test('private fringe receipts reject forged input, changed source and geometry without invoking user code',()=>{
 const f=fixture(),masks=plan(f.image,f.shapes,f.built.parts,{w:300,h:230}).masks;
 const receipt=masks.find(m=>m.sourceRouteInk);assert.ok(receipt);
 const text={x:140,y:60,w:20,h:40,textInk:{color:[30,60,90],polygon:[[147,61],[153,61],[153,99],[147,99]]}};
 assert.ok(residualTextPlans(f.image,[...masks,text]).every(p=>p.overlaps.every(o=>!o.mask.sourceRouteInk)),'the receipt bounding box never owns text background');
 let calls=0;
 for(const value of [new Proxy(receipt,{get(){calls++;throw Error('trap');}}),{...receipt,toJSON(){calls++;throw Error('hook');}},
  Object.defineProperty({...receipt},'x',{get(){calls++;throw Error('getter');}}),{...receipt},null]){
  assert.throws(()=>eraseMasks(f.image,[value],{transparent:true}));
 }
 assert.equal(calls,0);
 receipt.x++;assert.throws(()=>eraseMasks(f.image,masks,{transparent:true}),/proof/i);receipt.x--;
 f.image.rgba[0]^=1;assert.throws(()=>eraseMasks(f.image,masks,{transparent:true}),/source proof/i);
});
test('live fringe source reader validates unknown controls and grants no serialized source authority',()=>{
 const f=fixture();assert.equal(sharedSourceAntialiasBackground(structuredClone(f.fit),f.image,{checks:0}),null);
 for(const value of [null,{},[],{checks:-1},{checks:Infinity},{checks:4000001},Object.freeze({checks:0})])assert.throws(()=>sharedSourceAntialiasBackground(f.fit,f.image,value),TypeError);
 let calls=0;const getter=Object.defineProperty({},'checks',{get(){calls++;return 0;}});
 assert.throws(()=>sharedSourceAntialiasBackground(f.fit,f.image,getter),TypeError);assert.equal(calls,0);
 assert.equal(sharedSourceAntialiasBackground(f.fit,f.image,{checks:4000000}),null);
});
test('antialias regression is discovered by unified unit and all CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-shared-antialias-residual.test.js'));
});

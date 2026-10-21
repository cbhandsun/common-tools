'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {observeSceneLiteralPaint:observe,retainedSceneLiteralPaint:retained}=require('../packages/slideclone-core/source-scene-literal-paint');
const {hasMeasuredScenePortFrame,measuredSceneOpaqueSurface}=require('../packages/slideclone-core/source-scene-port-evidence');
function fixture(){
 const width=32,height=24,image={width,height,rgba:Buffer.alloc(width*height*4,255)};
 const cells=new Set([2*width+2,2*width+3,3*width+2,10*width+20]);
 for(const cell of cells)image.rgba.set([220,225,230,255],cell*4);
 return {id:'owner-paint',image,window:{x:0,y:0,w:width,h:height},cells,budget:{used:0},slideSize:{widthPt:64,heightPt:48}};
}
// Independent source-pixel oracle: even/odd polygons from the ACTUAL emitted
// geometry, not the receipt's copied cells. Closed holes remain empty.
function painted(shape,x,y,f){
 const px=((x+.5)*f.slideSize.widthPt/f.image.width-shape.box.x)/shape.box.w;
 const py=((y+.5)*f.slideSize.heightPt/f.image.height-shape.box.y)/shape.box.h;
 let paths=[],path=[];
 for(const s of shape.style.freeformSegments){
  if(s.type==='moveTo'){path=[s.points[0]];paths.push(path);}
  else if(s.type==='lnTo')path.push(s.points[0]);
  else assert.equal(s.type,'close');
 }
 let inside=false;
 for(const polygon of paths)for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a.y>py)!==(b.y>py)&&px<(b.x-a.x)*(py-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
function oracle(f,result){
 for(let y=0;y<f.image.height;y++)for(let x=0;x<f.image.width;x++){
  const cell=y*f.image.width+x,parts=result.parts.filter(p=>painted(p,x,y,f));
  assert.equal(parts.length,f.cells.has(cell)?1:0,'source footprint '+x+','+y);
  if(parts.length){const rgb=parts[0].style.fill.slice(1).match(/../g).map(c=>parseInt(c,16));
   for(let c=0;c<3;c++)assert.ok(Math.abs(rgb[c]-f.image.rgba[cell*4+c])<=18);}
 }
}

test('literal source paint preserves each selected source cell without joining or expanding islands',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),result=observe(f);assert.equal(result.failure,null,JSON.stringify(result));
 oracle(f,result);assert.equal(result.cells,4);assert.equal(result.maxColorError,0);assert.ok(f.budget.used>0);
 assert.deepEqual(f.image.rgba,before);assert.deepEqual([...retained(f.image,result.receipt,result.parts).cells],[...f.cells]);
 for(const name of ['ownerCompleted','portsAuthorized','opaqueBodyAuthorized','erasureAuthorized'])assert.equal(result[name],false);
 assert.equal(hasMeasuredScenePortFrame(f.image,result.receipt,f.window),false);assert.equal(measuredSceneOpaqueSurface(f.image,result.receipt),null);
});

test('a weak neighboring object is preserved literally, never inferred away as an antialias or assigned a semantic unit',()=>{
 const f=fixture();
 // Both a separate gray object and an adjacent gray pixel must survive.
 for(const [cell,color]of [[3*f.image.width+3,[235,240,245,255]],[16*f.image.width+12,[200,210,220,255]],[17*f.image.width+12,[200,210,220,255]]]){
  f.cells.add(cell);f.image.rgba.set(color,cell*4);
 }
 const result=observe(f);assert.equal(result.failure,null);oracle(f,result);assert.equal(result.cells,7);
 assert.ok(result.parts.every(p=>p.source.nativeComponentRole==='unclassified-source-paint'&&p.source.sceneRegionId===undefined));
 assert.equal(result.ownerCompleted,false);
});

test('holes, distant source colors and deterministic palette error retain exact geometry and the original color bound',()=>{
 const f=fixture();f.cells.clear();
 for(let y=2;y<8;y++)for(let x=2;x<8;x++)if(x===2||x===7||y===2||y===7){f.cells.add(y*32+x);f.image.rgba.set([10,20,200,255],(y*32+x)*4);}
 for(const [cell,color]of [[12*32+12,[200,20,10,255]],[13*32+12,[214,31,20,255]],[14*32+12,[0,200,10,255]]]){
  f.cells.add(cell);f.image.rgba.set(color,cell*4);
 }
 const result=observe(f);assert.equal(result.failure,null);oracle(f,result);assert.ok(result.maxColorError<=18);
 assert.ok(result.parts.length>=3);assert.ok(result.parts.every(p=>p.style.freeformSegments.length<=120));
 const other={...f,cells:new Set([...f.cells].reverse()),budget:{used:0}};
 assert.deepEqual(observe(other).parts,result.parts);
});

test('source receipts bind original pixels, exact outputs and snapshots; copies and changes grant no authority',()=>{
 for(const mode of ['copy','source','geometry','paint','order','image','receipt']){
  const f=fixture();f.cells.add(15*32+4);f.image.rgba.set([200,0,0,255],(15*32+4)*4);
  const result=observe(f);assert.equal(result.failure,null);let parts=result.parts,image=f.image,receipt=result.receipt;
  if(mode==='copy')parts=structuredClone(parts);
  if(mode==='source')parts[0].source.detector='changed';
  if(mode==='geometry')parts[0].box.w++;
  if(mode==='paint')parts[0].style.fill='#FFFFFF';
  if(mode==='order')parts.reverse();
  if(mode==='image')image={...image,rgba:Buffer.from(image.rgba)};
  if(mode==='receipt')receipt=structuredClone(receipt);
  assert.equal(retained(image,receipt,parts),null,mode);
 }
 const f=fixture(),result=observe(f),proof=retained(f.image,result.receipt,result.parts);proof.cells.clear();f.cells.clear();
 assert.equal(retained(f.image,result.receipt,result.parts).cells.size,4);
});

test('empty, unknown alpha, source budget and native capacity failures publish no partial paint receipt',()=>{
 for(const mode of ['empty','alpha','budget','palette']){
  const f=fixture();
  if(mode==='empty')f.cells.clear();
  if(mode==='alpha')f.image.rgba[[...f.cells][0]*4+3]=0;
  if(mode==='budget')f.budget.used=4000000;
  if(mode==='palette'){
   f.cells.clear();let i=0;
   outer:for(const r of [0,64,128,192])for(const g of [0,64,128,192])for(const b of [0,64,128,192]){
    f.cells.add(i);f.image.rgba.set([r,g,b,255],i*4);if(++i===33)break outer;
   }
  }
  const result=observe(f);assert.ok(result.failure.startsWith('literal-paint-'),mode);assert.equal(result.receipt,undefined,mode);assert.equal(result.parts,undefined,mode);
 }
});

test('invalid, extreme and hostile controls reject before executing user code or source reads',()=>{
 let reads=0;
 for(const mode of ['null','getter','proxy','iterator','cell','outside','fraction','capacity','size','window','unknown']){
  let f=fixture();
  if(mode==='null')f=null;
  if(mode==='getter')Object.defineProperty(f,'cells',{get(){reads++;throw Error('private');}});
  if(mode==='proxy')f.cells=new Proxy(f.cells,{get(){reads++;throw Error('private');}});
  if(mode==='iterator')f.cells[Symbol.iterator]=()=>{reads++;throw Error('private');};
  if(mode==='cell')f.cells=new Set([-1]);
  if(mode==='outside')f.window={x:10,y:10,w:10,h:10};
  if(mode==='fraction')f.cells=new Set([2.5]);
  if(mode==='capacity')f.cells=new Set(Array.from({length:262145},(_,i)=>i));
  if(mode==='size')f.slideSize.widthPt=Infinity;
  if(mode==='window')f.window.w=1.5;
  if(mode==='unknown')f.authorizeCompletion=true;
  assert.throws(()=>observe(f),TypeError,mode);
 }
 assert.equal(reads,0);
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.ok(includesSuite(__filename,suite));
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {sourceSharedTreeFixture}=require('./helpers/source-shared-tree.cjs');
const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {sourceSharedResidualErasurePlan:plan}=require('../packages/slideclone-core/scene-plan/source-shared-residual-union');
const {sharedResidualBackdropPlans}=require('../packages/slideclone-core/scene-plan/source-shared-residual-union');
const {eraseMasks}=require('../packages/slideclone-core/scene-plan/residual-primitive-erasure');
const {auditResidualPixelOwnership}=require('../packages/slideclone-core/scene-plan/residual-pixel-ownership');
const {observeRouteAntialiasBackground:observe}=require('../packages/slideclone-core/routing/source-route-antialias-background');
const {observeSourceCoreBackdrop:coreBackdrop}=require('../packages/slideclone-core/routing/source-route-core-backdrop');
const background=[235,248,241];
const rgbaAt=(image,n)=>[...image.rgba.subarray(n*4,n*4+4)];
function section(){
 const image={width:45,height:45,rgba:Buffer.alloc(45*45*4)},component=new Uint8Array(45*45),blocked=new Uint8Array(45*45);
 for(let n=0;n<45*45;n++)image.rgba.set([...background,255],n*4);
 for(let y=8;y<37;y++)for(let x=20;x<=22;x++){const n=y*45+x;component[n]=1;image.rgba.set([30,60,90,255],n*4);}
 return {image,component,blocked,window:{x:0,y:0,w:45,h:45},work:{checks:0}};
}
function curvedSection(){
 const image={width:80,height:80,rgba:Buffer.alloc(80*80*4)},component=new Uint8Array(80*80),blocked=new Uint8Array(80*80);
 for(let n=0;n<80*80;n++)image.rgba.set([...background,255],n*4);
 for(let y=40;y<=52;y++)for(let x=40;x<=52;x++){
  const radius=Math.hypot(x-40,y-40);if(radius<9||radius>11)continue;
  const n=y*80+x;component[n]=1;image.rgba.set([30,60,90,255],n*4);
 }
 return {image,component,blocked,window:{x:0,y:0,w:80,h:80},work:{checks:0}};
}
function overlappingSection(){
 const image={width:96,height:96,rgba:Buffer.alloc(96*96*4)},component=new Uint8Array(96*96),blocked=new Uint8Array(96*96);
 for(let n=0;n<component.length;n++)image.rgba.set([...background,255],n*4);
 for(let y=40;y<60;y++)for(let x=40;x<60;x++)if(Math.abs(Math.hypot(x-40,y-40)-18)<=1){
  const n=y*96+x;component[n]=1;image.rgba.set([30,60,90,255],n*4);
 }
 return {image,component,blocked,window:{x:0,y:0,w:96,h:96},work:{checks:0}};
}
function addUnavailableGridCorners(f){
 const tiles=new Set([...f.component.keys()].filter(n=>f.component[n]).map(n=>
  (Math.floor(n%f.window.w/8)*8+4)+','+(Math.floor(Math.floor(n/f.window.w)/8)*8+4)));
 for(const key of tiles){const [cx,cy]=key.split(',').map(Number);for(const flank of [10,18,22]){
  const x=cx-flank-1,y=cy-flank-1,n=y*f.window.w+x;
  if(x>=0&&y>=0&&!f.component[n])f.image.rgba[n*4]+=10;
 }}
 return f;
}
function nestedShiftSection(){
 const f=addUnavailableGridCorners(curvedSection());
 // These bodies intersect the four radius-24 shifted windows, but lie
 // outside the radius-20 windows that independently surround the target.
 for(const n of [18*80+62,70*80+62])f.blocked[n]=1;
 return f;
}

test('a narrow independently verified field restores a curved core between blocked square-window exteriors',()=>{
 for(const mode of ['flat','gradient','transpose','offset','covered','inner-body','inner-transparent','inner-ink']){
  const f=addUnavailableGridCorners(curvedSection()),target=47*80+47;
  if(mode==='gradient'){
   for(let y=0;y<80;y++)for(let x=0;x<80;x++)if(!f.component[y*80+x])
    f.image.rgba.set([210+Math.floor(x/4),225+Math.floor(y/4),235,255],(y*80+x)*4);
   addUnavailableGridCorners(f);
  }
  // Outside a narrow vertical field, inside every relevant square field.
  for(const x of [29,65])f.blocked[40*80+x]=1;
  if(mode==='inner-body')f.blocked[33*80+38]=1;
  if(mode==='inner-transparent')f.image.rgba[(33*80+38)*4+3]=0;
  if(mode==='inner-ink')f.image.rgba.set([30,60,90,255],(33*80+38)*4);
  if(mode==='transpose'){
   const rgba=Buffer.from(f.image.rgba),component=f.component.slice(),blocked=f.blocked.slice();
   for(let y=0;y<80;y++)for(let x=0;x<80;x++){
    const from=y*80+x,to=x*80+y;rgba.copy(f.image.rgba,to*4,from*4,from*4+4);
    f.component[to]=component[from];f.blocked[to]=blocked[from];
   }
  }
  if(mode==='offset'){
   const rgba=Buffer.alloc(100*100*4,255);
   for(let y=0;y<80;y++)f.image.rgba.copy(rgba,((y+10)*100+10)*4,y*80*4,(y+1)*80*4);
   f.image={width:100,height:100,rgba};f.window={x:10,y:10,w:80,h:80};
  }
  const covered=new Set(mode==='covered'?[target]:[]),before=Buffer.from(f.image.rgba),component=f.component.slice(),blocked=f.blocked.slice();
  const rows=coreBackdrop({...f,covered});assert.ok(rows,mode);
  const global=mode==='offset'?57*100+57:target,row=rows.find(r=>r.cell===global);
  if(['flat','gradient','transpose','offset'].includes(mode)){
   assert.ok(row,mode);const expected=mode==='gradient'?[221,236,235]:background;
   assert.ok(row.color.every((v,c)=>Math.abs(v-expected[c])<=1),mode);
  }else assert.equal(row,undefined,mode);
  for(const row of rows){const local=(Math.floor(row.cell/f.image.width)-f.window.y)*80+row.cell%f.image.width-f.window.x;
   assert.equal(f.component[local],1);assert.equal(f.blocked[local],0);assert.equal(covered.has(local),false);}
  assert.equal(new Set(rows.map(r=>r.cell)).size,rows.length);
  assert.deepEqual(f.image.rgba,before);assert.deepEqual(f.component,component);assert.deepEqual(f.blocked,blocked);
  assert.ok(f.work.checks<=4000000);
 }
});

test('a curved measured core can recover its independently witnessed background without a straight nine-section profile',()=>{
 const f=curvedSection(),before=Buffer.from(f.image.rgba),target=47*80+47,rows=observe(f);
 assert.equal(f.component[target],1);assert.ok(rows.some(r=>r.cell===target));
 assert.deepEqual(rows.find(r=>r.cell===target).color,background);
 assert.deepEqual(f.image.rgba,before);assert.ok(f.work.checks<=4000000);
});

test('curved core cells reuse overlapping fields without hiding a refused source window or extending coverage',()=>{
 for(const mode of ['plain','gradient','offset','covered','body','transparent']){
  const f=overlappingSection(),target=43*96+57,covered=new Set(mode==='covered'?[target]:[]);
  if(mode==='gradient')for(let n=0;n<96*96;n++)if(!f.component[n])f.image.rgba.set([230+Math.floor(n%96/8),248,241,255],n*4);
  if(mode==='body')f.blocked[target]=1;if(mode==='transparent')f.image.rgba[target*4+3]=0;
  if(mode==='offset'){
   const rgba=Buffer.alloc(116*116*4,255);
   for(let y=0;y<96;y++)f.image.rgba.copy(rgba,((y+10)*116+10)*4,y*96*4,(y+1)*96*4);
   f.image={width:116,height:116,rgba};f.window={x:10,y:10,w:96,h:96};
  }
  const before=Buffer.from(f.image.rgba),mask=f.component.slice(),blocked=f.blocked.slice();
  const rows=coreBackdrop({...f,covered});assert.ok(rows);
  const global=mode==='offset'?53*116+67:target,row=rows.find(r=>r.cell===global);
  if(['covered','body','transparent'].includes(mode))assert.equal(row,undefined,mode);
  else{assert.ok(row,'an independently verified neighboring field includes this measured core cell');
   assert.ok(row.color.every((value,c)=>Math.abs(value-(['gradient'].includes(mode)?[237,248,241]:background)[c])<=1));}
  for(const row of rows){const local=(Math.floor(row.cell/f.image.width)-f.window.y)*96+row.cell%f.image.width-f.window.x;
   assert.equal(f.component[local],1);assert.equal(f.blocked[local],0);assert.equal(covered.has(local),false);}
  assert.equal(new Set(rows.map(r=>r.cell)).size,rows.length);
  assert.deepEqual(f.image.rgba,before);assert.deepEqual(f.component,mask);assert.deepEqual(f.blocked,blocked);
  assert.ok(f.work.checks<=4000000);
 }
});

test('overlapping background reuse returns no partial result when its remaining work budget runs out',()=>{
 const measured=overlappingSection(),result=coreBackdrop({...measured,covered:new Set()});assert.ok(result?.length);
 const f=overlappingSection(),before=Buffer.from(f.image.rgba);f.work.checks=4000000-measured.work.checks+1;
 assert.equal(coreBackdrop({...f,covered:new Set()}),null);assert.ok(f.work.checks>4000000);
 assert.deepEqual(f.image.rgba,before);
 const covered=new Set([...f.component.keys()].filter(n=>f.component[n]));f.work.checks=0;
 assert.deepEqual(coreBackdrop({...f,covered}),[]);assert.ok(f.work.checks<=4000000);
});

test('an insufficient noisy tile does not veto an independently verified overlapping core background',()=>{
 for(const mode of ['bright-noise','dark-noise','body','transparent','contradictory-ink']){
  const f=overlappingSection(),target=43*96+57,cells=[[49,33],[41,25],[37,21]].map(([x,y])=>y*96+x);
  for(const n of cells){assert.equal(f.component[n],0);f.image.rgba.set([background[0]+(mode==='dark-noise'?-10:10),background[1],background[2],255],n*4);}
  if(mode==='body')f.blocked[cells[0]]=1;
  if(mode==='transparent')f.image.rgba[cells[0]*4+3]=0;
  if(mode==='contradictory-ink')f.image.rgba.set([30,60,90,255],cells[0]*4);
  const before=Buffer.from(f.image.rgba),component=f.component.slice(),blocked=f.blocked.slice();
  const rows=coreBackdrop({...f,covered:new Set()});assert.ok(rows);
  const row=rows.find(r=>r.cell===target);
  if(mode==='bright-noise'||mode==='dark-noise'){assert.ok(row,mode);assert.deepEqual(row.color,background);}
  else assert.equal(row,undefined,mode);
  assert.deepEqual(f.image.rgba,before);assert.deepEqual(f.component,component);assert.deepEqual(f.blocked,blocked);
  assert.ok(f.work.checks<=4000000);
 }
});

test('a locally insufficient support ratio cannot turn into a permanent veto of a complete neighboring field',()=>{
 const f=overlappingSection(),target=44*96+44;f.component.fill(0);
 for(let n=0;n<96*96;n++)f.image.rgba.set([...background,255],n*4);
 for(let y=25;y<=65;y++)for(let x=43;x<=45;x++){const n=y*96+x;f.component[n]=1;f.image.rgba.set([30,60,90,255],n*4);}
 for(const [x,y]of [[22,22],[26,26]]){const n=y*96+x;f.component[n]=1;f.image.rgba.set([30,60,90,255],n*4);}
 for(let y=38;y<=50;y++)for(let x=32;x<=35;x++)f.image.rgba.set([background[0]+10,background[1],background[2],255],(y*96+x)*4);
 const before=Buffer.from(f.image.rgba),rows=coreBackdrop({...f,covered:new Set()});assert.ok(rows);
 assert.deepEqual(rows.find(r=>r.cell===target)?.color,background);
 for(const row of rows)assert.equal(f.component[row.cell],1);
 assert.deepEqual(f.image.rgba,before);assert.ok(f.work.checks<=4000000);
});

test('bounded shifted fields recover curved cores when every regular grid corner is unavailable',()=>{
 for(const mode of ['flat','gradient','offset','covered','body','transparent','contradictory-ink']){
  const f=curvedSection(),target=47*80+47,covered=new Set(mode==='covered'?[target]:[]);
  if(mode==='gradient')for(let y=0;y<80;y++)for(let x=0;x<80;x++)if(!f.component[y*80+x])
   f.image.rgba.set([210+Math.floor(x/4),225+Math.floor(y/4),235,255],(y*80+x)*4);
  addUnavailableGridCorners(f);
  if(mode==='body')f.blocked[33*80+33]=1;
  if(mode==='transparent')f.image.rgba[(33*80+33)*4+3]=0;
  if(mode==='contradictory-ink')f.image.rgba.set([30,60,90,255],(33*80+33)*4);
  if(mode==='offset'){
   const rgba=Buffer.alloc(100*100*4,255);
   for(let y=0;y<80;y++)f.image.rgba.copy(rgba,((y+10)*100+10)*4,y*80*4,(y+1)*80*4);
   f.image={width:100,height:100,rgba};f.window={x:10,y:10,w:80,h:80};
  }
  const before=Buffer.from(f.image.rgba),component=f.component.slice(),blocked=f.blocked.slice();
  const rows=coreBackdrop({...f,covered});assert.ok(rows);
  const global=mode==='offset'?57*100+57:target,row=rows.find(r=>r.cell===global);
  if(['flat','gradient','offset'].includes(mode)){
   assert.ok(row,mode);const expected=mode==='gradient'?[221,236,235]:background;
   assert.ok(row.color.every((value,c)=>Math.abs(value-expected[c])<=1));
  }else assert.equal(row,undefined,mode);
  for(const row of rows){const local=(Math.floor(row.cell/f.image.width)-f.window.y)*80+row.cell%f.image.width-f.window.x;
   assert.equal(f.component[local],1);assert.equal(f.blocked[local],0);assert.equal(covered.has(local),false);}
  assert.equal(new Set(rows.map(r=>r.cell)).size,rows.length);
  assert.deepEqual(f.image.rgba,before);assert.deepEqual(f.component,component);assert.deepEqual(f.blocked,blocked);
  assert.ok(f.work.checks<=4000000);
 }
});

test('shifted core sampling never returns partial paint on late budget exhaustion or samples fully covered cores',()=>{
 const measured=addUnavailableGridCorners(curvedSection()),rows=coreBackdrop({...measured,covered:new Set()});assert.ok(rows?.length);
 const f=addUnavailableGridCorners(curvedSection()),before=Buffer.from(f.image.rgba);f.work.checks=4000000-measured.work.checks+1;
 assert.equal(coreBackdrop({...f,covered:new Set()}),null);assert.ok(f.work.checks>4000000);assert.deepEqual(f.image.rgba,before);
 const covered=new Set([...f.component.keys()].filter(n=>f.component[n]));f.work.checks=0;
 assert.deepEqual(coreBackdrop({...f,covered}),[]);assert.equal(f.work.checks,f.component.length);
});

test('independent shifted core observations share the original remaining budget without repeated radius ladders',()=>{
 const work={checks:3600000};
 for(let i=0;i<2;i++){
  const f=addUnavailableGridCorners(curvedSection()),before=Buffer.from(f.image.rgba);
  const rows=coreBackdrop({...f,work,covered:new Set()});
  assert.ok(rows,'each complete observation must fit the shared remaining 400000 checks');
  assert.deepEqual(rows.find(row=>row.cell===47*80+47)?.color,background);
  assert.deepEqual(f.image.rgba,before);
 }
 assert.ok(work.checks<=4000000);
});

test('shifted cores can use a fully validated nested field without interpolating across an obstructed exterior',()=>{
 for(const mode of ['flat','gradient','offset','covered','inner-body','inner-transparent','inner-ink']){
  const f=nestedShiftSection(),target=47*80+47,covered=new Set(mode==='covered'?[target]:[]);
  if(mode==='gradient'){
   for(let y=0;y<80;y++)for(let x=0;x<80;x++)if(!f.component[y*80+x])
    f.image.rgba.set([210+Math.floor(x/4),225+Math.floor(y/4),235,255],(y*80+x)*4);
   addUnavailableGridCorners(f);
  }
  if(mode==='inner-body')f.blocked[33*80+33]=1;
  if(mode==='inner-transparent')f.image.rgba[(33*80+33)*4+3]=0;
  if(mode==='inner-ink')f.image.rgba.set([30,60,90,255],(33*80+33)*4);
  if(mode==='offset'){
   const rgba=Buffer.alloc(100*100*4,255);
   for(let y=0;y<80;y++)f.image.rgba.copy(rgba,((y+10)*100+10)*4,y*80*4,(y+1)*80*4);
   f.image={width:100,height:100,rgba};f.window={x:10,y:10,w:80,h:80};
  }
  const before=Buffer.from(f.image.rgba),component=f.component.slice(),blocked=f.blocked.slice();
  const rows=coreBackdrop({...f,covered});assert.ok(rows);
  const global=mode==='offset'?57*100+57:target,row=rows.find(r=>r.cell===global);
  if(['flat','gradient','offset'].includes(mode)){
   assert.ok(row,mode);const expected=mode==='gradient'?[221,236,235]:background;
   assert.ok(row.color.every((value,c)=>Math.abs(value-expected[c])<=1));
  }else assert.equal(row,undefined,mode);
  for(const row of rows){const local=(Math.floor(row.cell/f.image.width)-f.window.y)*80+row.cell%f.image.width-f.window.x;
   assert.equal(f.component[local],1);assert.equal(f.blocked[local],0);assert.equal(covered.has(local),false);}
  assert.equal(new Set(rows.map(row=>row.cell)).size,rows.length);
  assert.deepEqual(f.image.rgba,before);assert.deepEqual(f.component,component);assert.deepEqual(f.blocked,blocked);
  assert.ok(f.work.checks<=4000000);
 }
});

test('nested shifted fields return no partial background when their full proof exhausts the shared budget',()=>{
 const measured=nestedShiftSection(),rows=coreBackdrop({...measured,covered:new Set()});assert.ok(rows?.length);
 const f=nestedShiftSection(),before=Buffer.from(f.image.rgba);f.work.checks=4000000-measured.work.checks+1;
 assert.equal(coreBackdrop({...f,covered:new Set()}),null);assert.ok(f.work.checks>4000000);
 assert.deepEqual(f.image.rgba,before);
});

test('curved core fields support two-dimensional gradients and source-window offsets, and never extend foreground ownership',()=>{
 for(const mode of ['flat','gradient','offset']){
  const f=curvedSection(),target=47*80+47;
  if(mode==='gradient')for(let y=0;y<80;y++)for(let x=0;x<80;x++){
   if(!f.component[y*80+x])f.image.rgba.set([210+Math.floor(x/4),225+Math.floor(y/4),235,255],(y*80+x)*4);
  }
  if(mode==='offset'){
   const rgba=Buffer.alloc(100*100*4);
   for(let n=0;n<100*100;n++)rgba.set([...background,255],n*4);
   for(let y=0;y<80;y++)f.image.rgba.copy(rgba,((y+10)*100+10)*4,y*80*4,(y+1)*80*4);
   f.image={width:100,height:100,rgba};f.window={x:10,y:10,w:80,h:80};
  }
  const before=Buffer.from(f.image.rgba),covered=new Set([50*80+40]);
  const rows=coreBackdrop({...f,covered});assert.ok(rows);
  const global=mode==='offset'?57*100+57:target,row=rows.find(r=>r.cell===global);assert.ok(row,mode);
  const expected=mode==='gradient'?[221,236,235]:background;
  assert.ok(row.color.every((value,c)=>Math.abs(value-expected[c])<=1),mode);
  for(const row of rows){const x=row.cell%f.image.width-f.window.x,y=Math.floor(row.cell/f.image.width)-f.window.y;
   const local=y*f.window.w+x;assert.equal(f.component[local],1);assert.equal(covered.has(local),false);
  }
  assert.deepEqual(f.image.rgba,before);assert.ok(f.work.checks<=4000000);
 }
});

test('curved core fields reject text, bodies, transparency, other ink, sharp backgrounds and insufficient evidence',()=>{
 for(const mode of ['text','body','transparent','nearby-ink','far-ink','corner','split-background','no-evidence','budget']){
  const f=curvedSection(),target=47*80+47;
  if(mode==='text')f.blocked[target]=1;
  if(mode==='body')f.blocked[28*80+28]=1;
  if(mode==='transparent')f.image.rgba[(28*80+28)*4+3]=0;
  if(mode==='nearby-ink')f.image.rgba.set([30,60,90,255],(44*80+46)*4);
  if(mode==='far-ink')f.image.rgba.set([30,60,90,255],(28*80+28)*4);
  if(mode==='corner')f.image.rgba.set([30,60,90,255],(33*80+33)*4);
  if(mode==='split-background')for(let y=0;y<80;y++)for(let x=48;x<80;x++)if(!f.component[y*80+x])f.image.rgba.set([255,195,195,255],(y*80+x)*4);
  if(mode==='no-evidence')f.component.fill(0);
  if(mode==='budget')f.work.checks=3999999;
  const before=Buffer.from(f.image.rgba),mask=f.component.slice(),rows=coreBackdrop({...f,covered:new Set()});
  if(mode==='budget')assert.equal(rows,null);else{assert.ok(rows);assert.equal(rows.some(r=>r.cell===target),false,mode);}
  assert.deepEqual(f.image.rgba,before);assert.deepEqual(f.component,mask);
 }
});
test('a complete measured route restores witnessed nonwhite background under its core instead of exposing page color',()=>{
 const f=sourceSharedTreeFixture();
 for(let n=0;n<f.image.width*f.image.height;n++)if(rgbaAt(f.image,n).every(v=>v===255))f.image.rgba.set([...background,255],n*4);
 const measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const built=compileSharedSourceRoute({fit:measured.fit,image:f.image,relations:f.nodes.slice(1).map((n,i)=>({id:'core-'+i,regionId:'root',fromId:f.nodes[0].endpointId,toId:n.endpointId,direction:'forward'})),
  id:'core-native',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230},wholeRelations:true});
 const bodies=f.nodes.map(n=>({id:n.id,type:'rect',box:{...n.box}})),shapes=[...bodies,...built.parts],before=Buffer.from(f.image.rgba),geometry=structuredClone(shapes);
 const {masks}=plan(f.image,shapes,built.parts,{w:300,h:230}),output=eraseMasks(f.image,masks,{transparent:true});
 assert.deepEqual(rgbaAt(output,80*300+150),[...background,255]);
 assert.equal(auditResidualPixelOwnership({source:f.image,residual:output,masks}).passed,true);
 assert.deepEqual(shapes,geometry);assert.deepEqual(f.image.rgba,before);
 const witnessed=new Map(sharedResidualBackdropPlans(f.image,masks).map(r=>[r.cell,r.color]));assert.ok(witnessed.has(80*300+150));
 const bad={...output,rgba:Buffer.from(output.rgba)};bad.rgba[(80*300+150)*4+3]=0;
 assert.equal(auditResidualPixelOwnership({source:f.image,residual:bad,masks}).passed,false);
});
test('core backgrounds require the same independent bilateral section evidence on flat and gradient surfaces',()=>{
 for(const mode of ['plain','gradient','blocked','transparent','different-flank','neighbor-ink']){
  const f=section(),target=20*45+21;
  if(mode==='gradient')for(let n=0;n<45*45;n++)if(!f.component[n])f.image.rgba.set([230+n%45/5|0,242,240,255],n*4);
  if(mode==='blocked')f.blocked[target]=1;
  if(mode==='transparent')f.image.rgba[target*4+3]=0;
  if(mode==='different-flank')for(let y=0;y<45;y++)for(let x=23;x<45;x++)f.image.rgba.set([255,200,200,255],(y*45+x)*4);
  if(mode==='neighbor-ink')for(let y=8;y<37;y++)for(let x=24;x<=27;x++)f.image.rgba.set([30,60,90,255],(y*45+x)*4);
  const rows=observe(f);assert.ok(rows);assert.equal(rows.some(r=>r.cell===target),['plain','gradient'].includes(mode),mode);
  assert.equal(rows.some(r=>r.cell===8*45+21),false,'unwitnessed line endpoints stay unchanged');
  assert.ok(f.work.checks<=4000000);
 }
});
test('core background regression is included in the unified unit and all CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(r=>r.file.replaceAll('\\','/')==='test/source-shared-core-background.test.js'));
 assert.ok(require('node:fs').readFileSync(path.join(__dirname,'../scripts/verify-runtime-package.js'),'utf8').includes('packages/slideclone-core/routing/source-route-core-backdrop.js'));
});

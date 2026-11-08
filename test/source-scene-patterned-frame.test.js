"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {measurePatternedSceneFrame:measure,measurePatternedSceneFrameDetailed:detailed,patternedSceneFrameGeometry:geometry}=require('../packages/slideclone-core/scene-plan/source-scene-patterned-frame');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
const {createMeasuredScenePortFrame,measuredScenePortFill,measuredSceneContainsGroup}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
const {nativePatternedSceneOutput}=require('../packages/slideclone-core/scene-plan/source-scene-patterned-output');
const {withSceneFillRasterCache}=require('../packages/slideclone-core/scene-plan/source-scene-fill-raster-cache');
function fixture(){
 const image={width:240,height:210,rgba:Buffer.alloc(240*210*4,255)},hint={x:30,y:25,w:144,h:120};
 const put=(x,y,w,h)=>{for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)image.rgba.set([30,60,90,255],(row*image.width+col)*4);};
 for(let x=46;x<158;x+=12){put(x,25,8,2);put(x,143,8,2);}
 for(let y=41;y<130;y+=12){put(30,y,2,8);put(172,y,2,8);}
 for(const [x,y,right,bottom]of[[30,25,false,false],[165,25,true,false],[30,136,false,true],[165,136,true,true]]){
  put(x,y+(bottom?7:0),9,2);put(x+(right?7:0),y,2,9);
 }
 return {image,hint,textMasks:[],owners:[],budget:{used:0},put};
}

test('faint patterned source strokes use local background evidence while all enclosure gates remain required',()=>{
 const f=fixture();for(let i=0;i<f.image.rgba.length;i+=4)if(f.image.rgba[i]===30)f.image.rgba.set([245,245,245,255],i);
 const before=Buffer.from(f.image.rgba),report=detailed(f);assert.ok(report.measurement);
 assert.ok(geometry(report.measurement,f.image));assert.deepEqual(f.image.rgba,before);
 const owned=fixture();for(let i=0;i<owned.image.rgba.length;i+=4)if(owned.image.rgba[i]===30)owned.image.rgba.set([245,245,245,255],i);
 owned.textMasks=[{x:45,y:24,w:20,h:6}];assert.equal(detailed(owned).detailCode,'patterned-source-text');
});

test('corner joins retain the same source dash allowance already measured by the rail fit',()=>{
 const f=fixture(),image={width:500,height:210,rgba:Buffer.alloc(500*210*4,255)},hint={x:30,y:25,w:400,h:120};
 const put=(x,y,w,h)=>{for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++)image.rgba.set([30,60,90,255],(py*500+px)*4);};
 for(let x=46;x<414;x+=12)put(x,143,8,2);
 for(let y=41;y<130;y+=12){put(30,y,2,8);put(428,y,2,8);}
 for(const [x,y,right,bottom]of[[30,25,false,false],[421,25,true,false],[30,136,false,true],[421,136,true,true]]){
  put(x,y+(bottom?7:0),8,2);put(x+(right?7:0),y,2,8);
 }
 for(const [x,w]of[[46,20],[67,20],[127,20],[163,20],[199,20],[235,20],[271,20],[307,20],[343,20],[379,20],[406,8]])put(x,25,w,2);
 const input={...f,image,hint,budget:{used:0}},before=Buffer.from(image.rgba),report=detailed(input);
 assert.ok(report.measurement,'the 1px interruption joins the first two source marks under the existing 1.5px tolerance');
 assert.deepEqual(image.rgba,before);
 assert.equal(report.measurement.sourcePixels.includes(25*500+66),false,'the source gap never becomes paint');
 for(let py=25;py<27;py++)for(let px=46;px<66;px++)image.rgba.set([255,255,255,255],(py*500+px)*4);
 assert.equal(detailed({...input,budget:{used:0}}).measurement,null,'a missing supporting mark still leaves an excessive gap');
});
function sparseFixture(){
 const f=fixture(),scale=4,width=f.image.width*scale,height=f.image.height*scale;
 const rgba=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const source=(Math.floor(y/scale)*f.image.width+Math.floor(x/scale))*4;
  rgba.set(f.image.rgba.subarray(source,source+4),(y*width+x)*4);
 }
 return {image:{width,height,rgba},hint:Object.fromEntries(Object.entries(f.hint).map(([k,v])=>[k,v*scale])),textMasks:[],owners:[],budget:{used:0}};
}
test('detailed patterned observation preserves source geometry and scan accounting',()=>{
 const a=fixture(),b=fixture(),plain=measure(a),report=detailed(b);assert.ok(plain);assert.ok(report.measurement);
 assert.equal(report.detailCode,null);assert.deepEqual(report.measurement,plain);assert.deepEqual(b.budget,a.budget);
 assert.ok(geometry(report.measurement,b.image));assert.equal(geometry(structuredClone(report.measurement),b.image),null);
});
test('patterned diagnostics distinguish source gaps, corner ambiguity, text and bounded scan failures',()=>{
 const gap=fixture();for(let y=143;y<145;y++)for(let x=70;x<134;x++)gap.image.rgba.set([255,255,255,255],(y*240+x)*4);
 assert.deepEqual(detailed(gap),{measurement:null,detailCode:'patterned-rail-gap',witness:{kind:'rail-gap',stage:'rail',
  side:1,startPx:66,endPx:134,trackPx:143.5,thicknessPx:2,allowedGapPx:8}});
 const ambiguous=fixture();ambiguous.put(170,133,1,9);ambiguous.put(163,141,8,1);
 assert.equal(detailed(ambiguous).detailCode,'patterned-corner-ambiguous');
 const owned=fixture();owned.textMasks=[{x:45,y:24,w:20,h:6}];assert.equal(detailed(owned).detailCode,'patterned-source-text');
 const exhausted=fixture();exhausted.budget.used=3999999;
 assert.deepEqual(detailed(exhausted),{measurement:null,detailCode:'patterned-source-scan-budget'});assert.equal(exhausted.budget.used,3999999);
 const blank=fixture();blank.image.rgba.fill(255);assert.deepEqual(detailed(blank),{measurement:null,detailCode:'patterned-rail-evidence'});
});
test('cached patterned failure remains distinct from continuous-ring failure without remeasurement',()=>{
 const f=fixture();for(let y=143;y<145;y++)for(let x=70;x<134;x++)f.image.rgba.set([255,255,255,255],(y*240+x)*4);
 const cache=createSceneMeasurementCache(f.image,[],f.budget);assert.equal(cache.outline(f.hint),null);
 const original=cache.failure(f.hint);assert.equal(cache.pattern(f.hint),null);const used=f.budget.used;
 const details=cache.failureDetails(f.hint);assert.ok(details.some(d=>d.code==='patterned-rail-gap'));
 assert.deepEqual(details.find(d=>d.code==='patterned-rail-gap').witness,
  {kind:'rail-gap',stage:'rail',side:1,startPx:66,endPx:134,trackPx:143.5,thicknessPx:2,allowedGapPx:8});
 assert.equal(cache.failure(f.hint),original);assert.equal(cache.pattern(f.hint),null);assert.equal(f.budget.used,used);
 details.at(-1).code='forged';assert.ok(cache.failureDetails(f.hint).some(d=>d.code==='patterned-rail-gap'));
 details.at(-1).witness.startPx=0;assert.equal(cache.failureDetails(f.hint).at(-1).witness.startPx,66);
});

test('unproven source corner reports its measured location without changing the plain rejection',()=>{
 const f=fixture();for(let y=25;y<34;y++)for(let x=30;x<39;x++)f.image.rgba.set([255,255,255,255],(y*240+x)*4);
 const report=detailed(f);assert.equal(report.measurement,null);assert.equal(measure(f),null);
 assert.equal(report.detailCode,'patterned-corner-unproven');
 assert.deepEqual(report.witness,{kind:'corner-unproven',xPx:30,yPx:25,farX:false,farY:false,searchLimitPx:8});
 assert.equal(geometry(report.witness,f.image),null,'a diagnostic does not become an enclosure receipt');
});
test('large fragmented frames reuse bounded perimeter strips without reading the unobserved core as paint',()=>{
 const f=sparseFixture(),before=Buffer.from(f.image.rgba),cache=createSceneMeasurementCache(f.image,[],f.budget);
 withSceneFillRasterCache(f.image,f.budget,()=>{
  assert.equal(cache.outline(f.hint),null);const used=f.budget.used,frame=cache.pattern(f.hint);assert.ok(frame);
  assert.deepEqual(frame.box,f.hint);assert.equal(f.budget.used-used,2880,'cached strips are reused; only bounded interior probes are reserved');
  assert.ok(f.budget.used<262144);assert.ok(frame.parts.length<=32);assert.ok(frame.parts.every(p=>p.length<=120));
  assert.ok(frame.sourcePixels.every(n=>{const x=n%f.image.width,y=Math.floor(n/f.image.width);return x<168||x>=648||y<148||y>=532;}));
  assert.ok(cache.patternFrame(f.hint));const finalUsed=f.budget.used;assert.equal(cache.pattern(f.hint),frame);assert.equal(f.budget.used,finalUsed);
 });
 assert.deepEqual(f.image.rgba,before);
});
test('sparse fragmented frames preserve missing-side, OCR ownership and atomic scan-budget rejection',()=>{
 const open=sparseFixture();
 for(let y=100;y<580;y++)for(let x=660;x<696;x++)open.image.rgba.set([255,255,255,255],(y*open.image.width+x)*4);
 assert.equal(measure(open),null);
 const owned=sparseFixture();owned.textMasks=[{x:184,y:100,w:32,h:8}];assert.equal(measure(owned),null);
 const exhausted=sparseFixture();exhausted.budget.used=3999000;assert.equal(measure(exhausted),null);assert.equal(exhausted.budget.used,3999000);
});
test('a source component continuing into the unobserved core cannot masquerade as an isolated dash',()=>{
 const f=sparseFixture();
 for(let y=108;y<400;y++)for(let x=200;x<204;x++)f.image.rgba.set([30,60,90,255],(y*f.image.width+x)*4);
 assert.equal(measure(f),null);
});
test('sparse frame contrast remains source measured on a colored background and never grants fill',()=>{
 const f=sparseFixture();
 for(let i=0;i<f.image.rgba.length;i+=4)if(f.image.rgba[i]===255)f.image.rgba.set([230,240,245,255],i);
 const frame=measure(f);assert.ok(frame);assert.deepEqual(frame.box,f.hint);
 const token=createMeasuredScenePortFrame(f.image,{...geometry(frame,f.image),fill:'none'},frame);
 assert.equal(measuredScenePortFill(f.image,token,frame.box),null);
});
test('a repeated four-sided source frame draws every admitted dash without painting the gaps',()=>{
 const f=fixture(),frame=measure(f);assert.ok(frame);assert.ok(frame.parts.length>1);assert.ok(frame.parts.length<=32);
 assert.deepEqual(frame.box,f.hint);assert.ok(frame.parts.every(p=>p.length<=120));
 assert.equal(frame.sourcePixels.includes(26*f.image.width+55),false,'the observed gap is never paint');
 assert.ok(Object.isFrozen(frame));assert.ok(Object.isFrozen(frame.parts[0][0].points));
 assert.ok(geometry(frame,f.image));assert.equal(geometry(structuredClone(frame),f.image),null);
 assert.equal(geometry(frame,{...f.image,rgba:Buffer.from(f.image.rgba)}),null);
 assert.throws(()=>{frame.box.x=0;},TypeError);
});
test('ragged dash rectangle endpoints retain their shared observed rail without filling gaps',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba);
 for(let y=143;y<145;y++)for(let x=46;x<54;x++)f.image.rgba.set([255,255,255,255],(y*240+x)*4);
 f.put(46,145,8,2);const source=Buffer.from(f.image.rgba),frame=measure(f);assert.ok(frame);
 assert.ok(frame.sourcePixels.includes(145*240+46));assert.equal(frame.sourcePixels.includes(144*240+46),false);
 assert.equal(frame.sourcePixels.includes(144*240+55),false,'matching a track never paints its gap');
 assert.deepEqual(f.image.rgba,source);assert.notDeepEqual(source,before);
 assert.ok(geometry(frame,f.image));assert.ok(f.budget.used<=262144);
});
test('missing repeated marks and strokes outside the observed common track remain rejected',()=>{
 for(const offset of [null,6]){
  const f=fixture();for(let y=143;y<145;y++)for(let x=46;x<54;x++)f.image.rgba.set([255,255,255,255],(y*240+x)*4);
  if(offset!==null)f.put(46,143+offset,8,2);
  assert.equal(measure(f),null);
 }
});
test('an attached outward branch preserves the observed dash but never paints the external connector as node perimeter',()=>{
 const f=fixture();f.put(73,20,2,5);const before=Buffer.from(f.image.rgba),frame=measure(f);assert.ok(frame);
 assert.ok(frame.sourcePixels.includes(25*240+73));assert.equal(frame.sourcePixels.includes(20*240+73),false);
 assert.equal(frame.sourcePixels.includes(25*240+79),false);assert.deepEqual(f.image.rgba,before);
 assert.ok(geometry(frame,f.image));
 const owned=fixture();owned.put(73,20,2,5);owned.textMasks=[{x:73,y:20,w:2,h:2}];assert.equal(measure(owned),null);
});
test('short rails need both distinct marks and all four independently witnessed source turns',()=>{
 const f=fixture();f.image.rgba.fill(255);f.hint.h=54;
 for(let x=46;x<158;x+=12){f.put(x,25,8,2);f.put(x,77,8,2);}
 for(const y of [41,55]){f.put(30,y,2,8);f.put(172,y,2,8);}
 for(const [x,y,right,bottom]of[[30,25,false,false],[165,25,true,false],[30,70,false,true],[165,70,true,true]]){
  f.put(x,y+(bottom?7:0),9,2);f.put(x+(right?7:0),y,2,9);
 }
 const before=Buffer.from(f.image.rgba),frame=measure(f);assert.ok(frame);assert.deepEqual(frame.box,f.hint);
 f.image.rgba.set(before);for(let y=70;y<79;y++)for(let x=30;x<39;x++)f.image.rgba.set([255,255,255,255],(y*240+x)*4);
 assert.equal(measure(f),null,'two repeated marks cannot substitute for a missing turn');
 f.image.rgba.set(before);for(let y=55;y<63;y++)for(let x=30;x<32;x++)f.image.rgba.set([255,255,255,255],(y*240+x)*4);
 assert.equal(measure(f),null,'one mark and corners cannot identify the repeated rail');
});
test('a nearby thick straight fragment cannot create false corner ambiguity',()=>{
 const f=fixture();f.put(165,132,4,10);const frame=measure(f);assert.ok(frame);assert.deepEqual(frame.box,f.hint);
 assert.equal(frame.sourcePixels.includes(132*240+165),false,'a rejected corner nominee receives no perimeter ownership');
});
test('two separately observed qualifying turns still reject corner ambiguity',()=>{
 const f=fixture();f.put(170,133,1,9);f.put(163,141,8,1);assert.equal(measure(f),null);
});
test('the private enclosure groups native members but never supplies fill or trusts a caller flag',()=>{
 const f=fixture(),frame=measure(f);assert.ok(frame);const bound=geometry(frame,f.image);
 const token=createMeasuredScenePortFrame(f.image,{...bound,fill:'none'},frame);
 assert.equal(measuredScenePortFill(f.image,token,frame.box),null);
 const label=[{x:70,y:70},{x:110,y:70},{x:110,y:90},{x:70,y:90}];
 assert.equal(measuredSceneContainsGroup(f.image,token,frame.box,label),true);
 assert.equal(measuredSceneContainsGroup({...f.image,rgba:Buffer.from(f.image.rgba)},token,frame.box,label),false);
 for(const forged of[{},structuredClone(frame),new Proxy(frame,{})])assert.throws(()=>createMeasuredScenePortFrame(f.image,{...bound,fill:'none'},forged),TypeError);
 assert.throws(()=>createMeasuredScenePortFrame(f.image,{...bound,box:{...bound.box,w:bound.box.w+1},fill:'none'},frame),TypeError);
});
test('the compiler cache reuses original scans and keeps continuous-ring rejection unchanged',()=>{
 const f=fixture(),cache=createSceneMeasurementCache(f.image,[],f.budget);
 withSceneFillRasterCache(f.image,f.budget,()=>{
 assert.equal(cache.pattern(f.hint),null,'an unobserved proposed box has no patterned authority');
 assert.equal(cache.outline(f.hint),null);const failure=cache.failure(f.hint),used=f.budget.used,frame=cache.pattern(f.hint);assert.ok(frame);
 assert.equal(f.budget.used,used);assert.equal(cache.pattern({...f.hint}),frame);
 assert.equal(f.budget.used,used);assert.ok(cache.patternFrame(f.hint));
 assert.equal(cache.outline(f.hint),null);assert.equal(cache.failure(f.hint),failure);
 });
});
test('a solid source ring never enters the fragmented representation consumer',()=>{
 const f=fixture();f.image.rgba.fill(255);f.put(30,25,144,2);f.put(30,143,144,2);f.put(30,25,2,120);f.put(172,25,2,120);
 const cache=createSceneMeasurementCache(f.image,[],f.budget);assert.ok(cache.outline(f.hint));const used=f.budget.used;
 assert.equal(cache.pattern(f.hint),null);assert.equal(f.budget.used,used);assert.ok(cache.portFrame(f.hint));
});
test('blank, open, scattered and missing-corner observations cannot acquire an enclosure',()=>{
 const blank=fixture();blank.image.rgba.fill(255);assert.equal(measure(blank),null);
 const open=fixture();for(let y=25;y<145;y++)for(let x=165;x<174;x++)open.image.rgba.set([255,255,255,255],(y*240+x)*4);
 assert.equal(measure(open),null);
 const corner=fixture();for(let y=25;y<34;y++)for(let x=30;x<39;x++)corner.image.rgba.set([255,255,255,255],(y*240+x)*4);
 assert.equal(measure(corner),null);
 const scattered=fixture();scattered.image.rgba.fill(255);for(let y=35;y<140;y+=17)for(let x=40;x<165;x+=19)scattered.put(x,y,3,3);
 assert.equal(measure(scattered),null);
});
test('unknown OCR ownership, unstable exterior and exhausted resource budgets preserve rejection',()=>{
 const owned=fixture();owned.textMasks=[{x:45,y:24,w:20,h:6}];assert.equal(measure(owned),null);
 const exterior=fixture();exterior.put(22,17,9,9);assert.equal(measure(exterior),null);
 const exhausted=fixture();exhausted.budget.used=3999999;assert.equal(measure(exhausted),null);assert.equal(exhausted.budget.used,3999999);
 const large={image:{width:1600,height:1600,rgba:Buffer.alloc(1600*1600*4,255)},hint:{x:100,y:100,w:1400,h:1400},textMasks:[],owners:[],budget:{used:0}};
 assert.equal(measure(large),null);assert.equal(large.budget.used,0);
});
test('invalid and hostile source controls fail without executing getters or reading pixels',()=>{
 let calls=0;const f=fixture(),getter={};Object.defineProperty(getter,'image',{get(){calls++;throw Error('private');}});
 for(const value of[null,{},getter,new Proxy(f,{}),{...f,textMasks:new Array(1)},{...f,hint:{...f.hint,w:Infinity}},
  {...f,image:{...f.image,rgba:new Uint8Array(new SharedArrayBuffer(240*210*4))}}])assert.throws(()=>measure(value),TypeError);
 assert.equal(calls,0);assert.equal(f.budget.used,0);
});
test('native output emits bounded observed paths and rejects copied measurements',()=>{
 const f=fixture(),frame=measure(f);assert.ok(frame);
 const input={image:f.image,measurement:frame,id:'object-unit',regionId:'region-root',inventory:true,slideSize:{widthPt:240,heightPt:210}};
 const shapes=nativePatternedSceneOutput(input);assert.ok(shapes);assert.equal(shapes.length,frame.parts.length+(frame.paint?.parts.length??0));
 assert.ok(shapes.every(s=>s.type==='freeform'&&s.style.freeformSegments.length<=120&&s.source.sceneInventoryId==='object-unit'));
 assert.ok(shapes.every(s=>s.source.residualBackgroundFill===false));
 shapes[0].style.freeformSegments[0].points[0].x=1;assert.notDeepEqual(shapes[0].style.freeformSegments,frame.parts[0]);
 assert.throws(()=>nativePatternedSceneOutput({...input,measurement:structuredClone(frame)}),TypeError);
 assert.throws(()=>nativePatternedSceneOutput({...input,id:'<unsafe>'}),TypeError);
});

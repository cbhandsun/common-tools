'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {ellipseBackgroundResidualMasks:measure}=require('../packages/slideclone-core/scene-plan/residual-ellipse-mask');
const {eraseObjectMask,createFullSlideResidualBuilder}=require('../packages/slideclone-core/archetypes/full-slide-native-residual');
const {eraseMasks}=require('../packages/slideclone-core/scene-plan/residual-primitive-erasure');
function fixture(){return {image:{width:80,height:60,rgba:Buffer.alloc(80*60*4,255)},size:{w:40,h:30},
 item:{type:'ellipse',box:{x:4,y:3,w:28,h:18},style:{fill:'#1e7244',stroke:'#1d6d42',strokeWidthPt:4,opacity:1},source:{residualBackgroundFill:true}}};}
test('native filled ellipses project their real interior under non-unit source scale',()=>{
 const {image,size,item}=fixture(),before=structuredClone(item),masks=measure(item,image,size),cells=new Set();
 assert.deepEqual(eraseObjectMask(item,image,size),masks);
 for(const mask of masks){assert.equal(mask.h,1);assert.deepEqual(mask.sourceFill,[30,114,68]);
  for(let x=mask.x;x<mask.x+mask.w;x++){const cell=mask.y*image.width+x;assert.ok(!cells.has(cell));cells.add(cell);}}
 const cx=36,cy=24,rx=28,ry=18;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)
  assert.equal(cells.has(y*image.width+x),((x+.5-cx)/rx)**2+((y+.5-cy)/ry)**2<1);
 assert.ok(cells.size>1000);assert.deepEqual(item,before);
});
test('ellipse background masks preserve corners and unmatched foreground while removing only matching fill',()=>{
 const {image,size,item}=fixture();
 for(let y=6;y<42;y++)for(let x=8;x<64;x++)image.rgba.set([30,114,68,255],(y*80+x)*4);
 image.rgba.set([230,20,30,255],(24*80+36)*4);
 const before=Buffer.from(image.rgba),masks=measure(item,image,size),result=eraseMasks(image,masks,{transparent:true});
 assert.deepEqual([...result.rgba.subarray((6*80+8)*4,(6*80+8)*4+4)],[30,114,68,255]);
 assert.deepEqual([...result.rgba.subarray((24*80+36)*4,(24*80+36)*4+4)],[230,20,30,255]);
 assert.equal(result.rgba[(24*80+35)*4+3],0);assert.deepEqual(image.rgba,before);
 masks[0].sourceFill[0]=255;assert.deepEqual(masks[1].sourceFill,[30,114,68]);
});
test('subpixel empty interiors and maximum page height stay bounded',()=>{
 const {image,size,item}=fixture();assert.deepEqual(measure({...item,box:{x:0,y:0,w:.01,h:.01}},image,size),[]);
 const masks=measure({...item,box:{x:0,y:0,w:1,h:16384}},{width:1,height:16384},{w:1,h:16384});
 assert.equal(masks.length,16384);assert.ok(masks.every(row=>row.x===0&&row.w===1&&row.h===1));
});
test('invalid, unsupported and hostile ellipse inputs fail before returning any masks or executing input code',()=>{
 const f=fixture();let calls=0;const bad=()=>{calls++;throw Error('private-content');};
 const getter=Object.defineProperty({},'fill',{get:bad}),proxy=new Proxy({},{get:bad,ownKeys:bad,getPrototypeOf:bad});
 for(const item of [null,proxy,{...f.item,style:getter},{...f.item,box:proxy},{...f.item,source:getter},
  {...f.item,type:'rect'},{...f.item,source:{residualBackgroundFill:false}},...[
   {fill:'none'},{fill:'red'},{fill:'#12345'},{gradient:{}},{opacity:0.5},{fillOpacity:0},{fillTransparency:1},
   {rotation:20},{rotationDeg:NaN},{rotate:1},{flipH:'true'},{stroke:'url(private)'},{strokeWidthPt:-1}
  ].map(style=>({...f.item,style:{...f.item.style,...style}})),
  ...[{x:-1},{y:Infinity},{w:0},{h:NaN},{w:100}].map(box=>({...f.item,box:{...f.item.box,...box}}))])
  assert.throws(()=>measure(item,f.image,f.size),error=>error instanceof TypeError&&!error.message.includes('private-content'));
 for(const image of [null,proxy,{width:0,height:1},{width:Infinity,height:1},{width:16385,height:1},{width:10000,height:10000}])
  assert.throws(()=>measure(f.item,image,f.size),TypeError);
 for(const size of [null,proxy,{w:0,h:1},{w:1,h:Infinity}])assert.throws(()=>measure(f.item,f.image,size),TypeError);
 assert.equal(calls,0);
});
test('unsupported ellipse paint prevents residual erasure and publication',async()=>{
 const {image,size,item}=fixture();let calls=0;
 const build=createFullSlideResidualBuilder({readPng:()=>image,eraseMasks:()=>{calls++;},writePng:()=>{calls++;}});
 await assert.rejects(build({sourceFile:path.resolve('source.png'),outputFile:path.resolve('output.png'),
  objects:[{...item,style:{...item.style,gradient:{}}}],slideSize:{x:0,y:0,...size}}),/ellipse paint/);
 assert.equal(calls,0);
});
test('ellipse regression runs through the unified unit and all test discovery',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/residual-ellipse-mask.test.js'));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/residual-ellipse-mask.js'));
});

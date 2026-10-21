"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {reconcileSourceConnectorCrops:reconcile}=require("../packages/slideclone-core/source-connector-crop-contour");
const {proposeSourceNativePage:finalize,finalizeSourceNativePage:compose,proposeNativeOwnedGraphics}=require("../packages/slideclone-core/source-native-finalization");
const {writePng}=require("../packages/slideclone-core/png");
function fixture({scale=1,offset=0,color=[25,110,210]}={}) {
  const project=b=>({x:b.x*scale+offset,y:b.y*scale+offset,w:b.w*scale,h:b.h*scale});
  const image={width:60,height:30,rgba:Buffer.alloc(60*30*4)};
  for(let y=0;y<30;y++)for(let x=0;x<60;x++) {
    image.rgba.set([255,255,255,0],(y*60+x)*4);
    if((x>=4&&x<=44&&y>=13&&y<=16)||(x>=42&&x<=54&&Math.abs(y-15)<=54-x)) image.rgba.set([...color,255],(y*60+x)*4);
  }
  const box=project({x:40,y:40,w:60,h:30}),pixelBox={x:40+offset/scale,y:40+offset/scale,w:60,h:30};
  const crop={id:"measured-visual",type:"fidelity-crop",assetPath:"assets/visual.png",box,source:{
    reason:"source-isolated-leading-icon",protectedMinimumUnit:true,cropEvidenceRequired:true,pageImage:"assets/source.png",
    sourceIconEvidence:{independentSourceROI:true},coordinateReferenceSizePx:{width:480,height:320},mappedPixelBox:pixelBox,tightenedPixelBox:pixelBox}};
  const shape={id:"logical-edge",type:"line",box:project({x:44,y:55,w:50,h:0}),style:{stroke:"#"+color.map(x=>x.toString(16).padStart(2,"0")).join(""),strokeWidthPt:4*scale,endArrow:"triangle"},source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,pageImage:"assets/source.png"}};
  return {input:{images:[crop],shapes:[shape],slideSize:{widthPt:480*scale,heightPt:320*scale}},image};
}
test("source-backed connector crop becomes one editable contour with its logical identity and no duplicate raster",()=>{
  for(const options of [{},{scale:2},{scale:0.8,offset:8},{color:[170,40,80]},{color:[40,40,40]}]) {
    const {input,image}=fixture(options),before=structuredClone(input),pixels=Buffer.from(image.rgba);
    const result=reconcile(input,()=>image);
    assert.equal(result.replacedCrops,1,JSON.stringify(options));assert.equal(result.images.length,0);assert.equal(result.shapes.length,1);
    const shape=result.shapes[0];assert.equal(shape.id,"logical-edge");assert.equal(shape.type,"freeform");assert.equal(shape.source.connector,true);
    assert.equal(shape.source.sourceConnectorCropContour.cropId,"measured-visual");assert.equal(shape.source.sourceConnectorCropContour.measuredShaftBins,32);
    assert.equal(shape.style.freeformSegments.filter(s=>s.type==="moveTo").length,1);
    assert.deepEqual(input,before);assert.deepEqual(image.rgba,pixels);
    assert.equal(JSON.stringify(result).includes("private-user-content"),false);
  }
});
test("bounding overlap, confidence, ambiguity and stale source mapping cannot authorize a replacement",()=>{
  const mutations=[
    f=>{f.input.shapes=[];},f=>{f.input.shapes.push({...structuredClone(f.input.shapes[0]),id:"second-owner"});},
    f=>{f.input.shapes[0].source.editable=false;},f=>{f.input.shapes[0].source.pageImage="assets/another.png";},
    f=>{f.input.shapes[0].type="rect";},f=>{f.input.images[0].source.tightenedPixelBox.x++;},
    f=>{f.input.shapes[0].box.y-=5;},f=>{f.input.shapes[0].box.w=4;},
    f=>{f.input.images[0].source.sourceIconEvidence.independentSourceROI=false;},
    f=>{f.input.shapes[0].style.opacity=0.5;}
  ];
  for(const mutate of mutations) {const f=fixture();mutate(f);const result=reconcile(f.input,()=>f.image);assert.equal(result.replacedCrops,0);assert.deepEqual(result.images,f.input.images);}
});
test("color-independent evidence rejects a second foreground part, colored interior, clipped ink and missing shaft",()=>{
  for(const kind of ["second","colored","clipped","shaft","empty"]) {
    const f=fixture();
    if(kind==="empty") f.image.rgba.fill(0);
    if(kind==="second") for(let y=2;y<6;y++)for(let x=3;x<7;x++)f.image.rgba.set([25,110,210,255],(y*60+x)*4);
    if(kind==="colored") for(let y=13;y<17;y++)for(let x=8;x<19;x++)f.image.rgba.set([220,30,60,255],(y*60+x)*4);
    if(kind==="clipped") f.image.rgba.set([25,110,210,255],(15*60)*4);
    if(kind==="shaft") for(let y=12;y<18;y++)for(let x=20;x<35;x++)f.image.rgba[(y*60+x)*4+3]=0;
    assert.equal(reconcile(f.input,()=>f.image).replacedCrops,0,kind);
  }
});
test("normal empty, invalid, extreme, getter, proxy and adapter failure paths stay bounded and safe",()=>{
  const f=fixture();assert.equal(reconcile({...f.input,images:[]},()=>{throw Error("unexpected");}).replacedCrops,0);
  for(const input of [null,{},new Proxy(f.input,{}),{...f.input,images:Array(2001).fill(f.input.images[0])},{...f.input,slideSize:{widthPt:Infinity,heightPt:10}}]) assert.throws(()=>reconcile(input,()=>f.image),/source connector/);
  let reads=0;const malicious={...f.input};Object.defineProperty(malicious,"images",{get(){reads++;throw Error("private-user-content");}});
  assert.throws(()=>reconcile(malicious,()=>f.image),error=>!error.message.includes("private-user-content"));assert.equal(reads,0);
  const imageEntry=[f.input.images[0]];Object.defineProperty(imageEntry,"0",{get(){reads++;throw Error("private-user-content");}});
  assert.throws(()=>reconcile({...f.input,images:imageEntry},()=>f.image),/source connector/);assert.equal(reads,0);
  for(const image of [{...f.image,width:513},new Proxy(f.image,{}),{...f.image,rgba:Buffer.alloc(1)},{...f.image,width:59,rgba:Buffer.alloc(59*30*4)}]) assert.throws(()=>reconcile(f.input,()=>image),/source connector/);
  const failure=new Error("adapter failed");assert.throws(()=>reconcile(f.input,()=>{throw failure;}),error=>error===failure);
});
test("finalization reads a confined PNG and rejects path traversal, links, absent and corrupt outputs",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"native-source-finalization-"));
  try {
    fs.mkdirSync(path.join(root,"assets"));const f=fixture(),page={...f.input,source:{otherEvidence:true}};
    writePng(path.join(root,"assets/visual.png"),f.image);
    assert.equal(compose(page,f.input.slideSize,root).images.length,1,"canonical composition preserves the crop before rendering");
    assert.equal(finalize(page,f.input.slideSize,root).images.length,0);assert.equal(page.images.length,1);
    const proposal=proposeNativeOwnedGraphics({pages:[page],slideSize:f.input.slideSize},root);
    assert.equal(proposal.vectorizedImages,1);assert.equal(proposal.deck.pages[0].images.length,0);
    for(const asset of ["../outside.png","assets/missing.png","assets/../outside.png","C:/outside.png"]) {
      const altered=structuredClone(page);altered.images[0].assetPath=asset;assert.throws(()=>finalize(altered,f.input.slideSize,root));
    }
    const file=path.join(root,"assets/visual.png");fs.writeFileSync(file,"invalid PNG");assert.throws(()=>finalize(page,f.input.slideSize,root));
    const link=path.join(root,"assets/linked");fs.symlinkSync(root,link,process.platform==="win32"?"junction":"dir");
    const altered=structuredClone(page);altered.images[0].assetPath="assets/linked/assets/visual.png";assert.throws(()=>finalize(altered,f.input.slideSize,root),/escaped/);
    fs.unlinkSync(link);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

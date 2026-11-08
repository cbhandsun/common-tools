"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const {writePng}=require("../packages/slideclone-core/png");
const {createSourceOcrRefiner}=require("../packages/slideclone-core/ocr/ocr-source-refinement");
const {createRawImageNativeRebuilder}=require("../packages/slideclone-core/team-native-rebuild");
const {sourceLabelIdentity}=require("../packages/slideclone-core/scene-plan/source-label-identity");
function setup(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"ocr-source-test-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sourceFile=path.join(root,"source.png");writePng(sourceFile,{width:300,height:180,rgba:Buffer.alloc(300*180*4,255)});
  return {root,sourceFile,dimensions:{widthPx:300,heightPx:180},ocr:{lines:[{text:"Network I/O,",confidence:0.82,box:{x:40,y:50,w:100,h:20}}]},isCancellationRequested:async()=>false};
}
test("source refiner runs two bounded fresh crops, admits agreement and removes owned temporary files",async t=>{
  const request=setup(t),seen=[];
  const refine=createSourceOcrRefiner({provider:"test-ocr",recognize:async input=>{
    seen.push(input);assert.ok(fs.existsSync(input.inputFile));const padding=(input.dimensions.widthPx-100)/2;
    return {lines:[{text:"Network I/O",confidence:0.97,box:{x:padding+1,y:padding+1,w:98,h:18}}]};
  }});
  const result=await refine(request);assert.equal(result.lines[0].text,"Network I/O");assert.equal(seen.length,2);
  assert.equal(request.ocr.lines[0].text,"Network I/O,");assert.deepEqual(fs.readdirSync(request.root),["source.png"]);
});

test("same-text crop agreement retains raw confidence and cannot rewrite source wording",async t=>{
  const request=setup(t),before=structuredClone(request.ocr);
  const refine=createSourceOcrRefiner({provider:"test-ocr",recognize:async input=>{
    const padding=(input.dimensions.widthPx-100)/2;
    return {lines:[{text:request.ocr.lines[0].text,confidence:padding===16?0.99:0.939,box:{x:padding+1,y:padding+1,w:98,h:18}}]};
  }});
  const result=await refine(request);
  assert.equal(result.lines[0].text,before.lines[0].text);assert.equal(result.lines[0].confidence,0.939);
  assert.equal(result.lines[0].confidenceEvidence.originalConfidence,0.82);
  assert.deepEqual(request.ocr,before);assert.deepEqual(fs.readdirSync(request.root),["source.png"]);
});

test("source mutation during crop recognition invalidates confidence evidence and cleans owned files",async t=>{
  const request=setup(t);let calls=0;
  const refine=createSourceOcrRefiner({provider:"test-ocr",recognize:async()=>{
    calls++;const bytes=fs.readFileSync(request.sourceFile);bytes[bytes.length-1]^=1;fs.writeFileSync(request.sourceFile,bytes);
    return {lines:[{text:request.ocr.lines[0].text,confidence:0.99,box:{x:17,y:17,w:98,h:18}}]};
  }});
  await assert.rejects(refine(request),/source changed/u);assert.equal(calls,1);
  assert.deepEqual(fs.readdirSync(request.root),["source.png"]);
});
test("refiner avoids rechecking complete high-confidence text and foreign ownership",async t=>{
  const request=setup(t);let calls=0;const refine=createSourceOcrRefiner({provider:"test-ocr",recognize:async()=>{calls++;throw new Error("unexpected");}});
  request.ocr.lines[0].confidence=0.99;assert.equal((await refine(request)).lines.length,1);
  request.ocr.lines[0].confidence=0.82;request.ocr.lines.push({text:"Neighbor",confidence:0.99,box:{x:144,y:51,w:40,h:18}});
  assert.equal((await refine(request)).lines.length,2);assert.equal(calls,0);
});
test("recognition failure is propagated with owned crops cleaned",async t=>{
  const request=setup(t),failure=new Error("engine failed");
  const refine=createSourceOcrRefiner({provider:"test-ocr",recognize:async()=>{throw failure;}});
  await assert.rejects(refine(request),error=>error===failure);assert.deepEqual(fs.readdirSync(request.root),["source.png"]);
});
test("missing recognition confidence and accessor requests are not trusted",async t=>{
  const request=setup(t),refine=createSourceOcrRefiner({provider:"test-ocr",recognize:async()=>({lines:[{text:"Network I/O",box:{x:17,y:17,w:98,h:18}}]})});
  await assert.rejects(refine(request),/confidence/u);assert.deepEqual(fs.readdirSync(request.root),["source.png"]);
  let calls=0;const accessor={...request};Object.defineProperty(accessor,"sourceFile",{get(){calls++;return request.sourceFile;}});
  await assert.rejects(refine(accessor));assert.equal(calls,0);
});
test("cancellation between crop calls stops inference and cleans owned files",async t=>{
  const request=setup(t);let cancelled=false,calls=0;
  request.isCancellationRequested=async()=>cancelled;
  const refine=createSourceOcrRefiner({provider:"test-ocr",recognize:async()=>{calls++;cancelled=true;return {lines:[]};}});
  await assert.rejects(refine(request),/cancelled/u);assert.equal(calls,1);assert.deepEqual(fs.readdirSync(request.root),["source.png"]);
});
test("invalid dependencies, changed image dimensions and outside-root inputs fail closed",async t=>{
  for(const dependencies of [{recognize:null,provider:"ocr"},{recognize:async()=>{},provider:"unsafe\nprovider"}]) assert.throws(()=>createSourceOcrRefiner(dependencies));
  const request=setup(t),refine=createSourceOcrRefiner({provider:"test-ocr",recognize:async()=>({lines:[]})});
  await assert.rejects(refine({...request,dimensions:{widthPx:301,heightPx:180}}),/dimensions/u);
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),"ocr-outside-"));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
  const source=path.join(outside,"source.png");fs.copyFileSync(request.sourceFile,source);
  await assert.rejects(refine({...request,sourceFile:source}),/source/u);
  const alias=path.join(outside,"root-link");fs.symlinkSync(request.root,alias,"junction");
  await assert.rejects(refine({...request,root:alias,sourceFile:path.join(alias,"source.png")}),/source/u);
});
test("crop sampling remains bounded and cleans up before an oversized second inference",async t=>{
  const request=setup(t);request.dimensions={widthPx:2000,heightPx:2000};
  writePng(request.sourceFile,{width:2000,height:2000,rgba:Buffer.alloc(2000*2000*4,255)});
  request.ocr.lines[0].box={x:100,y:100,w:1500,h:1500};let calls=0;
  const refine=createSourceOcrRefiner({provider:"test-ocr",recognize:async()=>{calls++;return {lines:[]};}});
  await assert.rejects(refine(request),/budget/u);assert.equal(calls,1);assert.deepEqual(fs.readdirSync(request.root),["source.png"]);
});
test("native reconstruction admits refined OCR before projection and keeps the input snapshot unchanged",async t=>{
  const request=setup(t);let projected;
  const rebuild=createRawImageNativeRebuilder({refineSourceOcr:async input=>{
    assert.ok(input.sourceFile.endsWith(path.join("normalized","001.png")));
    return {lines:[{...input.ocr.lines[0],text:"Network I/O",confidence:0.97}]};
  },rebuildDeckFromWorkDir:workDir=>{
    projected=JSON.parse(fs.readFileSync(path.join(workDir,"ir","deck.json")));
    return {slideSize:projected.slideSize,pages:[{source:{},intent:{},images:[],textBoxes:[],shapes:[]}]};
  }});
  await rebuild({root:request.root,metadata:{inputFile:request.sourceFile,assetPath:"assets/source.png",dimensions:request.dimensions},ocr:request.ocr,isCancellationRequested:request.isCancellationRequested});
  assert.equal(projected.pages[0].textBoxes[0].text,"Network I/O");assert.equal(request.ocr.lines[0].text,"Network I/O,");
});
test("native reconstruction rejects invalid or failed OCR refiners before generator execution",async t=>{
  assert.throws(()=>createRawImageNativeRebuilder({refineSourceOcr:true,rebuildDeckFromWorkDir(){}}),/OCR refiner/u);
  for(const refineSourceOcr of [async()=>({lines:[{text:"Bad",box:{x:-1,y:1,w:20,h:10}}]}),async()=>{throw new Error("recognition failed");}]) {
    const request=setup(t);let calls=0;
    const rebuild=createRawImageNativeRebuilder({refineSourceOcr,rebuildDeckFromWorkDir(){calls++;return {};}});
    await assert.rejects(rebuild({root:request.root,metadata:{inputFile:request.sourceFile,assetPath:"assets/source.png",dimensions:request.dimensions},ocr:request.ocr,isCancellationRequested:request.isCancellationRequested}));
    assert.equal(calls,0);
  }
});

test("scene planning, preflight and final projection bind the same refined source frame",async t=>{
  const request=setup(t),order=[];let projected,plannedRef,preflightRef;
  const refinedBox={x:42,y:51,w:96,h:18};
  const rebuild=createRawImageNativeRebuilder({
    refineSourceOcr:async input=>{
      order.push("refine");return {lines:[{...input.ocr.lines[0],box:refinedBox}]};
    },
    reviewSourceScene:async input=>{
      order.push("review");assert.deepEqual(input.ocr.lines[0].box,refinedBox);
      plannedRef=sourceLabelIdentity(input.ocr.lines[0].box,input.dimensions);
      input.preflightSourceScene({});return {ocr:input.ocr,evidence:{}};
    },
    preflightSourceScene:input=>{preflightRef=input.page.textBoxes[0].source.ocrLabelRef;},
    rebuildDeckFromWorkDir:workDir=>{
      order.push("project");projected=JSON.parse(fs.readFileSync(path.join(workDir,"ir","deck.json")));
      return {slideSize:projected.slideSize,pages:[{source:{},intent:{},images:[],textBoxes:[],shapes:[]}]};
    }
  });
  await rebuild({root:request.root,metadata:{inputFile:request.sourceFile,assetPath:"assets/source.png",dimensions:request.dimensions},ocr:request.ocr,isCancellationRequested:request.isCancellationRequested});
  assert.deepEqual(order,["refine","review","project"]);
  assert.equal(plannedRef,preflightRef);assert.equal(plannedRef,projected.pages[0].textBoxes[0].source.ocrLabelRef);
  assert.notEqual(plannedRef,sourceLabelIdentity(request.ocr.lines[0].box,request.dimensions));
  assert.deepEqual(request.ocr.lines[0].box,{x:40,y:50,w:100,h:20});
});

test("failed, invalid or cancelled refinement prevents scene dispatch",async t=>{
  const hostile={};Object.defineProperty(hostile,"lines",{get(){throw new Error("accessor invoked");}});
  for(const result of [null,{lines:[{text:"Bad",box:{x:-1,y:1,w:20,h:10}}]},hostile,
    {lines:Array.from({length:10001},()=>({}))},"failure","cancelled"]) {
    const request=setup(t);let cancelled=false,reviews=0,projections=0;
    const rebuild=createRawImageNativeRebuilder({
      refineSourceOcr:async()=>{if(result==="failure")throw new Error("recognition failed");
        if(result==="cancelled"){cancelled=true;return request.ocr;}return result;},
      reviewSourceScene:async()=>{reviews++;return null;},
      rebuildDeckFromWorkDir:()=>{projections++;return {};}
    });
    await assert.rejects(rebuild({root:request.root,metadata:{inputFile:request.sourceFile,assetPath:"assets/source.png",dimensions:request.dimensions},ocr:request.ocr,isCancellationRequested:async()=>cancelled}),error=>{
      assert.notEqual(error.message,"accessor invoked");return true;
    });
    assert.equal(reviews,0);assert.equal(projections,0);
  }
});

test("empty refined OCR and scene-retired graphic labels stay absent from final projection",async t=>{
  for(const empty of [true,false]) {
    const request=setup(t);let projected,refinements=0;
    const rebuild=createRawImageNativeRebuilder({
      refineSourceOcr:async()=>{refinements++;return empty?{lines:[]}:request.ocr;},
      reviewSourceScene:async input=>{
        assert.equal(input.ocr.lines.length,empty?0:1);
        return {ocr:{lines:[]},evidence:{}};
      },
      rebuildDeckFromWorkDir:workDir=>{
        projected=JSON.parse(fs.readFileSync(path.join(workDir,"ir","deck.json")));
        return {slideSize:projected.slideSize,pages:[{source:{},intent:{},images:[],textBoxes:[],shapes:[]}]};
      }
    });
    await rebuild({root:request.root,metadata:{inputFile:request.sourceFile,assetPath:"assets/source.png",dimensions:request.dimensions},ocr:request.ocr,isCancellationRequested:request.isCancellationRequested});
    assert.equal(refinements,1);assert.deepEqual(projected.pages[0].textBoxes,[]);
    assert.equal(request.ocr.lines.length,1);
  }
});

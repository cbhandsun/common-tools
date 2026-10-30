// @ts-check
'use strict';
/** Complete installed Worker factory, real transport decoder and native source
 * compilation; deterministic provider/rebuild adapters only. No model, OCR,
 * renderer, external service or Office is invoked. Fixed output stages only. */
function sceneProgramConsumerProbe(){return String.raw`
(async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
 const root=path.resolve(process.argv[1]),parent=fs.realpathSync(os.tmpdir());let temporary,stage='worker-program-cold-load';
 try{
  const {createNativeRebuilder}=require(path.join(root,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js'));
  const {createSceneVisionClient}=require(path.join(root,'packages/remote-mcp-server/source-scene-client.js'));
  const {writePng,readPng,cropPng}=require(path.join(root,'packages/slideclone-core/png.js'));
  const {registerSourceCrop}=require(path.join(root,'packages/slideclone-core/scene-plan/source-crop-registration.js'));
  const {pxToPtBox}=require(path.join(root,'packages/slideclone-core/scene-plan/raster-native-detection.js'));
  stage='worker-program-fixture';temporary=fs.mkdtempSync(path.join(parent,'common-tools-installed-program-'));
  const image={width:250,height:100,rgba:Buffer.alloc(250*100*4,255)},put=(x,y,c)=>image.rgba.set([...c,255],(y*250+x)*4);
  for(const x of [20,170])for(let y=20;y<60;y++)for(let xx=x;xx<x+50;xx++)put(xx,y,xx<x+2||xx>=x+48||y<22||y>=58?[15,15,15]:[210,230,245]);
  for(let x=70;x<=168;x++)for(let dy=-1;dy<=1;dy++)put(x,40+dy,[30,60,90]);
  for(let x=163;x<=168;x++)for(let dy=-(168-x);dy<=168-x;dy++)put(x,40+dy,[30,60,90]);
  const inputFile=path.join(temporary,'source.png');writePng(inputFile,image);
  const scene={coordinateSpace:'source-pixels',regions:[{id:'owner',parentId:null,kind:'diagram',box:{x:0,y:0,w:250,h:100}}],inventory:[['owner',2,0,1]],
   objects:[20,170].map((x,i)=>({id:'node'+i,regionId:'owner',kind:'container',box:{x,y:20,w:50,h:40},pictorialContent:'absent'})),
   relations:[{id:'link',regionId:'owner',fromId:'node0',toId:'node1',direction:'forward',shaftBox:{x:70,y:34,w:99,h:13}}],programs:[]};
  let globals=0,locals=0,programs=0,rebuilds=0,dashApproximation=false;
  const recognize=request=>createSceneVisionClient({endpoint:'https://fixture.invalid/v1/chat/completions',model:'fixture-model',token:'fixture-only',enforceLocalSchema:true,
   fetchImpl:async(_url,init)=>{
    const body=JSON.parse(init.body);assert.equal(body.max_tokens,6000);let reply;
    if(request.task==='structure'){globals++;reply={scene,reviews:[],missingText:[]};}
    else {locals++;const t=request.localTargets;
     reply={reviewsByIndex:Object.fromEntries(t.reviews.map(i=>[i,'text'])),recoveredByIndex:Object.fromEntries(t.missing.map(i=>[i,{text:null,confidence:0,box_2d:null,color:null}])),
      ...(t.structures?{structuresByIndex:Object.fromEntries(t.structures.map(i=>[i,{kind:'unknown',confidence:0,regionId:null,box_2d:null,nativeGeometry:null}]))}:{}),
      ...(t.inventories?{inventoriesByIndex:Object.fromEntries(t.inventories.map(i=>[i,{kind:'unknown',confidence:0,regionId:null,box_2d:null}]))}:{}),
      ...(t.relations?{relationsByIndex:Object.fromEntries(t.relations.map(i=>[i,{fromId:null,toId:null,direction:'unknown',confidence:0}]))}:{}),
      ...(t.regionInventories?{regionInventoriesByIndex:Object.fromEntries(t.regionInventories.map(i=>{
       const binding=t.regionProgramBindings?.[i];if(binding){programs++;assert.ok(body.response_format.json_schema.schema.properties.regionInventoriesByIndex.properties[i].properties.program);}
       return [i,{units:[],relations:[],...(t.regionBoundaryIndices?.includes(i)?{boundary:{confidence:0,box_2d:null}}:{}),
        ...(binding?{program:{objects:binding.objects,relations:binding.relations,labels:binding.labels.length?[{refs:binding.labels,family:'KaiTi',weight:'bold',sizePt:null,role:null}]:[]}}:{})}];
      }))}:{})};
    }
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply)}}]}));
   }})(request);
  stage='worker-program-factory';
  const rebuild=createNativeRebuilder({rawImageOcrProfile:{kind:'umi'}},{environment:{},sceneVision:recognize,loadImplementation:()=>({rebuildDeckFromWorkDir(work,controls){
   rebuilds++;const deck=JSON.parse(fs.readFileSync(path.join(work,'ir/deck.json'),'utf8'));
   deck.pages[0].textBoxes=deck.pages[0].textBoxes.map(text=>({...text,font:{...text.font,opacity:1},style:{...text.style,visibility:'visible',opacity:1}}));
   if(dashApproximation){const sx=deck.slideSize.widthPt/250,sy=deck.slideSize.heightPt/100;
    deck.pages[0].shapes.push({id:'legacy-dash-approximation',type:'line',box:{x:60*sx,y:40*sy,w:120*sx,h:0},
     style:{stroke:'#334455',strokeWidthPt:4*sy,connectorType:'straight'},source:{nativeRebuild:true,detector:'visual-atom-native-connector',layerSourceId:'fixture-crop'}});
    const pixelBox={x:140,y:40,w:45,h:20},crop=cropPng(image,pixelBox),file=path.join(controls.irDir,'assets/fixture-crop.png');
    fs.mkdirSync(path.dirname(file),{recursive:true});writePng(file,crop);
    const item={id:'fixture-crop',assetPath:'assets/fixture-crop.png',box:pxToPtBox(pixelBox,image,deck.slideSize),source:{nativeRebuild:true}};
    registerSourceCrop(image,pixelBox,file,crop,item.box);deck.pages[0].images.push(item);
   }
   return deck;
  }})});
  stage='worker-program-reconstruction';
  const result=await rebuild({root:temporary,metadata:{inputFile,assetPath:'assets/source.png',dimensions:{widthPx:250,heightPx:100}},
   ocr:{lines:[30,180].map((x,i)=>({text:'fixture label '+i,confidence:.99,box:{x,y:28,w:20,h:10}}))},isCancellationRequested:async()=>false});
  stage='worker-program-calls';
  assert.deepEqual([globals,locals,programs,rebuilds],[1,2,2,1]);
  const page=result.deck.pages[0],compiled=page.source.sourceScene;
  stage='worker-program-completion';assert.equal(compiled.regionPrograms.completed,1);
  stage='worker-program-relation';assert.equal(compiled.resolvedRelations,1);
  stage='worker-program-unresolved';assert.deepEqual(compiled.unresolved,[]);
  stage='worker-program-labels';
  assert.equal(page.textBoxes.length,2);for(const text of page.textBoxes){assert.equal(text.font.family,'KaiTi');assert.equal(text.font.weight,'bold');}
  stage='worker-program-native-members';
  // Final overlay ungrouping deliberately removes nativeComponent* metadata.
  // Verify the surviving drawing, source identity and live endpoint bindings.
  const members=[...page.shapes,...page.textBoxes,...page.images];
  assert.equal(new Set(members.map(member=>member.id)).size,members.length);
  const links=page.shapes.filter(shape=>shape.source?.sceneInventoryId==='relation-link');
  assert.equal(links.length,1);const link=links[0];
  assert.equal(link.type,'line');assert.equal(link.source.editable,true);
  assert.equal(link.source.semanticNativeStructure,true);assert.equal(link.source.role,'relationship');
  assert.ok(link.style.stroke&&link.style.stroke!=='none'&&link.style.strokeWidthPt>0);
  assert.equal(link.style.endArrow,'triangle');
  const endpoints=[link.style.startAnchor?.elementId,link.style.endAnchor?.elementId];
  assert.ok(endpoints.every(id=>typeof id==='string'));assert.notEqual(endpoints[0],endpoints[1]);
  for(let index=0;index<2;index++){
   const nodes=page.shapes.filter(shape=>shape.id===endpoints[index]);assert.equal(nodes.length,1);
   assert.equal(nodes[0].source?.sceneInventoryId,'object-node'+index);assert.equal(nodes[0].source?.editable,true);
  }
  assert.deepEqual(link.source.sourceNodeIds,endpoints);
  // Exercise the changed paint proof through this same installed Worker,
  // transport and final compiler. Every interval and the covered terminal
  // must survive; an independently foreign head must remain unresolved.
  for(const foreign of [false,true]){
   dashApproximation=true;
   stage='worker-program-dash-fixture';
   for(let x=70;x<=168;x++)for(let y=34;y<=46;y++)put(x,y,[255,255,255]);
   for(const [lo,hi] of [[74,85],[96,108],[119,129]])for(let x=lo;x<=hi;x++)for(let y=39;y<=41;y++)put(x,y,[30,60,90]);
   for(let x=140;x<=165;x++){
    const radius=x>=159?165-x:1,alpha=(x-140)%2?.4:.8,color=foreign?[160,20,40]:[30,60,90];
    for(let y=40-radius;y<=40+radius;y++)put(x,y,color.map(v=>Math.round(v*alpha+255*(1-alpha))));
   }
   const job=path.join(temporary,foreign?'foreign-dash':'covered-dash');fs.mkdirSync(job);
   const dashFile=path.join(job,'source.png');writePng(dashFile,image);
   stage=foreign?'worker-program-dash-foreign':'worker-program-dash-confirmed';
   const observed=await rebuild({root:job,metadata:{inputFile:dashFile,assetPath:'assets/source.png',dimensions:{widthPx:250,heightPx:100}},
    ocr:{lines:[30,180].map((x,i)=>({text:'fixture label '+i,confidence:.99,box:{x,y:28,w:20,h:10}}))},isCancellationRequested:async()=>false});
   const compiled=observed.deck.pages[0],members=compiled.shapes.filter(s=>s.source?.sceneInventoryId==='relation-link');
   const approximations=compiled.shapes.filter(s=>s.id.startsWith('legacy-dash-approximation'));
   if(foreign){assert.equal(compiled.source.sourceScene.resolvedRelations,0);assert.deepEqual(members,[]);}
   else{
    assert.equal(compiled.source.sourceScene.resolvedRelations,1);assert.equal(members.length,1);
    const dash=members[0];assert.equal(dash.source.detector,'source-scene-visible-gap');
    assert.equal(dash.style.stroke.toUpperCase(),'#1E3C5A');assert.equal(JSON.parse(dash.style.strokeDashPattern).length,4);
    assert.equal(dash.style.endArrow,'triangle');
    for(const key of ['startAnchor','endAnchor'])assert.ok(compiled.shapes.some(s=>s.id===dash.style[key].elementId));
   }
   stage=foreign?'worker-program-dash-retained':'worker-program-dash-retired';
   const sx=observed.deck.slideSize.widthPt/250,sy=observed.deck.slideSize.heightPt/100;
   const expected=foreign?[{x:60,y:40,w:120,h:0}]:[{x:60,y:40,w:13.5,h:0},{x:165.5,y:40,w:14.5,h:0}];
   assert.equal(approximations.length,expected.length);
   for(let i=0;i<expected.length;i++)for(const key of ['x','y','w','h'])assert.ok(Math.abs(approximations[i].box[key]/(['x','w'].includes(key)?sx:sy)-expected[i][key])<1e-7);
   if(!foreign){
    assert.equal(compiled.source.sourceScene.replacedConnectors.clipped.length,1);
   }
   stage=foreign?'worker-program-crop-retained':'worker-program-crop-erased';
   const item=compiled.images.find(s=>s.id==='fixture-crop');assert.ok(item);
   const before=readPng(path.join(job,'assets/fixture-crop.png')),after=readPng(path.join(job,item.assetPath));let erased=0;
   assert.equal(after.width,45);assert.equal(after.height,20);
   for(let n=0;n<45*20;n++){
    assert.deepEqual(after.rgba.subarray(n*4,n*4+3),before.rgba.subarray(n*4,n*4+3));
    const x=140+n%45,y=40+Math.floor(n/45),radius=x>=159?165-x:1;
    const owned=!foreign&&x<=165&&y-40<=radius;
    assert.equal(after.rgba[n*4+3],owned?0:255);if(owned)erased++;
   }
   if(foreign){assert.equal(item.assetPath,'assets/fixture-crop.png');assert.deepEqual(compiled.source.sourceScene.replacedConnectors.erasedImages,[]);}
   else{
    assert.notEqual(item.assetPath,'assets/fixture-crop.png');assert.ok(erased>0);
    assert.deepEqual(compiled.source.sourceScene.replacedConnectors.erasedImages,[{id:'fixture-crop',erasedPixels:erased,replacementIds:[members[0].id]}]);
   }
  }
  // The small detached head has no invented body. Two complete ordinary
  // dashes witness each observed color; the actual Worker must carry the
  // source-space gradient, native gaps and live anchors to the final deck.
  dashApproximation=false;
  for(const foreign of [false,true]){
   for(let x=70;x<=168;x++)for(let y=34;y<=46;y++)put(x,y,[255,255,255]);
   for(const [lo,hi,color] of [[74,81,[30,60,90]],[89,96,[30,60,90]],[104,111,[100,140,200]],[119,126,[100,140,200]]])
    for(let x=lo;x<=hi;x++)for(let y=39;y<=41;y++)put(x,y,color);
   for(let x=132;x<=138;x++)for(let y=40-(138-x);y<=40+(138-x);y++)put(x,y,foreign?[180,10,100]:[100,140,200]);
   const job=path.join(temporary,foreign?'foreign-detached':'spatial-detached');fs.mkdirSync(job);
   const file=path.join(job,'source.png');writePng(file,image);
   stage=foreign?'worker-program-detached-foreign':'worker-program-detached-confirmed';
   const observed=await rebuild({root:job,metadata:{inputFile:file,assetPath:'assets/source.png',dimensions:{widthPx:250,heightPx:100}},
    ocr:{lines:[30,180].map((x,i)=>({text:'fixture label '+i,confidence:.99,box:{x,y:28,w:20,h:10}}))},isCancellationRequested:async()=>false});
   const compiled=observed.deck.pages[0],members=compiled.shapes.filter(s=>s.source?.sceneInventoryId==='relation-link');
   if(foreign){assert.equal(compiled.source.sourceScene.resolvedRelations,0);assert.deepEqual(members,[]);}
   else{
    assert.equal(compiled.source.sourceScene.resolvedRelations,1);assert.equal(members.length,1);
    const dash=members[0];assert.equal(dash.source.detector,'source-scene-visible-gap');assert.equal(dash.style.strokeGradient.angleDeg,0);
    assert.deepEqual(dash.style.strokeGradient.stops.map(s=>s.color),['#1E3C5A','#1E3C5A','#648CC8','#648CC8']);
    assert.equal(JSON.parse(dash.style.strokeDashPattern).length,5);assert.equal(dash.style.endArrow,'triangle');
    for(const key of ['startAnchor','endAnchor'])assert.ok(compiled.shapes.some(s=>s.id===dash.style[key].elementId));
   }
  }
  stage='ready';
 }catch{process.exitCode=2;}
 finally{if(temporary){if(path.dirname(temporary)!==parent||!path.basename(temporary).startsWith('common-tools-installed-program-')){stage='worker-program-cleanup';process.exitCode=2;}
  else try{fs.rmSync(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{stage='worker-program-cleanup';process.exitCode=2;}}}
 process.stdout.write(stage);
})().catch(()=>{process.stdout.write('worker-program-consumer-failed');process.exitCode=2;});
`;}
module.exports={sceneProgramConsumerProbe};

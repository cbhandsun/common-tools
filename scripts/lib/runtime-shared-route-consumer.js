// @ts-check
'use strict';
/** Actual Worker factory and source compiler, with deterministic provider and
 * native-rebuild adapters. Runs from the installed package root; does not call
 * any model, OCR, renderer, service or Office. Only fixed stage codes escape.
 */
function sceneSharedRouteConsumerProbe(){return String.raw`
(async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
 const root=path.resolve(process.argv[1]),parent=fs.realpathSync(os.tmpdir());let temporary,stage='worker-shared-cold-load';
 try{
  const {createNativeRebuilder}=require(path.join(root,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js'));
  const {createSceneVisionClient}=require(path.join(root,'packages/remote-mcp-server/source-scene-client.js'));
  const {writePng}=require(path.join(root,'packages/slideclone-core/png.js'));
  const {unpackSceneInventoryMembers}=require(path.join(root,'packages/slideclone-core/source-scene-inventory-codec.js'));
  const {survivingSharedSceneRoutes}=require(path.join(root,'packages/slideclone-core/source-scene-shared-route-inventory.js'));
  stage='worker-shared-fixture';temporary=fs.mkdtempSync(path.join(parent,'common-tools-installed-shared-'));
  for(const mixed of [false,true]){
   const job=path.join(temporary,mixed?'mixed':'both-arrows');fs.mkdirSync(job);
   const image={width:300,height:230,rgba:Buffer.alloc(300*230*4,255)},put=(x,y,c=[30,60,90])=>image.rgba.set([...c,255],(y*300+x)*4);
   const boxes=[{x:130,y:20,w:40,h:30},{x:30,y:170,w:240,h:30}];
   for(const b of boxes)for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++)put(x,y,[210,230,245]);
   for(let y=50;y<=110;y++)for(let x=149;x<=151;x++)put(x,y);
   for(let y=109;y<=111;y++)for(let x=50;x<=250;x++)put(x,y);
   for(const x of [50,250]){
    for(let y=110;y<170;y++)for(let xx=x-1;xx<=x+1;xx++)put(xx,y);
    if(!mixed||x===50)for(let y=164;y<170;y++)for(let xx=x-(169-y);xx<=x+(169-y);xx++)put(xx,y);
   }
   const inputFile=path.join(job,'source.png');writePng(inputFile,image);const pixels=Buffer.from(fs.readFileSync(inputFile));
   const scene={coordinateSpace:'source-pixels',relationObservationUnit:'logical-relations-v1',
    regions:[{id:'owner',parentId:null,kind:'diagram',box:{x:0,y:0,w:300,h:230}}],inventory:[['owner',2,0,2]],
    objects:boxes.map((box,i)=>({id:i?'target':'source',regionId:'owner',kind:'container',box,pictorialContent:'absent'})),
    relations:[45,245].map((x,i)=>({id:i?'right':'left',regionId:'owner',fromId:'source',toId:'target',direction:mixed&&i?'undirected':'forward',shaftBox:{x,y:125,w:10,h:30}})),programs:[]};
   let globals=0,locals=0,rebuilds=0;
   const recognize=request=>createSceneVisionClient({endpoint:'https://fixture.invalid/v1/chat/completions',model:'fixture-model',token:'fixture-only',enforceLocalSchema:true,
    fetchImpl:async(_url,init)=>{
     const body=JSON.parse(init.body);assert.equal(body.max_tokens,6000);let reply;
     if(request.task==='structure'){globals++;reply={scene,reviews:[],missingText:[]};}
     else{locals++;const t=request.localTargets;reply={
      reviewsByIndex:Object.fromEntries(t.reviews.map(i=>[i,'text'])),recoveredByIndex:Object.fromEntries(t.missing.map(i=>[i,{text:null,confidence:0,box_2d:null,color:null}])),
      ...(t.structures?{structuresByIndex:Object.fromEntries(t.structures.map(i=>[i,{kind:'unknown',confidence:0,regionId:null,box_2d:null,nativeGeometry:null}]))}:{}),
      ...(t.inventories?{inventoriesByIndex:Object.fromEntries(t.inventories.map(i=>[i,{kind:'unknown',confidence:0,regionId:null,box_2d:null}]))}:{}),
      ...(t.relations?{relationsByIndex:Object.fromEntries(t.relations.map(i=>[i,{fromId:null,toId:null,direction:'unknown',confidence:0}]))}:{}),
      ...(t.regionInventories?{regionInventoriesByIndex:Object.fromEntries(t.regionInventories.map(i=>{
       const binding=t.regionProgramBindings?.[i];return [i,{units:[],relations:[],
        ...(t.regionBoundaryIndices?.includes(i)?{boundary:{confidence:0,box_2d:null}}:{}),
        ...(binding?{program:{objects:binding.objects,relations:binding.relations,labels:binding.labels.length?[{refs:binding.labels,family:null,weight:null,sizePt:null,role:null}]:[]}}:{})}];
      }))}:{})};}
     return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply)}}]}));
    }})(request);
   stage='worker-shared-factory';
   const rebuild=createNativeRebuilder({rawImageOcrProfile:{kind:'umi'}},{environment:{},sceneVision:recognize,
    loadImplementation:()=>({rebuildDeckFromWorkDir(work){
     rebuilds++;const deck=JSON.parse(fs.readFileSync(path.join(work,'ir/deck.json'),'utf8'));
     const sx=deck.slideSize.widthPt/300,sy=deck.slideSize.heightPt/230;
     deck.pages[0].textBoxes=deck.pages[0].textBoxes.map(text=>({...text,font:{...text.font,opacity:1},style:{...text.style,visibility:'visible',opacity:1}}));
     deck.pages[0].shapes.push({id:'prior-shared-arrow',type:'line',box:{x:50*sx,y:110*sy,w:0,h:59*sy},
      style:{fill:'none',stroke:'#1E3C5A',strokeWidthPt:3*(sx+sy)/2,endArrow:'triangle'},source:{nativeRebuild:true,semanticNativeStructure:true}});
     return deck;
    }})});
   stage='worker-shared-reconstruction';
   const result=await rebuild({root:job,metadata:{inputFile,assetPath:'assets/source.png',dimensions:{widthPx:300,heightPx:230}},
    ocr:{lines:[{text:'fixture source',confidence:.99,box:{x:136,y:28,w:20,h:9}},{text:'fixture target',confidence:.99,box:{x:100,y:180,w:30,h:9}}]},isCancellationRequested:async()=>false});
   stage='worker-shared-calls';assert.deepEqual([globals,locals,rebuilds],[1,2,1]);
   const page=result.deck.pages[0],compiled=page.source.sourceScene;
   stage='worker-shared-completion';assert.equal(compiled.resolvedRelations,2);assert.equal(compiled.regionPrograms.completed,1);assert.deepEqual(compiled.unresolved,[]);
   stage='worker-shared-inventory';const inventory=unpackSceneInventoryMembers(compiled.observedInventory);
   assert.equal(inventory.version,5);assert.equal(inventory.sharedRouteGraphs.length,1);const graph=inventory.sharedRouteGraphs[0];
   assert.equal(graph.paths.length,2);assert.equal(graph.nodes.filter(n=>n.endpointId==='object-target').length,2);
   stage='worker-shared-native-members';
   const members=[...page.shapes,...page.textBoxes,...page.images];assert.equal(new Set(members.map(member=>member.id)).size,members.length);
   const actual=new Map(page.shapes.map(shape=>[shape.id,shape]));
   for(const node of graph.nodes)assert.ok(actual.has(node.nativeId));
   for(const edge of graph.edges){const shape=actual.get(edge.memberId);assert.equal(shape.type,'line');
    assert.equal(shape.source.editable,true);assert.equal(shape.source.semanticNativeStructure,true);
    assert.equal(shape.style.startAnchor.elementId,graph.nodes.find(n=>n.id===edge.from).nativeId);
    assert.equal(shape.style.endAnchor.elementId,graph.nodes.find(n=>n.id===edge.to).nativeId);
   }
   const common=graph.paths[0].edges.filter(a=>graph.paths[1].edges.some(b=>a.id===b.id));assert.equal(common.length,1);
   const trunk=graph.edges.find(edge=>edge.id===common[0].id);assert.equal(page.shapes.filter(shape=>shape.id===trunk.memberId).length,1);
   assert.equal(graph.edges.filter(edge=>{const s=actual.get(edge.memberId);return s.style.startArrow||s.style.endArrow;}).length,mixed?1:2);
   const surviving=shapes=>survivingSharedSceneRoutes([graph],shapes,page.images,inventory.units,inventory.endpointBindings??[],page.textBoxes);
   assert.equal(surviving(page.shapes).size,2);
   assert.equal(surviving(page.shapes.filter(shape=>shape.id!==trunk.memberId)).size,0);
   stage='worker-shared-retirement';assert.equal(page.shapes.some(shape=>shape.id==='prior-shared-arrow'),false);
   assert.ok(compiled.replacedConnectors.removed.some(row=>row.id==='prior-shared-arrow'));
   assert.deepEqual(fs.readFileSync(inputFile),pixels);
  }
  stage='ready';
 }catch{process.exitCode=2;}
 finally{if(temporary){if(path.dirname(temporary)!==parent||!path.basename(temporary).startsWith('common-tools-installed-shared-')){stage='worker-shared-cleanup';process.exitCode=2;}
  else try{fs.rmSync(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{stage='worker-shared-cleanup';process.exitCode=2;}}}
 process.stdout.write(stage);
})().catch(()=>{process.stdout.write('worker-shared-consumer-failed');process.exitCode=2;});
`;}
module.exports={sceneSharedRouteConsumerProbe};

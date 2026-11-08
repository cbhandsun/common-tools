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
  const {createNativeRebuilder,workerSettings}=require(path.join(root,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js'));
  const {createSceneVisionClient}=require(path.join(root,'packages/remote-mcp-server/source-scene-client.js'));
  const {writePng,readPngBuffer}=require(path.join(root,'packages/slideclone-core/png.js'));
  const {unpackSceneInventoryMembers}=require(path.join(root,'packages/slideclone-core/scene-plan/source-scene-inventory-codec.js'));
  const {survivingSharedSceneRoutes}=require(path.join(root,'packages/slideclone-core/scene-plan/source-scene-shared-route-inventory.js'));
  stage='worker-shared-default-mode';
  assert.equal(workerSettings({OPENXML_BUILDER_EXE:process.execPath}).connectorCornerMode,'reroutable-elbow');
  stage='worker-shared-ordered-path';
  const {sourceRouteMatchesProgram:orderedPath}=require(path.join(root,'packages/slideclone-core/scene-plan/source-scene-path-program.js'));
  const orderedSource=[{x:0,y:0},{x:20,y:0}],orderedProgram={kind:'polyline',dash:'solid',vertices:[{x:0,y:0},{x:10,y:0},{x:20,y:0}]};
  assert.equal(orderedPath(orderedSource,orderedProgram,{checks:0}),true);
  assert.equal(orderedPath([...orderedSource].reverse(),orderedProgram,{checks:0}),false);
  stage='worker-shared-fixture';temporary=fs.mkdtempSync(path.join(parent,'common-tools-installed-shared-'));
  for(const scenario of ['both-arrows','mixed','network','review-network','partial-network']){
   const mixed=scenario==='mixed',partial=scenario==='partial-network',network=scenario==='network'||scenario==='review-network'||partial,pathReview=scenario==='review-network';
   const job=path.join(temporary,scenario);fs.mkdirSync(job);
   const image={width:300,height:230,rgba:Buffer.alloc(300*230*4,255)},put=(x,y,c=[30,60,90])=>image.rgba.set([...c,255],(y*300+x)*4);
   const boxes=[{x:130,y:20,w:40,h:30},{x:30,y:170,w:240,h:30}];
   for(const b of boxes)for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++)put(x,y,[210,230,245]);
   for(let y=50;y<=110;y++)for(let x=149;x<=151;x++)put(x,y);
   for(let y=109;y<=111;y++)for(let x=50;x<=250;x++)put(x,y);
   for(const x of [50,250]){
    for(let y=110;y<170;y++)for(let xx=x-1;xx<=x+1;xx++)put(xx,y);
    if(!mixed||x===50)for(let y=164;y<170;y++)for(let xx=x-(169-y);xx<=x+(169-y);xx++)put(xx,y);
   }
   if(network){
    for(let y=99;y<=121;y++)for(let x=139;x<=161;x++)put(x,y,[255,255,255]);
    for(let x=138;x<=162;x++)for(let d=-1;d<=1;d++){put(x,98+d);put(x,122+d);}
    for(let y=98;y<=122;y++)for(let d=-1;d<=1;d++){put(138+d,y);put(162+d,y);}
   }
   const inputFile=path.join(job,'source.png');writePng(inputFile,image);const pixels=Buffer.from(fs.readFileSync(inputFile));
   const scene={coordinateSpace:'source-pixels',relationObservationUnit:'logical-relations-v1',
    regions:[{id:'owner',parentId:null,kind:'diagram',box:{x:0,y:0,w:300,h:230}}],inventory:[['owner',2,0,2]],
    objects:boxes.map((box,i)=>({id:i?'target':'source',regionId:'owner',kind:'container',box,pictorialContent:'absent'})),
    relations:[45,245].map((x,i)=>({id:i?'right':'left',regionId:'owner',fromId:'source',toId:'target',direction:mixed&&i?'undirected':'forward',
     shaftBox:network?{x:35,y:45,w:230,h:130}:{x,y:125,w:10,h:30},...(network?{visiblePath:{kind:'polyline',dash:'solid',
      vertices:(i?[[150,50],[150,98],[138,98],[138,122],[162,122],[162,110],[250,110],[250,169]]
       :[[150,50],[150,98],[138,98],[138,110],[50,110],[50,169]]).map(([x,y])=>({x,y}))}}:{})})),programs:[]};
   const sourcePaths=network?scene.relations.map(r=>r.visiblePath):[];
   if(partial){scene.relations.push({...scene.relations[0],id:'pending'});delete scene.relations[2].visiblePath;scene.inventory=[['owner',2,0,3]];}
   if(pathReview)for(const relation of scene.relations)delete relation.visiblePath;
   let globals=0,locals=0,rebuilds=0,pathObservations=0;
   const recognize=request=>createSceneVisionClient({endpoint:'https://fixture.invalid/v1/chat/completions',model:'fixture-model',token:'fixture-only',enforceLocalSchema:true,
    fetchImpl:async(_url,init)=>{
     const body=JSON.parse(init.body);assert.equal(body.max_tokens,6000);let reply;
     if(request.task==='structure'){globals++;reply={scene,reviews:[],missingText:[]};}
     else{locals++;const t=request.localTargets;reply={
      reviewsByIndex:Object.fromEntries(t.reviews.map(i=>[i,'text'])),recoveredByIndex:Object.fromEntries(t.missing.map(i=>[i,{text:null,confidence:0,box_2d:null,color:null}])),
      ...(t.structures?{structuresByIndex:Object.fromEntries(t.structures.map(i=>[i,{kind:'unknown',confidence:0,regionId:null,box_2d:null,nativeGeometry:null}]))}:{}),
      ...(t.inventories?{inventoriesByIndex:Object.fromEntries(t.inventories.map(i=>[i,{kind:'unknown',confidence:0,regionId:null,box_2d:null}]))}:{}),
      ...(t.relations?{relationsByIndex:Object.fromEntries(t.relations.map(i=>{
       if(t.relationEdgePaths?.[i]){
        pathObservations++;
        if(partial)return [i,{fromId:null,toId:null,direction:'unknown',confidence:0,sourceEdgePath:null}];
        assert.equal(pathReview,true);
        assert.ok(body.response_format.json_schema.schema.properties.relationsByIndex.properties[i].required.includes('sourceEdgePath'));
        const catalog=JSON.parse(request.prompt.split('Source networks: ')[1].split('. ')[0])[0];
        assert.equal(catalog.edges.length,6);assert.equal(catalog.contacts.length,6);
        const source=catalog.contacts.find(c=>c.endpointId==='object-source'),ends=catalog.contacts.filter(c=>c.endpointId==='object-target').sort((a,b)=>a.point.x-b.point.x);
        const top=catalog.contacts.find(c=>c.endpointId===null&&catalog.edges.some(e=>(e.from===source.id&&e.to===c.id)||(e.to===source.id&&e.from===c.id)));
        const sides=catalog.contacts.filter(c=>c.endpointId===null&&c.id!==top.id).sort((a,b)=>a.point.x-b.point.x);
        const ordinal=Object.keys(t.relationEdgePaths).indexOf(String(i)),contacts=ordinal?[source,top,sides[0],sides[1],ends[1]]:[source,top,sides[0],ends[0]];
        const steps=contacts.slice(1).map((to,k)=>{const from=contacts[k],edge=catalog.edges.find(e=>e.from===from.id&&e.to===to.id||e.to===from.id&&e.from===to.id);assert.ok(edge);return {id:edge.id,reversed:edge.to===from.id};});
        return [i,{fromId:'object-source',toId:'object-target',direction:'forward',confidence:.99,sourceEdgePath:steps}];
       }
       if(!t.relationPathIndices?.includes(i))return [i,{fromId:null,toId:null,direction:'unknown',confidence:0}];
       pathObservations++;assert.equal(pathReview,true);
       assert.ok(body.response_format.json_schema.schema.properties.relationsByIndex.properties[i].required.includes('visiblePath_2d'));
       const atlas=readPngBuffer(request.images[0].bytes),tile=JSON.parse(request.prompt.split('Targets: ').at(-1)).find(row=>row.index===i);
       const dx=Math.round(tile.cropBox2D[1]*atlas.width/1000),dy=Math.round(tile.cropBox2D[0]*atlas.height/1000);
       const route=sourcePaths[t.relationPathIndices.indexOf(i)];
       return [i,{fromId:'object-source',toId:'object-target',direction:'forward',confidence:.99,
        visiblePath_2d:{...route,vertices:route.vertices.map(p=>({x:Math.round((p.x+dx)*1000/atlas.width),y:Math.round((p.y+dy)*1000/atlas.height)}))}}];
      }))}:{}),
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
   assert.equal(pathObservations,pathReview?4:partial?2:0);
   const page=result.deck.pages[0],compiled=page.source.sourceScene;
   stage='worker-shared-completion';assert.equal(compiled.resolvedRelations,2);assert.equal(compiled.regionPrograms.completed,partial?0:1);
   if(partial){assert.ok(compiled.unresolved.some(r=>r.id==='relation-pending'&&r.detailCode==='shared-relation-ambiguous'));
    assert.equal(page.shapes.some(s=>s.source?.sceneRelationId==='relation-pending'||s.id==='scene-relation-pending'),false);
    assert.deepEqual(compiled.sharedRoutes.rejected,[{ids:['relation-pending'],reason:'shared-relation-ambiguous'}]);
   }else assert.deepEqual(compiled.unresolved,[]);
   stage='worker-shared-inventory';const inventory=unpackSceneInventoryMembers(compiled.observedInventory);
   assert.equal(inventory.version,5);assert.equal(inventory.sharedRouteGraphs.length,1);const graph=inventory.sharedRouteGraphs[0];
   assert.equal(graph.paths.length,2);assert.equal(graph.nodes.filter(n=>n.endpointId==='object-target').length,2);
   if(network){assert.equal(graph.topology,'source-network-v1');assert.equal(graph.edges.length,graph.nodes.length);}
   else assert.equal(graph.topology,undefined);
   stage='worker-shared-native-members';
   const members=[...page.shapes,...page.textBoxes,...page.images];assert.equal(new Set(members.map(member=>member.id)).size,members.length);
   const actual=new Map(page.shapes.map(shape=>[shape.id,shape]));
   const selection=result.deck.meta.nativeRouteSelection,representation=selection.routeRepresentations;
   assert.equal(selection.requestedMode,'reroutable-elbow');assert.equal(representation.requestedMode,'reroutable-elbow');
   assert.equal(graph.rendering,'whole-native-paths-v1');assert.equal(graph.renderedPaths.length,2);
   assert.deepEqual(representation.wholeObjectUnmetRelationIds,partial?['relation-pending']:[]);
   if(network){
    // This fixture's ordered right path has seven orthogonal legs. Keeping
    // its cycle and chosen side exceeds the five-leg Office preset capacity.
    // Exercise refusal explicitly; a surviving freeform is not a connector.
    assert.equal(selection.status,'partial');assert.equal(selection.changed,0);
    assert.deepEqual(selection.rejected,[{id:graph.id,reason:'native-network-unrepresentable'}]);
    assert.deepEqual(selection.unmetRelationIds,partial?['relation-left','relation-right','relation-pending']:['relation-left','relation-right']);
    assert.deepEqual(representation.nativeModeUnmetRelationIds,selection.unmetRelationIds);
    assert.deepEqual(representation.relations.map(row=>row.relationId),selection.unmetRelationIds);
    assert.ok(representation.relations.every(row=>row.requestedNativeModeUnmet&&row.objectStructure===(row.relationId==='relation-pending'?'unavailable':'single-native-path')));
    if(partial)assert.equal(representation.relations.find(row=>row.relationId==='relation-pending').wholeNativeObject,false);
    const {auditSemanticEditability}=require(path.join(root,'packages/slideclone-core/quality/semantic-editability-quality'));
    assert.equal(auditSemanticEditability(result.deck).passed,false);
   }else{
    assert.equal(selection.status,'applied');assert.deepEqual(selection.rejected,[]);assert.deepEqual(selection.unmetRelationIds,[]);
    assert.deepEqual(representation.nativeModeUnmetRelationIds,[]);
   }
   for(const rendered of graph.renderedPaths){const shape=actual.get(rendered.memberId),path=graph.paths.find(p=>p.relationId===rendered.relationId);
    assert.ok(shape&&path);assert.equal(shape.type,network?'freeform':'line');assert.equal(shape.source.sourceRouteParts,1);
    assert.equal(shape.source.editable,true);assert.equal(shape.source.semanticNativeStructure,true);
    const first=path.edges[0],last=path.edges.at(-1),head=graph.edges.find(e=>e.id===first.id),tail=graph.edges.find(e=>e.id===last.id);
    assert.equal(shape.style.startAnchor.elementId,graph.nodes.find(n=>n.id===(first.reversed?head.to:head.from)).nativeId);
    assert.equal(shape.style.endAnchor.elementId,graph.nodes.find(n=>n.id===(last.reversed?tail.from:tail.to)).nativeId);
   }
   const common=graph.paths[0].edges.filter(a=>graph.paths[1].edges.some(b=>a.id===b.id));
   if(network)assert.ok(common.length>=1);else assert.equal(common.length,1);
   const trunk=graph.renderedPaths[0];assert.equal(page.shapes.filter(shape=>shape.id===trunk.memberId).length,1);
   assert.equal(graph.renderedPaths.filter(edge=>{const s=actual.get(edge.memberId);return s.style.startArrow||s.style.endArrow;}).length,mixed?1:2);
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

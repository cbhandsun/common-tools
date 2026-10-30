// @ts-check
"use strict";
const fs=require("node:fs"),crypto=require("node:crypto");
const {readPng}=require("../png");
const {containsSceneBox,sceneObjectBatches}=require("./source-scene-plan");
const {fitSourceTextBand}=require("../typography/source-text-band-evidence");
const {samplePanelBackgroundFill,pixel,rgbToHex}=require("../typography/line-text-native-primitives");
const {withSceneCompilationSession}=require('./source-scene-compilation-session');
const {orderSourceSceneProposals}=require("./source-scene-surface-stage");
const {compileSceneIcon,sceneNativeIconNode,createSceneIconRelationNodes,bindSceneIconSemanticReview,sceneIconSemanticObjectMatches}=require("./source-scene-surface-stage");
const {measureOutlinedSceneContainer,outlineOwnsAxisLine,sceneOutlineWindow}=require("./source-scene-surface-stage");
const {measureSceneRelationDetailed}=require("./source-scene-relation");
const {prepareSceneSourceMeasurements,prepareSceneSurfacePortfolio,readSceneSurfaceSelection,sceneGlyphOcclusionEvidence,sceneGlyphOcclusionScanReserve}=require("./source-scene-surface-stage");
const {proposeSceneTableHeaders,appendSceneTableHeaderBackgrounds,sceneHeaderObjectCapacity}=require("./source-scene-surface-stage");
const {sceneEndpointWithinScope,sceneRelationWithinAnchor,sceneRelationBatches}=require('./source-scene-topology-review');
const {finalizeSourceScene}=require('./source-scene-finalize');
const {compileSceneRelationFallbacks,replaceMeasuredSceneConnectors}=require("./source-scene-routing-stage");
const {compileSharedSceneRoutes}=require("./source-scene-routing-stage");
const {prepareRegionProgramLabels,completeRegionPrograms,currentSceneAdmissionRejections,resolveSceneGlyphRecoveries,sceneGlyphRecoveryIcon}=require('./source-scene-region-completion');
const {completeOpenSceneOwners,retainedOpenSceneOwnerTransaction}=require('./source-scene-open-owner-transaction');
const {compileJointIconRelations}=require("./source-scene-routing-stage");
const {prepareSceneRouteEndpoints,parseSourceRouteChoice,parseSourceRouteCatalogs,summarizeSceneRouteRepresentations,sealSourceNativeNetworks}=require("./source-scene-routing-stage");
const {restoreRegionProgramObligations,effectiveSceneInventoryPlan,sceneInventoryRevisionForPlan}=require('./source-scene-program-obligations');
const {validateCompiledRegionPrograms}=require('./source-scene-region-program');
/** @typedef {import("./source-scene-plan").Box} Box */
/** @typedef {{id?:string,box:Box,source?:Record<string,unknown>,style?:Record<string,unknown>,type?:string}} Item */
/** @param {Box} a @param {Box} b */
function overlap(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));}
/** @typedef {{page:{shapes:Item[],images:Item[],textBoxes:({text:string}&Item)[],source?:Record<string,unknown>},plan:import("./source-scene-plan").ScenePlan,sourceFile:string,root:string,slideSize:{widthPt:number,heightPt:number},compilationSession?:unknown,sourceCropSession?:unknown,sourceIconReview?:unknown,sourceRouteCatalogs?:unknown,deferNativeRoutes?:boolean,preflight?:boolean,surfaceSelection?:boolean,cageProgram?:boolean,spatialExterior?:boolean,jointIconRelations?:boolean,pictorialMode?:"native"|"source-crop",connectorCornerMode?:import("../routing/source-route-corner-mode").ConnectorCornerMode}} CompileInput */
/** @param {CompileInput} input */
function compileSourceScene(input) {
  // Descriptor validation must precede every read, spread and source-bound
  // inventory operation. Provider getters and proxies cannot execute here.
  const surfaceSelection=readSceneSurfaceSelection(input);
  const connectorCornerMode=require("../routing/source-route-corner-mode").parseConnectorCornerMode(input.connectorCornerMode);
  if(input.pictorialMode!==undefined&&!["native","source-crop"].includes(input.pictorialMode))throw new TypeError("Scene pictorial mode is invalid");
  if(input.spatialExterior!==undefined&&typeof input.spatialExterior!=='boolean')throw new TypeError('Scene exterior selection is invalid');
  if(input.cageProgram!==undefined&&typeof input.cageProgram!=='boolean')throw new TypeError('Scene cage control is invalid');
  if(input.jointIconRelations!==undefined&&typeof input.jointIconRelations!=='boolean')throw new TypeError('Scene joint icon control is invalid');
  if(input.preflight!==undefined&&typeof input.preflight!=='boolean')throw new TypeError('Scene compiler source binding is invalid');
  if(input.deferNativeRoutes!==undefined&&typeof input.deferNativeRoutes!=='boolean')throw new TypeError('Scene native route finalization control is invalid');
  input={...input,plan:effectiveSceneInventoryPlan(input.plan,input.sourceFile)};
  const {plan,sourceFile,slideSize}=input;
  const sourceRouteCatalogs=parseSourceRouteCatalogs(input.sourceRouteCatalogs);
  sceneRelationBatches(plan);
  sceneObjectBatches(plan);
  for(const relation of plan.relations)if(relation.sourcePathChoice!==undefined){
    const choice=parseSourceRouteChoice(relation.sourcePathChoice);
    if(relation.visiblePath!==undefined||choice.sourceHash!==plan.sourceHash)throw new TypeError('Scene source edge choice binding is invalid');
  }
  const image=readPng(sourceFile,{maxFileBytes:12*1024*1024,maxPixels:40000000});
  if(image.width!==plan.widthPx||image.height!==plan.heightPx
    ||crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex")!==plan.sourceHash
    ||![slideSize.widthPt,slideSize.heightPt].every(n=>Number.isFinite(n)&&n>0))throw new TypeError("Scene compiler source binding is invalid");
  const opened=withSceneCompilationSession({image,sourceHash:plan.sourceHash,...(input.compilationSession!==undefined?{session:input.compilationSession}:{})},state=>{
    const semanticReview=input.preflight?null:bindSceneIconSemanticReview(input.sourceIconReview,{image:state.image,sourceHash:plan.sourceHash,plan,textBoxes:input.page.textBoxes,slideSize,budget:state.budget});
    // Source erasure and existing appearance approvals consume the same exact
    // intermediate geometry in either final editing mode. Only the explicit
    // output transaction below can choose approximate Office presets.
    const prepareNativeGeometry=input.deferNativeRoutes===true&&connectorCornerMode==='reroutable-elbow';
    return compileMeasuredScene({...input,sourceRouteCatalogs,surfaceSelection,prepareNativeGeometry,
      connectorCornerMode:prepareNativeGeometry?'rounded-freeform':connectorCornerMode,image:state.image,budget:state.budget,semanticReview});
  });
  return {...opened.result,compilationSession:opened.session};
}
/** @param {CompileInput&{prepareNativeGeometry:boolean,connectorCornerMode:import('../routing/source-route-corner-mode').ConnectorCornerMode,image:import('../png').PngImage,budget:{used:number},semanticReview:unknown}} input */
function compileMeasuredScene({page,plan,root,slideSize,image,budget,sourceCropSession,sourceRouteCatalogs,semanticReview,preflight=false,surfaceSelection=false,cageProgram=false,spatialExterior=true,jointIconRelations=true,pictorialMode="native",connectorCornerMode,prepareNativeGeometry}){
  if(plan.pendingRegionPrograms?.length) plan = restoreRegionProgramObligations(plan, validateCompiledRegionPrograms);
  const programLabels=prepareRegionProgramLabels(page,plan,slideSize);
  // Staged typography never participates in SOURCE measurement or glyph rights.
  /** @type {Map<string,string[]>} */const nativeObjects=new Map(),nativeRelations=new Map();
  const regions=new Map(plan.regions.map(r=>[r.id,r]));
  const evidence={regions:plan.regions.length,containers:0,containerAliases:0,occludedPerimeters:0,regionOutlines:0,regionOutlineSkippedBudget:0,icons:0,assignedText:0,sourceRoutes:0,sourceRouteParts:0,
    unresolved:/** @type {{id:string,reason:string,detailCode?:string,alternativeFailures?:import('./source-scene-measurement-cache').MeasurementFailure[]}[]} */([]),relations:plan.relations.length,resolvedRelations:0};
  if(plan.regionPrograms)Object.assign(evidence,{regionProgramLabels:programLabels.evidence});
  const nativeProgram={constructed:0,admitted:0,parts:0,rejected:/** @type {{id:string,reason:string,observedFaces?:number}[]} */([]),
    sourceAlternatives:/** @type {{id:string,reason:string}[]} */([])};
  if([...plan.regions,...plan.objects].some(o=>o.nativeGeometry))Object.assign(evidence,{nativeProgram});
  const admissionRejections=currentSceneAdmissionRejections(plan);
  const inventoryRevision=sceneInventoryRevisionForPlan(plan);
  const admissionRecovery={historicalRejected:plan.admission?.history?.rejections.length??plan.admission?.rejections.length??0,
    unresolved:admissionRejections.length,resolvedPrograms:(plan.resolvedRegionPrograms?.length??0)-(inventoryRevision?1:0),resolvedRelations:plan.admission?.history?.relations.length??0,
    ...(inventoryRevision?{supersededPrograms:1,supersededRelations:1,inventoryRevisionId:inventoryRevision.revisionId}:{})};
  if(plan.resolvedRegionPrograms||plan.admission?.history)Object.assign(evidence,{admissionRecovery});
  for(const rejected of admissionRejections)evidence.unresolved.push({id:`proposal-${rejected.collection}-${rejected.index}`,reason:rejected.reason,...(rejected.detailCode?{detailCode:rejected.detailCode}:{})});
  const validRegions=new Set();
  for(const region of plan.regions){
    let current=region,valid=true;
    while(current.parentId){const parent=regions.get(current.parentId);if(!parent||!containsSceneBox(parent.box,current.box)){valid=false;break;}current=parent;}
    if(valid)validRegions.add(region.id);else evidence.unresolved.push({id:region.id,reason:"region-containment"});
  }
  // Semantic grouping has no drawable perimeter. Only explicit physical
  // containers may propose a background; diagrams and sections are metadata.
  const proposals=[...plan.regions.filter(r=>validRegions.has(r.id)&&["card","container"].includes(r.kind))
    .map(r=>({id:r.id,regionId:r.id,box:r.box,kind:"container",...(r.nativeGeometry?{nativeGeometry:r.nativeGeometry}:{})})),...plan.objects];
  const shapes=[...page.shapes],images=[...page.images];
  // Source-compiled units are indivisible. A later, independently measured
  // rectangle may overlap their backdrop, but cannot delete one member of
  // the private source receipt and leave only the pictorial fragments.
  /** @type {Set<Item>} */const atomicMembers=new Set();
  const outlineRetirementWork={used:0,exhausted:false};
  /** @type {string[]} */const retiredOutlineAxes=[];
  /** @type {Map<string,import('./source-outline-paint').Paint>} */const outlinePaints=new Map();
  /** @type {Map<string,{id:string,box:Box,portFrame:object|null}>} */const nodes=new Map();
  /** @param {Box} box */
  const points=box=>({x:box.x*slideSize.widthPt/image.width,y:box.y*slideSize.heightPt/image.height,
    w:box.w*slideSize.widthPt/image.width,h:box.h*slideSize.heightPt/image.height});
  // Initial OCR typography has not been refined. Preflight grants no glyph
  // bridge or ownership; final compilation measures its actual source ink.
  const {glyphOcclusion,textMasks,measurements}=prepareSceneSourceMeasurements(image,page.textBoxes,slideSize,budget,preflight,spatialExterior);
  const orderedProposals=orderSourceSceneProposals(proposals,textMasks,plan.relations,plan);
  const selection=surfaceSelection&&!preflight?prepareSceneSurfacePortfolio({proposals:orderedProposals.filter(proposal=>{
    const region=regions.get(proposal.regionId);return !!region&&validRegions.has(region.id)&&containsSceneBox(region.box,proposal.box);
  }),measurements,glyphOcclusion,
    slideSize,relations:plan.relations,background:'background' in page?page.background:undefined}):null;
  if(selection)Object.assign(evidence,{surfaceSelection:selection.evidence});
  /** @type {Box[]} */const measuredOwnerHints=[];
  /** @type {{hint:Box,proposalId:string,node:{id:string,box:Box,portFrame:object|null,parentPaint?:unknown}}[]} */const physicalNodes=[];
  /** @type {{id:string,canonicalId:string}[]} */const physicalAliases=[];
  /** @type {unknown[]} */const nativeIcons=[];
  /** @param {typeof orderedProposals[number]} proposal
   * @param {NonNullable<ReturnType<typeof measurements.pattern>>} pattern */
  const appendPattern=(proposal,pattern)=>{
    const parts=measurements.patternOutput(proposal.box,{id:proposal.id,regionId:proposal.regionId,
      inventory:!!plan.observedInventory&&plan.objects.some(o=>o.id===proposal.id),slideSize});
    if(!parts)return false;
    shapes.push(...parts);nativeObjects.set(proposal.id,parts.map(part=>part.id));
    const node={id:parts.find(part=>part.source.detector==='source-scene-outline')?.id??'',box:{...pattern.box},
      portFrame:measurements.patternFrame(proposal.box),parentPaint:parts};
    nodes.set(proposal.id,node);physicalNodes.push({hint:proposal.box,proposalId:proposal.id,node});
    evidence.containers++;return true;
  };
  for(const proposal of orderedProposals){
    const region=regions.get(proposal.regionId);
    if(!region||!validRegions.has(region.id)||!containsSceneBox(region.box,proposal.box)){
      evidence.unresolved.push({id:proposal.id,reason:"object-containment"});continue;
    }
    if(proposal.kind==="icon"){
      const request={image,box:proposal.box,id:proposal.id,regionId:proposal.regionId,root,slideSize,textBoxes:page.textBoxes,budget,...(semanticReview?{semanticReview}:{})};
      const reviewedIcon=sceneIconSemanticObjectMatches(semanticReview,proposal.id,proposal.regionId,proposal.box);
      const glyphIcon=sceneGlyphRecoveryIcon(plan,image,proposal.id);
      const compiled=compileSceneIcon(request,{preflight,preferSourceCrop:pictorialMode==="source-crop"&&!reviewedIcon&&!glyphIcon,preserveStructureBudget:!glyphIcon,nativePictorial:glyphIcon||reviewedIcon||'nativePictorial' in proposal&&proposal.nativePictorial===true
        ||!!plan.regionPrograms?.some(p=>p.objects.includes(proposal.id))||plan.relations.some(r=>r.fromId===proposal.id||r.toId===proposal.id),
        relationEndpoint:plan.relations.some(r=>r.fromId===proposal.id||r.toId===proposal.id),
        parentObjectId:'parentObjectId' in proposal&&typeof proposal.parentObjectId==='string'?proposal.parentObjectId:'',
        ...(!preflight?{recoverSource:()=>measurements.iconRecovery(proposal.box,region.box,proposals.filter(p=>p.kind==='container').map(p=>p.box))}:{})});
      const icon=compiled.icon;
      if(!icon){evidence.unresolved.push({id:proposal.id,reason:compiled.failure??'icon-isolation',...(compiled.detailCode?{detailCode:compiled.detailCode}:{})});continue;}
      if(compiled.shapes.length){nativeObjects.set(proposal.id,compiled.shapes.map(s=>s.id));
        for(const s of compiled.shapes)if(plan.observedInventory)s.source={...s.source,sceneInventoryId:proposal.id};
        for(const shape of compiled.shapes)atomicMembers.add(shape);
        const node=sceneNativeIconNode(image,compiled);if(node)nodes.set(proposal.id,node);
        // Multi-part icons are resolved per contacted source contour below.
        nativeIcons.push(compiled);shapes.push(...compiled.shapes);evidence.icons++;continue;}
      // Existing source crops of this same unit yield to the measured tight crop.
      for(let i=images.length-1;i>=0;i--){const other=images[i];if(other&&other.box.w*other.box.h<=icon.box.w*icon.box.h*1.5
        &&overlap(other.box,icon.box)>=Math.min(other.box.w*other.box.h,icon.box.w*icon.box.h)*.85)images.splice(i,1);}
      if(pictorialMode==="source-crop")nativeObjects.set(proposal.id,[icon.id]);
      if(plan.observedInventory)Object.assign(icon.source,{sceneInventoryId:proposal.id});
      nativeIcons.push(compiled);
      images.push(icon);evidence.icons++;continue;
    }
    if(proposal.kind!=="container"){evidence.unresolved.push({id:proposal.id,reason:"object-type"});continue;}
    if('nativeGeometry' in proposal&&proposal.nativeGeometry){
      let program=/** @type {ReturnType<typeof measurements.primitiveProgram>|ReturnType<typeof measurements.cageProgram>} */(measurements.primitiveProgram(/** @type {import('./source-scene-plan').SceneObject} */(proposal),slideSize));
      if(!program)throw new TypeError('Scene native program construction is unavailable');
      nativeProgram.constructed++;nativeProgram.parts+=program.constructed;
      if(cageProgram&&!preflight&&program.failure!==null){
        const alternative=measurements.cageProgram(/** @type {import('./source-scene-plan').SceneObject} */(proposal),slideSize);
        if(alternative?.failure===null){
          nativeProgram.rejected.push({id:proposal.id,reason:program.failure});
          nativeProgram.sourceAlternatives.push({id:proposal.id,reason:program.failure});program=alternative;
        }else if(alternative){
          nativeProgram.rejected.push({id:proposal.id,reason:alternative.failure,...('observedFaces' in alternative?{observedFaces:alternative.observedFaces}:{})});
          if(alternative.failure==='cage-topology-mismatch'){
            nativeProgram.sourceAlternatives.push({id:proposal.id,reason:program.failure});
            program={constructed:program.constructed,failure:alternative.failure};
          }
        }
      }
      if(program.failure!==null||!('shapes' in program)){
        const reason=program.failure??'primitive-source-evidence';nativeProgram.rejected.push({id:proposal.id,reason});
        // A single-face geometry is a representation hypothesis. Its rejection
        // cannot veto a separately measured complete source boundary below.
        // Multi-face programs must retain all their declared caps/dividers;
        // a body-only alternative cannot satisfy that construction obligation.
        if(program.constructed!==1||proposal.nativeGeometry.kind==='openPaths'){
          evidence.unresolved.push({id:proposal.id,reason:'native-program-source-evidence',detailCode:reason});continue;
        }
        nativeProgram.sourceAlternatives.push({id:proposal.id,reason});
      }else{
      // All faces share one independently proven physical surface and receipt.
      // Register it before relationships and the existing whole-unit label/icon
      // assembler; never count construction alone as a completed region.
      const first='anchorId' in program?program.shapes.find(s=>s.id===program.anchorId):program.shapes[0];if(!first)throw new TypeError('Scene native program members are unavailable');
      const node={id:first.id,box:program.measurement.box,portFrame:program.portFrame,parentPaint:program.parentPaint};
      for(const shape of program.shapes)atomicMembers.add(shape);
      shapes.push(...program.shapes);nativeObjects.set(proposal.id,program.shapes.map(s=>s.id));
      nodes.set(proposal.id,node);physicalNodes.push({hint:proposal.box,proposalId:proposal.id,node});
      nativeProgram.admitted++;evidence.containers++;continue;
      }
    }
    if(selection?.denied.has(proposal.id)){evidence.unresolved.push({id:proposal.id,reason:'surface-choice-budget'});continue;}
    let {outline,measured}=measurements.surface(proposal.box);
    const pattern=!outline&&(!measured||measured.parts)?measurements.pattern(proposal.box):null;
    if(pattern&&appendPattern(proposal,pattern)){
      if(measured?.parts)measuredOwnerHints.push(proposal.box);
      continue;
    }
    if(!outline&&!measured)measured=measurements.layeredBackground(proposal.box,measuredOwnerHints);
    const measuredFit=measured?{box:points(measured.box),strokeSupported:false,support:measured.support}:null;
    // A source-measured body and its private port frame must use the SAME
    // geometry. An independently fitted text band can have a different box
    // and cannot borrow the measured body's attachment capability.
    const fit=measuredFit||(outline?{box:points(outline.box),strokeSupported:false,support:1}:fitSourceTextBand({image,slideSize,box:points(proposal.box)}));
    if(!fit){evidence.unresolved.push({id:proposal.id,reason:"container-perimeter",detailCode:measurements.failure(proposal.box),alternativeFailures:measurements.failureDetails(proposal.box)});continue;}
    // Source-proven paint is drawable even when it cannot supply a single
    // attachment surface. Keep that failure and never register its parts as
    // nodes, aliases or replacements for an existing attached perimeter.
    if(measured?.parts&&(outline||plan.relations.some(relation=>relation.fromId===proposal.id||relation.toId===proposal.id))){
      evidence.unresolved.push({id:proposal.id,reason:"compound-background-node"});
    }
    const canonical=measured?.parts?undefined:physicalNodes.find(other=>measurements.sameSurface(proposal.box,other.hint));
    if(canonical){nodes.set(proposal.id,canonical.node);evidence.containerAliases++;
      nativeObjects.set(proposal.id,nativeObjects.get(canonical.proposalId)??[]);
      const target=plan.objects.find(o=>o.id===canonical.proposalId),alias=plan.objects.find(o=>o.id===proposal.id);
      if(alias&&target&&alias.regionId===target.regionId&&alias.parentObjectId===target.parentObjectId)
        physicalAliases.push({id:alias.id,canonicalId:target.id});
      continue;}
    const fill=measured?.fill||outline?.fill||samplePanelBackgroundFill(image,fit.box,slideSize,"none");
    if(fill==="none"&&!outline){evidence.unresolved.push({id:proposal.id,reason:"container-fill"});continue;}
    const px={x:fit.box.x*image.width/slideSize.widthPt,y:fit.box.y*image.height/slideSize.heightPt,
      w:fit.box.w*image.width/slideSize.widthPt,h:fit.box.h*image.height/slideSize.heightPt};
    const edgeColor=pixel(image,Math.round(px.x),Math.round(px.y+px.h/2));
    const stroke=fit.strokeSupported&&edgeColor?rgbToHex(edgeColor):"none";
    /** @type {Item} */
    const shape={id:`scene-container-${proposal.id}`,type:"rect",box:fit.box,
      style:{fill,stroke,strokeWidthPt:stroke==="none"?0:slideSize.widthPt/image.width,opacity:1,
        ...(measured&&'gradient' in measured&&measured.gradient?{gradient:measured.gradient}:{})},
      source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,nativeComponentRole:"section-panel",
        detector:"source-scene-container",residualBackgroundFill:true,preserveResidualInterior:true,
        sceneRegionId:proposal.regionId,sourcePerimeterSupport:fit.support,
        ...(plan.observedInventory&&plan.objects.some(o=>o.id===proposal.id)?{sceneInventoryId:proposal.id}:{}),
        ...(measured?.glyphOcclusionPixels?{sourcePaintSupport:measured.paintSupport,sourceGlyphOcclusionPixels:measured.glyphOcclusionPixels}:{})}};
    if(measured?.segments){shape.type="freeform";shape.style={...shape.style,freeformSegments:measured.segments};}
    else if(!measured&&outline?.bodySegments&&fill!=="none"){
      shape.type="freeform";shape.style={...shape.style,freeformSegments:outline.bodySegments};
    }
    if(!preflight&&measured&&!measured.parts&&shape.style?.gradient)
      measurements.registerFillGradient(proposal.box,{id:shape.id,box:shape.box,gradient:shape.style.gradient});
    if(outline&&!measured?.parts)for(let i=shapes.length-1;i>=0;i--){const previous=shapes[i];
      if(previous&&outlineOwnsAxisLine(previous,outline,image.width,{x:image.width/slideSize.widthPt,y:image.height/slideSize.heightPt},
        {shapes,protectedMembers:atomicMembers,work:outlineRetirementWork})){
        if(previous.source?.detector==='visual-atom-native-connector'&&previous.id)retiredOutlineAxes.push(previous.id);
        shapes.splice(i,1);
      }
    }
    if(!measured?.parts)for(let i=shapes.length-1;i>=0;i--){const other=shapes[i];if(other&&!atomicMembers.has(other)&&["rect","roundRect"].includes(other.type||"")
      &&overlap(other.box,shape.box)>=Math.max(other.box.w*other.box.h,shape.box.w*shape.box.h)*.85)shapes.splice(i,1);}
    if(outline&&fill==="none"){
      shape.type="freeform";shape.style={fill:outline.color,stroke:"none",strokeWidthPt:0,freeformSegments:outline.segments};
      shape.source={...shape.source,detector:"source-scene-outline",residualBackgroundFill:false};
    }
    if(measured?.parts){
      for(const [index,part]of measured.parts.entries())shapes.push({...shape,id:`${shape.id}-part-${index}`,type:"freeform",box:points(part.box),
        style:{...shape.style,freeformSegments:part.segments},source:{...shape.source,nativeComponentGroupId:shape.id}});
      nativeObjects.set(proposal.id,measured.parts.map((_,index)=>`${shape.id}-part-${index}`));
      measuredOwnerHints.push(proposal.box);evidence.containers++;continue;
    }
    shapes.push(shape);
    if(outline?.interiorPaint&&fill==='none'){
      const paint=outline.interiorPaint;
      shapes.push({id:`scene-interior-face-${proposal.id}`,type:'freeform',box:points(paint.box),
        style:{fill:paint.color,stroke:'none',strokeWidthPt:0,freeformSegments:paint.segments},
        source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,nativeComponentRole:'node-fill',
          detector:'source-enclosed-ring-face',residualBackgroundFill:true,sceneRegionId:proposal.regionId}});
    }
    if(measured&&'paint' in measured&&measured.paint){const paint=measured.paint;
      shapes.push({id:`scene-outline-${proposal.id}`,type:'freeform',box:points(paint.box),
        style:{fill:paint.color,stroke:'none',strokeWidthPt:0,freeformSegments:paint.segments},
        source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,nativeComponentRole:'section-panel-outline',
          detector:'source-scene-outline',sceneRegionId:proposal.regionId,
          ...(plan.observedInventory&&plan.objects.some(o=>o.id===proposal.id)?{sceneInventoryId:proposal.id}:{})}});
    }
    if(measured||outline?.bodySegments)measuredOwnerHints.push(proposal.box);
    if(outline&&fill!=="none")shapes.push({id:`scene-outline-${proposal.id}`,type:"freeform",box:points(outline.box),
      style:{fill:outline.color,stroke:"none",strokeWidthPt:0,freeformSegments:outline.segments},
      source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,nativeComponentRole:"section-panel-outline",
        detector:"source-scene-outline",sceneRegionId:proposal.regionId,
        ...(plan.observedInventory&&plan.objects.some(o=>o.id===proposal.id)?{sceneInventoryId:proposal.id}:{})}});
    evidence.containers++;
    nativeObjects.set(proposal.id,shapes.filter(s=>s.id===shape.id||s.id===`scene-outline-${proposal.id}`||s.id===`scene-interior-face-${proposal.id}`).flatMap(s=>s.id?[s.id]:[]));
    if(outline?.paint)outlinePaints.set(outline&&fill!=="none"?`scene-outline-${proposal.id}`:shape.id||'',outline.paint);
    // Source admission stays in the original raster coordinate system. A
    // points-to-pixels round trip adds floating error at the unchanged 2px
    // port boundary and can change which source cells the scanner observes.
    const node={id:outline&&fill!=="none"?`scene-outline-${proposal.id}`:shape.id||"",box:outline?.box||(fit===measuredFit&&measured?measured.box:px),portFrame:measurements.portFrame(proposal.box)};
    nodes.set(proposal.id,node);physicalNodes.push({hint:proposal.box,proposalId:proposal.id,node});
  }
  // Foreground bodies can appear later in the source order. Revisit only a
  // failed fragmented perimeter, once, with actual emitted opaque-body tokens.
  // No fallback rectangle or proposal can explain missing source boundary ink.
  for(const proposal of orderedProposals){
    if(!evidence.unresolved.some(f=>f.id===proposal.id&&f.reason==='container-perimeter'))continue;
    const owners=physicalNodes.filter(p=>p.proposalId!==proposal.id&&overlap(p.node.box,proposal.box)>0
      &&shapes.some(s=>s.id===p.node.id)&&nativeObjects.get(p.proposalId)?.every(id=>shapes.filter(s=>s.id===id).length===1))
      .flatMap(p=>p.node.portFrame?[p.node.portFrame]:[]).slice(0,88);
    if(!owners.length)continue;
    const pattern=measurements.pattern(proposal.box,owners);
    if(pattern&&appendPattern(proposal,pattern)){
      evidence.occludedPerimeters++;evidence.unresolved=evidence.unresolved.filter(f=>f.id!==proposal.id||f.reason!=='container-perimeter');
    }
  }
  if(jointIconRelations){
    const joint=compileJointIconRelations({image,plan,root,slideSize,textBoxes:page.textBoxes,textMasks,budget,icons:nativeIcons,nodes,shapes,
      failedIds:new Set(evidence.unresolved.filter(r=>r.reason==='icon-isolation'&&r.detailCode==='icon-source-clipped-component').map(r=>r.id))});
    Object.assign(evidence,{jointIconRelations:joint.evidence});
    for(const candidate of joint.adopted){
      const {id,result}=candidate;nativeIcons.push(result);shapes.push(...result.shapes);
      if(plan.observedInventory)for(const shape of result.shapes)shape.source={...shape.source,sceneInventoryId:id};
      nativeObjects.set(id,result.shapes.map(s=>s.id));for(const shape of result.shapes)atomicMembers.add(shape);
      const node=sceneNativeIconNode(image,result);if(node)nodes.set(id,node);
      evidence.unresolved=evidence.unresolved.filter(r=>r.id!==id);evidence.icons++;
    }
    shapes.push(...joint.parts);evidence.resolvedRelations+=joint.resolved.size;
    for(const id of joint.resolved)nativeRelations.set(id,joint.parts.filter(s=>s.source.sceneRelationId===id).map(s=>s.id));
  }
  // A semantic region never authorizes a fill. Its box can nevertheless
  // propose a source ring: the same isolated, closed two-contour evidence
  // required of an object authorizes only that hollow physical perimeter.
  // Run these optional probes after mandatory node and relation measurements.
  const appendRegionOutlines=()=>{
  for(const region of plan.regions){
    if(!validRegions.has(region.id)||["card","container"].includes(region.kind))continue;
    const proposedBox=points(region.box);
    if(orderedShapes.some(s=>s.source?.detector==="source-scene-outline"
      &&overlap(s.box,proposedBox)>=Math.max(s.box.w*s.box.h,proposedBox.w*proposedBox.h)*.85))continue;
    const {area}=sceneOutlineWindow(image,region.box);
    if(area>262144||budget.used+area>4000000){evidence.regionOutlineSkippedBudget++;continue;}
    const outline=measureOutlinedSceneContainer(image,region.box,textMasks,budget);
    if(!outline)continue;
    const measuredBox=points(outline.box);
    if(orderedShapes.some(s=>s.source?.detector==="source-scene-outline"
      &&overlap(s.box,measuredBox)>=Math.max(s.box.w*s.box.h,measuredBox.w*measuredBox.h)*.85))continue;
    for(let i=orderedShapes.length-1;i>=0;i--){const previous=orderedShapes[i];
      if(previous&&outlineOwnsAxisLine(previous,outline,image.width,{x:image.width/slideSize.widthPt,y:image.height/slideSize.heightPt},
        {shapes:orderedShapes,protectedMembers:atomicMembers,work:outlineRetirementWork})){
        if(previous.source?.detector==='visual-atom-native-connector'&&previous.id)retiredOutlineAxes.push(previous.id);
        orderedShapes.splice(i,1);
      }
    }
    orderedShapes.push({id:`scene-region-outline-${region.id}`,type:"freeform",box:measuredBox,
      style:{fill:outline.color,stroke:"none",strokeWidthPt:0,freeformSegments:outline.segments},
      source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,nativeComponentRole:"section-panel-outline",
        detector:"source-scene-outline",sceneRegionId:region.id}});
    evidence.regionOutlines++;
    if(outline.paint)outlinePaints.set(`scene-region-outline-${region.id}`,outline.paint);
  }
  };
  const backgrounds=shapes.filter(s=>s.source?.detector==="source-scene-container").sort((a,b)=>b.box.w*b.box.h-a.box.w*a.box.h);
  const orderedShapes=[...backgrounds,...shapes.filter(s=>s.source?.detector!=="source-scene-container")];
  const textBoxes=page.textBoxes.map((text,index)=>{
    // Labels keep their source region when native layout crosses a boundary.
    // Use the same admitted source frame as graph measurements; typography
    // remains an output and cannot reassign semantic ownership.
    const pixels=textMasks[index];
    if(!pixels)throw new TypeError('Scene source label frame is missing');
    const matches=plan.regions.filter(r=>validRegions.has(r.id)&&containsSceneBox(r.box,pixels)).sort((a,b)=>a.box.w*a.box.h-b.box.w*b.box.h);
    if(!matches[0])return text;evidence.assignedText++;
    return {...text,source:{...text.source,sceneRegionId:matches[0].id}};
  });
  const resolveNodes=createSceneIconRelationNodes({image,icons:nativeIcons,nodes,slideSize});
  const routeEndpoints=prepareSceneRouteEndpoints({image,plan,nodes,objects:nativeObjects,textBoxes:page.textBoxes,slideSize});
  for(const [id,node] of routeEndpoints.textNodes)nodes.set(id,node);
  evidence.unresolved.push(...routeEndpoints.rejected);
  const sharedRoutes=compileSharedSceneRoutes({connectorCornerMode,prepareNativeGeometry,sourceRouteCatalogs,plan,image,nodes,shapes:orderedShapes,images,textMasks,budget,slideSize,
    existing:nativeRelations,endpoints:routeEndpoints.capture(orderedShapes,textBoxes)});
  orderedShapes.push(...sharedRoutes.parts);for(const part of sharedRoutes.parts)atomicMembers.add(part);
  for(const [id,members]of sharedRoutes.resolved)nativeRelations.set(id,members);
  evidence.resolvedRelations+=sharedRoutes.resolved.size;
  if(plan.relationObservationUnit!==undefined)Object.assign(evidence,{sharedRoutes:{graphs:sharedRoutes.graphs.length,resolved:sharedRoutes.resolved.size,rejected:sharedRoutes.rejected,...(sharedRoutes.pathChoices.length?{pathChoices:sharedRoutes.pathChoices}:{}),...(sharedRoutes.reprojectedChoices.length?{reprojectedChoices:sharedRoutes.reprojectedChoices}:{})}});
  // A model relation can select two independently measured nodes, but cannot
  // authorize a line. Both shaft and direction must exist in the source gap.
  for(const relation of plan.relations){
    if(nativeRelations.has(relation.id))continue;
    const pendingShared=sharedRoutes.pending.get(relation.id);
    if(pendingShared){evidence.unresolved.push({id:relation.id,reason:'relation-source-evidence',detailCode:pendingShared});continue;}
    if(!sceneEndpointWithinScope(plan,relation.regionId,relation.fromId)||!sceneEndpointWithinScope(plan,relation.regionId,relation.toId)){
      evidence.unresolved.push({id:relation.id,reason:'relation-source-evidence',detailCode:'relation-scope'});continue;
    }
    // An explicitly proposed complete path cannot be silently downgraded to
    // a center-to-center straight line before its source consumer runs.
    if(relation.visiblePath||relation.sourcePathChoice){evidence.unresolved.push({id:relation.id,reason:'relation-source-evidence',detailCode:relation.sourcePathChoice?'source-edge-choice':'visible-path-program'});continue;}
    const {from,to}=resolveNodes(relation);
    const measuredRelation=from&&to&&from.id===to.id?{fit:null,reason:'same-physical-node'}:from&&to&&shapes.some(s=>s.id===from.id)&&shapes.some(s=>s.id===to.id)
      ?measureSceneRelationDetailed({image,from,to,direction:relation.direction,textMasks,budget,...(relation.shaftBox?{shaftBox:relation.shaftBox}:{})}):{fit:null,reason:'missing-native-node'};
    const fit=measuredRelation.fit;
    if(!fit||!from||!to){evidence.unresolved.push({id:relation.id,reason:"relation-source-evidence",detailCode:measuredRelation.reason||"source-evidence"});continue;}
    if(!sceneRelationWithinAnchor(relation,fit)){
      evidence.unresolved.push({id:relation.id,reason:'relation-source-evidence',detailCode:'relation-anchor'});continue;
    }
    const start=points({x:fit.start.x,y:fit.start.y,w:1,h:1}),end=points({x:fit.end.x,y:fit.end.y,w:1,h:1});
    orderedShapes.push({id:`scene-${relation.id}`,type:"line",box:{x:start.x,y:start.y,w:end.x-start.x,h:end.y-start.y},
      style:{fill:"none",stroke:fit.color,strokeWidthPt:fit.widthPx*(slideSize.widthPt/image.width+slideSize.heightPt/image.height)/2,lineCap:"round",
        ...(relation.direction==="backward"||relation.direction==="both"?{startArrow:"triangle",startArrowWidth:"medium",startArrowLength:"medium"}:{}),
        ...(relation.direction==="forward"||relation.direction==="both"?{endArrow:"triangle",endArrowWidth:"medium",endArrowLength:"medium"}:{}),
        startAnchor:{elementId:from.id,side:fit.startSide,position:fit.startPosition??.5,
          ...(fit.startOffset?{dxPt:fit.startOffset.x*slideSize.widthPt/image.width,dyPt:fit.startOffset.y*slideSize.heightPt/image.height}:{})},
        endAnchor:{elementId:to.id,side:fit.endSide,position:fit.endPosition??.5,
          ...(fit.endOffset?{dxPt:fit.endOffset.x*slideSize.widthPt/image.width,dyPt:fit.endOffset.y*slideSize.heightPt/image.height}:{})}},
      source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,nativeComponentRole:"relationship",role:"relationship",
        detector:"source-scene-relation",sceneRegionId:relation.regionId,sourceShaftSupport:fit.support,sourceNodeIds:[from.id,to.id],
        ...(fit.startOffset?{sourceAttachmentKind:'measured-contour-physical',sourcePhysicalAttachment:true}:{}),
        ...(plan.observedInventory?{sceneInventoryId:relation.id}:{})}});
    evidence.resolvedRelations++;
    nativeRelations.set(relation.id,[`scene-${relation.id}`]);
  }
  // The complete network already paints pending identities. No single-path
  // fallback may redraw it or turn an unresolved logical choice into success.
  const fallbackPlan={...plan,relations:plan.relations.filter(r=>!sharedRoutes.pending.has(r.id))};
  const fallback=compileSceneRelationFallbacks({connectorCornerMode,plan:fallbackPlan,image,nodes,shapes:[...shapes,...page.textBoxes],textMasks,budget,slideSize,glyphOcclusion,resolveNodes,icons:nativeIcons,unresolved:evidence.unresolved});
  orderedShapes.push(...fallback.parts);evidence.resolvedRelations+=fallback.resolvedRelations;evidence.unresolved=fallback.unresolved;
  Object.assign(evidence,{replacedConnectors:replaceMeasuredSceneConnectors({image,slideSize,shapes:orderedShapes,previous:page.shapes,protectedMembers:atomicMembers,...(!preflight?{images,root,sourceCropSession}:{})})});
  for(const id of fallback.resolvedIds)nativeRelations.set(id,fallback.parts.filter(s=>s.source?.sceneRelationId===id).flatMap(s=>s.id?[s.id]:[]));
  Object.assign(evidence,fallback.evidence);
  appendRegionOutlines();
  const headers=proposeSceneTableHeaders({regions:plan.regions.filter(r=>validRegions.has(r.id)),textBoxes:page.textBoxes,
    widthPx:image.width,heightPx:image.height,slideSize,capacity:sceneHeaderObjectCapacity(plan)});
  const tableHeaders=appendSceneTableHeaderBackgrounds({headers,image,budget,slideSize,shapes:orderedShapes,
    measure:hint=>measurements.fill(hint),glyphReserve:window=>sceneGlyphOcclusionScanReserve(glyphOcclusion,window),inventory:!!plan.observedInventory,
    isMeasuredBodyRepresented:header=>physicalNodes.some(body=>{
      const declared=proposals.find(p=>p.id===body.proposalId),members=nativeObjects.get(body.proposalId);
      return declared?.regionId===header.regionId&&!!members?.length
        &&members.every(id=>orderedShapes.filter(s=>s.id===id).length===1)&&measurements.sameSurface(body.hint,header.box);
    })});
  Object.assign(evidence,{tableHeaderBackgrounds:tableHeaders.accepted,tableHeaderSkippedBudget:tableHeaders.skippedBudget});
  // A semantic label cannot suppress source-proven paint. Keep the page root
  // as metadata; optional child sections use the original fill, closure, glyph
  // and reserved scan gates. No failed probe becomes a physical requirement.
  const optionalSurfaces=plan.regions.filter(r=>validRegions.has(r.id)&&r.kind==='section'&&r.parentId!==null)
    .map(r=>({id:`semantic-region-${r.id}`,regionId:r.id,box:r.box}));
  const semanticShapes=[...orderedShapes];
  const semantic=appendSceneTableHeaderBackgrounds({headers:optionalSurfaces,image,budget,slideSize,shapes:semanticShapes,
    measure:hint=>{const fit=measurements.fill(hint);return fit?.parts?null:fit;},glyphReserve:window=>sceneGlyphOcclusionScanReserve(glyphOcclusion,window)});
  // Source paint belongs below existing native strokes and child surfaces.
  orderedShapes.unshift(...semanticShapes.slice(orderedShapes.length));
  Object.assign(evidence,{semanticRegionBackgrounds:semantic.accepted,semanticRegionSkippedBudget:semantic.skippedBudget});
  Object.assign(evidence,measurements.evidence,sceneGlyphOcclusionEvidence(glyphOcclusion),{sourceScanPixels:budget.used});
  Object.assign(evidence,{outlineAxisRetirements:{removed:retiredOutlineAxes,geometryChecks:outlineRetirementWork.used}});
  const grouped=finalizeSourceScene({image,slideSize,shapes:orderedShapes,images,textBoxes,physicalNodes,initialGeometryChecks:outlineRetirementWork.used,...(!preflight?{outlinePaints}:{}),
     plan,root,budget,preflight,validRegions,physicalAliases,nativeIcons,recoveredInventoryUnits:tableHeaders.inventoryUnits??[],routeEndpoints,
     ...(plan.relationObservationUnit!==undefined?{sharedRouteGraphs:sharedRoutes.graphs}:{}),
    ...(!preflight?{recoverInteriorSource:(seed,parent)=>measurements.iconRecovery(seed,parent,[parent])}:{})});
  // Final interior isolation can acquire additional glyph proofs on the same
  // private ledger. Report that terminal ledger rather than its earlier copy.
  Object.assign(evidence,grouped.evidence,sceneGlyphOcclusionEvidence(glyphOcclusion));
  for(const [id]of sharedRoutes.resolved){const members=grouped.sharedRelations.get(id);
    if(members)nativeRelations.set(id,members);else{nativeRelations.delete(id);evidence.resolvedRelations--;evidence.unresolved.push({id,reason:'shared-final-members'});}}
  if(plan.relationObservationUnit!==undefined)Object.assign(evidence,{sharedRoutes:{graphs:sharedRoutes.graphs.length,resolved:grouped.sharedRelations.size,wholeRelations:sharedRoutes.wholeResolved.size,rejected:sharedRoutes.rejected,...(sharedRoutes.pathChoices.length?{pathChoices:sharedRoutes.pathChoices}:{}),...(sharedRoutes.reprojectedChoices.length?{reprojectedChoices:sharedRoutes.reprojectedChoices}:{})}});
  const inventory=grouped.physicalInventory;
  const missingGlyphRecovery=resolveSceneGlyphRecoveries({plan,image,page:grouped,slideSize,budget,preflight,nativeIcons});
  if(missingGlyphRecovery){
    const recovered=new Set(missingGlyphRecovery.items.map(item=>`proposal-missingText-${item.index}`));
    evidence.unresolved=evidence.unresolved.filter(item=>item.reason!=='glyph-source-unit'||!recovered.has(item.id));
    admissionRecovery.unresolved=admissionRejections.filter(item=>item.reason!=='glyph-source-unit'||!recovered.has(`proposal-${item.collection}-${item.index}`)).length;
    Object.assign(admissionRecovery,{resolvedTexts:missingGlyphRecovery.items.length});
    Object.assign(evidence,{missingGlyphRecovery,admissionRecovery});
  }
  const completionInput={page:{...page,shapes:grouped.shapes,images:grouped.images,textBoxes:grouped.textBoxes},plan,slideSize,preflight,
    objects:new Map([...nativeObjects,...routeEndpoints.textMembers(grouped.textBoxes)]),relations:nativeRelations,interiorParents:grouped.interiorParents,recoveries:grouped.recoveries,unresolved:evidence.unresolved,labelEvidence:programLabels.evidence};
  let completed=completeRegionPrograms(completionInput);
  const openOwners=!preflight?plan.regions.filter(r=>validRegions.has(r.id)&&r.nativeGeometry?.kind==='openPaths'):[];
  let openOwnerReceipt;
  if(openOwners.length){
    const transaction=completeOpenSceneOwners({image,plan,page:completed.page,slideSize,budget,glyph:glyphOcclusion,textMasks,measurements,completion:completionInput,owners:openOwners});
    if(transaction.failure===null&&'completed' in transaction){
      if(!retainedOpenSceneOwnerTransaction(transaction.receipt,transaction.page))throw new TypeError('Open owner final transaction is invalid');
      completed=transaction.completed;evidence.unresolved=transaction.unresolved;openOwnerReceipt=transaction.receipt;
      for(const owner of openOwners){nativeObjects.set(owner.id,transaction.objects.get(owner.id)??[]);nativeProgram.admitted++;evidence.containers++;}
      Object.assign(evidence,{openOwners:transaction.evidence});
    }else if('rejected' in transaction)Object.assign(evidence,{openOwners:{completed:0,rejected:transaction.rejected}});
  }
  Object.assign(evidence,{sourceScanPixels:budget.used});
  if(plan.regionPrograms){Object.assign(evidence,{regionPrograms:completed.evidence});
    for(const failed of completed.evidence.rejected)evidence.unresolved.push({id:failed.regionId,reason:failed.reason});}
  Object.assign(evidence,{routeRepresentations:summarizeSceneRouteRepresentations({connectorCornerMode,page:completed.page,
    relations:[...nativeRelations].map(([relationId,memberIds])=>({relationId,memberIds}))})});
  if(!preflight)for(const physical of physicalNodes){
    const matches=completed.page.shapes.filter(s=>s.id===physical.node.id);
    if(matches.length===1)measurements.registerOutlineStyle(physical.hint,matches[0],completed.page.shapes);
  }
  const outputPage={...completed.page,source:{...page.source,sourceScene:{version:1,sourceHash:plan.sourceHash,
    regionTree:plan.regions.map(r=>({id:r.id,parentId:r.parentId,kind:r.kind,box:points(r.box)})),...evidence}}};
  // Bind native alternatives only after the public source identity exists.
  // Source consumers keep the unchanged measured parts and their receipts.
  return {...(!preflight&&(prepareNativeGeometry||connectorCornerMode==='reroutable-elbow')?{nativeRouteReceipt:sealSourceNativeNetworks(outputPage)}:{}),
    ...(inventory?{physicalInventory:inventory}:{}),...(openOwnerReceipt?{openOwnerReceipt}:{}),...(grouped.sealGroups?{groupReceipt:grouped.sealGroups(completed.page)}:{}),page:outputPage,evidence};
}
/** No output asset is written by preflight. Its failure report informs the
 * original two reviews; final controls must run the compiler again.
 * @param {CompileInput} input */
function preflightSourceScene(input){readSceneSurfaceSelection(input);const result=compileSourceScene({...input,preflight:true});
 return {evidence:result.evidence,compilationSession:result.compilationSession,...(result.physicalInventory?{physicalInventory:result.physicalInventory}:{})};}
module.exports={compileSourceScene,preflightSourceScene};
